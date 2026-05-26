<script setup lang="ts">
import { ref, onMounted } from 'vue';
import SidebarComponent from '../components/SidebarComponent.vue';
import api from '../services/api';

const idJornadaEdicao = ref<string | null>(null); // Controla se estamos editando (se tiver ID) ou criando (null)
const descricao = ref('');
const jornadasCadastradas = ref<any[]>([]);
const mensagemSucesso = ref('');
const mensagemErro = ref('');

const trabalhaDomingoAlt = ref(false);
const domingoInicioImpar = ref(true);

// Estrutura reativa padrão para os dias da semana
const regrasDias = ref([
  { dia: 'Segunda-feira', numero: 1, trabalha: true, entrada: '08:00', saida: '17:00' },
  { dia: 'Terça-feira',   numero: 2, trabalha: true, entrada: '08:00', saida: '17:00' },
  { dia: 'Quarta-feira',  numero: 3, trabalha: true, entrada: '08:00', saida: '17:00' },
  { dia: 'Quinta-feira',  numero: 4, trabalha: true, entrada: '08:00', saida: '17:00' },
  { dia: 'Sexta-feira',   numero: 5, trabalha: true, entrada: '08:00', saida: '17:00' },
  { dia: 'Sábado',        numero: 6, trabalha: false, entrada: '08:00', saida: '12:00' },
  { dia: 'Domingo',       numero: 0, trabalha: false, entrada: '08:00', saida: '12:00' }, // Iniciado com horário comercial padrão para o usuário ajustar se ativar
]);

const carregarJornadas = async () => {
  try {
    const res = await api.get('/horarios');
    jornadasCadastradas.value = res.data;
  } catch (error) {
    console.error(error);
  }
};

const salvarJornada = async () => {
  mensagemSucesso.value = '';
  mensagemErro.value = '';
  
  const payload = {
    descricao: descricao.value,
    regrasDias: regrasDias.value,
    trabalhaDomingoAlt: trabalhaDomingoAlt.value,
    domingoInicioImpar: domingoInicioImpar.value
  };

  try {
    if (idJornadaEdicao.value) {
      // MODO EDIÇÃO (PUT)
      await api.put(`/horarios/${idJornadaEdicao.value}`, payload);
      mensagemSucesso.value = 'Jornada de trabalho atualizada com sucesso!';
    } else {
      // MODO INCLUSÃO (POST)
      await api.post('/horarios', payload);
      mensagemSucesso.value = 'Jornada de trabalho cadastrada com sucesso!';
    }

    limparFormulario();
    carregarJornadas();
  } catch (err: any) {
    mensagemErro.value = err.response?.data?.erro || err.message || 'Erro ao processar a jornada.';
  }
};

// Ativa o modo de edição jogando os dados da linha clicada de volta para o formulário
const entrarModoEdicao = (j: any) => {
  idJornadaEdicao.value = j.id;
  descricao.value = j.descricao;
  trabalhaDomingoAlt.value = j.trabalhaDomingoAlt || false;
  domingoInicioImpar.value = j.domingoInicioImpar !== undefined ? j.domingoInicioImpar : true;

  regrasDias.value.forEach(d => {
    if (d.numero >= 1 && d.numero <= 5) { 
      d.entrada = j.horaEntradaPadrao || '08:00';
      d.saida = j.horaSaidaPadrao || '17:00';
      d.trabalha = true;
    } else if (d.numero === 6) {
      d.trabalha = j.trabalhaSabado || false;
      d.entrada = j.horaEntradaSabado || '08:00';
      d.saida = j.horaSaidaSabado || '12:00';
    } else if (d.numero === 0) {
      // Carrega o horário do Domingo independente de ser fixo ou alternado
      d.trabalha = j.trabalhaDomingo || false;
      d.entrada = j.horaEntradaDomingo || '08:00';
      d.saida = j.horaSaidaDomingo || '12:00';
    }
  });

  window.scrollTo({ top: 0, behavior: 'smooth' });
};

const limparFormulario = () => {
  idJornadaEdicao.value = null;
  descricao.value = '';
  trabalhaDomingoAlt.value = false;
  domingoInicioImpar.value = true;
  // Reseta para a estrutura padrão estável
  regrasDias.value = [
    { dia: 'Segunda-feira', numero: 1, trabalha: true, entrada: '08:00', saida: '17:00' },
    { dia: 'Terça-feira',   numero: 2, trabalha: true, entrada: '08:00', saida: '17:00' },
    { dia: 'Quarta-feira',  numero: 3, trabalha: true, entrada: '08:00', saida: '17:00' },
    { dia: 'Quinta-feira',  numero: 4, trabalha: true, entrada: '08:00', saida: '17:00' },
    { dia: 'Sexta-feira',   numero: 5, trabalha: true, entrada: '08:00', saida: '17:00' },
    { dia: 'Sábado',        numero: 6, trabalha: false, entrada: '08:00', saida: '12:00' },
    { dia: 'Domingo',       numero: 0, trabalha: false, entrada: '08:00', saida: '12:00' },
  ];
};

onMounted(carregarJornadas);
</script>

<template>
  <div class="layout">
    <SidebarComponent />
    <main class="content">
      <h2>Configuração de Horários e Jornadas</h2>
      <p>Configure os horários padrão de entrada e saída baseados nos dias da semana.</p>

      <div class="grid-jornadas">
        <div class="card-form">
          <h3>{{ idJornadaEdicao ? '📝 Editar Jornada Base' : '➕ Nova Jornada Base' }}</h3>
          <div class="input-group">
            <label>Nome do Horário / Setor</label>
            <input type="text" v-model="descricao" placeholder="Ex: Administrativo Geral (Seg a Sex)" required />
          </div>

          <h4 style="margin-top: 1.5rem; color: #475569;">Configuração por Dia</h4>
          <div class="dias-lista">
            <div v-for="item in regrasDias" :key="item.numero" class="dia-row">
              <div class="dia-label">
                <input type="checkbox" v-model="item.trabalha" :id="'dia-' + item.numero" />
                <label :for="'dia-' + item.numero"><strong>{{ item.dia }}</strong></label>
              </div>
              
              <div class="dia-inputs" v-if="item.trabalha">
                <input type="time" v-model="item.entrada" />
                <span>até</span>
                <input type="time" v-model="item.saida" />
              </div>
              <div v-else class="folga-text">☀️ Folga / Não contratado</div>
            </div>
          </div>

          <div class="secao-domingo-especial">
            <h4>Regra Especial de Finais de Semana</h4>
            <div class="checkbox-domingo">
              <input type="checkbox" v-model="trabalhaDomingoAlt" id="domingo-alt" />
              <label for="domingo-alt">Esta jornada trabalha em <strong>Domingos Alternados</strong> (Escala 15x15)</label>
            </div>
            
            <div v-if="trabalhaDomingoAlt" class="sub-opcoes-domingo">
              <label>Defina o início do ciclo de trabalho:</label>
              <select v-model="domingoInicioImpar">
                <option :value="true">Semana Ímpar (Trabalha no próximo domingo)</option>
                <option :value="false">Semana Par (Folga no próximo domingo)</option>
              </select>
            </div>
          </div>

          <p v-if="mensagemSucesso" class="txt-sucesso">{{ mensagemSucesso }}</p>
          <p v-if="mensagemErro" class="txt-erro">{{ mensagemErro }}</p>

          <div class="form-actions">
            <button @click="salvarJornada" class="btn-salvar">
              {{ idJornadaEdicao ? 'Salvar Alterações' : 'Salvar Regra de Horário' }}
            </button>
            <button v-if="idJornadaEdicao" @click="limparFormulario" class="btn-cancelar">
              Cancelar
            </button>
          </div>
        </div>

        <div class="card-lista">
          <h3>Jornadas Ativas</h3>
          <div class="lista-wrapper">
            <div v-for="j in jornadasCadastradas" :key="j.id" class="jornada-item">
              <div class="jornada-info">
                <strong>{{ j.descricao }}</strong>
                <p class="sub-info">Seg a Sex: {{ j.horaEntradaPadrao }}h às {{ j.horaSaidaPadrao }}h</p>
                <p class="sub-info">
                  Sábado: {{ j.trabalhaSabado ? `${j.horaEntradaSabado}h às ${j.horaSaidaSabado}h` : '☀️ Folga' }}
                </p>
                <p class="sub-info">
                  Domingo: 
                  <span v-if="j.trabalhaDomingo">
                    {{ j.horaEntradaDomingo }}h às {{ j.horaSaidaDomingo }}h 
                    <span class="badge-escala-status">
                      {{ j.trabalhaDomingoAlt ? '🔄 (Alternado)' : '📌 (Fixo)' }}
                    </span>
                  </span>
                  <span v-else>☀️ Folga</span>
                </p>
              </div>
              <button @click="entrarModoEdicao(j)" class="btn-edit-table" title="Editar Jornada">✏️</button>
            </div>
            <p v-if="jornadasCadastradas.length === 0" style="color: #94a3b8;">Nenhuma jornada criada.</p>
          </div>
        </div>
      </div>
    </main>
  </div>
</template>

<style scoped>
.layout { display: flex; min-height: 100vh; background-color: #f8fafc; }
.content { margin-left: 250px; padding: 2rem; flex: 1; font-family: sans-serif; }
h2 { color: #0f172a; margin: 0; }
p { color: #64748b; margin: 0.25rem 0 2rem 0; }
.grid-jornadas { display: flex; gap: 2rem; align-items: flex-start; }
.card-form { flex: 2; background: white; padding: 1.5rem; border-radius: 12px; box-shadow: 0 1px 3px rgba(0,0,0,0.05); }
.card-lista { flex: 1; background: white; padding: 1.5rem; border-radius: 12px; box-shadow: 0 1px 3px rgba(0,0,0,0.05); min-width: 325px; }
.input-group { display: flex; flex-direction: column; gap: 0.4rem; }
.input-group label { font-size: 0.85rem; font-weight: bold; color: #475569; }
.input-group input { padding: 0.6rem; border: 1px solid #cbd5e1; border-radius: 6px; font-size: 1rem; }

.dias-lista { display: flex; flex-direction: column; gap: 0.75rem; margin-top: 1rem; }
.dia-row { display: flex; justify-content: space-between; align-items: center; padding: 0.6rem; background: #f8fafc; border-radius: 8px; border: 1px solid #f1f5f9; }
.dia-label { display: flex; align-items: center; gap: 0.5rem; min-width: 140px; }
.dia-inputs { display: flex; align-items: center; gap: 0.5rem; }
.dia-inputs input { padding: 0.3rem; border: 1px solid #cbd5e1; border-radius: 4px; font-family: monospace; }
.folga-text { color: #94a3b8; font-size: 0.85rem; font-style: italic; }

.secao-domingo-especial { margin-top: 1.75rem; padding-top: 1.25rem; border-top: 1px dashed #e2e8f0; }
.secao-domingo-especial h4 { margin: 0 0 0.75rem 0; color: #334155; }
.checkbox-domingo { display: flex; align-items: center; gap: 0.5rem; font-size: 0.95rem; color: #475569; }
.sub-opcoes-domingo { margin-top: 0.75rem; margin-left: 1.5rem; display: flex; flex-direction: column; gap: 0.4rem; }
.sub-opcoes-domingo label { font-size: 0.85rem; color: #64748b; font-weight: 500; }
.sub-opcoes-domingo select { padding: 0.5rem; border: 1px solid #cbd5e1; border-radius: 6px; background: white; font-size: 0.9rem; max-width: 350px; }

.form-actions { display: flex; gap: 0.75rem; margin-top: 1.5rem; }
.btn-salvar { flex: 3; padding: 0.75rem; background: #2563eb; color: white; border: none; border-radius: 6px; font-size: 1rem; font-weight: bold; cursor: pointer; }
.btn-salvar:hover { background: #1d4ed8; }
.btn-cancelar { flex: 1; padding: 0.75rem; background: #64748b; color: white; border: none; border-radius: 6px; font-size: 1rem; font-weight: bold; cursor: pointer; }
.btn-cancelar:hover { background: #475569; }

.jornada-item { display: flex; justify-content: space-between; align-items: center; padding: 1rem 0.5rem; border-bottom: 1px solid #f1f5f9; gap: 0.5rem; }
.jornada-info { flex: 1; }
.sub-info { margin: 0.2rem 0 0 0; font-size: 0.8rem; color: #64748b; }
.badge-escala-status { display: inline-block; font-size: 0.75rem; font-weight: 700; color: #2563eb; margin-left: 0.25rem; }

.btn-edit-table { background: #f1f5f9; border: 1px solid #cbd5e1; font-size: 0.9rem; padding: 0.4rem 0.6rem; border-radius: 6px; cursor: pointer; transition: background 0.2s; }
.btn-edit-table:hover { background: #e2e8f0; }

.txt-sucesso { color: #10b981; font-weight: bold; margin-top: 1rem; font-size: 0.9rem; }
.txt-erro { color: #dc2626; font-weight: bold; margin-top: 1rem; font-size: 0.9rem; }
</style>