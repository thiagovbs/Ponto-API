import { Router } from 'express';
import { SuperAdminController } from '../controllers/superadmin.controller';
import { AuthController } from '../controllers/auth.controller';
import { AuthMiddleware } from '../middlewares/auth.middleware'; // 🟢 Importação protegida instalada

const superAdminRoutes = Router();

// 🟢 Trava de segurança: Injeta a verificação de Token e perfil Administrativo na base da sub-árvore
superAdminRoutes.use(AuthMiddleware.verificarToken);

// Base montada no Express: /api/super

// 🏢 Operações de Organizações (Tenants)
superAdminRoutes.post('/empresa', SuperAdminController.cadastrarEmpresa);
superAdminRoutes.get('/empresas', SuperAdminController.listarEmpresas);
superAdminRoutes.put('/empresa/:id', SuperAdminController.atualizarEmpresa);
superAdminRoutes.post('/empresa/redefinir-senha', SuperAdminController.alterarSenhaAdminCliente);

// 👥 Gerenciamento de Equipe Interna (Membros Super Admin)
superAdminRoutes.post('/equipe', SuperAdminController.cadastrarMembroEquipeMaster);
superAdminRoutes.get('/equipe', SuperAdminController.listarMembrosEquipeMaster);

// 👁️ Suporte Técnico: Modo Personificação (Ghost Mode)
superAdminRoutes.post('/personificar', AuthController.personificarEmpresa);

export { superAdminRoutes };