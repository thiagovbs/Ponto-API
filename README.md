# ⏱️ Controle de Horas - API Backend

Este é o core do sistema de controle de ponto, responsável pelas regras de negócio, persistência de dados de usuários, jornadas contratuais e registro geolocalizado de batidas de ponto (com suporte a auditoria por foto em Base64).

---

## 🚀 Tecnologias Utilizadas

* **Runtime:** Node.js (v20+)
* **Linguagem:** TypeScript
* **Framework Web:** Express
* **ORM:** Prisma
* **Banco de Dados:** PostgreSQL
* **Criptografia:** Bcrypt (Hash de senhas)
* **Compilador/Bundler:** esbuild / tsx

---

## 🛠️ Pré-requisitos

Se for executar o projeto de forma local (sem Docker), você precisará de:
* Node.js v20 ou superior
* Instância do PostgreSQL ativa (Porta `5434` ou conforme seu `.env`)

---

## 🏃 Como Executar o Projeto

### Opção A: Execução Rápida com Docker (Recomendado)
Como o projeto possui uma estrutura unificada com Docker Compose na raiz, você pode subir o Banco de Dados, a API e o Painel Web com um único comando:

1. Certifique-se de estar na raiz do projeto.
2. Execute o comando:
   ```bash
   docker-compose up --build