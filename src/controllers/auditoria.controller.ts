import { Request, Response } from 'express';
import { prisma } from '../config/prisma';

export const AuditoriaController = {
  async listarLogs(req: Request, res: Response): Promise<void> {
    try {
      
      const pagina = parseInt(req.query.pagina as string) || 1;
      const limite = parseInt(req.query.limite as string) || 20;
      const acao = req.query.acao as string;
      const busca = req.query.busca as string; // Para pesquisar nome do usuário

      
      const dataSeteDiasAtras = new Date();
      dataSeteDiasAtras.setDate(dataSeteDiasAtras.getDate() - 7);
      dataSeteDiasAtras.setHours(0, 0, 0, 0); // Começo do dia

      const dataInicioQuery = req.query.dataInicio ? new Date(req.query.dataInicio as string) : dataSeteDiasAtras;
      const dataFimQuery = req.query.dataFim ? new Date(req.query.dataFim as string) : new Date();

      const skip = (pagina - 1) * limite;

      
      const whereClause: any = {
        dataHora: {
          gte: dataInicioQuery,
          lte: dataFimQuery
        }
      };

      // Se filtrou por uma ação específica
      if (acao && acao.trim() !== '') {
        whereClause.acao = acao;
      }

      // Se digitou algo na busca por texto (Nome do usuário ou detalhes)
      if (busca && busca.trim() !== '') {
        whereClause.OR = [
          { acao: { contains: busca, mode: 'insensitive' } },
          { detalhes: { contains: busca, mode: 'insensitive' } },
          { usuarioAcao: { nome: { contains: busca, mode: 'insensitive' } } }
        ];
      }

      // Executa a paginação e a contagem em uma única transação no banco
      const [logs, totalRegistros] = await prisma.$transaction([
        prisma.logAuditoria.findMany({
          where: whereClause,
          orderBy: { 
            dataHora: 'desc' 
          },
          skip: skip,
          take: limite,
          include: {
            usuarioAcao: {
              select: {
                nome: true,
                cpf: true
              }
            }
          }
        }),
        prisma.logAuditoria.count({ where: whereClause })
      ]);

      // Retorna os dados envelopados com metadados de paginação
      res.status(200).json({
        total: totalRegistros,
        pagina: pagina,
        limite: limite,
        paginasTotais: Math.ceil(totalRegistros / limite),
        logs: logs
      });

    } catch (error) {
      console.error('Erro ao listar logs de auditoria:', error);
      res.status(500).json({ erro: 'Erro interno ao buscar logs de auditoria.' });
    }
  }
};