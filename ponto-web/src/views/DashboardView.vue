<script setup lang="ts">
import { ref, onMounted } from 'vue';
import SidebarComponent from '../components/SidebarComponent.vue';
import api from '../services/api';

// Imports necessários para fazer o Chart.js funcionar com Vue 3 e TypeScript
import { Bar } from 'vue-chartjs';
import { Chart as ChartJS, Title, Tooltip, Legend, BarElement, CategoryScale, LinearScale } from 'chart.js';

ChartJS.register(Title, Tooltip, Legend, BarElement, CategoryScale, LinearScale);

const totalFuncionarios = ref(0);
const batidasHoje = ref(0);
const feed = ref<any[]>([]);

// Configurações reativas do Gráfico
const chartData = ref<any>({
  labels: [],
  datasets: []
});

const chartOptions = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: { display: false }
  }
};

onMounted(async () => {
  try {
    const resposta = await api.get('/relatorios/dashboard');
    totalFuncionarios.value = resposta.data.totalFuncionarios;
    batidasHoje.value = resposta.data.batidasHoje;
    feed.value = resposta.data.feedAtividades;

    // Monta a estrutura de dados do gráfico vinda do backend
    chartData.value = {
      labels: resposta.data.graficoSemanal.labels,
      datasets: [
        {
          label: 'Batidas de Ponto',
          backgroundColor: '#3b82f6',
          borderRadius: 6,
          data: resposta.data.graficoSemanal.dados
        }
      ]
    };
  } catch (error) {
    console.error('Erro ao carregar dados do dashboard:', error);
  }
});
</script>

<template>
  <div class="layout">
    <SidebarComponent />
    <main class="content">
      <header class="dashboard-header">
        <h2>Painel de Controle</h2>
        <p>Visão geral e monitoramento de frequência.</p>
      </header>

      <div class="cards-grid">
        <div class="card bg-blue">
          <div class="card-info">
            <h3>Total Colaboradores</h3>
            <p class="numero">{{ totalFuncionarios }}</p>
          </div>
          <span class="icon">👥</span>
        </div>
        <div class="card bg-green">
          <div class="card-info">
            <h3>Registros Hoje</h3>
            <p class="numero">{{ batidasHoje }}</p>
          </div>
          <span class="icon">⏱️</span>
        </div>
      </div>

      <div class="dashboard-body">
        <div class="main-chart-container">
          <h3>Frequência Semanal (Total de Batidas)</h3>
          <div class="chart-wrapper">
            <Bar v-if="chartData.labels.length > 0" :data="chartData" :options="chartOptions" />
          </div>
        </div>

        <div class="feed-container">
          <h3>Atividades Recentes</h3>
          <div class="feed-list">
            <div v-for="item in feed" :key="item.id" class="feed-item">
              <img :src="item.foto || 'https://via.placeholder.com/40'" class="avatar" alt="Foto Ponto" />
              <div class="feed-info">
                <p class="feed-nome">{{ item.nome }}</p>
                <p class="feed-meta">Registrou ponto às {{ item.hora }}</p>
              </div>
              <span class="badge-time">✓</span>
            </div>
            <p v-if="feed.length === 0" class="feed-vazio">Nenhuma atividade registrada recentemente.</p>
          </div>
        </div>
      </div>
    </main>
  </div>
</template>

<style scoped>
.layout { display: flex; min-height: 100vh; background-color: #f8fafc; }
.content { margin-left: 250px; padding: 2rem; flex: 1; font-family: sans-serif; }
.dashboard-header h2 { color: #0f172a; margin: 0; font-size: 1.75rem; }
.dashboard-header p { color: #64748b; margin: 0.25rem 0 2rem 0; }

.cards-grid { display: flex; gap: 1.5rem; margin-bottom: 2rem; }
.card { 
  flex: 1; padding: 1.5rem; border-radius: 12px; color: white; 
  display: flex; justify-content: space-between; align-items: center;
  box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05);
}
.bg-blue { background: linear-gradient(135deg, #3b82f6, #2563eb); }
.bg-green { background: linear-gradient(135deg, #10b981, #059669); }
.card h3 { margin: 0; font-size: 0.9rem; font-weight: 500; opacity: 0.9; }
.numero { font-size: 2.2rem; font-weight: 700; margin: 0.25rem 0 0 0; }
.icon { font-size: 2.5rem; opacity: 0.3; }

.dashboard-body { display: flex; gap: 1.5rem; }
.main-chart-container { 
  flex: 2; background: white; padding: 1.5rem; border-radius: 12px;
  box-shadow: 0 1px 3px rgba(0,0,0,0.05);
}
.main-chart-container h3, .feed-container h3 { margin: 0 0 1.2rem 0; color: #1e293b; font-size: 1.1rem; }
.chart-wrapper { height: 300px; position: relative; }

.feed-container { 
  flex: 1; background: white; padding: 1.5rem; border-radius: 12px;
  box-shadow: 0 1px 3px rgba(0,0,0,0.05); min-width: 320px;
}
.feed-list { display: flex; flex-direction: column; gap: 1rem; }
.feed-item { 
  display: flex; align-items: center; gap: 0.75rem; padding: 0.75rem;
  background-color: #f8fafc; border-radius: 8px; border: 1px solid #f1f5f9;
}
.avatar { width: 42px; height: 42px; border-radius: 50%; object-fit: cover; background-color: #cbd5e1; }
.feed-info { flex: 1; }
.feed-nome { margin: 0; font-weight: 600; color: #334155; font-size: 0.9rem; }
.feed-meta { margin: 0; font-size: 0.8rem; color: #64748b; }
.badge-time { color: #10b981; font-weight: bold; background: #d1fae5; width: 22px; height: 22px; display: flex; align-items: center; justify-content: center; border-radius: 50%; font-size: 0.8rem; }
.feed-vazio { color: #94a3b8; font-size: 0.9rem; text-align: center; margin: 2rem 0; }
</style>