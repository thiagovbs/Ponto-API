import { Router } from 'express';
import { SetorController } from '../controllers/setor.controller';

const setorRoutes = Router();

// Base: /api/setores
setorRoutes.get('/', SetorController.listar);
setorRoutes.post('/', SetorController.criar);
setorRoutes.put('/:id', SetorController.atualizar);
setorRoutes.delete('/:id', SetorController.deletar);

export { setorRoutes };