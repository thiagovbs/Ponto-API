import { Router } from 'express';
import { AuditoriaController } from '../controllers/auditoria.controller';

const auditoriaRoutes = Router();

// Endpoint: GET /api/auditoria
auditoriaRoutes.get('/', AuditoriaController.listarLogs);

export { auditoriaRoutes };