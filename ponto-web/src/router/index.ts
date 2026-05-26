import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router';
import LoginView from '../views/LoginView.vue';
import DashboardView from '../views/DashboardView.vue';
import FuncionariosView from '../views/FuncionariosView.vue';
import RelatoriosView from '../views/RelatoriosView.vue';
import JornadasView from '../views/JornadasView.vue';

const routes: RouteRecordRaw[] = [
  { path: '/', component: LoginView },
  { 
    path: '/dashboard', 
    component: DashboardView, 
    meta: { requiresAuth: true } 
  },
  { 
    path: '/funcionarios', 
    component: FuncionariosView, 
    meta: { requiresAuth: true } 
  },
  { 
    path: '/relatorios', 
    component: RelatoriosView, 
    meta: { requiresAuth: true } 
  },
  { 
    path: '/jornadas', 
    component: JornadasView, 
    meta: { requiresAuth: true } 
  },
];

const router = createRouter({
  history: createWebHistory(),
  routes,
});

// Trava de segurança: Verifica se a rota exige login
router.beforeEach((to, _from, next) => {
  const isAuthenticated = !!localStorage.getItem('ponto_token');
  
  if (to.meta.requiresAuth && !isAuthenticated) {
    next('/');
  } else {
    next();
  }
});

export default router;