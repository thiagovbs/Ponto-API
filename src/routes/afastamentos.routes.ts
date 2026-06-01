import { Router } from 'express';
import { AfastamentoController } from '../controllers/afastamento.controller';
import { AuthMiddleware } from '../middlewares/auth.middleware';

const afastamentoRoutes = Router();

// Todas as rotas de afastamento exigem perfil de Administrador autenticado
afastamentoRoutes.use(AuthMiddleware.verificarToken, AuthMiddleware.verificarAdmin);

afastamentoRoutes.post('/', AfastamentoController.cadastrar);
afastamentoRoutes.get('/', AfastamentoController.listar);
afastamentoRoutes.delete('/:id', AfastamentoController.deletar);
afastamentoRoutes.put('/:id', AfastamentoController.editar);

export { afastamentoRoutes };