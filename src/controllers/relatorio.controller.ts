import { Request, Response } from 'express';
import { prisma } from '../config/prisma';
import HTMLPDF from 'html-pdf-node';
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
  async dashboardGeral(req: Request, res: Response): Promise<void> {
    try {
      const { empresaId } = req;
      const hoje = new Date();
      const dataInicio = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate(), 0, 0, 0);
      const dataFim = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate(), 23, 59, 59);

      const [totalFuncionarios, batidasHoje, feedAtividades] = await prisma.$transaction([
        prisma.usuario.count({
          where: { perfil: 'FUNCIONARIO', empresaId: empresaId }
        }),
        prisma.batidaPonto.count({
          where: {
            empresaId: empresaId,
            dataHora: {
              gte: dataInicio,
              lte: dataFim
            }
          }
        }),
        prisma.batidaPonto.findMany({
          where: {
            empresaId: empresaId,
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
          hour: f.dataHora.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' }),
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
      const { usuarioId } = req.params;
      const { mes, ano } = req.query;
      const { empresaId } = req;

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

      const mesInt = parseInt(mes as string, 10);
      const anoInt = parseInt(ano as string, 10);

      const dataInicio = new Date(anoInt, mesInt - 1, 1);
      const dataFim = new Date(anoInt, mesInt, 0, 23, 59, 59);

      const todasBatidas = await prisma.batidaPonto.findMany({
        where: {
          usuarioId,
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

        // 🟢 REGRA FISCAL DE AUDITORIA: Filtra apenas as batidas válidas que NÃO foram desconsideradas
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

            const minutesContratuaisEsperados = transformarEmMinutos(saidaEsperadaStr) - transformarEmMinutos(entradaEsperadaStr);
            const duracaoAlmocoConfigurada = usuario.Horario?.duracaoAlmocoMinutos || 60;
            
            let cargaHorariaComAlmocoDefinida = minutesContratuaisEsperados - duracaoAlmocoConfigurada;

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

        // O mapeamento estruturado do feed para o Dashboard Web se mantém intacto
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
      const { usuarioId } = req.params;
      const { mes, ano } = req.query;
      const { empresaId } = req;

      if (!usuarioId || !mes || !ano) {
        res.status(400).json({ erro: 'Parâmetros insuficientes para geração do documento.' });
        return;
      }

      const usuario = await prisma.usuario.findFirst({
        where: { id: usuarioId, empresaId: empresaId },
        include: { Horario: true, afastamentos: true, empresa: true }
      });

      if (!usuario) {
        res.status(404).json({ erro: 'Colaborador não identificado.' });
        return;
      }

      const mesInt = parseInt(mes as string, 10);
      const anoInt = parseInt(ano as string, 10);

      const dataInicio = new Date(anoInt, mesInt - 1, 1);
      const dataFim = new Date(anoInt, mesInt, 0, 23, 59, 59);

      const todasBatidas = await prisma.batidaPonto.findMany({
        where: {
          usuarioId,
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

        // 🟢 FILTRAGEM FISCAL PARA O PDF TEMPLATE: Remove marcações invalidadas
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

        // Loop original de formatação de string mantido integralmente para herança visual estável do HTML
        const batidasTexto = batidasFiltradasParaExibicao.length > 0 
          ? batidasFiltradasParaExibicao.map(b => (b as any).dataCalculoReal.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' })).join('  |  ') 
          : (status === 'FOLGA' ? '<span style="color:#777; font-style:italic;">FOLGA</span>' : '<span style="color:#dc2626; font-weight:bold;">FALTA UNIFICADA</span>');

        historicoDias.push({
          data: dataCorrenteStr,
          status,
          batidasTexto,
          horasTrabalhadas: formatarMinutosParaHoras(minutosTrabalhadosNoDia),
          saldoDoDia: formatarMinutosParaHoras(saldoDoDiaMinutos)
        });
      }

      let linhasHtml = '';
      historicoDias.forEach(dia => {
        if (dia.status === 'AFASTADO') {
          linhasHtml += `
            <tr style="line-height: 1.1; background-color: #f4fbf7;">
              <td style="border: 1px solid #444; padding: 3px; text-align: center;">${dia.data}</td>
              <td colspan="3" style="border: 1px solid #444; padding: 3px; text-align: center; color: #155724; font-weight: bold; font-size: 7.5pt; letter-spacing: 0.3px;">
                ${dia.observacao}
              </td>
            </tr>
          `;
        } else {
          linhasHtml += `
            <tr style="line-height: 1.1;">
              <td style="border: 1px solid #444; padding: 3px; text-align: center;">${dia.data}</td>
              <td style="border: 1px solid #444; padding: 3px; text-align: left; padding-left: 8px; letter-spacing: 0.3px;">${dia.batidasTexto}</td>
              <td style="border: 1px solid #444; padding: 3px; text-align: center;">${dia.horasTrabalhadas}</td>
              <td style="border: 1px solid #444; padding: 3px; text-align: center;">${dia.saldoDoDia}</td>
            </tr>
          `;
        }
      });

      const htmlCompleto = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="UTF-8">
          <style>
            @page { 
              size: A4; 
              margin: 12mm 12mm 10mm 12mm;
            }
            body { 
              font-family: Arial, sans-serif; 
              font-size: 8pt; 
              color: #000; 
              line-height: 1.15;
              margin: 0;
              padding: 0;
            }
            .header { border: 1px solid #000; padding: 6px 10px; margin-bottom: 6px; }
            .title { text-align: center; font-size: 11pt; font-weight: bold; margin: 0 0 2px 0; text-transform: uppercase; letter-spacing: 0.5px; }
            table { width: 100%; border-collapse: collapse; margin-bottom: 6px; }
            th { border: 1px solid #444; background-color: #eaeaea; padding: 4px; font-weight: bold; text-align: center; font-size: 8pt; }
            .signatures { width: 100%; margin-top: 10px; }
            .line { border-top: 1px solid #000; width: 85%; margin: 20px auto 3px auto; text-align: center; }
            .resumo-box { float: right; width: 40%; border: 1px solid #000; padding: 5px; background-color: #fafafa; margin-bottom: 6px; }
            .clear { clear: both; }
          </style>
        </head>
        <body>
          <div class="header">
            <div class="title">Espelho de Ponto Eletrônico</div>
            <table style="width:100%; border:none; margin:0; font-size: 8.5pt;">
              <tr style="border:none;">
                <td style="border:none; padding:1px;"><strong>Empregador:</strong> ${usuario.empresa?.razaoSocial}</td>
                <td style="border:none; padding:1px; text-align:right;"><strong>CNPJ:</strong> ${usuario.empresa?.cnpj}</td>
              </tr>
              <tr style="border:none;">
                <td style="border:none; padding:1px;"><strong>Funcionário:</strong> ${usuario.nome}</td>
                <td style="border:none; padding:1px; text-align:right;"><strong>Período de Referência:</strong> ${String(mesInt).padStart(2, '0')}/${anoInt}</td>
              </tr>
              <tr style="border:none;">
                <td style="border:none; padding:1px;"><strong>CPF:</strong> ${usuario.cpf || 'Não cadastrado'}</td>
                <td style="border:none; padding:1px; text-align:right;"><strong>Data de Emissão:</strong> ${new Date().toLocaleDateString('pt-BR')}</td>
              </tr>
            </table>
          </div>

          <table>
            <thead>
              <tr>
                <th width="15%">Data</th>
                <th width="55%">Marcações Registradas (Horas)</th>
                <th width="15%">Trabalhadas</th>
                <th width="15%">Saldo do Dia</th>
              </tr>
            </thead>
            <tbody>
              ${linhasHtml}
            </tbody>
          </table>

          <div class="resumo-box">
            <strong>Total de Faltas no Período:</strong> ${totalFaltas} dia(s) <br/>
            <strong>Saldo Acumulado no Mês:</strong> ${formatarMinutosParaHoras(saldoBancoHorasMinutos)}
          </div>
          <div class="clear"></div>

          <div class="signatures">
            <p style="font-size: 7.5pt; text-align: justify; margin: 0 0 10px 0; color: #222;">
              Reconheço a fidelidade e a exatidão das marcações de horários e períodos aqui expostas, em total conformidade com o artigo 74 da Consolidação das Leis do Trabalho (CLT).
            </p>
            <table style="border: none; width: 100%; margin-top: 5px;">
              <tr style="border: none;">
                <td style="border: none; width: 50%; text-align: center; padding: 0;">
                  <div class="line"></div>
                  <strong>${usuario.nome}</strong><br/>
                  <span style="font-size:7.5pt; color:#444;">Assinatura do Funcionário</span>
                </td>
                <td style="border: none; width: 50%; text-align: center; padding: 0;">
                  <div class="line"></div>
                  <strong>Representante Legal</strong><br/>
                  <span style="font-size:7.5pt; color:#444;">Assinatura do Empregador</span>
                </td>
              </tr>
            </table>
          </div>
        </body>
        </html>
      `;

      const options = { format: 'A4' };
      const file = { content: htmlCompleto };

      HTMLPDF.generatePdf(file, options).then((pdfBuffer: Buffer) => {
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename=espelho-ponto-${usuarioId}.pdf`);
        res.status(200).send(pdfBuffer);
      });

    } catch (error) {
      console.error(error);
      res.status(500).json({ erro: 'Falha crítica ao renderizar arquivo de impressão do espelho.' });
    }
  },

  async downloadAEF(req: Request, res: Response): Promise<void> {
    try {
      const { dataInicio, dataFim } = req.query;
      const { empresaId } = req;

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
        new Date(String(dataInicio)),
        new Date(String(dataFim)),
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