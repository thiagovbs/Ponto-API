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
        res.status(400).json({ erro: 'Este CPF já está associado a um usuário no sistema.' });
        return;
      }

      // Criptografia da senha do admin do cliente
      const salt = await bcrypt.genSalt(10);
      const senhaHash = await bcrypt.hash(senhaAdmin, salt);

      // Geração do token seguro para o Totem em Flutter daquela empresa específica
      const tokenTotemGerado = crypto.randomBytes(24).toString('hex');

      // ⚡ TRANSAÇÃO ATÔMICA DO PRISMA
      const resultadoSetup = await prisma.$transaction(async (tx) => {
        // 1. Cadastra a Empresa Cliente
        const empresa = await tx.empresa.create({
          data: {
            razaoSocial,
            cnpj,
            tokenTotem: tokenTotemGerado
          }
        });

        // 2. Provisiona a Filial Matriz inicial automática dela
        const filial = await tx.filial.create({
          data: {
            nome: 'Matriz Central',
            cnpj: cnpj,
            empresaId: empresa.id
          }
        });

        // 3. Provisiona o Setor Geral inicial automático dela
        const setor = await tx.setor.create({
          data: {
            nome: 'Geral',
            empresaId: empresa.id,
            filialId: filial.id
          }
        });

        // 4. Cria o usuário ADMINISTRADOR mestre daquela empresa
        const adminCliente = await tx.usuario.create({
          data: {
            nome: nomeAdmin,
            cpf: cpfAdmin,
            senhaHash: senhaHash,
            perfil: 'ADMIN', // Ele é ADMIN da empresa dele, não SUPER_ADMIN global
            empresaId: empresa.id,
            filialId: filial.id,
            setorId: setor.id
          }
        });

        return { empresa, adminCliente };
      });

      // Retorna os dados configurados e a chave que eles vão colocar no Flutter
      res.status(201).json({
        mensagem: 'Empresa e infraestrutura SaaS provisionadas com sucesso!',
        empresaId: resultadoSetup.empresa.id,
        tokenTotemConfiguracao: resultadoSetup.empresa.tokenTotem,
        administradorVinculado: resultadoSetup.adminCliente.nome
      });

    } catch (error) {
      console.error('Erro fatal no setup do Tenant:', error);
      res.status(500).json({ erro: 'Erro interno ao processar a criação da empresa.' });
    }
  }
};