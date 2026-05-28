import { Request, Response } from 'express';
import { prisma } from '../config/prisma';

export const PontoController = {
  async registrarPonto(req: Request, res: Response): Promise<void> {
    try {
      const { usuarioId, fotoBase64, latitude, longitude, dataHora } = req.body;
      const ip = req.ip || req.socket.remoteAddress;

      if (!usuarioId || !fotoBase64 || !latitude || !longitude || !dataHora) {
        res.status(400).json({ erro: 'Todos os campos são obrigatórios' });
        return;
      }

      // 1. Verifica se o funcionário existe no banco
      const usuario = await prisma.usuario.findUnique({
        where: { id: usuarioId },
      });

      if (!usuario) {
        res.status(404).json({ erro: 'Funcionário não encontrado' });
        return;
      }

      // 2. Transação isolada e explicitamente tipada para o TypeScript resolver os operadores
      const resultado = await prisma.$transaction([
        prisma.batidaPonto.create({
          data: {
            usuarioId,
            fotoBase64,
            latitude,
            longitude,
            dataHora: new Date(dataHora),
          },
        }),
        prisma.logAuditoria.create({
          data: {
            acao: 'CREATE',
            entidade: 'BatidaPonto',
            usuarioAcaoId: usuarioId,
            ipOrigem: ip || null,
            dadosAnteriores: {},
            dadosNovos: {
              usuarioNome: usuario.nome,
              cpf: usuario.cpf,
              latitude,
              longitude,
              dataHora,
              info: "Marcação de ponto efetuada via Mobile."
            }
          }
        })
      ]);

      // Captura o primeiro elemento do array retornado (a batida criada)
      const batidaCriada = resultado[0];

      res.status(201).json({
        mensagem: 'Ponto registrado com sucesso',
        dataHora: batidaCriada.dataHora,
      });

    } catch (error) {
      console.error('Erro ao registrar ponto:', error);
      res.status(500).json({ erro: 'Erro interno no servidor' });
    }
  },

  async listarBatidas(req: Request, res: Response): Promise<void> {
    try {
      const batidas = await prisma.batidaPonto.findMany({
        select: {
          id: true,
          dataHora: true,
          latitude: true,
          longitude: true,
          createdAt: true,
          usuarioId: true,
          usuario: {
            select: {
              nome: true,
              cpf: true
            }
          }
        },
        orderBy: { dataHora: 'desc' }
      });

      res.status(200).json(batidas);
    } catch (error) {
      console.error('Erro ao listar batidas:', error);
      res.status(500).json({ erro: 'Erro interno ao buscar batidas de ponto.' });
    }
  }
};