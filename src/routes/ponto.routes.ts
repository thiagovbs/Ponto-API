import { Router } from 'express';
import { PontoController } from '../controllers/ponto.controller';
import { AuthMiddleware } from '../middlewares/auth.middleware';

const pontoRoutes = Router();

// Endpoint: POST /api/ponto/bater
pontoRoutes.post('/bater', PontoController.registrarPonto);

// Endpoint PRIVADO (Admin): Listar todas as batidas
pontoRoutes.get('/', AuthMiddleware.verificarToken, AuthMiddleware.verificarAdmin, PontoController.listarBatidas);

export { pontoRoutes };