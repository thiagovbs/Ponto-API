<script setup lang="ts">
import { useRouter } from 'vue-router';

const router = useRouter();

const logout = () => {
  localStorage.removeItem('ponto_token');
  localStorage.removeItem('ponto_user');
  router.push('/');
};
</script>

<template>
  <aside class="sidebar">
    <div class="logo">
      <h3>Ponto Admin</h3>
    </div>
    <nav class="menu">
      <router-link to="/dashboard" class="menu-item" active-class="active">📊 Dashboard</router-link>
      <router-link to="/jornadas" class="menu-item" active-class="active">⏱️ Configurar Horários</router-link>
      <router-link to="/funcionarios" class="menu-item" active-class="active">👥 Funcionários</router-link>
      <router-link to="/relatorios" class="menu-item" active-class="active">📋 Espelho de Ponto</router-link>
    </nav>
    <button @click="logout" class="btn-logout">🚪 Sair</button>
  </aside>
</template>

<style scoped>
.sidebar {
  width: 250px;
  background-color: #1f2937;
  color: white;
  display: flex;
  flex-direction: column;
  height: 100vh;
  position: fixed;
}
.logo { padding: 2rem 1.5rem; border-bottom: 1px solid #374151; }
.logo h3 { margin: 0; color: #3b82f6; }
.menu { flex: 1; display: flex; flex-direction: column; padding: 1.5rem 0; gap: 0.5rem; }
.menu-item {
  padding: 0.75rem 1.5rem;
  color: #9ca3af;
  text-decoration: none;
  font-weight: 500;
  transition: all 0.2s;
}
.menu-item:hover { background-color: #374151; color: white; }
.active { background-color: #2563eb; color: white; border-left: 4px solid #60a5fa; }
.btn-logout {
  padding: 1rem;
  background-color: #dc2626;
  color: white;
  border: none;
  cursor: pointer;
  font-weight: bold;
}
.btn-logout:hover { background-color: #b91c1c; }
</style>