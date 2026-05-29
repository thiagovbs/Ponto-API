import { Router } from 'express';
import { RelatorioController } from '../controllers/relatorio.controller';

const relatorioRoutes = Router();

// Endpoint: GET /api/relatorios/dashboard
relatorioRoutes.get('/dashboard', RelatorioController.dashboardGeral);

// Endpoint: GET /api/relatorios/funcionario/:id
relatorioRoutes.get('/funcionario/:usuarioId', RelatorioController.relatorioMensalPorFuncionario);

// Endpoint: GET /api/relatorios/funcionario/:id
relatorioRoutes.get('/funcionario/:usuarioId/imprimir', RelatorioController.emitirPDFEspelho);

export { relatorioRoutes };