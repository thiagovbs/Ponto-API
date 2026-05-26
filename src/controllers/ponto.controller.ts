import { Request, Response } from 'express';
import { prisma } from '../config/prisma';

export const PontoController = {
  async registrarPonto(req: Request, res: Response): Promise<void> {
    try {
      const { usuarioId, fotoBase64, latitude, longitude } = req.body;

      if (!usuarioId || !fotoBase64 || !latitude || !longitude) {
        res.status(400).json({ erro: 'Todos os campos são obrigatórios' });
        return;
      }

      // 1. Verifica se o usuário existe
      const usuario = await prisma.usuario.findUnique({
        where: { id: usuarioId },
      });

      if (!usuario) {
        res.status(404).json({ erro: 'Funcionário não encontrado' });
        return;
      }

      // 2. Grava a batida de ponto
      const batida = await prisma.batidaPonto.create({
        data: {
          usuarioId,
          fotoBase64,
          latitude,
          longitude,
        },
      });

      res.status(201).json({
        mensagem: 'Ponto registrado com sucesso',
        dataHora: batida.dataHora,
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
          // Omitimos a fotoBase64 para a listagem ficar leve
          usuario: {
            select: {
              nome: true,
              cpf: true
            }
          }
        },
        orderBy: { dataHora: 'desc' } // Mostra as mais recentes primeiro
      });

      res.status(200).json(batidas);
    } catch (error) {
      console.error('Erro ao listar batidas:', error);
      res.status(500).json({ erro: 'Erro interno ao buscar batidas de ponto.' });
    }
  }

};