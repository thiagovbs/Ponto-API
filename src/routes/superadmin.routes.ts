import { Router } from 'express';
import { SuperAdminController } from '../controllers/superadmin.controller';

const superAdminRoutes = Router();

// Base: /api/super/empresa
superAdminRoutes.post('/empresa', SuperAdminController.cadastrarEmpresa);

export { superAdminRoutes };