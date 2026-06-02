import { Request, Response } from 'express';
import { prisma } from '../config/prisma';

export const AfastamentoController = {
  // 1. CADASTRAR UM NOVO AFASTAMENTO OU FÉRIAS
  async cadastrar(req: Request, res: Response): Promise<void> {
    try {
      const { usuarioId, tipo, dataInicio, dataFim, justificativa } = req.body;
      const { empresaId } = req; // 🔒 Injetado pelo Middleware de Tenant
      const quemCadastrouId = req.usuario?.id;
      const ip = req.ip || req.socket.remoteAddress;

      if (!usuarioId || !tipo || !dataInicio || !dataFim || !justificativa) {
        res.status(400).json({ erro: 'Todos os campos são de preenchimento obrigatório.' });
        return;
      }

      if (justificativa.trim().length < 10) {
        res.status(400).json({ erro: 'A justificativa ou observação legal deve conter no mínimo 10 caracteres.' });
        return;
      }

      // Validação de segurança: Garante que o usuário alvo pertence à mesma empresa do Admin logado
      const usuarioPertenceAEmpresa = await prisma.usuario.findFirst({
        where: {
          id: usuarioId,
          empresaId: empresaId,
        }
      });

      if (!usuarioPertenceAEmpresa) {
        res.status(403).json({ erro: 'Ação não permitida: O funcionário informado não pertence a esta empresa.' });
        return;
      }

      // Converte os inputs de data para objetos Date UTC puros
      const inicio = new Date(`${dataInicio}T00:00:00.000Z`);
      const fim = new Date(`${dataFim}T23:59:59.000Z`);

      if (inicio > fim) {
        res.status(400).json({ erro: 'A data de início do afastamento não pode ser maior que a data de término.' });
        return;
      }

      // Validação de segurança: Impede o cadastro se o funcionário já tiver outra ausência ativa no mesmo período e mesma empresa
      const conflitoPeriodo = await prisma.afastamento.findFirst({
        where: {
          usuarioId,
          empresaId, // 🔒 Isolamento de escopo
          OR: [
            { dataInicio: { lte: fim }, dataFim: { gte: inicio } }
          ]
        }
      });

      if (conflitoPeriodo) {
        res.status(409).json({ 
          erro: `Conflito de Período: O colaborador já possui um afastamento do tipo [${conflitoPeriodo.tipo}] agendado ou ativo entre este intervalo.` 
        });
        return;
      }

      // Executa a inserção e grava o log de auditoria exigido pela fiscalização do MTE
      const resultado = await prisma.$transaction(async (tx) => {
        const novoAfastamento = await tx.afastamento.create({
          data: {
            usuarioId,
            tipo,
            dataInicio: inicio,
            dataFim: fim,
            justificativa,
            empresaId: empresaId! // 🔒 Grava vinculando ao Tenant atual
          },
          include: {
            usuario: { select: { nome: true, cpf: true } }
          }
        });

        await tx.logAuditoria.create({
          data: {
            acao: 'CREATE',
            entidade: 'Afastamento',
            usuarioAcaoId: quemCadastrouId || null,
            ipOrigem: ip || null,
            dadosAnteriores: {},
            dadosNovos: {
              empresaId,
              funcionarioNome: novoAfastamento.usuario.nome,
              cpf: novoAfastamento.usuario.cpf,
              tipoAfastamento: tipo,
              periodo: `${dataInicio} até ${dataFim}`,
              motivo: justificativa
            }
          }
        });

        return novoAfastamento;
      });

      res.status(201).json({
        mensagem: 'Férias/Afastamento cadastrado e provisionado no sistema com sucesso.',
        afastamento: resultado
      });

    } catch (error) {
      console.error('Erro ao cadastrar afastamento:', error);
      res.status(500).json({ erro: 'Falha interna ao provisionar período de afastamento.' });
    }
  },

  // 2. LISTAR TODOS OS AFASTAMENTOS LANÇADOS (CORRIGIDO E MULTI-TENANT)
  async listar(req: Request, res: Response): Promise<void> {
    try {
      const { usuarioId } = req.query;
      const { empresaId } = req; // Injetado pelo middleware

      // 🟢 CORRIGIDO: Monta a query espalhando os filtros dinâmicos de forma nativa para o Prisma
      const whereClause: any = {
        empresaId: empresaId // 🔒 DADOS ISOLADOS! Nenhuma outra empresa vaza aqui.
      };

      if (usuarioId) {
        whereClause.usuarioId = usuarioId as string;
      }

      const afastamentos = await prisma.afastamento.findMany({
        where: whereClause,
        include: {
          usuario: {
            select: { nome: true, cpf: true }
          }
        },
        orderBy: { dataInicio: 'desc' }
      });

      res.status(200).json(afastamentos);
    } catch (error) {
      console.error('Erro ao listar afastamentos:', error);
      res.status(500).json({ erro: 'Erro interno ao buscar relatórios de afastamento.' });
    }
  },

  // 3. REMOVER/CANCELAR UM AFASTAMENTO LANÇADO
  async deletar(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const { empresaId } = req;
      const quemDeletouId = req.usuario?.id;
      const ip = req.ip || req.socket.remoteAddress;

      // 🟢 CORRIGIDO: Valida se o registro pertence à empresa antes de deletar (Evita ID spoofing)
      const registro = await prisma.afastamento.findFirst({
        where: { 
          id, 
          empresaId: empresaId 
        },
        include: { usuario: { select: { nome: true } } }
      });

      if (!registro) {
        res.status(404).json({ erro: 'Registro de afastamento não localizado ou não pertence a esta empresa.' });
        return;
      }

      await prisma.$transaction([
        prisma.afastamento.delete({ where: { id } }),
        prisma.logAuditoria.create({
          data: {
            acao: 'DELETE',
            entidade: 'Afastamento',
            usuarioAcaoId: quemDeletouId || null,
            ipOrigem: ip || null,
            dadosAnteriores: {
              id: registro.id,
              empresaId,
              funcionario: registro.usuario.nome,
              tipoExcluido: registro.tipo,
              periodoEstornado: `${registro.dataInicio.toISOString()} a ${registro.dataFim.toISOString()}`
            },
            dadosNovos: { info: "Registro de ausência cancelado pelo administrador." }
          }
        })
      ]);

      res.status(200).json({ mensagem: 'Período de afastamento removido e estornado do sistema com sucesso.' });
    } catch (error) {
      console.error('Erro ao deletar afastamento:', error);
      res.status(500).json({ erro: 'Erro interno ao excluir registro de afastamento.' });
    }
  },

  // 4. ATUALIZAR/EDITAR UM AFASTAMENTO EXISTENTE
  async editar(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const { empresaId } = req;
      const { tipo, dataInicio, dataFim, justificativa } = req.body;
      const quemAlterouId = req.usuario?.id;
      const ip = req.ip || req.socket.remoteAddress;

      if (!tipo || !dataInicio || !dataFim || !justificativa) {
        res.status(400).json({ erro: 'Todos os campos são de preenchimento obrigatório para a atualização.' });
        return;
      }

      if (justificativa.trim().length < 10) {
        res.status(400).json({ erro: 'A justificativa da alteração deve conter no mínimo 10 caracteres.' });
        return;
      }

      // 🟢 CORRIGIDO: Busca usando findFirst com o filtro da empresa para isolamento rigoroso
      const afastamentoOriginal = await prisma.afastamento.findFirst({
        where: { 
          id,  
          empresaId: empresaId
        },
        include: { usuario: { select: { id: true, nome: true, cpf: true } } }
      });

      if (!afastamentoOriginal) {
        res.status(404).json({ erro: 'Registro de afastamento não localizado para alteração.' });
        return;
      }

      // Converte os novos inputs de data para objetos Date UTC
      const novoInicio = new Date(`${dataInicio}T00:00:00.000Z`);
      const novoFim = new Date(`${dataFim}T23:59:59.000Z`);

      if (novoInicio > novoFim) {
        res.status(400).json({ erro: 'A data de início não pode ser maior que a data de término.' });
        return;
      }

      // Validação de segurança de conflito de período (ignorando o próprio registro e restrito à empresa)
      const conflitoPeriodo = await prisma.afastamento.findFirst({
        where: {
          usuarioId: afastamentoOriginal.usuario.id,
          empresaId,
          id: { not: id },
          OR: [
            { dataInicio: { lte: novoFim }, dataFim: { gte: novoInicio } }
          ]
        }
      });

      if (conflitoPeriodo) {
        res.status(409).json({ 
          erro: `Não foi possível alterar. O colaborador possui outro conflito de ausência [${conflitoPeriodo.tipo}] agendado para este período.` 
        });
        return;
      }

      // Executa a alteração e registra a trilha de auditoria para o MTE
      const resultado = await prisma.$transaction(async (tx) => {
        const afastamentoAtualizado = await tx.afastamento.update({
          where: { id },
          data: {
            tipo,
            dataInicio: novoInicio,
            dataFim: novoFim,
            justificativa
          }
        });

        await tx.logAuditoria.create({
          data: {
            acao: 'UPDATE',
            entidade: 'Afastamento',
            usuarioAcaoId: quemAlterouId || null,
            ipOrigem: ip || null,
            dadosAnteriores: {
              tipo: afastamentoOriginal.tipo,
              periodo: `${afastamentoOriginal.dataInicio.toISOString().split('T')[0]} até ${afastamentoOriginal.dataFim.toISOString().split('T')[0]}`,
              justificativa: afastamentoOriginal.justificativa
            },
            dadosNovos: {
              empresaId,
              funcionarioNome: afastamentoOriginal.usuario.nome,
              tipoAlterado: tipo,
              novoPeriodo: `${dataInicio} até ${dataFim}`,
              novaJustificativa: justificativa,
              info: "Registro de afastamento/férias retificado pelo Admin."
            }
          }
        });

        return afastamentoAtualizado;
      });

      res.status(200).json({
        mensagem: 'Registro de afastamento updated e auditado com sucesso.',
        afastamento: resultado
      });

    } catch (error) {
      console.error('Erro ao editar afastamento:', error);
      res.status(500).json({ erro: 'Falha interna ao atualizar período de afastamento.' });
    }
  }
};