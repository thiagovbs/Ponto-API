# 1. Usa uma imagem estável do Node.js
FROM node:20-alpine

# 2. Define o diretório de trabalho dentro do contêiner
WORKDIR /app

# 3. Copia os arquivos de dependências
COPY package*.json ./

# 4. Instala as dependências de produção e desenvolvimento (necessárias para o build)
RUN npm install

# 5. Copia a pasta do Prisma primeiro para gerar o client
COPY prisma ./prisma/
RUN npx prisma generate

# 6. Copia o restante do código do projeto
COPY . .

# 7. Compila o projeto TypeScript (se aplicável) ou prepara o esbuild
RUN npm run build --if-present || true

# 8. Expõe a porta que a sua API usa
EXPOSE 3003

# 9. Comando para rodar a aplicação
CMD ["npm", "run", "dev"]