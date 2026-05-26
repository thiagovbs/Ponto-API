import { Request, Response } from 'express';
import { prisma } from '../config/prisma';

export const HorarioController = {
  // 1. CRIAR JORNADA
  async criarHorario(req: Request, res: Response): Promise<void> {
  try {
    const { descricao, regrasDias, trabalhaDomingoAlt, domingoInicioImpar } = req.body;

    const regraSegunda = regrasDias.find((d: any) => d.numero === 1) || { entrada: "08:00", saida: "17:00" };
    const regraSabado  = regrasDias.find((d: any) => d.numero === 6) || { trabalha: false, entrada: "08:00", saida: "12:00" };
    const regraDomingo = regrasDias.find((d: any) => d.numero === 0) || { trabalha: false, entrada: "08:00", saida: "12:00" };

    const novoHorario = await prisma.horario.create({
      data: {
        descricao,
        horaEntradaPadrao: regraSegunda.entrada,
        horaSaidaPadrao: regraSegunda.saida,
        
        trabalhaSabado: regraSabado.trabalha,
        horaEntradaSabado: regraSabado.entrada,
        horaSaidaSabado: regraSabado.saida,
        
        // O horário do domingo é gravado NORMALMENTE aqui, livre
        trabalhaDomingo: regraDomingo.trabalha, 
        horaEntradaDomingo: regraDomingo.entrada,
        horaSaidaDomingo: regraDomingo.saida,
        
        // A flag apenas dita se o cálculo vai alternar as semanas
        trabalhaDomingoAlt: trabalhaDomingoAlt || false,
        domingoInicioImpar: domingoInicioImpar !== undefined ? domingoInicioImpar : true
      }
    });

    res.status(201).json({ mensagem: 'Jornada criada com sucesso!', horario: novoHorario });
  } catch (error) {
    console.error(error);
    res.status(500).json({ erro: 'Erro interno ao salvar jornada.' });
  }
},

  // 2. LISTAR JORNADAS
  async listarHorarios(req: Request, res: Response): Promise<void> {
    try {
      const horarios = await prisma.horario.findMany({
        orderBy: { descricao: 'asc' }
      });
      res.status(200).json(horarios);
    } catch (error) {
      console.error('Erro ao listar horários:', error);
      res.status(500).json({ erro: 'Erro interno ao buscar horários.' });
    }
  }, 

  // 3. ATUALIZAR JORNADA
  async atualizarHorario(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    const { descricao, regrasDias, trabalhaDomingoAlt, domingoInicioImpar } = req.body;

    const horarioExistente = await prisma.horario.findUnique({ where: { id } });
    if (!horarioExistente) {
      res.status(404).json({ erro: 'Jornada não encontrada.' });
      return;
    }

    const interrogadoSegunda = regrasDias?.find((d: any) => d.numero === 1);
    const interrogadoSabado  = regrasDias?.find((d: any) => d.numero === 6);
    const interrogadoDomingo = regrasDias?.find((d: any) => d.numero === 0);

    const horarioAtualizado = await prisma.horario.update({
      where: { id },
      data: {
        descricao: descricao || horarioExistente.descricao,
        ...(interrogadoSegunda && {
          horaEntradaPadrao: interrogadoSegunda.entrada,
          horaSaidaPadrao: interrogadoSegunda.saida
        }),
        ...(interrogadoSabado && {
          trabalhaSabado: interrogadoSabado.trabalha,
          horaEntradaSabado: interrogadoSabado.entrada,
          horaSaidaSabado: interrogadoSabado.saida
        }),
        ...(interrogadoDomingo && {
          trabalhaDomingo: interrogadoDomingo.trabalha,
          horaEntradaDomingo: interrogadoDomingo.entrada,
          horaSaidaDomingo: interrogadoDomingo.saida
        }),
        trabalhaDomingoAlt: trabalhaDomingoAlt !== undefined ? trabalhaDomingoAlt : horarioExistente.trabalhaDomingoAlt,
        domingoInicioImpar: domingoInicioImpar !== undefined ? domingoInicioImpar : horarioExistente.domingoInicioImpar
      }
    });

    res.status(200).json({ mensagem: 'Jornada atualizada com sucesso!', horario: horarioAtualizado });
  } catch (error) {
    console.error(error);
    res.status(500).json({ erro: 'Erro interno ao atualizar jornada.' });
  }
}
};