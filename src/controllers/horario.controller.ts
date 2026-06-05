import { Request, Response } from 'express';
import { prisma } from '../config/prisma';

export const HorarioController = {
  // 1. CRIAR JORNADA (ISOLADA POR EMPRESA)
  async criarHorario(req: Request, res: Response): Promise<void> {
    try {
      // 🛡️ CASTING ESTRITO
      const empresaId = (req as any).empresaId as string; 
      const { 
        descricao, 
        tipoEscala, 
        regrasDias, 
        trabalhaDomingoAlt, 
        domingoInicioImpar,
        utilizaAlmocoAutomatico,
        duracaoAlmocoMinutos,
        entradaAlternada, 
        saidaAlternada    
      } = req.body;

      const administradorId = (req as any).usuario?.id as string | undefined;
      const ip = (req.ip || req.socket.remoteAddress) as string | undefined;

      if (!descricao) {
        res.status(400).json({ erro: 'A descrição da jornada é obrigatória.' });
        return;
      }

      // Se for SEMANAL, busca do array. Se for ALTERNADA, assume as variáveis dedicadas
      let entradaFinal = "08:00";
      let saidaFinal = "17:00";

      if (tipoEscala === 'ALTERNADA') {
        entradaFinal = entradaAlternada || "07:00";
        saidaFinal = saidaAlternada || "19:00";
      } else {
        const regraSegunda = regrasDias?.find((d: any) => d.numero === 1) || { entrada: "08:00", saida: "17:00" };
        entradaFinal = regraSegunda.entrada;
        saidaFinal = regraSegunda.saida;
      }

      const regraSabado  = regrasDias?.find((d: any) => d.numero === 6) || { trabalha: false, entrada: "08:00", saida: "12:00" };
      const regraDomingo = regrasDias?.find((d: any) => d.numero === 0) || { trabalha: false, entrada: "08:00", saida: "12:00" };

      const [novoHorario] = await prisma.$transaction([
        prisma.horario.create({
          data: {
            descricao,
            tipoEscala: tipoEscala || 'SEMANAL',
            horaEntradaPadrao: entradaFinal, 
            horaSaidaPadrao: saidaFinal,     
            utilizaAlmocoAutomatico: utilizaAlmocoAutomatico !== undefined ? utilizaAlmocoAutomatico : true,
            duracaoAlmocoMinutos: utilizaAlmocoAutomatico !== undefined ? Number(duracaoAlmocoMinutos) : 60,
            trabalhaSabado: tipoEscala === 'ALTERNADA' ? false : (regraSabado.trabalha || false),
            horaEntradaSabado: regraSabado.entrada,
            horaSaidaSabado: regraSabado.saida,
            trabalhaDomingo: tipoEscala === 'ALTERNADA' ? false : (regraDomingo.trabalha || false),
            horaEntradaDomingo: regraDomingo.entrada,
            horaSaidaDomingo: regraDomingo.saida,
            trabalhaDomingoAlt: trabalhaDomingoAlt || false,
            domingoInicioImpar: domingoInicioImpar !== undefined ? domingoInicioImpar : true,
            empresaId: empresaId // 🔒 Vincula a nova jornada permanentemente ao Tenant ativo
          }
        }),

        prisma.logAuditoria.create({
          data: {
            acao: 'CREATE',
            entidade: 'Horario',
            usuarioAcaoId: administradorId || null,
            ipOrigem: ip || null,
            dadosAnteriores: {},
            dadosNovos: { 
              empresaId, 
              descricao,
              escala: tipoEscala,
              horarioEfetivo: `${entradaFinal} - ${saidaFinal}`
            }
          }
        })
      ]);

      res.status(201).json({ mensagem: 'Jornada criada com sucesso!', horario: novoHorario });
    } catch (error) {
      console.error(error);
      res.status(500).json({ erro: 'Erro interno ao salvar jornada.' });
    }
  },

  // 2. LISTAR JORNADAS (FILTRADO POR EMPRESA)
  async listarHorarios(req: Request, res: Response): Promise<void> {
    try {
      // 🛡️ CASTING ESTRITO
      const empresaId = (req as any).empresaId as string; 

      const horarios = await prisma.horario.findMany({
        where: {
          empresaId: empresaId // 🔒 Só exibe as escalas pertencentes a esta empresa!
        },
        orderBy: { descricao: 'asc' }
      });
      res.status(200).json(horarios);
    } catch (error) {
      console.error('Erro ao listar horários:', error);
      res.status(500).json({ erro: 'Erro interno ao buscar horários.' });
    }
  }, 

  // 3. ATUALIZAR JORNADA (VALIDANDO PROPRIEDADE CORPORATIVA)
  async atualizarHorario(req: Request, res: Response): Promise<void> {
    try {
      // 🛡️ CASTING ESTRITO
      const id = req.params.id as string;
      const empresaId = (req as any).empresaId as string; 
      const { 
        descricao, 
        tipoEscala, 
        regrasDias, 
        trabalhaDomingoAlt, 
        domingoInicioImpar,
        utilizaAlmocoAutomatico,
        duracaoAlmocoMinutos,
        entradaAlternada, 
        saidaAlternada    
      } = req.body;

      const administradorId = (req as any).usuario?.id as string | undefined;
      const ip = (req.ip || req.socket.remoteAddress) as string | undefined;

      // 🔒 Valida rigorosamente se o Horário pertence a esta empresa antes de atualizar
      const horarioExistente = await prisma.horario.findFirst({ 
        where: { 
          id: id,
          empresaId: empresaId 
        } 
      });

      if (!horarioExistente) {
        res.status(404).json({ erro: 'Jornada não encontrada ou não pertence a esta organização.' });
        return;
      }

      const escalaAtual = tipoEscala || horarioExistente.tipoEscala;
      let entradaFinal = horarioExistente.horaEntradaPadrao;
      let saidaFinal = horarioExistente.horaSaidaPadrao;

      if (escalaAtual === 'ALTERNADA') {
        if (entradaAlternada) entradaFinal = entradaAlternada;
        if (saidaAlternada) saidaFinal = saidaAlternada;
      } else {
        const interrogadoSegunda = regrasDias?.find((d: any) => d.numero === 1);
        if (interrogadoSegunda) {
          entradaFinal = interrogadoSegunda.entrada;
          saidaFinal = interrogadoSegunda.saida;
        }
      }

      const interrogadoSabado  = regrasDias?.find((d: any) => d.numero === 6);
      const interrogadoDomingo = regrasDias?.find((d: any) => d.numero === 0);

      const [horarioAtualizado] = await prisma.$transaction([
        prisma.horario.update({
          where: { id },
          data: {
            descricao: descricao || horarioExistente.descricao,
            tipoEscala: escalaAtual,
            horaEntradaPadrao: entradaFinal, 
            horaSaidaPadrao: saidaFinal,     
            ...(escalaAtual !== 'ALTERNADA' && interrogadoSabado && {
              trabalhaSabado: interrogadoSabado.trabalha,
              horaEntradaSabado: interrogadoSabado.entrada,
              horaSaidaSabado: interrogadoSabado.saida
            }),
            ...(escalaAtual !== 'ALTERNADA' && interrogadoDomingo && {
              trabalhaDomingo: interrogadoDomingo.trabalha,
              horaEntradaDomingo: interrogadoDomingo.entrada,
              horaSaidaDomingo: interrogadoDomingo.saida
            }),
            utilizaAlmocoAutomatico: utilizaAlmocoAutomatico !== undefined ? utilizaAlmocoAutomatico : horarioExistente.utilizaAlmocoAutomatico,
            duracaoAlmocoMinutos: duracaoAlmocoMinutos !== undefined ? Number(duracaoAlmocoMinutos) : horarioExistente.duracaoAlmocoMinutos,
            trabalhaDomingoAlt: trabalhaDomingoAlt !== undefined ? trabalhaDomingoAlt : horarioExistente.trabalhaDomingoAlt,
            domingoInicioImpar: domingoInicioImpar !== undefined ? domingoInicioImpar : horarioExistente.domingoInicioImpar
          }
        }),

        prisma.logAuditoria.create({
          data: {
            acao: 'UPDATE',
            entidade: 'Horario',
            usuarioAcaoId: administradorId || null,
            ipOrigem: ip || null,
            dadosAnteriores: horarioExistente as any,
            dadosNovos: { 
              empresaId, // Registra o Tenant na trilha fiscal
              descricao: descricao || horarioExistente.descricao,
              utilizaAlmocoAutomatico,
              duracaoAlmocoMinutos,
              horaEntradaPadrao: entradaFinal,
              horaSaidaPadrao: saidaFinal
            }
          }
        })
      ]);

      res.status(200).json({ mensagem: 'Jornada atualizada com sucesso!', horario: horarioAtualizado });
    } catch (error) {
      console.error(error);
      res.status(500).json({ erro: 'Erro interno ao atualizar jornada.' });
    }
  }
};