import { Router } from 'express';
import { AuthController } from '../controllers/auth.controller';

const authRoutes = Router();

// Endpoint: POST /api/auth/login
authRoutes.post('/login', AuthController.login);

export { authRoutes };