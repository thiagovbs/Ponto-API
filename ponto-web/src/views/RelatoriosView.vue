<script setup lang="ts">
import { ref, onMounted, watch } from 'vue';
import SidebarComponent from '../components/SidebarComponent.vue';
import api from '../services/api';

const funcionarios = ref<any[]>([]);
const funcionarioSelecionado = ref('');
const mesSelecionado = ref(new Date().getMonth() + 1);
const anoSelecionado = ref(new Date().getFullYear());

const resumo = ref<any>(null);
const linhasRelatorio = ref<any[]>([]);

const buscarFuncionarios = async () => {
  try {
    const res = await api.get('/usuarios');
    funcionarios.value = res.data.filter((u: any) => u.perfil === 'FUNCIONARIO');
    if (funcionarios.value.length > 0) {
      funcionarioSelecionado.value = funcionarios.value[0].id;
    }
  } catch (error) {
    console.error(error);
  }
};

const buscarRelatorio = async () => {
  if (!funcionarioSelecionado.value) return;
  try {
    const res = await api.get(`/relatorios/funcionario/${funcionarioSelecionado.value}`, {
      params: { mes: mesSelecionado.value, ano: anoSelecionado.value }
    });

    // 👇 ADICIONE ESTE LOG TEMPORÁRIO PARA AUDITORIA:
    console.log("Dados das batidas vindos do servidor:", res.data.relatorioMensal);

    resumo.value = res.data.resumoDashboard;
    linhasRelatorio.value = res.data.relatorioMensal;
  } catch (error) {
    console.error(error);
    resumo.value = null;
    linhasRelatorio.value = [];
  }
};

// Dispara a busca automática sempre que mudar os filtros
watch([funcionarioSelecionado, mesSelecionado, anoSelecionado], buscarRelatorio);

onMounted(async () => {
  await buscarFuncionarios();
  buscarRelatorio();
});
</script>

<template>
  <div class="layout">
    <SidebarComponent />
    <main class="content">
      <h2>Espelho de Ponto</h2>

      <div class="filtros">
        <select v-model="funcionarioSelecionado">
          <option v-for="f in funcionarios" :key="f.id" :value="f.id">{{ f.nome }}</option>
        </select>
        <select v-model="mesSelecionado">
          <option v-for="m in 12" :key="m" :value="m">Mês {{ m }}</option>
        </select>
        <select v-model="anoSelecionado">
          <option value="2026">2026</option>
        </select>
      </div>

      <div v-if="resumo" class="resumo-grid">
        <div class="resumo-card">
          <h4>Faltas no Mês</h4>
          <p class="dado erro">{{ resumo.totalFaltas }}</p>
        </div>
        <div class="resumo-card">
          <h4>Saldo Banco de Horas</h4>
          <p :class="['dado', resumo.saldoBancoHorasMinutos >= 0 ? 'sucesso' : 'erro']">
            {{ resumo.saldoBancoHorasFormatado }}
          </p>
        </div>
      </div>

      <div class="table-container">
        <table>
          <thead>
            <tr>
              <th>Data</th>
              <th>Status</th>
              <th>Batidas Registradas</th>
              <th>Horas Trabalhadas</th>
              <th>Saldo do Dia</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="linha in linhasRelatorio" :key="linha.data">
              <td>{{ linha.data.split('-').reverse().join('/') }}</td>
              <td><span :class="['status-txt', linha.status.toLowerCase().replace(/\s+/g, '-')]">{{ linha.status }}</span></td>
              <td>
                <div v-if="linha.batidas.length > 0" class="container-batidas">
                  <div v-for="batida in linha.batidas" :key="batida.hora" class="tag-batida">
                    <span>{{ batida.hora }}</span>
                    
                    <a 
                      v-if="batida.latitude && batida.longitude" 
                      :href="`https://www.google.com/maps/search/?api=1&query=${batida.latitude},${batida.longitude}`" 
                      target="_blank" 
                      title="Ver localização exata no Google Maps"
                      class="link-mapa"
                    >
                      📍
                    </a>
                  </div>
                </div>
                <span v-else style="color: #9ca3af;">-</span>
              </td>
              <td>{{ linha.horasTrabalhadas }}</td>
              <td :style="{ color: linha.saldoDoDia.startsWith('-') ? '#dc2626' : '#10b981' }">
                {{ linha.saldoDoDia }}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </main>
  </div>
</template>

<style scoped>
.layout { display: flex; min-height: 100vh; }
.content { margin-left: 250px; padding: 2rem; flex: 1; font-family: sans-serif; }
h2 { color: #1f2937; }
.filtros { display: flex; gap: 1rem; margin-bottom: 2rem; }
select { padding: 0.5rem; border-radius: 6px; border: 1px solid #d1d5db; font-size: 1rem; background: white; }
.resumo-grid { display: flex; gap: 1.5rem; margin-bottom: 2rem; }
.resumo-card { background: white; padding: 1rem 2rem; border-radius: 8px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); flex: 1; max-width: 250px; }
.resumo-card h4 { margin: 0; color: #4b5563; font-size: 0.9rem; }
.dado { font-size: 1.8rem; font-weight: bold; margin: 0.5rem 0 0 0; }
.dado.sucesso { color: #10b981; }
.dado.erro { color: #dc2626; }
.table-container { background: white; padding: 1.5rem; border-radius: 8px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
table { width: 100%; border-collapse: collapse; text-align: left; }
th, td { padding: 0.75rem; border-bottom: 1px solid #e5e7eb; font-size: 0.9rem; }
th { background-color: #f9fafb; color: #374151; }

/* ESTILIZAÇÃO COMPATÍVEL COM O FORMATO DE MINI BADGES */
.container-batidas {
  display: flex;
  gap: 0.4rem;
  flex-wrap: wrap;
}
.tag-batida { 
  display: inline-flex;
  align-items: center;
  gap: 4px;
  background: #f3f4f6; 
  padding: 0.25rem 0.5rem; 
  border-radius: 4px; 
  font-weight: bold; 
  font-size: 0.85rem; 
  color: #374151; 
}
.link-mapa {
  text-decoration: none;
  font-size: 0.85rem;
  cursor: pointer;
  transition: transform 0.15s ease-in-out;
  display: inline-block;
}
.link-mapa:hover {
  transform: scale(1.25);
}

.status-txt.falta { color: #dc2626; font-weight: bold; }
.status-txt.folga { color: #9ca3af; }
.status-txt.regular { color: #10b981; }
.status-txt.atraso { color: #d97706; font-weight: bold; }
.status-txt.hora-extra { color: #16a34a; font-weight: bold; }
.status-txt.trabalho-em-folga { color: #2563eb; font-weight: bold; }
.status-txt.batida-incompleta { color: #7c3aed; font-weight: bold; }
</style>