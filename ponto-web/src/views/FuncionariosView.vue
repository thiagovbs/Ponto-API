<script setup lang="ts">
import { ref, onMounted } from 'vue';
import SidebarComponent from '../components/SidebarComponent.vue';
import api from '../services/api';

interface Usuario {
  id: string;
  nome: string;
  cpf: string;
  perfil: string;
  horarioBaseId: string | null;
}

interface Jornada {
  id: string;
  descricao: string;
}

const funcionarios = ref<Usuario[]>([]);
const jornadas = ref<Jornada[]>([]);

// Campos do Formulário (Inclusão/Edição)
const idUsuarioEdicao = ref<string | null>(null); // Se tiver ID, estamos editando
const nome = ref('');
const cpf = ref('');
const senha = ref('');
const perfil = ref('FUNCIONARIO');
const horarioBaseId = ref<string>('');

const mensagemSucesso = ref('');
const mensagemErro = ref('');

// Carrega a tabela de colaboradores e a lista de horários para o Select
const inicializarDados = async () => {
  try {
    const [resUsuarios, resHorarios] = await Promise.all([
      api.get('/usuarios'),
      api.get('/horarios')
    ]);
    funcionarios.value = resUsuarios.data;
    jornadas.value = resHorarios.data;
  } catch (error) {
    console.error('Erro ao carregar dados:', error);
  }
};

// Salva (Inclusão ou Edição)
const submeterFormulario = async () => {
  mensagemSucesso.value = '';
  mensagemErro.value = '';

  // 🪛 1. Criamos o payload básico (Campos comuns)
  const payload: any = {
    nome: nome.value,
    cpf: cpf.value,
    perfil: perfil.value,
    horarioBaseId: horarioBaseId.value || null
  };

  // 🪛 2. Injetamos a senha apenas se o campo tiver conteúdo digitado
  if (senha.value && senha.value.trim() !== '') {
    payload.senha = senha.value;
  }

  try {
    if (idUsuarioEdicao.value) {
      // MODO EDIÇÃO (PUT)
      await api.put(`/usuarios/${idUsuarioEdicao.value}`, payload);
      mensagemSucesso.value = 'Funcionário atualizado com sucesso!';
    } else {
      // MODO INCLUSÃO (POST)
      // Na inclusão, a senha continua a ser estritamente obrigatória
      if (!senha.value || senha.value.trim() === '') {
        mensagemErro.value = 'A senha é obrigatória para novos cadastros.';
        return;
      }
      await api.post('/usuarios', payload);
      mensagemSucesso.value = 'Funcionário cadastrado com sucesso!';
    }

    limparFormulario();
    inicializarDados(); // Recarrega a tabela
  } catch (err: any) {
    mensagemErro.value = err.response?.data?.erro || 'Erro ao processar requisição.';
  }
};

// Prepara os campos do formulário com os dados do funcionário clicado
const entrarModoEdicao = (f: Usuario) => {
  idUsuarioEdicao.value = f.id;
  nome.value = f.nome;
  cpf.value = f.cpf;
  perfil.value = f.perfil;
  horarioBaseId.value = f.horarioBaseId || '';
  senha.value = ''; // 🪛 Começa explicitamente vazia por motivos de segurança
  window.scrollTo({ top: 0, behavior: 'smooth' }); // Sobe a página para o formulário
};

const limparFormulario = () => {
  idUsuarioEdicao.value = null;
  nome.value = '';
  cpf.value = '';
  senha.value = '';
  perfil.value = 'FUNCIONARIO';
  horarioBaseId.value = '';
};

// Retorna o texto legível da jornada associada na tabela
const obterNomeJornada = (id: string | null) => {
  if (!id) return 'Não Associado';
  const jornada = jornadas.value.find(j => j.id === id);
  return jornada ? jornada.descricao : 'Carregando...';
};

onMounted(inicializarDados);
</script>

<template>
  <div class="layout">
    <SidebarComponent />
    <main class="content">
      <h2>Gestão de Funcionários</h2>
      
      <div class="form-container">
        <h3>{{ idUsuarioEdicao ? '📝 Editar Colaborador' : '👤 Novo Funcionário' }}</h3>
        
        <form @submit.prevent="submeterFormulario" class="form-grid">
          <div class="input-group">
            <label>Nome Completo</label>
            <input type="text" v-model="nome" placeholder="Nome do Funcionário" required />
          </div>
          
          <div class="input-group">
            <label>CPF</label>
            <input type="text" v-model="cpf" placeholder="Apenas números" required />
          </div>

          <div class="input-group">
            <label>{{ idUsuarioEdicao ? 'Alterar Senha de Acesso' : 'Senha de Acesso' }}</label>
            <input 
              type="password" 
              v-model="senha" 
              :placeholder="idUsuarioEdicao ? 'Deixe em branco para manter a atual' : 'Senha inicial'" 
            />
          </div>

          <div class="input-group">
            <label>Perfil de Sistema</label>
            <select v-model="perfil">
              <option value="FUNCIONARIO">Funcionário</option>
              <option value="ADMIN">Administrador (Acesso ao Painel)</option>
            </select>
          </div>

          <div class="input-group">
            <label>Jornada / Horário Contratual</label>
            <select v-model="horarioBaseId">
              <option value="">-- Selecione uma Jornada Base --</option>
              <option v-for="j in jornadas" :key="j.id" :value="j.id">
                {{ j.descricao }}
              </option>
            </select>
          </div>

          <div class="form-actions">
            <button type="submit" class="btn-primary">
              {{ idUsuarioEdicao ? 'Salvar Alterações' : 'Cadastrar' }}
            </button>
            <button type="button" v-if="idUsuarioEdicao" @click="limparFormulario" class="btn-cancel">
              Cancelar
            </button>
          </div>
        </form>
        
        <p v-if="mensagemSucesso" class="sucesso">{{ mensagemSucesso }}</p>
        <p v-if="mensagemErro" class="erro">{{ mensagemErro }}</p>
      </div>

      <div class="table-container">
        <h3>Colaboradores Ativos</h3>
        <table>
          <thead>
            <tr>
              <th>Nome</th>
              <th>CPF</th>
              <th>Perfil</th>
              <th>Jornada Associada</th>
              <th style="text-align: center;">Ações</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="f in funcionarios" :key="f.id">
              <td><strong>{{ f.nome }}</strong></td>
              <td>{{ f.cpf }}</td>
              <td><span :class="['badge', f.perfil.toLowerCase()]">{{ f.perfil }}</span></td>
              <td>
                <span :class="['jornada-tag', f.horarioBaseId ? 'vinculada' : 'vazia']">
                  {{ obterNomeJornada(f.horarioBaseId) }}
                </span>
              </td>
              <td style="text-align: center;">
                <button @click="entrarModoEdicao(f)" class="btn-edit">✏️ Editar</button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </main>
  </div>
</template>

<style scoped>
.layout { display: flex; min-height: 100vh; background-color: #f8fafc; }
.content { margin-left: 250px; padding: 2rem; flex: 1; font-family: sans-serif; }
h2, h3 { color: #1e293b; margin-top: 0; }
.form-container, .table-container { background: white; padding: 1.5rem; border-radius: 12px; box-shadow: 0 1px 3px rgba(0,0,0,0.05); margin-bottom: 2rem; }

.form-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 1.2rem; align-items: flex-end; }
.input-group { display: flex; flex-direction: column; gap: 0.4rem; }
.input-group label { font-size: 0.85rem; font-weight: bold; color: #475569; }
input, select { padding: 0.65rem; border: 1px solid #cbd5e1; border-radius: 6px; font-size: 0.95rem; background: white; }

.form-actions { display: flex; gap: 0.5rem; }
.btn-primary { background: #2563eb; color: white; cursor: pointer; font-weight: bold; border: none; padding: 0.65rem 1.5rem; border-radius: 6px; }
.btn-primary:hover { background: #1d4ed8; }
.btn-cancel { background: #64748b; color: white; cursor: pointer; border: none; padding: 0.65rem 1rem; border-radius: 6px; }

table { width: 100%; border-collapse: collapse; margin-top: 1rem; text-align: left; }
th, td { padding: 0.85rem; border-bottom: 1px solid #e2e8f0; font-size: 0.95rem; }
th { background-color: #f8fafc; color: #475569; font-weight: 600; }

.btn-edit { background: #f1f5f9; border: 1px solid #cbd5e1; padding: 0.4rem 0.8rem; border-radius: 6px; cursor: pointer; font-size: 0.85rem; color: #334155; font-weight: 500; }
.btn-edit:hover { background: #e2e8f0; }

.sucesso { color: #10b981; margin-top: 1rem; font-weight: bold; font-size: 0.9rem; }
.erro { color: #dc2626; margin-top: 1rem; font-weight: bold; font-size: 0.9rem; }
.badge { padding: 0.25rem 0.5rem; border-radius: 4px; font-size: 0.75rem; font-weight: bold; }
.badge.admin { background: #fee2e2; color: #991b1b; }
.badge.funcionario { background: #e0f2fe; color: #0369a1; }

.jornada-tag { padding: 0.25rem 0.6rem; border-radius: 6px; font-size: 0.85rem; font-weight: 500; }
.jornada-tag.vinculada { background: #f0fdf4; color: #166534; border: 1px solid #bbf7d0; }
.jornada-tag.vazia { background: #f8fafc; color: #94a3b8; border: 1px solid #e2e8f0; }
</style>