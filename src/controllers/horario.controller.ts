import { Response } from 'express';
import { prisma } from '../config/prisma';
import { AuthRequest } from '../middlewares/auth.middleware'; // 🪛 Importa a sua requisição tipada do JWT

export const HorarioController = {
  // 1. CRIAR JORNADA
  async criarHorario(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { descricao, regrasDias, trabalhaDomingoAlt, domingoInicioImpar } = req.body;

      const administradorId = req.usuario?.id; // 🪛 Captura o ID do admin logado
      const ip = req.ip || req.socket.remoteAddress; // 🪛 Captura o IP de origem da requisição

      const regraSegunda = regrasDias?.find((d: any) => d.numero === 1) || { entrada: "08:00", saida: "17:00" };
      const regraSabado  = regrasDias?.find((d: any) => d.numero === 6) || { trabalha: false, entrada: "08:00", saida: "12:00" };
      const regraDomingo = regrasDias?.find((d: any) => d.numero === 0) || { trabalha: false, entrada: "08:00", saida: "12:00" };

      // Executa a inserção do Horário e do Log juntos de forma atômica
      const [novoHorario] = await prisma.$transaction([
        prisma.horario.create({
          data: {
            descricao,
            horaEntradaPadrao: regraSegunda.entrada,
            horaSaidaPadrao: regraSegunda.saida,
            
            trabalhaSabado: regraSabado.trabalha,
            horaEntradaSabado: regraSabado.entrada,
            horaSaidaSabado: regraSabado.saida,
            
            trabalhaDomingo: regraDomingo.trabalha,
            horaEntradaDomingo: regraDomingo.entrada,
            horaSaidaDomingo: regraDomingo.saida,
            
            trabalhaDomingoAlt: trabalhaDomingoAlt || false,
            domingoInicioImpar: domingoInicioImpar !== undefined ? domingoInicioImpar : true
          }
        }),

        // 🛡️ REGISTRO DA CRIAÇÃO NA TABELA DE AUDITORIA (Compatível com o Schema)
        prisma.logAuditoria.create({
          data: {
            acao: 'CREATE',
            entidade: 'Horario', // Vinculado ao modelo Horario
            usuarioAcaoId: administradorId || null,
            ipOrigem: ip || null,
            dadosAnteriores: {}, // Sem estado anterior pois é um registro novo
            dadosNovos: { // Salva o payload completo criado
              descricao,
              entradaSemana: `${regraSegunda.entrada} - ${regraSegunda.saida}`,
              trabalhaSabado: regraSabado.trabalha,
              trabalhaDomingo: regraDomingo.trabalha
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

  // 2. LISTAR JORNADAS
  async listarHorarios(req: AuthRequest, res: Response): Promise<void> {
    try {
      const horarios = await prisma.horario.findMany({
        orderBy: { descricao: 'asc' }
      });
      res.status(200).json(horarios);
    } catch (error) {
      console.error('Erro ao listar horários:', error);
      res.status(500).json({ erro: 'Erro interno ao buscar horários.' });
    }
  }, 

  // 3. ATUALIZAR JORNADA
  async atualizarHorario(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const { descricao, regrasDias, trabalhaDomingoAlt, domingoInicioImpar } = req.body;

      const administradorId = req.usuario?.id;
      const ip = req.ip || req.socket.remoteAddress;

      // 1. Busca o estado atual do Horário ANTES da modificação para compor a auditoria completa
      const horarioExistente = await prisma.horario.findUnique({ where: { id } });
      if (!horarioExistente) {
        res.status(404).json({ erro: 'Jornada não encontrada.' });
        return;
      }

      const interrogadoSegunda = regrasDias?.find((d: any) => d.numero === 1);
      const interrogadoSabado  = regrasDias?.find((d: any) => d.numero === 6);
      const interrogadoDomingo = regrasDias?.find((d: any) => d.numero === 0);

      // 2. Executa a alteração e o registro histórico juntos
      const [horarioAtualizado] = await prisma.$transaction([
        prisma.horario.update({
          where: { id },
          data: {
            descricao: descricao || horarioExistente.descricao,
            ...(interrogadoSegunda && {
              horaEntradaPadrao: interrogadoSegunda.entrada,
              horaSaidaPadrao: interrogadoSegunda.saida
            }),
            ...(interrogadoSabado && {
              trabalhaSabado: interrogadoSabado.trabalha,
              horaEntradaSabado: interrogadoSabado.entrada,
              horaSaidaSabado: interrogadoSabado.saida
            }),
            ...(interrogadoDomingo && {
              trabalhaDomingo: interrogadoDomingo.trabalha,
              horaEntradaDomingo: interrogadoDomingo.entrada,
              horaSaidaDomingo: interrogadoDomingo.saida
            }),
            trabalhaDomingoAlt: trabalhaDomingoAlt !== undefined ? trabalhaDomingoAlt : horarioExistente.trabalhaDomingoAlt,
            domingoInicioImpar: domingoInicioImpar !== undefined ? domingoInicioImpar : horarioExistente.domingoInicioImpar
          }
        }),

        // 🛡️ REGISTRO DA ATUALIZAÇÃO NO LOG DE AUDITORIA (Estado completo Antes vs Depois)
        prisma.logAuditoria.create({
          data: {
            acao: 'UPDATE',
            entidade: 'Horario',
            usuarioAcaoId: administradorId || null,
            ipOrigem: ip || null,
            dadosAnteriores: horarioExistente as any, // Estado original capturado da memória
            dadosNovos: { // Novos dados consolidados submetidos
              descricao: descricao || horarioExistente.descricao,
              trabalhaDomingoAlt: trabalhaDomingoAlt !== undefined ? trabalhaDomingoAlt : horarioExistente.trabalhaDomingoAlt
            }
          }
        })
      ]);

      res.status(200).json({ mensagem: 'Jornada updated com sucesso!', horario: horarioAtualizado });
    } catch (error) {
      console.error(error);
      res.status(500).json({ erro: 'Erro interno ao atualizar jornada.' });
    }
  }
};