import { Router } from 'express';
import { PontoController } from '../controllers/ponto.controller';
import { AuthMiddleware } from '../middlewares/auth.middleware';

const pontoRoutes = Router();

pontoRoutes.post('/bater', PontoController.registrarPonto);
pontoRoutes.post('/ajustar', PontoController.ajustarBatidaPonto);
pontoRoutes.post('/incluir-manual', PontoController.incluirPontoManualmente);
pontoRoutes.post('/desconsiderar/:batidaId', PontoController.desconsiderarBatidaPonto);

// Endpoint PRIVADO (Admin): Listar todas as batidas
pontoRoutes.get('/', AuthMiddleware.verificarToken, AuthMiddleware.verificarAdmin, PontoController.listarBatidas);

export { pontoRoutes };