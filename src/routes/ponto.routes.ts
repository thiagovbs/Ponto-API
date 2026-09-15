import { Router } from 'express';
import { PontoController } from '../controllers/ponto.controller';
import { AuthMiddleware, PERFIL_TOTEM } from '../middlewares/auth.middleware';

const pontoRoutes = Router();

// Registrar batida e o que o totem faz. Funcionario e admin tambem podem.
pontoRoutes.post(
  '/bater',
  AuthMiddleware.permitirPerfis('SUPER_ADMIN', 'ADMIN', 'FUNCIONARIO', PERFIL_TOTEM),
  PontoController.registrarPonto
);

// Ajustar, incluir e desconsiderar batida alteram a jornada registrada e
// precisam ser atribuiveis a um administrador. Antes nao tinham guard nenhum
// na rota, entao o totem alcancava as tres.
const somenteAdmin = AuthMiddleware.permitirPerfis('SUPER_ADMIN', 'ADMIN');

pontoRoutes.put('/ajustar/:batidaId', somenteAdmin, PontoController.ajustarBatidaPonto);
pontoRoutes.post('/incluir-manual', somenteAdmin, PontoController.incluirPontoManualmente);
pontoRoutes.post('/desconsiderar/:batidaId', somenteAdmin, PontoController.desconsiderarBatidaPonto);

// Endpoint PRIVADO (Admin): Listar todas as batidas
pontoRoutes.get('/', AuthMiddleware.verificarToken, AuthMiddleware.verificarAdmin, PontoController.listarBatidas);

export { pontoRoutes };