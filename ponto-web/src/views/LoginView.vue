<script setup lang="ts">
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import api from '../services/api';

const cpf = ref('');
const senha = ref('');
const erro = ref('');
const carregando = ref(false);
const router = useRouter();

const realizarLogin = async () => {
  erro.value = '';
  carregando.value = true;
  try {
    const resposta = await api.post('/auth/login', {
      cpf: cpf.value,
      senha: senha.value,
    });

    // Salva o token e os dados do admin no navegador
    localStorage.setItem('ponto_token', resposta.data.token);
    localStorage.setItem('ponto_user', JSON.stringify(resposta.data.usuario));

    // Redireciona para o painel principal
    router.push('/dashboard');
  } catch (err: any) {
    erro.value = err.response?.data?.erro || 'Falha ao conectar ao servidor.';
  } finally {
    carregando.value = false;
  }
};
</script>

<template>
  <div class="login-container">
    <div class="login-card">
      <h2>Controle de Ponto - Admin</h2>
      <p>Insira suas credenciais para acessar o painel</p>
      
      <form @submit.prevent="realizarLogin">
        <div class="input-group">
          <label>CPF</label>
          <input type="text" v-model="cpf" placeholder="000.000.000-00" required />
        </div>

        <div class="input-group">
          <label>Senha</label>
          <input type="password" v-model="senha" placeholder="******" required />
        </div>

        <p v-if="erro" class="erro-mensagem">{{ erro }}</p>

        <button type="submit" :disabled="carregando">
          {{ carregando ? 'Autenticando...' : 'Entrar no Sistema' }}
        </button>
      </form>
    </div>
  </div>
</template>

<style scoped>
.login-container {
  display: flex;
  justify-content: center;
  align-items: center;
  height: 100vh;
  background-color: #f3f4f6;
  font-family: sans-serif;
}
.login-card {
  background: white;
  padding: 2.5rem;
  border-radius: 8px;
  box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
  width: 100%;
  max-width: 400px;
}
h2 { margin-bottom: 0.5rem; color: #1f2937; }
p { color: #6b7280; font-size: 0.9rem; margin-bottom: 2rem; }
.input-group { margin-bottom: 1.2rem; display: flex; flex-direction: column; }
label { font-size: 0.85rem; font-weight: bold; margin-bottom: 0.4rem; color: #374151; }
input { padding: 0.75rem; border: 1px solid #d1d5db; border-radius: 6px; font-size: 1rem; }
button { width: 100%; padding: 0.75rem; background: #2563eb; color: white; border: none; border-radius: 6px; font-size: 1rem; cursor: pointer; font-weight: bold; margin-top: 1rem; }
button:disabled { background: #93c5fd; }
.erro-mensagem { color: #dc2626; font-weight: bold; margin-bottom: 1rem; font-size: 0.85rem; }
</style>