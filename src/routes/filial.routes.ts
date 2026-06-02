import { Router } from 'express';
import { FilialController } from '../controllers/filial.controller';

const filialRoutes = Router();

// Base: /api/filiais
filialRoutes.get('/', FilialController.listar);
filialRoutes.post('/', FilialController.criar);
filialRoutes.put('/:id', FilialController.atualizar);
filialRoutes.delete('/:id', FilialController.deletar);

export { filialRoutes };