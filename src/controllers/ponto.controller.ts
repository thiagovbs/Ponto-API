import { Request, Response } from 'express';
import { prisma } from '../config/prisma';

const criarDataUTCLiteral = (ano: number, mes: number, dia: number, horas: number, minutos: number): Date => {
  return new Date(Date.UTC(ano, mes - 1, dia, horas, minutos, 0, 0));
};

export const PontoController = {
  async registrarPonto(req: Request, res: Response): Promise<void> {
    try {
      const { usuarioId, fotoBase64, latitude, longitude, dataHora } = req.body;
      const ip = req.ip || req.socket.remoteAddress;

      if (
        !usuarioId || 
        !fotoBase64 || 
        !dataHora || 
        latitude === undefined || latitude === null || 
        longitude === undefined || longitude === null
      ) {
        res.status(400).json({ erro: 'Todos os campos são obrigatórios' });
        return;
      }

      const usuario = await prisma.usuario.findUnique({
        where: { id: usuarioId },
      });

      if (!usuario) {
        res.status(404).json({ erro: 'Funcionário não encontrado' });
        return;
      }

      const dataHoraTratada = dataHora.endsWith('Z') ? dataHora : `${dataHora}Z`;
      const dataFinalPonto = new Date(dataHoraTratada);

      const resultado = await prisma.$transaction([
        prisma.batidaPonto.create({
          data: {
            usuarioId,
            fotoBase64,
            latitude,
            longitude,
            dataHora: dataFinalPonto,
            empresaId: usuario.empresaId,
            setorId: usuario.setorId
          },
        }),
        prisma.logAuditoria.create({
          data: {
            acao: 'CREATE',
            entidade: 'BatidaPonto',
            usuarioAcaoId: usuarioId,
            ipOrigem: ip || null,
            dadosAnteriores: {},
            dadosNovos: {
              empresaId: usuario.empresaId,
              setorId: usuario.setorId,
              usuarioNome: usuario.nome,
              cpf: usuario.cpf,
              latitude,
              longitude,
              dataHora: dataFinalPonto.toISOString(),
              info: "Marcação de ponto efetuada via Mobile."
            }
          }
        })
      ]);

      const batidaCriada = resultado[0];

      res.status(201).json({
        mensagem: 'Ponto registrado com sucesso',
        dataHora: batidaCriada.dataHora,
      });

    } catch (error) {
      console.error('Erro ao registrar ponto:', error);
      res.status(500).json({ erro: 'Erro interno no servidor' });
    }
  },

  async listarBatidas(req: Request, res: Response): Promise<void> {
    try {
      const { empresaId } = req;

      const batidas = await prisma.batidaPonto.findMany({
        where: {
          empresaId: empresaId
        },
        select: {
          id: true,
          dataHora: true,
          latitude: true,
          longitude: true,
          createdAt: true,
          usuarioId: true,
          usuario: {
            select: {
              nome: true,
              cpf: true
            }
          }
        },
        orderBy: { dataHora: 'desc' }
      });

      res.status(200).json(batidas);
    } catch (error) {
      console.error('Erro ao listar batidas:', error);
      res.status(500).json({ erro: 'Erro interno ao buscar batidas de ponto.' });
    }
  },

  async ajustarBatidaPonto(req: Request, res: Response): Promise<void> {
    try {
      const { batidaId } = req.params;
      const { empresaId } = req;
      const { novaHora, novaData, justificativa } = req.body;
      const quemAlterouId = req.usuario?.id; 
      const ip = req.ip || req.socket.remoteAddress;

      if (!justificativa || justificativa.trim().length < 10) {
        res.status(400).json({ erro: 'Uma justificativa de no mínimo 10 caracteres é obrigatória.' });
        return;
      }

      const batidaOriginal = await prisma.batidaPonto.findFirst({
        where: { id: batidaId, empresaId: empresaId },
        include: { 
          usuario: { select: { nome: true, cpf: true } },
          modificacoes: { orderBy: { createdAt: 'desc' }, take: 1 } 
        }
      });

      if (!batidaOriginal) {
        res.status(404).json({ erro: 'Registro de ponto não encontrado.' });
        return;
      }

      const dataHoraAnteriorDeReferencia = batidaOriginal.modificacoes.length > 0 
        ? batidaOriginal.modificacoes[0].dataHoraNova 
        : batidaOriginal.dataHora;

      const [horas, minutos] = novaHora.split(':').map(Number);
      let novaDataHoraEfetiva: Date;

      if (novaData) {
        const [ano, mes, dia] = novaData.split('-').map(Number);
        novaDataHoraEfetiva = criarDataUTCLiteral(ano, mes, dia, horas, minutos);
      } else {
        const ano = dataHoraAnteriorDeReferencia.getUTCFullYear();
        const mes = dataHoraAnteriorDeReferencia.getUTCMonth() + 1;
        const dia = dataHoraAnteriorDeReferencia.getUTCDate();
        novaDataHoraEfetiva = criarDataUTCLiteral(ano, mes, dia, horas, minutos);
      }

      const [logHistorico] = await prisma.$transaction([
        prisma.historicoModificacaoPonto.create({
          data: {
            batidaPontoId: batidaId,
            dataHoraAnterior: dataHoraAnteriorDeReferencia,
            dataHoraNova: novaDataHoraEfetiva,
            justificativa: justificativa,
            alteradoPorId: quemAlterouId || null
          }
        }),
        prisma.logAuditoria.create({
          data: {
            acao: 'UPDATE',
            entidade: 'BatidaPonto',
            usuarioAcaoId: quemAlterouId || null,
            ipOrigem: ip || null,
            dadosAnteriores: {
              batidaId,
              empresaId,
              funcionario: batidaOriginal.usuario.nome,
              horarioAnterior: dataHoraAnteriorDeReferencia.toISOString()
            },
            dadosNovos: {
              horarioNovo: novaDataHoraEfetiva.toISOString(),
              justificativa,
              info: "Ajuste manual de horário efetuado via Painel Administrativo."
            }
          }
        })
      ]);

      res.status(200).json({
        mensagem: 'Histórico de modificação e logs de auditoria gravados com sucesso.',
        historico: logHistorico
      });

    } catch (error) {
      console.error('Erro ao gravar histórico de modificação:', error);
      res.status(500).json({ erro: 'Erro interno ao processar modificação.' });
    }
  },

  async incluirPontoManualmente(req: Request, res: Response): Promise<void> {
    try {
      const { empresaId } = req;
      const { usuarioId, dataDia, hora, justificativa } = req.body;
      const quemAlterouId = req.usuario?.id;
      const ip = req.ip || req.socket.remoteAddress;

      if (!usuarioId || !dataDia || !hora || !justificativa || justificativa.trim().length < 10) {
        res.status(400).json({ erro: 'Todos os campos, incluindo justificativa de no mínimo 10 caracteres, são obrigatórios.' });
        return;
      }

      const usuario = await prisma.usuario.findFirst({ where: { id: usuarioId, empresaId: empresaId } });
      if (!usuario) {
        res.status(404).json({ erro: 'Funcionário não encontrado' });
        return;
      }

      const [ano, mes, dia] = dataDia.split('-').map(Number);
      const [horas, minutos] = hora.split(':').map(Number);
      
      const novaDataHoraEfetiva = criarDataUTCLiteral(ano, mes, dia, horas, minutos);

      const resultado = await prisma.$transaction(async (tx) => {
        const novaBatida = await tx.batidaPonto.create({
          data: {
            usuarioId,
            dataHora: novaDataHoraEfetiva,
            fotoBase64: "INCLUSAO_MANUAL_ADMIN", 
            latitude: 0,
            longitude: 0,
            empresaId: empresaId!,
            setorId: usuario.setorId
          }
        });

        await tx.historicoModificacaoPonto.create({
          data: {
            batidaPontoId: novaBatida.id,
            dataHoraAnterior: novaDataHoraEfetiva, 
            dataHoraNova: novaDataHoraEfetiva,
            justificativa: `[Inclusão Manual] ${justificativa}`,
            alteradoPorId: quemAlterouId || null
          }
        });

        await tx.logAuditoria.create({
          data: {
            acao: 'CREATE',
            entidade: 'BatidaPonto',
            usuarioAcaoId: quemAlterouId || null,
            ipOrigem: ip || null,
            dadosAnteriores: {},
            dadosNovos: {
              empresaId,
              usuarioNome: usuario.nome,
              cpf: usuario.cpf,
              horarioIncluido: novaDataHoraEfetiva.toISOString(),
              justificativa,
              info: "Inclusão forçada de marcação de ponto realizada pelo Admin."
            }
          }
        });

        return novaBatida;
      });

      res.status(201).json({
        mensagem: 'Marcação incluída manualmente e registrada na trilha de auditoria.',
        batida: resultado
      });

    } catch (error) {
      console.error('Erro ao incluir ponto manualmente:', error);
      res.status(500).json({ erro: 'Erro interno ao processar inclusão manual.' });
    }
  },

  async desconsiderarBatidaPonto(req: Request, res: Response): Promise<void> {
    try {
      const { batidaId } = req.params;
      const { empresaId } = req;
      const { justificativa } = req.body;
      const quemAlterouId = req.usuario?.id; 
      const ip = req.ip || req.socket.remoteAddress;

      if (!justificativa || justificativa.trim().length < 10) {
        res.status(400).json({ erro: 'Uma justificativa de no mínimo 10 caracteres é obrigatória para desconsiderar um ponto.' });
        return;
      }

      const batidaOriginal = await prisma.batidaPonto.findFirst({
        where: { id: batidaId, empresaId: empresaId },
        include: { 
          usuario: { select: { nome: true, cpf: true } },
          modificacoes: { orderBy: { createdAt: 'desc' }, take: 1 } 
        }
      });

      if (!batidaOriginal) {
        res.status(404).json({ erro: 'Registro de ponto não encontrado.' });
        return;
      }

      const dataHoraAnterior = batidaOriginal.modificacoes.length > 0 
        ? batidaOriginal.modificacoes[0].dataHoraNova 
        : batidaOriginal.dataHora;

      await prisma.$transaction([
        prisma.historicoModificacaoPonto.create({
          data: {
            batidaPontoId: batidaId,
            dataHoraAnterior: dataHoraAnterior,
            dataHoraNova: new Date(0), 
            justificativa: `[PONTO DESCONSIDERADO] ${justificativa}`,
            alteradoPorId: quemAlterouId || null
          }
        }),
        prisma.logAuditoria.create({
          data: {
            acao: 'DELETE', 
            entidade: 'BatidaPonto',
            usuarioAcaoId: quemAlterouId || null,
            ipOrigem: ip || null,
            dadosAnteriores: {
              batidaId,
              empresaId,
              funcionario: batidaOriginal.usuario.nome,
              horarioQueSumiu: dataHoraAnterior.toISOString()
            },
            dadosNovos: {
              justificativa,
              statusFinal: "DESCONSIDERADO_DO_ESPELHO",
              info: "Marcação de ponto desativada logicamente da folha mensal."
            }
          }
        })
      ]);

      res.status(200).json({
        mensagem: 'Marcação desconsiderada com sucesso e documentada no histórico de auditoria.'
      });

    } catch (error) {
      console.error('Erro ao desconsiderar ponto:', error);
      res.status(500).json({ erro: 'Erro interno ao processar exclusão lógica.' });
    }
  }
};