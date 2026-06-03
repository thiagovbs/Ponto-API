import { Request, Response } from 'express';
import { prisma } from '../config/prisma';
import bcrypt from 'bcrypt';
import crypto from 'crypto';

export const SuperAdminController = {
  // 🏢 PROVISIONAR NOVA EMPRESA CLIENTE (MÉTODO ATÔMICO)
  async cadastrarEmpresa(req: Request, res: Response): Promise<void> {
    try {
      // 🔒 Segurança Máxima: Valida se QUEM está chamando essa rota é de fato você (SUPER_ADMIN)
      if (req.usuario?.perfil !== 'SUPER_ADMIN') {
        res.status(403).json({ erro: 'Acesso negado. Rota restrita ao proprietário do sistema.' });
        return;
      }

      const { razaoSocial, cnpj, nomeAdmin, cpfAdmin, senhaAdmin } = req.body;

      if (!razaoSocial || !cnpj || !nomeAdmin || !cpfAdmin || !senhaAdmin) {
        res.status(400).json({ erro: 'Todos os campos corporativos e do administrador são obrigatórios.' });
        return;
      }

      // Validações prévias de duplicidade global
      const empresaExistente = await prisma.empresa.findFirst({ where: { cnpj } });
      if (empresaExistente) {
        res.status(400).json({ erro: 'Uma empresa com este CNPJ já está cadastrada no ecossistema.' });
        return;
      }

      const usuarioExistente = await prisma.usuario.findFirst({ where: { cpf: cpfAdmin } });
      if (usuarioExistente) {
        res.status(400).json({ erro: 'Um usuário com este CPF já está cadastrado no sistema.' });
        return;
      }

      // Criptografia da senha do admin mestre da empresa parceira
      const salt = await bcrypt.genSalt(10);
      const senhaHash = await bcrypt.hash(senhaAdmin, salt);

      // Geração de token único para configuração do Totem em Flutter
      const tokenTotemConfiguracao = crypto.randomBytes(24).toString('hex');

      // TRANSAÇÃO ISOLADA: Salva a empresa e o usuário admin ou falha tudo junto
      const resultado = await prisma.$transaction(async (tx) => {
        const novaEmpresa = await tx.empresa.create({
          data: {
            razaoSocial,
            cnpj,
            tokenTotem: tokenTotemConfiguracao,
            ativo: true
          }
        });

        // Cria uma Filial Padrão automaticamente (Multi-tenant)
        const filialPadrao = await tx.filial.create({
          data: {
            nome: 'Matriz Principal',
            cnpj: cnpj,
            empresaId: novaEmpresa.id
          }
        });

        // Cria um Setor Padrão automaticamente
        // 🟢 CORREÇÃO: Injetado o 'empresaId' exigido pelas relações do Prisma Schema
        const setorPadrao = await tx.setor.create({
          data: {
            nome: 'Administração Geral',
            filialId: filialPadrao.id,
            empresaId: novaEmpresa.id
          }
        });

        const novoUsuario = await tx.usuario.create({
          data: {
            nome: nomeAdmin,
            cpf: cpfAdmin,
            senhaHash,
            perfil: 'ADMIN',
            empresaId: novaEmpresa.id,
            filialId: filialPadrao.id,
            setorId: setorPadrao.id
          }
        });

        return { novaEmpresa, novoUsuario };
      });

      res.status(201).json({
        mensagem: 'Estrutura multi-tenant inicializada com sucesso!',
        empresaId: resultado.novaEmpresa.id,
        tokenTotemConfiguracao: resultado.novaEmpresa.tokenTotem,
        administradorVinculado: resultado.novoUsuario.nome
      });

    } catch (error: any) {
      console.error('Erro crítico no provisionamento atômico:', error);
      res.status(500).json({ erro: 'Erro interno ao processar o setup de banco da organização.' });
    }
  },

  // 📋 LISTAR TODAS AS ORGANIZAÇÕES PARCEIRAS DO ECOSSISTEMA
  async listarEmpresas(req: Request, res: Response): Promise<void> {
    try {
      if (req.usuario?.perfil !== 'SUPER_ADMIN') {
        res.status(403).json({ erro: 'Acesso negado. Rota restrita ao proprietário do sistema.' });
        return;
      }

      const empresas = await prisma.empresa.findMany({
        orderBy: { createdAt: 'desc' }
      });

      res.status(200).json(empresas);
    } catch (error: any) {
      console.error('Erro ao listar tenants:', error);
      res.status(500).json({ erro: 'Erro interno ao buscar carteira de clientes.' });
    }
  },

  // 🚫 ALTERAR STATUS OPERACIONAL DA EMPRESA (BLOQUEIO LÓGICO)
  async atualizarEmpresa(req: Request, res: Response): Promise<void> {
    try {
      if (req.usuario?.perfil !== 'SUPER_ADMIN') {
        res.status(403).json({ erro: 'Acesso negado. Rota restrita ao proprietário do sistema.' });
        return;
      }

      const { id } = req.params;
      const { ativo } = req.body;

      if (ativo === undefined) {
        res.status(400).json({ erro: 'O parâmetro operacional "ativo" é obrigatório.' });
        return;
      }

      await prisma.empresa.update({
        where: { id },
        data: { ativo }
      });

      res.status(200).json({ mensagem: 'Status organizacional updated com sucesso!' });
    } catch (error: any) {
      console.error('Erro ao atualizar empresa:', error);
      res.status(500).json({ erro: 'Erro interno ao modificar cadastro do cliente.' });
    }
  },

  // 🔑 REDEFINIR FORÇADO A SENHA DO ADMINISTRADOR CLIENTE
  async alterarSenhaAdminCliente(req: Request, res: Response): Promise<void> {
    try {
      if (req.usuario?.perfil !== 'SUPER_ADMIN') {
        res.status(403).json({ erro: 'Acesso negado. Rota restrita ao proprietário do sistema.' });
        return;
      }

      const { empresaId, usuarioAdminId, novaSenha } = req.body;

      if (!empresaId || !usuarioAdminId || !novaSenha || novaSenha.trim().length < 6) {
        res.status(400).json({ erro: 'Parâmetros obrigatórios ausentes ou senha menor que 6 caracteres.' });
        return;
      }

      const usuarioAdmin = await prisma.usuario.findFirst({
        where: {
          id: usuarioAdminId,
          empresaId: empresaId,
          perfil: 'ADMIN'
        }
      });

      if (!usuarioAdmin) {
        res.status(404).json({ erro: 'Usuário administrador não localizado para a empresa informada.' });
        return;
      }

      const salt = await bcrypt.genSalt(10);
      const senhaHash = await bcrypt.hash(novaSenha, salt);

      await prisma.usuario.update({
        where: { id: usuarioAdminId },
        data: { senhaHash }
      });

      res.status(200).json({
        mensagem: `Senha de acesso para o administrador ${usuarioAdmin.nome} foi atualizada com sucesso no banco.`
      });
    } catch (error: any) {
      console.error('Erro ao redefinir senha do cliente:', error);
      res.status(500).json({ erro: 'Erro interno ao redefinir credenciais de suporte.' });
    }
  },

  // 👥 CADASTRAR OUTRO INTEGRANTE NA EQUIPE SUPER_ADMIN (MESMA ORGANIZAÇÃO MATRIZ)
  async cadastrarMembroEquipeMaster(req: Request, res: Response): Promise<void> {
    try {
      if (req.usuario?.perfil !== 'SUPER_ADMIN') {
        res.status(403).json({ erro: 'Acesso negado. Rota restrita ao proprietário do sistema.' });
        return;
      }

      const { nome, cpf, senha } = req.body;

      if (!nome || !cpf || !senha || senha.trim().length < 6) {
        res.status(400).json({ erro: 'Nome, CPF e uma senha válida (mínimo 6 dígitos) são obrigatórios.' });
        return;
      }

      const usuarioExistente = await prisma.usuario.findFirst({ where: { cpf } });
      if (usuarioExistente) {
        res.status(400).json({ erro: 'Este CPF já está associado a um usuário no ecossistema.' });
        return;
      }

      // 🔄 HERANÇA DINÂMICA: Localiza os dados da empresa matriz baseando-se no super admin logado
      const superAdminAtual = await prisma.usuario.findUnique({
        where: { id: req.usuario.id }
      });

      if (!superAdminAtual || !superAdminAtual.empresaId || !superAdminAtual.filialId || !superAdminAtual.setorId) {
        res.status(400).json({ erro: 'Inconsistência relacional: O Super Admin atual não possui uma empresa/filial/setor padrão vinculados.' });
        return;
      }

      const salt = await bcrypt.genSalt(10);
      const senhaHash = await bcrypt.hash(senha, salt);

      const novoMestre = await prisma.usuario.create({
        data: {
          nome,
          cpf,
          senhaHash,
          perfil: 'SUPER_ADMIN', // Injeta obrigatoriamente o superpoder global
          empresaId: superAdminAtual.empresaId,
          filialId: superAdminAtual.filialId,
          setorId: superAdminAtual.setorId
        },
        select: {
          id: true,
          nome: true,
          cpf: true,
          createdAt: true
        }
      });

      res.status(201).json({
        mensagem: 'Novo membro integrado à equipe Super Admin com sucesso!',
        usuario: novoMestre
      });
    } catch (error: any) {
      console.error('Erro ao cadastrar membro da equipe master:', error);
      res.status(500).json({ erro: 'Erro interno ao salvar integrante técnico no ecossistema.' });
    }
  },

  // 📋 LISTAR MEMBROS DA EQUIPE SUPER_ADMIN
  async listarMembrosEquipeMaster(req: Request, res: Response): Promise<void> {
    try {
      if (req.usuario?.perfil !== 'SUPER_ADMIN') {
        res.status(403).json({ erro: 'Acesso negado. Rota restrita ao proprietário do sistema.' });
        return;
      }

      // Busca o super admin atual para filtrar pela mesma empresa matriz
      const superAdminAtual = await prisma.usuario.findUnique({
        where: { id: req.usuario.id }
      });

      if (!superAdminAtual) {
        res.status(404).json({ erro: 'Super Admin requisitante não localizado.' });
        return;
      }

      const membros = await prisma.usuario.findMany({
        where: {
          empresaId: superAdminAtual.empresaId,
          perfil: 'SUPER_ADMIN'
        },
        select: {
          id: true,
          nome: true,
          cpf: true,
          createdAt: true
        },
        orderBy: { nome: 'asc' }
      });

      res.status(200).json(membros);
    } catch (error: any) {
      console.error('Erro ao listar equipe master:', error);
      res.status(500).json({ erro: 'Erro interno ao buscar integrantes de suporte.' });
    }
  }
};