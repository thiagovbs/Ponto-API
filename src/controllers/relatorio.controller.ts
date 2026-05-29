import { Request, Response } from 'express';
import { prisma } from '../config/prisma';

// Funções auxiliares para cálculo de horas
const transformarEmMinutos = (horarioStr: string): number => {
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
  // 1. DASHBOARD GERAL (Painel Inicial do Admin)
  async dashboardGeral(req: Request, res: Response): Promise<void> {
    try {
      const hoje = new Date();
      hoje.setHours(0, 0, 0, 0);

      const totalFuncionarios = await prisma.usuario.count({
        where: { perfil: 'FUNCIONARIO' }
      });

      const batidasHoje = await prisma.batidaPonto.count({
        where: { dataHora: { gte: hoje } }
      });

      const seteDiasAtras = new Date();
      seteDiasAtras.setDate(seteDiasAtras.getDate() - 7);

      const ultimasBatidasGrafico = await prisma.batidaPonto.findMany({
        where: { dataHora: { gte: seteDiasAtras } },
        select: { dataHora: true }
      });

      const feedAtividades = await prisma.batidaPonto.findMany({
        take: 5,
        orderBy: { dataHora: 'desc' },
        include: {
          usuario: { select: { nome: true } }
        }
      });

      const contagemDias: { [key: string]: number } = {};
      for (let i = 6; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        const dataStr = d.toLocaleDateString('pt-BR', { weekday: 'short' });
        contagemDias[dataStr] = 0;
      }

      ultimasBatidasGrafico.forEach(b => {
        const diaSemana = b.dataHora.toLocaleDateString('pt-BR', { weekday: 'short' });
        if (contagemDias[diaSemana] !== undefined) {
          contagemDias[diaSemana]++;
        }
      });

      res.status(200).json({
        totalFuncionarios,
        batidasHoje,
        statusSistema: "Operacional",
        graficoSemanal: {
          labels: Object.keys(contagemDias),
          dados: Object.values(contagemDias)
        },
        feedAtividades: feedAtividades.map(f => ({
          id: f.id,
          nome: f.usuario.nome,
          hora: f.dataHora.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' }),
          foto: f.fotoBase64,
          latitude: f.latitude,
          longitude: f.longitude
        }))
      });
    } catch (error) {
      console.error(error);
      res.status(500).json({ erro: 'Erro interno ao carregar dados.' });
    }
  },

  // 2. RELATÓRIO MENSAL E DASHBOARD POR FUNCIONÁRIO (LÓGICA DO ALMOÇO + AUDITORIA CORRIGIDA)
  async relatorioMensalPorFuncionario(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const mes = Number(req.query.mes) || new Date().getMonth() + 1;
      const ano = Number(req.query.ano) || new Date().getFullYear();

      const usuario = await prisma.usuario.findUnique({
        where: { id },
        include: { horarioBase: true }
      });

      if (!usuario) {
        res.status(404).json({ erro: 'Funcionário não encontrado.' });
        return;
      }

      const inicioMes = new Date(ano, mes - 1, 1);
      const fimMes = new Date(ano, mes, 0, 23, 59, 59);
      const totalDiasNoMes = fimMes.getDate();

      const batidas = await prisma.batidaPonto.findMany({
        where: {
          usuarioId: id,
          dataHora: { gte: inicioMes, lte: fimMes }
        },
        include: {
          modificacoes: {
            orderBy: { createdAt: 'desc' }
          }
        },
        orderBy: { dataHora: 'asc' }
      });

      const batidasAgrupadasPorDia: { [key: string]: any[] } = {};
      batidas.forEach(b => {
        const possuiModificacao = b.modificacoes && b.modificacoes.length > 0;
        const dataParaCalculo = possuiModificacao ? b.modificacoes[0].dataHoraNova : b.dataHora;

        const anoB = dataParaCalculo.getFullYear();
        const mesB = String(dataParaCalculo.getMonth() + 1).padStart(2, '0');
        const diaB = String(dataParaCalculo.getDate()).padStart(2, '0');
        const dataStr = `${anoB}-${mesB}-${diaB}`;
        
        if (!batidasAgrupadasPorDia[dataStr]) {
          batidasAgrupadasPorDia[dataStr] = [];
        }
        
        // 🔥 Correção do Item 2: Armazena a data real recalculada (original ou ajustada)
        (b as any).dataCalculoReal = dataParaCalculo;
        batidasAgrupadasPorDia[dataStr].push(b);
      });

      let saldoBancoHorasMinutos = 0;
      let totalFaltas = 0;
      const historicoDias = [];

      for (let dia = 1; dia <= totalDiasNoMes; dia++) {
        const dataCorrente = new Date(ano, mes - 1, dia);
        
        const anoCStr = dataCorrente.getFullYear();
        const mesCStr = String(dataCorrente.getMonth() + 1).padStart(2, '0');
        const diaCStr = String(dataCorrente.getDate()).padStart(2, '0');
        const dataCorrenteStr = `${anoCStr}-${mesCStr}-${diaCStr}`;
        
        const diaDaSemana = dataCorrente.getDay();
        const numeroSemana = obterNumeroSemanaAno(dataCorrente);
        const ehSemanaImpar = numeroSemana % 2 !== 0;

        let trabalhaNesseDia = diaDaSemana !== 0 && diaDaSemana !== 6;
        let entradaEsperada = "08:00";
        let saidaEsperada = "17:00";
        let minutosEsperadosNoDia = 480;

        if (usuario.horarioBase) {
          entradaEsperada = usuario.horarioBase.horaEntradaPadrao;
          saidaEsperada = usuario.horarioBase.horaSaidaPadrao;
          
          let diferencaBrutaEsperada = transformarEmMinutos(saidaEsperada) - transformarEmMinutos(entradaEsperada);
          
          if (usuario.horarioBase.utilizaAlmocoAutomatico) {
            const minutosAlmoco = usuario.horarioBase.duracaoAlmocoMinutos || 60;
            minutosEsperadosNoDia = diferencaBrutaEsperada - minutosAlmoco;
          } else {
            minutosEsperadosNoDia = diferencaBrutaEsperada;
          }

          if (usuario.horarioBase.tipoEscala === 'ALTERNADA') {
            const dataAncora = usuario.dataInicioEscala 
              ? new Date(usuario.dataInicioEscala) 
              : new Date(ano, mes - 1, 1);

            const anoA = dataAncora.getUTCFullYear();
            const mesA = dataAncora.getUTCMonth();
            const diaA = dataAncora.getUTCDate();

            const anoC = dataCorrente.getFullYear();
            const mesC = dataCorrente.getMonth();
            const diaC = dataCorrente.getDate();

            const dataAncoraUTC = Date.UTC(anoA, mesA, diaA);
            const dataAtualUTC = Date.UTC(anoC, mesC, diaC);

            const diferencaTempo = dataAtualUTC - dataAncoraUTC;
            const diferencaDias = Math.round(diferencaTempo / (1000 * 60 * 60 * 24));

            if (diferencaDias >= 0) {
              trabalhaNesseDia = diferencaDias % 2 === 0;
            } else {
              trabalhaNesseDia = false;
            }

            if (!trabalhaNesseDia) {
              minutosEsperadosNoDia = 0;
            }
          } 
          else {
            if (diaDaSemana === 6) {
              trabalhaNesseDia = usuario.horarioBase.trabalhaSabado;
              if (trabalhaNesseDia) {
                entradaEsperada = usuario.horarioBase.horaEntradaSabado || entradaEsperada;
                saidaEsperada = usuario.horarioBase.horaSaidaSabado || saidaEsperada;
                minutosEsperadosNoDia = transformarEmMinutos(saidaEsperada) - transformarEmMinutos(entradaEsperada);
              } else {
                minutosEsperadosNoDia = 0;
              }
            }

            if (diaDaSemana === 0) {
              if (usuario.horarioBase.trabalhaDomingo) {
                entradaEsperada = usuario.horarioBase.horaEntradaDomingo || entradaEsperada;
                saidaEsperada = usuario.horarioBase.horaSaidaDomingo || saidaEsperada;

                if (usuario.horarioBase.trabalhaDomingoAlt) {
                  if (usuario.horarioBase.domingoInicioImpar) {
                    trabalhaNesseDia = ehSemanaImpar;
                  } else {
                    trabalhaNesseDia = !ehSemanaImpar;
                  }
                } else {
                  trabalhaNesseDia = true;
                }

                if (trabalhaNesseDia) {
                  minutosEsperadosNoDia = transformarEmMinutos(saidaEsperada) - transformarEmMinutos(entradaEsperada);
                } else {
                  minutosEsperadosNoDia = 0;
                }
              } else {
                trabalhaNesseDia = false;
                minutosEsperadosNoDia = 0;
              }
            }
          }
        }

        const batidasDoDia = batidasAgrupadasPorDia[dataCorrenteStr] || [];
        let minutesTrabalhadosNoDia = 0;
        let saldoDoDiaMinutos = 0;
        let status = 'Regular';

        // === 🛠️ 1. GANCHOS DO ITEM 3: ABAIXO COLOCAREMOS A VALIDAÇÃO DE FÉRIAS/AFASTAMENTOS ===
        let possuiAfastamento = false;
        let tipoAfastamentoTexto = ""; 
        // ====================================================================================

        // === CÁLCULO DE TEMPO TRABALHADO BASEADO NA TRILHA DE AUDITORIA ===
        if (batidasDoDia.length >= 2) {
          for (let i = 0; i < batidasDoDia.length; i += 2) {
            if (batidasDoDia[i + 1]) {
              // 🔥 Correção Item 2: Usa 'dataCalculoReal' em vez de 'dataHora' para calcular o tempo ajustado
              const diffMs = batidasDoDia[i + 1].dataCalculoReal.getTime() - batidasDoDia[i].dataCalculoReal.getTime();
              minutesTrabalhadosNoDia += Math.floor(diffMs / 1000 / 60);
            }
          }
          
          if (batidasDoDia.length === 2 && usuario.horarioBase?.utilizaAlmocoAutomatico) {
            const minutosAlmoco = usuario.horarioBase.duracaoAlmocoMinutos || 60;
            if (minutesTrabalhadosNoDia > minutosAlmoco) {
              minutesTrabalhadosNoDia -= minutosAlmoco;
            }
          }
          
          if (trabalhaNesseDia) {
            saldoDoDiaMinutos = minutesTrabalhadosNoDia - minutosEsperadosNoDia;
            if (saldoDoDiaMinutos < -10) status = 'Atraso';
            else if (saldoDoDiaMinutos > 10) status = 'Hora Extra';
            else status = 'Regular';
          } else {
            saldoDoDiaMinutos = minutesTrabalhadosNoDia;
            status = 'Trabalho em Folga';
          }
        } else if (batidasDoDia.length === 1) {
          status = 'Batida Incompleta';
          saldoDoDiaMinutos = trabalhaNesseDia ? -minutosEsperadosNoDia : 0;
        } else {
          // 🔥 Modificação para interceptar Férias e Afastamentos no cálculo
          if (possuiAfastamento) {
            status = tipoAfastamentoTexto; // Ex: 'Férias', 'Atestado Médico'
            saldoDoDiaMinutos = 0; // Afastamento legal não debita banco de horas
          } else if (trabalhaNesseDia) {
            status = 'Falta';
            totalFaltas++;
            saldoDoDiaMinutos = -minutosEsperadosNoDia;
          } else {
            status = 'Folga';
            saldoDoDiaMinutos = 0;
          }
        }

        saldoBancoHorasMinutos += saldoDoDiaMinutos;

        // 🔥 Correção Item 2: Envia os metadados de auditoria e horários originais para a tabela Vue
        const batidasFormatadasComCoordenadas = batidasDoDia.map(b => {
          const foiModificado = b.modificacoes && b.modificacoes.length > 0;
          return {
            id: b.id,
            // Exibe a hora efetiva (corrigida se houver alteração)
            hora: b.dataCalculoReal.toLocaleTimeString('pt-BR', { 
              hour: '2-digit', 
              minute: '2-digit', 
              timeZone: 'America/Sao_Paulo' 
            }),
            foiAlterada: foiModificado,
            justificativa: foiModificado ? b.modificacoes[0].justificativa : null,
            horaOriginal: b.dataHora.toLocaleTimeString('pt-BR', {
              hour: '2-digit',
              minute: '2-digit',
              timeZone: 'America/Sao_Paulo'
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
      console.error('Erro crítico capturado na geração do relatório:', error);
      res.status(500).json({ erro: 'Erro interno ao processar relatório.' });
    }
  }
};