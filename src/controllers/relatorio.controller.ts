import { Request, Response } from 'express';
import { prisma } from '../config/prisma';

// Funções auxiliares para cálculo de horas
const transformarEmMinutos = (horarioStr: string): number => {
  if (!horarioStr) return 0;
  const [horas, minutos] = horarioStr.split(':').map(Number);
  return horas * 60 + minutos;
};

const formatarMinutosParaHoras = (minutosTotais: number): string => {
  const sinal = minutosTotais < 0 ? '-' : '';
  const minutosAbsolutos = Math.abs(minutosTotais);
  const horas = Math.floor(minutosAbsolutos / 60);
  const minutos = minutosAbsolutos % 60;
  return `${sinal}${String(horas).padStart(2, '0')}:${String(minutos).padStart(2, '0')}`;
};

// Função para descobrir o número da semana no ano (1 a 52) para escala alternada
const obterNumeroSemanaAno = (data: Date): number => {
  const d = new Date(Date.UTC(data.getFullYear(), data.getMonth(), data.getDate()));
  const diaNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - diaNum);
  const anoInicio = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d.getTime() - anoInicio.getTime()) / 86400000) + 1) / 7);
};

export const RelatorioController = {
  // 1. DASHBOARD GERAL (NOME CORRIGIDO: dashboardGeral)
  async dashboardGeral(req: Request, res: Response): Promise<void> {
    try {
      const hoje = new Date();
      const dataInicio = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate(), 0, 0, 0);
      const dataFim = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate(), 23, 59, 59);

      const [totalFuncionarios, batidasHoje, feedAtividades] = await prisma.$transaction([
        prisma.usuario.count({
          where: { perfil: 'FUNCIONARIO' }
        }),
        prisma.batidaPonto.count({
          where: {
            dataHora: {
              gte: dataInicio,
              lte: dataFim
            }
          }
        }),
        prisma.batidaPonto.findMany({
          where: {
            dataHora: {
              gte: dataInicio,
              lte: dataFim
            }
          },
          orderBy: { dataHora: 'desc' },
          include: {
            usuario: {
              select: { nome: true }
            }
          }
        })
      ]);

      res.status(200).json({
        totalFuncionarios,
        batidasHoje,
        feedAtividades: feedAtividades.map(f => ({
          id: f.id,
          nome: f.usuario.nome,
          // 🔒 Trava UTC literal para blindar a leitura contra cortes de fuso no servidor
          hora: f.dataHora.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' }),
          foto: f.fotoBase64,
          latitude: f.latitude,
          longitude: f.longitude
        }))
      });
    } catch (error) {
      console.error(error);
      res.status(500).json({ erro: 'Falha crítica ao consolidar indicadores de controle gerencial.' });
    }
  },

  // 2. EMISSÃO DO ESPELHO DE PONTO (NOME CORRIGIDO: relatorioMensalPorFuncionario)
  async relatorioMensalPorFuncionario(req: Request, res: Response): Promise<void> {
    try {
      const { usuarioId } = req.params;
      const { mes, ano } = req.query;

      if (!usuarioId || !mes || !ano) {
        res.status(400).json({ erro: 'Os parâmetros usuarioId, mes e ano são obrigatórios.' });
        return;
      }

      const usuario = await prisma.usuario.findUnique({
        where: { id: usuarioId },
        include: { horarioBase: true }
      });

      if (!usuario) {
        res.status(404).json({ erro: 'Funcionário não encontrado no ecossistema.' });
        return;
      }

      const mesInt = parseInt(mes as string, 10);
      const anoInt = parseInt(ano as string, 10);

      const dataInicio = new Date(anoInt, mesInt - 1, 1);
      const dataFim = new Date(anoInt, mesInt, 0, 23, 59, 59);

      const todasBatidas = await prisma.batidaPonto.findMany({
        where: {
          usuarioId,
          dataHora: {
            gte: dataInicio,
            lte: dataFim
          }
        },
        orderBy: { dataHora: 'asc' },
        include: {
          modificacoes: {
            orderBy: { createdAt: 'desc' }, // 🔒 Alinhado com a propriedade real gerada pelo Prisma Client
            take: 1
          }
        }
      });

      const totalDiasNoMes = new Date(anoInt, mesInt, 0).getDate();
      const historicoDias = [];
      let totalFaltas = 0;
      let saldoBancoHorasMinutos = 0;

      for (let dia = 1; dia <= totalDiasNoMes; dia++) {
        const dataCorrente = new Date(anoInt, mesInt - 1, dia);
        const dataCorrenteStr = `${anoInt}-${String(mesInt).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
        
        const diaSemanaNum = dataCorrente.getDay();

        const batidasDoDia = todasBatidas.filter(b => {
          const dataB = b.dataHora;
          return dataB.getFullYear() === anoInt &&
                 (dataB.getMonth() + 1) === mesInt &&
                 dataB.getDate() === dia;
        });

        // Injeta a propriedade de cálculo em tempo de execução de forma segura
        batidasDoDia.forEach(b => {
          (b as any).dataCalculoReal = b.modificacoes && b.modificacoes.length > 0 
            ? b.modificacoes[0].dataHoraNova 
            : b.dataHora;
        });

        batidasDoDia.sort((a, b) => (a as any).dataCalculoReal.getTime() - (b as any).dataCalculoReal.getTime());

        let trabalhaNoDia = false;
        let entradaEsperadaStr = '';
        let saidaEsperadaStr = '';

        if (usuario.horarioBase) {
          const h = usuario.horarioBase;
          if (h.tipoEscala === 'SEMANAL') {
            // Mapeamento com base nas propriedades fixas reais do schema
            if (diaSemanaNum >= 1 && diaSemanaNum <= 5) {
              trabalhaNoDia = true; 
              entradaEsperadaStr = h.horaEntradaPadrao; 
              saidaEsperadaStr = h.horaSaidaPadrao; 
            } else if (diaSemanaNum === 6 && (h as any).trabalhaSabado) {
              trabalhaNoDia = true; 
              entradaEsperadaStr = (h as any).horaEntradaSabado || h.horaEntradaPadrao; 
              saidaEsperadaStr = (h as any).horaSaidaSabado || h.horaSaidaPadrao; 
            } else if (diaSemanaNum === 0) {
              if (h.domingoInicioImpar || (h as any).trabalhaDomingo) {
                trabalhaNoDia = true; 
                entradaEsperadaStr = (h as any).horaEntradaDomingo || h.horaEntradaPadrao; 
                saidaEsperadaStr = (h as any).horaSaidaDomingo || h.horaSaidaPadrao;
              }
            }
          } else if (h.tipoEscala === 'ALTERNADA') {
            // 🔒 Propriedade corrigida para o camelCase real do Prisma Client
            const dataReferenciaUsuario = (usuario as any).dataInicioEscala 
              ? new Date((usuario as any).dataInicioEscala) 
              : null;
              
            if (dataReferenciaUsuario) {
              const checkZero = new Date(dataCorrente.getFullYear(), dataCorrente.getMonth(), dataCorrente.getDate());
              const refZero = new Date(dataReferenciaUsuario.getFullYear(), dataReferenciaUsuario.getMonth(), dataReferenciaUsuario.getDate());
              const diferencaTempo = checkZero.getTime() - refZero.getTime();
              const diferencaDias = Math.floor(diferencaTempo / (1000 * 60 * 60 * 24));
              if (diferencaDias >= 0 && diferencaDias % 2 === 0) {
                trabalhaNoDia = true;
                entradaEsperadaStr = h.horaEntradaPadrao;
                saidaEsperadaStr = h.horaSaidaPadrao;
              }
            }
          }
        }

        let minutesTrabalhadosNoDia = 0;
        let saldoDoDiaMinutos = 0;
        let status = 'FOLGA';

        if (trabalhaNoDia) {
          status = 'FALTA';
          if (batidasDoDia.length > 0) {
            // Tratamento de segurança: Se o ponto foi marcado com a flag de Ano 1970 (Time 0), indica exclusão lógica
            const bPrimeira = batidasDoDia[0];
            if (bPrimeira.modificacoes && bPrimeira.modificacoes.length > 0 && bPrimeira.modificacoes[0].dataHoraNova.getTime() === 0) {
              status = 'FALTA';
            } else {
              status = 'TRABALHADO';
              for (let i = 0; i < batidasDoDia.length; i += 2) {
                if (i + 1 < batidasDoDia.length) {
                  const entradaMinutos = transformarEmMinutos((batidasDoDia[i] as any).dataCalculoReal.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' }));
                  const saidaMinutos = transformarEmMinutos((batidasDoDia[i+1] as any).dataCalculoReal.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' }));
                  minutesTrabalhadosNoDia += (saidaMinutos - entradaMinutos);
                }
              }

              const minutosContratuaisEsperados = transformarEmMinutos(saidaEsperadaStr) - transformarEmMinutos(entradaEsperadaStr);
              let cargaHorariaComAlmocoDefinida = minutosContratuaisEsperados;

              if (usuario.horarioBase?.utilizaAlmocoAutomatico) {
                const duracaoAlmocoConfigurada = usuario.horarioBase.duracaoAlmocoMinutos || 60;
                if (batidasDoDia.length === 2) {
                  minutesTrabalhadosNoDia -= duracaoAlmocoConfigurada;
                  if (minutesTrabalhadosNoDia < 0) minutesTrabalhadosNoDia = 0;
                } else if (batidasDoDia.length >= 4) {
                  const primeiroAlmocoEntrada = transformarEmMinutos((batidasDoDia[1] as any).dataCalculoReal.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' }));
                  const primeiroAlmocoSaida = transformarEmMinutos((batidasDoDia[2] as any).dataCalculoReal.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' }));
                  const almocoRealMinutos = primeiroAlmocoSaida - primeiroAlmocoEntrada;
                  const diferencaDeAlmocoTolerada = duracaoAlmocoConfigurada - almocoRealMinutos;
                  if (diferencaDeAlmocoTolerada > 0) {
                    minutesTrabalhadosNoDia -= diferencaDeAlmocoTolerada;
                  }
                }
              } else {
                cargaHorariaComAlmocoDefinida = minutosContratuaisEsperados - 60;
              }

              saldoDoDiaMinutos = minutesTrabalhadosNoDia - cargaHorariaComAlmocoDefinida;
            }
          }

          if (status === 'FALTA') {
            const hojeVerificador = new Date();
            const ehDataFutura = new Date(anoInt, mesInt - 1, dia) > hojeVerificador;
            if (ehDataFutura) {
              status = 'AGENDADO';
              saldoDoDiaMinutos = 0;
            } else {
              totalFaltas++;
              const minutosContratuaisEsperados = transformarEmMinutos(saidaEsperadaStr) - transformarEmMinutos(entradaEsperadaStr);
              const cargaDeveriaTerSidoFeita = usuario.horarioBase?.utilizaAlmocoAutomatico ? minutosContratuaisEsperados : (minutosContratuaisEsperados - 60);
              saldoDoDiaMinutos = -cargaDeveriaTerSidoFeita;
            }
          }
        } else {
          if (batidasDoDia.length > 0) {
            status = 'EXTRA_FOLGA';
            for (let i = 0; i < batidasDoDia.length; i += 2) {
              if (i + 1 < batidasDoDia.length) {
                const entradaMinutos = transformarEmMinutos((batidasDoDia[i] as any).dataCalculoReal.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' }));
                const saidaMinutos = transformarEmMinutos((batidasDoDia[i+1] as any).dataCalculoReal.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' }));
                minutesTrabalhadosNoDia += (saidaMinutos - entradaMinutos);
              }
            }
            saldoDoDiaMinutos = minutesTrabalhadosNoDia;
          }
        }

        saldoBancoHorasMinutos += saldoDoDiaMinutos;

        // Filtra para remover da exibição na tabela as batidas que foram desconsideradas logicamente
        const batidasFiltradasParaExibicao = batidasDoDia.filter(b => {
          return !(b.modificacoes && b.modificacoes.length > 0 && b.modificacoes[0].dataHoraNova.getTime() === 0);
        });

        const batidasFormatadasComCoordenadas = batidasFiltradasParaExibicao.map(b => {
          const foiModificado = b.modificacoes && b.modificacoes.length > 0;
          return {
            id: b.id,
            // 🔒 Força timeZone UTC para casar com a leitura fidedigna das batidas no banco
            hora: (b as any).dataCalculoReal.toLocaleTimeString('pt-BR', { 
              hour: '2-digit', 
              minute: '2-digit', 
              timeZone: 'UTC' 
            }),
            foiAlterada: foiModificado,
            justificativa: foiModificado ? b.modificacoes[0].justificativa : null,
            horaOriginal: b.dataHora.toLocaleTimeString('pt-BR', {
              hour: '2-digit',
              minute: '2-digit',
              timeZone: 'UTC'
            }),
            latitude: b.latitude || null,
            longitude: b.longitude || null
          };
        });

        historicoDias.push({
          data: dataCorrenteStr,
          status,
          batidas: batidasFormatadasComCoordenadas,
          horasTrabalhadas: formatarMinutosParaHoras(minutesTrabalhadosNoDia),
          saldoDoDia: formatarMinutosParaHoras(saldoDoDiaMinutos)
        });
      }

      res.status(200).json({
        funcionario: { id: usuario.id, nome: usuario.nome, cpf: usuario.cpf },
        resumoDashboard: {
          mesReferencia: `${mes}/${ano}`,
          totalFaltas,
          saldoBancoHorasFormatado: formatarMinutosParaHoras(saldoBancoHorasMinutos),
          saldoBancoHorasMinutos
        },
        relatorioMensal: historicoDias
      });
    } catch (error) {
      console.error(error);
      res.status(500).json({ erro: 'Falha interna ao compilar dados do relatório de ponto.' });
    }
  }
};