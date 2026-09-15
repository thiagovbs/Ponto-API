import { Request, Response } from 'express';
import { prisma } from '../config/prisma';
import { gerarEspelhoDePonto, type DiaDoEspelho } from '../config/pdf';
import { gerarConteudoAEF } from '../services/aef.service';

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

export const RelatorioController = {
  // 🟢 MÉTODO TOTALMENTE CORRIGIDO: Agora calcula e entrega o gráfico semanal para desrepresar o painel web
  async dashboardGeral(req: Request, res: Response): Promise<void> {
    try {
      // 🛡️ CASTING ESTRITO: Garante que o ID da empresa é uma string pura
      const empresaId = (req as any).empresaId as string;
      const hoje = new Date();
      const dataInicioHoje = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate(), 0, 0, 0);
      const dataFimHoje = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate(), 23, 59, 59);

      // 🟢 COMPILADOR DO GRÁFICO SEMANAL NATIVO: Mapeia os últimos 7 dias retroativos em fuso UTC
      const listaDiasGrafico: string[] = [];
      const contagemDadosGrafico: number[] = [];
      const diasSemanaNomes = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

      // Monta o array de datas dos últimos 7 dias para fazer buscas atômicas agrupadas
      for (let i = 6; i >= 0; i--) {
        const dataPassada = new Date();
        dataPassada.setDate(hoje.getDate() - i);
        
        const nomeDia = diasSemanaNomes[dataPassada.getDay()];
        listaDiasGrafico.push(nomeDia);

        const inicioDiaPassado = new Date(dataPassada.getFullYear(), dataPassada.getMonth(), dataPassada.getDate(), 0, 0, 0);
        const fimDiaPassado = new Date(dataPassada.getFullYear(), dataPassada.getMonth(), dataPassada.getDate(), 23, 59, 59);

        // Conta as batidas daquele dia específico que NÃO foram desconsideradas logicamente
        const totalBatidasDoDiaValidas = await prisma.batidaPonto.count({
          where: {
            empresaId: empresaId,
            dataHora: { gte: inicioDiaPassado, lte: fimDiaPassado },
            NOT: {
              modificacoes: {
                some: {
                  dataHoraNova: new Date(0) // Filtra fora os pontos desconsiderados
                }
              }
            }
          }
        });
        contagemDadosGrafico.push(totalBatidasDoDiaValidas);
      }

      const [totalFuncionarios, batidasHoje, feedAtividades] = await prisma.$transaction([
        prisma.usuario.count({
          where: { perfil: 'FUNCIONARIO', empresaId: empresaId }
        }),
        prisma.batidaPonto.count({
          where: {
            empresaId: empresaId,
            dataHora: {
              gte: dataInicioHoje,
              lte: dataFimHoje
            }
          }
        }),
        prisma.batidaPonto.findMany({
          where: {
            empresaId: empresaId,
            dataHora: {
              gte: dataInicioHoje,
              lte: dataFimHoje
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
        // 🟢 INJEÇÃO DO OBJETO DE GRÁFICO ESTRUTURADO PARA CONSUMO DO CHART.JS NA WEB
        graficoSemanal: {
          labels: listaDiasGrafico,
          dados: contagemDadosGrafico
        },
        feedAtividades: feedAtividades.map(f => ({
          id: f.id,
          nome: f.usuario.nome,
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

  async relatorioMensalPorFuncionario(req: Request, res: Response): Promise<void> {
    try {
      // 🛡️ CASTING ESTRITO: Impede o conflito de string | string[]
      const usuarioId = req.params.usuarioId as string;
      const mes = req.query.mes as string;
      const ano = req.query.ano as string;
      const empresaId = (req as any).empresaId as string;

      if (!usuarioId || !mes || !ano) {
        res.status(400).json({ erro: 'Os parâmetros usuarioId, mes e ano são obrigatórios.' });
        return;
      }

      const usuario = await prisma.usuario.findFirst({
        where: { id: usuarioId, empresaId: empresaId },
        include: { Horario: true, afastamentos: true }
      });

      if (!usuario) {
        res.status(404).json({ erro: 'Funcionário não encontrado no ecossistema.' });
        return;
      }

      const mesInt = parseInt(mes, 10);
      const anoInt = parseInt(ano, 10);

      const dataInicio = new Date(anoInt, mesInt - 1, 1);
      const dataFim = new Date(anoInt, mesInt, 0, 23, 59, 59);

      const todasBatidas = await prisma.batidaPonto.findMany({
        where: {
          usuarioId: usuarioId,
          empresaId: empresaId,
          dataHora: {
            gte: dataInicio,
            lte: dataFim
          }
        },
        orderBy: { dataHora: 'asc' },
        include: {
          modificacoes: {
            orderBy: { createdAt: 'desc' },
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
        const dataAfastamentoCheck = new Date(`${anoInt}-${String(mesInt).padStart(2, '0')}-${String(dia).padStart(2, '0')}T12:00:00.000Z`);
        
        const diaSemanaNum = dataCorrente.getDay();

        const afastamentoDoDia = usuario?.afastamentos?.find((af) => {
          const inicio = new Date(af.dataInicio);
          const fim = new Date(af.dataFim);
          inicio.setHours(0, 0, 0, 0);
          fim.setHours(23, 59, 59, 999);
          return dataAfastamentoCheck >= inicio && dataAfastamentoCheck <= fim;
        });

        if (afastamentoDoDia) {
          historicoDias.push({
            data: dataCorrenteStr,
            status: 'AFASTADO',
            batidas: [],
            horasTrabalhadas: '00:00',
            saldoDoDia: '00:00',
            observacao: `[${afastamentoDoDia.tipo.replace('_', ' ')}] - ${afastamentoDoDia.justificativa}`
          });
          continue;
        }

        const batidasDoDia = todasBatidas.filter(b => {
          const dataB = b.dataHora;
          return dataB.getFullYear() === anoInt &&
                 (dataB.getMonth() + 1) === mesInt &&
                 dataB.getDate() === dia;
        });

        batidasDoDia.forEach(b => {
          (b as any).dataCalculoReal = b.modificacoes && b.modificacoes.length > 0 
            ? b.modificacoes[0].dataHoraNova 
            : b.dataHora;
        });

        batidasDoDia.sort((a, b) => (a as any).dataCalculoReal.getTime() - (b as any).dataCalculoReal.getTime());

        // REGRA FISCAL DE AUDITORIA: Filtra apenas as batidas válidas que NÃO foram desconsideradas
        const batidasValidasParaCalculo = batidasDoDia.filter(b => {
          return !(b.modificacoes && b.modificacoes.length > 0 && b.modificacoes[0].dataHoraNova.getTime() === 0);
        });

        let trabalhaNoDia = false;
        let entradaEsperadaStr = '';
        let saidaEsperadaStr = '';

        if (usuario.Horario) {
          const h = usuario.Horario;
          if (h.tipoEscala === 'SEMANAL') {
            if (diaSemanaNum >= 1 && diaSemanaNum <= 5) {
              trabalhaNoDia = true; 
              entradaEsperadaStr = h.horaEntradaPadrao; 
              saidaEsperadaStr = h.horaSaidaPadrao; 
            } else if (diaSemanaNum === 6 && (h as any).trabalhaSabado) {
              trabalhaNoDia = true; 
              entradaEsperadaStr = (h as any).horaEntradaSabado || h.horaEntradaPadrao; 
              saidaEsperadaStr = (h as any).horaSaidaSabado || h.horaSaidaPadrao; 
            } else if (diaSemanaNum === 0 && (h as any).trabalhaDomingo) {
              trabalhaNoDia = true; 
              entradaEsperadaStr = (h as any).horaEntradaDomingo || h.horaEntradaPadrao; 
              saidaEsperadaStr = (h as any).horaSaidaDomingo || h.horaSaidaPadrao;
            }
          } else if (h.tipoEscala === 'ALTERNADA') {
            const dataReferenciaUsuario = usuario.dataInicioEscala 
              ? new Date(usuario.dataInicioEscala) 
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

        let minutosTrabalhadosNoDia = 0;
        let saldoDoDiaMinutos = 0;
        let status = 'FOLGA';

        if (trabalhaNoDia) {
          status = 'FALTA';
          if (batidasValidasParaCalculo.length > 0) {
            status = 'TRABALHADO';
            for (let i = 0; i < batidasValidasParaCalculo.length; i += 2) {
              if (i + 1 < batidasValidasParaCalculo.length) {
                const entradaMinutos = transformarEmMinutos((batidasValidasParaCalculo[i] as any).dataCalculoReal.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' }));
                const saidaMinutos = transformarEmMinutos((batidasValidasParaCalculo[i+1] as any).dataCalculoReal.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' }));
                minutosTrabalhadosNoDia += (saidaMinutos - entradaMinutos);
              }
            }

            const minutosContratuaisEsperados = transformarEmMinutos(saidaEsperadaStr) - transformarEmMinutos(entradaEsperadaStr);
            const duracaoAlmocoConfigurada = usuario.Horario?.duracaoAlmocoMinutos || 60;
            
            let cargaHorariaComAlmocoDefinida = minutosContratuaisEsperados - duracaoAlmocoConfigurada;

            if (usuario.Horario?.utilizaAlmocoAutomatico) {
              if (batidasValidasParaCalculo.length === 2) {
                minutosTrabalhadosNoDia -= duracaoAlmocoConfigurada;
                if (minutosTrabalhadosNoDia < 0) minutosTrabalhadosNoDia = 0;
              } else if (batidasValidasParaCalculo.length >= 4) {
                const primeiroAlmocoEntrada = transformarEmMinutos((batidasValidasParaCalculo[1] as any).dataCalculoReal.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' }));
                const primeiroAlmocoSaida = transformarEmMinutos((batidasValidasParaCalculo[2] as any).dataCalculoReal.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' }));
                const almocoRealMinutos = primeiroAlmocoSaida - primeiroAlmocoEntrada;
                const diferencaDeAlmocoTolerada = duracaoAlmocoConfigurada - almocoRealMinutos;
                if (diferencaDeAlmocoTolerada > 0) {
                  minutosTrabalhadosNoDia -= diferencaDeAlmocoTolerada;
                }
              }
            }

            if (minutosTrabalhadosNoDia === 0 && batidasValidasParaCalculo.length === 0) {
              status = 'FALTA';
            } else {
              saldoDoDiaMinutos = minutosTrabalhadosNoDia - cargaHorariaComAlmocoDefinida;
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
              const duracaoAlmocoConfigurada = usuario.Horario?.duracaoAlmocoMinutos || 60;
              const cargaDeveriaTerSidoFeita = minutosContratuaisEsperados - duracaoAlmocoConfigurada;
              saldoDoDiaMinutos = -cargaDeveriaTerSidoFeita;
            }
          }
        } else {
          if (batidasValidasParaCalculo.length > 0) {
            status = 'EXTRA_FOLGA';
            for (let i = 0; i < batidasValidasParaCalculo.length; i += 2) {
              if (i + 1 < batidasValidasParaCalculo.length) {
                const entradaMinutos = transformarEmMinutos((batidasValidasParaCalculo[i] as any).dataCalculoReal.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' }));
                const saidaMinutos = transformarEmMinutos((batidasValidasParaCalculo[i+1] as any).dataCalculoReal.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' }));
                minutosTrabalhadosNoDia += (saidaMinutos - entradaMinutos);
              }
            }
            saldoDoDiaMinutos = minutosTrabalhadosNoDia;
          }
        }

        saldoBancoHorasMinutos += saldoDoDiaMinutos;

        const batidasFormatadasComCoordenadas = batidasDoDia.map(b => {
          const foiModificado = b.modificacoes && b.modificacoes.length > 0;
          const foiDesconsiderado = foiModificado && b.modificacoes[0].dataHoraNova.getTime() === 0;

          return {
            id: b.id,
            hora: foiDesconsiderado ? '--:--' : (b as any).dataCalculoReal.toLocaleTimeString('pt-BR', { 
              hour: '2-digit', 
              minute: '2-digit', 
              timeZone: 'UTC' 
            }),
            foiAlterada: foiModificado,
            foiDesconsiderada: foiDesconsiderado,
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
          horasTrabalhadas: formatarMinutosParaHoras(minutosTrabalhadosNoDia),
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
  },
  
  async emitirPDFEspelho(req: Request, res: Response): Promise<void> {
    try {
      // 🛡️ CASTING ESTRITO: Impede o conflito de string | string[]
      const usuarioId = req.params.usuarioId as string;
      const mes = req.query.mes as string;
      const ano = req.query.ano as string;
      const empresaId = (req as any).empresaId as string;

      if (!usuarioId || !mes || !ano) {
        res.status(400).json({ erro: 'Parâmetros insuficientes para geração do documento.' });
        return;
      }

      const usuario = await prisma.usuario.findFirst({
        where: { id: usuarioId, empresaId: empresaId },
        include: { Horario: true, afastamentos: true, empresa: true }
      });

      if (!usuario) {
        res.status(404).json({ coladoradorIdentificado: false });
        return;
      }

      const mesInt = parseInt(mes, 10);
      const anoInt = parseInt(ano, 10);

      const dataInicio = new Date(anoInt, mesInt - 1, 1);
      const dataFim = new Date(anoInt, mesInt, 0, 23, 59, 59);

      const todasBatidas = await prisma.batidaPonto.findMany({
        where: {
          usuarioId: usuarioId,
          empresaId: empresaId,
          dataHora: {
            gte: dataInicio,
            lte: dataFim
          }
        },
        orderBy: { dataHora: 'asc' },
        include: {
          modificacoes: {
            orderBy: { createdAt: 'desc' },
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
        const dataCorrenteStr = `${String(dia).padStart(2, '0')}/${String(mesInt).padStart(2, '0')}/${anoInt}`;
        const dataAfastamentoCheck = new Date(`${anoInt}-${String(mesInt).padStart(2, '0')}-${String(dia).padStart(2, '0')}T12:00:00.000Z`);
        
        const diaSemanaNum = dataCorrente.getDay();

        const afastamentoDoDia = usuario?.afastamentos?.find((af) => {
          const inicio = new Date(af.dataInicio);
          const fim = new Date(af.dataFim);
          inicio.setHours(0, 0, 0, 0);
          fim.setHours(23, 59, 59, 999);
          return dataAfastamentoCheck >= inicio && dataAfastamentoCheck <= fim;
        });

        if (afastamentoDoDia) {
          historicoDias.push({
            data: dataCorrenteStr,
            status: 'AFASTADO',
            batidas: [],
            horasTrabalhadas: '00:00',
            saldoDoDia: '00:00',
            observacao: `🏝️ [AFASTAMENTO] - ${afastamentoDoDia.tipo} (${afastamentoDoDia.justificativa})`
          });
          continue;
        }

        const batidasDoDia = todasBatidas.filter(b => {
          const dataB = b.dataHora;
          return dataB.getFullYear() === anoInt &&
                 (dataB.getMonth() + 1) === mesInt &&
                 dataB.getDate() === dia;
        });

        batidasDoDia.forEach(b => {
          (b as any).dataCalculoReal = b.modificacoes && b.modificacoes.length > 0 
            ? b.modificacoes[0].dataHoraNova 
            : b.dataHora;
        });

        batidasDoDia.sort((a, b) => (a as any).dataCalculoReal.getTime() - (b as any).dataCalculoReal.getTime());

        const batidasValidasParaCalculo = batidasDoDia.filter(b => {
          return !(b.modificacoes && b.modificacoes.length > 0 && b.modificacoes[0].dataHoraNova.getTime() === 0);
        });

        let trabalhaNoDia = false;
        let entradaEsperadaStr = '';
        let saidaEsperadaStr = '';

        if (usuario.Horario) {
          const h = usuario.Horario;
          if (h.tipoEscala === 'SEMANAL') {
            if (diaSemanaNum >= 1 && diaSemanaNum <= 5) {
              trabalhaNoDia = true; 
              entradaEsperadaStr = h.horaEntradaPadrao; 
              saidaEsperadaStr = h.horaSaidaPadrao; 
            } else if (diaSemanaNum === 6 && (h as any).trabalhaSabado) {
              trabalhaNoDia = true; 
              entradaEsperadaStr = (h as any).horaEntradaSabado || h.horaEntradaPadrao; 
              saidaEsperadaStr = (h as any).horaSaidaSabado || h.horaSaidaPadrao; 
            } else if (diaSemanaNum === 0 && (h as any).trabalhaDomingo) {
              trabalhaNoDia = true; 
              entradaEsperadaStr = (h as any).horaEntradaDomingo || h.horaEntradaPadrao; 
              saidaEsperadaStr = (h as any).horaSaidaDomingo || h.horaSaidaPadrao;
            }
          } else if (h.tipoEscala === 'ALTERNADA') {
            const dataReferenciaUsuario = usuario.dataInicioEscala 
              ? new Date(usuario.dataInicioEscala) 
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

        let minutosTrabalhadosNoDia = 0;
        let saldoDoDiaMinutos = 0;
        let status = 'FOLGA';

        if (trabalhaNoDia) {
          status = 'FALTA';
          if (batidasValidasParaCalculo.length > 0) {
            status = 'TRABALHADO';
            for (let i = 0; i < batidasValidasParaCalculo.length; i += 2) {
              if (i + 1 < batidasValidasParaCalculo.length) {
                const entradaMinutos = transformarEmMinutos((batidasValidasParaCalculo[i] as any).dataCalculoReal.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' }));
                const saidaMinutos = transformarEmMinutos((batidasValidasParaCalculo[i+1] as any).dataCalculoReal.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' }));
                minutosTrabalhadosNoDia += (saidaMinutos - entradaMinutos);
              }
            }

            const minutosContratuaisEsperados = transformarEmMinutos(saidaEsperadaStr) - transformarEmMinutos(entradaEsperadaStr);
            const duracaoAlmocoConfigurada = usuario.Horario?.duracaoAlmocoMinutos || 60;
            
            let cargaHorariaComAlmocoDefinida = minutosContratuaisEsperados - duracaoAlmocoConfigurada;

            if (usuario.Horario?.utilizaAlmocoAutomatico) {
              if (batidasValidasParaCalculo.length === 2) {
                minutosTrabalhadosNoDia -= duracaoAlmocoConfigurada;
                if (minutosTrabalhadosNoDia < 0) minutosTrabalhadosNoDia = 0;
              } else if (batidasValidasParaCalculo.length >= 4) {
                const primeiroAlmocoEntrada = transformarEmMinutos((batidasValidasParaCalculo[1] as any).dataCalculoReal.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' }));
                const primeiroAlmocoSaida = transformarEmMinutos((batidasValidasParaCalculo[2] as any).dataCalculoReal.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' }));
                const almocoRealMinutos = primeiroAlmocoSaida - primeiroAlmocoEntrada;
                const diferencaDeAlmocoTolerada = duracaoAlmocoConfigurada - almocoRealMinutos;
                if (diferencaDeAlmocoTolerada > 0) {
                  minutosTrabalhadosNoDia -= diferencaDeAlmocoTolerada;
                }
              }
            }

            if (minutosTrabalhadosNoDia === 0 && batidasValidasParaCalculo.length === 0) {
              status = 'FALTA';
            } else {
              saldoDoDiaMinutos = minutosTrabalhadosNoDia - cargaHorariaComAlmocoDefinida;
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
              const duracaoAlmocoConfigurada = usuario.Horario?.duracaoAlmocoMinutos || 60;
              const cargaDeveriaTerSidoFeita = minutosContratuaisEsperados - duracaoAlmocoConfigurada;
              saldoDoDiaMinutos = -cargaDeveriaTerSidoFeita;
            }
          }
        } else {
          if (batidasValidasParaCalculo.length > 0) {
            status = 'EXTRA_FOLGA';
            for (let i = 0; i < batidasValidasParaCalculo.length; i += 2) {
              if (i + 1 < batidasValidasParaCalculo.length) {
                const entradaMinutos = transformarEmMinutos((batidasValidasParaCalculo[i] as any).dataCalculoReal.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' }));
                const saidaMinutos = transformarEmMinutos((batidasValidasParaCalculo[i+1] as any).dataCalculoReal.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' }));
                minutosTrabalhadosNoDia += (saidaMinutos - entradaMinutos);
              }
            }
            saldoDoDiaMinutos = minutosTrabalhadosNoDia;
          }
        }

        saldoBancoHorasMinutos += saldoDoDiaMinutos;

        const batidasFiltradasParaExibicao = batidasDoDia.filter(b => {
          return !(b.modificacoes && b.modificacoes.length > 0 && b.modificacoes[0].dataHoraNova.getTime() === 0);
        });

        // Só os horários. O rótulo de folga ou falta e o estilo dele saem do
        // `status` na hora de desenhar: antes vinham embutidos aqui como
        // `<span style="...">FOLGA</span>`, o que acoplava dado a apresentação.
        const batidas = batidasFiltradasParaExibicao.map(b =>
          (b as any).dataCalculoReal.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' })
        );

        historicoDias.push({
          data: dataCorrenteStr,
          status,
          batidas,
          horasTrabalhadas: formatarMinutosParaHoras(minutosTrabalhadosNoDia),
          saldoDoDia: formatarMinutosParaHoras(saldoDoDiaMinutos)
        });
      }

      // O layout vive em config/pdf.ts. Aqui fica apenas o dado: o controller
      // nao monta mais marcacao, e por isso nao ha mais o que escapar.
      const pdf = await gerarEspelhoDePonto({
        empresa: {
          razaoSocial: usuario.empresa?.razaoSocial ?? '',
          cnpj: usuario.empresa?.cnpj ?? ''
        },
        funcionario: {
          nome: usuario.nome,
          cpf: usuario.cpf || 'Nao cadastrado'
        },
        periodo: `${String(mesInt).padStart(2, '0')}/${anoInt}`,
        emitidoEm: new Date().toLocaleDateString('pt-BR'),
        dias: historicoDias as DiaDoEspelho[],
        totalFaltas,
        saldoAcumulado: formatarMinutosParaHoras(saldoBancoHorasMinutos)
      });

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename=espelho-ponto-${usuarioId}.pdf`);
      res.status(200).send(pdf);

    } catch (error) {
      console.error(error);
      res.status(500).json({ erro: 'Falha crítica ao renderizar arquivo de impressão do espelho.' });
    }
  },

  async downloadAEF(req: Request, res: Response): Promise<void> {
    try {
      // 🛡️ CASTING ESTRITO: Impede o conflito de string | string[]
      const dataInicio = req.query.dataInicio as string;
      const dataFim = req.query.dataFim as string;
      const empresaId = (req as any).empresaId as string;

      if (!dataInicio || !dataFim) {
        res.status(400).json({ erro: 'As datas de início e fim são obrigatórias para a extração fiscal.' });
        return;
      }

      const empresa = await prisma.empresa.findUnique({
        where: { id: empresaId }
      });

      if (!empresa) {
        res.status(404).json({ erro: 'Empresa contratante não localizada.' });
        return;
      }

      const conteudoTxt = await gerarConteudoAEF(
        new Date(dataInicio),
        new Date(dataFim),
        empresa.cnpj,
        empresa.razaoSocial
      );

      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.setHeader('Content-Disposition', 'attachment; filename=AEF_Portaria671.txt');
      
      res.status(200).send(conteudoTxt);
    } catch (error) {
      console.error(error);
      res.status(500).json({ erro: 'Falha crítica ao compilar e estruturar o arquivo fiscal AEF.' });
    }
  }
};