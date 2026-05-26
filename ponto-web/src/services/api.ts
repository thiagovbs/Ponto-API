import axios from 'axios';

const api = axios.create({
  baseURL: 'http://localhost:3003/api',
});

// Interceptor para injetar o Token JWT em cada requisição automaticamente
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('ponto_token');
  if (token && config.headers) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export default api;