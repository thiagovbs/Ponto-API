import { Router } from 'express';
import { UsuarioController } from '../controllers/usuario.controller';

const usuarioRoutes = Router();


usuarioRoutes.post('/', UsuarioController.criarUsuario);
usuarioRoutes.get('/', UsuarioController.listarUsuarios);
usuarioRoutes.put('/:id', UsuarioController.atualizarUsuario);

export { usuarioRoutes };