import { Request, Response } from 'express';
import { prisma } from '../config/prisma';

export const AuditoriaController = {
  async listarLogs(req: Request, res: Response): Promise<void> {
    try {
      // 1. Captura e trata os parâmetros enviados pelo Vue.js
      const pagina = parseInt(req.query.pagina as string) || 1;
      const limite = parseInt(req.query.limite as string) || 20;
      const busca = req.query.busca as string;
      const dataInicio = req.query.dataInicio as string;
      const dataFim = req.query.dataFim as string;

      const pular = (pagina - 1) * limite;

      // 2. Monta as condições dinâmicas do WHERE (Filtros)
      const whereClause: any = {};

      // Filtro por período de datas
      if (dataInicio || dataFim) {
        whereClause.dataHora = {};
        if (dataInicio) {
          // Ajusta para o início do dia
          whereClause.dataHora.gte = new Date(`${dataInicio}T00:00:00.000Z`);
        }
        if (dataFim) {
          // Ajusta para o fim do dia
          whereClause.dataHora.lte = new Date(`${dataFim}T23:59:59.999Z`);
        }
      }

      // Filtro por termo de busca (Procura na Ação, Entidade ou no nome do Usuário)
      if (busca) {
        whereClause.OR = [
          { acao: { contains: busca, mode: 'insensitive' } },
          { entidade: { contains: busca, mode: 'insensitive' } },
          {
            usuarioAcao: {
              nome: { contains: busca, mode: 'insensitive' }
            }
          }
        ];
      }

      // 3. Executa em paralelo a contagem total e a busca paginada (Melhor performance)
      const [totalLogs, logs] = await prisma.$transaction([
        prisma.logAuditoria.count({ where: whereClause }),
        prisma.logAuditoria.findMany({
          where: whereClause,
          skip: pular,
          take: limite,
          orderBy: { 
            dataHora: 'desc' 
          },
          include: {
            usuarioAcao: {
              select: {
                nome: true,
                cpf: true
              }
            }
          }
        })
      ]);

      const paginasTotais = Math.ceil(totalLogs / limite) || 1;

      // 4. Retorna no formato exato esperado pela AuditoriaView.vue
      res.status(200).json({
        logs,
        total: totalLogs,
        paginasTotais,
        paginaAtual: pagina
      });

    } catch (error) {
      console.error('Erro ao listar logs de auditoria:', error);
      res.status(500).json({ erro: 'Erro interno ao buscar logs de auditoria.' });
    }
  }
};