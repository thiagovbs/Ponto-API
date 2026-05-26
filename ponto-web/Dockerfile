# --- Estágio 1: Build da aplicação Vue ---
FROM node:20-alpine AS build-stage
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build

# --- Estágio 2: Servidor de Produção (Nginx) ---
FROM nginx:stable-alpine AS production-stage

# Copia os arquivos compilados do Vue para a pasta pública do Nginx
COPY --from=build-stage /app/dist /usr/share/nginx/html

# Expõe a porta padrão do servidor web
EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]