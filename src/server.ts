import 'dotenv/config';
import express from 'express';
import { tenantMiddleware } from './middlewares/tenant.middleware';
import { superAdminRoutes } from './routes/superadmin.routes';
import cors from 'cors';
import { authRoutes } from './routes/auth.routes';
import { pontoRoutes } from './routes/ponto.routes';
import { usuarioRoutes } from './routes/usuario.routes';
import { AuthMiddleware } from './middlewares/auth.middleware';
import { horarioRoutes } from './routes/horario.routes';
import { auditoriaRoutes } from './routes/auditoria.routes';
import { relatorioRoutes } from './routes/relatorio.routes';
import { afastamentoRoutes } from './routes/afastamentos.routes';
import { filialRoutes } from './routes/filial.routes'; 
import { setorRoutes } from './routes/setor.routes';

const app = express();

// 🟢 CONFIGURAÇÃO DE CORS CORRIGIDA: Adicionado 'x-totem-token' aos cabeçalhos permitidos para liberar as chamadas complexas do Totem
app.use(cors({
  origin: '*', 
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-totem-token']
}));

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// 🟢 ROTA DE PING / HEALTH CHECK: Declarada antes de qualquer middleware para ser 100% pública e leve
app.get('/ping', (req, res) => {
  res.status(200).json({ 
    status: "online",
    message: "pong",
    timestamp: new Date().toISOString()
  });
});

// Rotas Públicas (Não exigem Token)
app.use('/api/auth', authRoutes); // O login é público

app.use('/api/super', AuthMiddleware.verificarToken, superAdminRoutes);

// Rotas Protegidas
// Aqui aplicamos a proteção: exige Token E exige ser Admin

app.use(tenantMiddleware);
app.use('/api/ponto', pontoRoutes);
app.use('/api/usuarios', usuarioRoutes);
app.use('/api/horarios', AuthMiddleware.verificarToken, AuthMiddleware.verificarAdmin, horarioRoutes);
app.use('/api/auditoria', AuthMiddleware.verificarToken, AuthMiddleware.verificarAdmin, auditoriaRoutes);
app.use('/api/relatorios', AuthMiddleware.verificarToken, AuthMiddleware.verificarAdmin, relatorioRoutes);
app.use('/api/afastamentos', AuthMiddleware.verificarToken, AuthMiddleware.verificarAdmin, afastamentoRoutes);
app.use('/api/filiais', AuthMiddleware.verificarToken, AuthMiddleware.verificarAdmin, filialRoutes);
app.use('/api/setores', AuthMiddleware.verificarToken, AuthMiddleware.verificarAdmin, setorRoutes);

const PORT = process.env.PORT || 3003;

app.listen(PORT, () => {
  console.log(`🚀 Servidor rodando na porta ${PORT}`);
});