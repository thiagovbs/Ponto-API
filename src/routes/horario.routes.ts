import { Router } from 'express';
import { HorarioController } from '../controllers/horario.controller';

const horarioRoutes = Router();

// Endpoint: GET /api/horarios
horarioRoutes.get('/', HorarioController.listarHorarios);
horarioRoutes.post('/', HorarioController.criarHorario);
horarioRoutes.put('/:id', HorarioController.atualizarHorario);

export { horarioRoutes };