import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { authRoutes } from './routes/auth.routes';
import { pontoRoutes } from './routes/ponto.routes';
import { usuarioRoutes } from './routes/usuario.routes';
import { AuthMiddleware } from './middlewares/auth.middleware';
import { horarioRoutes } from './routes/horario.routes';
import { auditoriaRoutes } from './routes/auditoria.routes';
import { relatorioRoutes } from './routes/relatorio.routes';
import { afastamentoRoutes } from './routes/afastamentos.routes';

const app = express();

app.use(cors({
  origin: '*', 
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Rotas Públicas (Não exigem Token)
app.use('/api/auth', authRoutes); // O login é público
app.use('/api/ponto', pontoRoutes); // O ponto também é público (pois o tablet da portaria não tem sessão fixa)
app.use('/api/usuarios', usuarioRoutes);

// Rotas Protegidas
// Aqui aplicamos a proteção: exige Token E exige ser Admin

app.use('/api/horarios', AuthMiddleware.verificarToken, AuthMiddleware.verificarAdmin, horarioRoutes);
app.use('/api/auditoria', AuthMiddleware.verificarToken, AuthMiddleware.verificarAdmin, auditoriaRoutes);
app.use('/api/relatorios', AuthMiddleware.verificarToken, AuthMiddleware.verificarAdmin, relatorioRoutes);
app.use('/api/afastamentos', AuthMiddleware.verificarToken, AuthMiddleware.verificarAdmin, afastamentoRoutes);

const PORT = process.env.PORT || 3003;

app.listen(PORT, () => {
  console.log(`🚀 Servidor rodando na porta ${PORT}`);
});