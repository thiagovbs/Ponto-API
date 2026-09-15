/**
 * Autorização por perfil.
 *
 * Diferente de tests/arquitetura.test.ts, que lê o código, aqui o middleware é
 * executado de verdade — com req/res falsos, sem servidor e sem banco.
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import type { Request, Response, NextFunction } from 'express';
import { AuthMiddleware, PERFIL_TOTEM } from '../src/middlewares/auth.middleware';

type Resposta = {
  status: number | null;
  corpo: unknown;
  passou: boolean;
};

/** Monta req/res mínimos e devolve o que o middleware fez com eles. */
function executar(perfil: string | undefined, guard: ReturnType<typeof AuthMiddleware.permitirPerfis>): Resposta {
  const resultado: Resposta = { status: null, corpo: null, passou: false };

  const req = { usuario: perfil ? { id: 'u1', perfil } : undefined } as unknown as Request;
  const res = {
    status(codigo: number) {
      resultado.status = codigo;
      return this;
    },
    json(corpo: unknown) {
      resultado.corpo = corpo;
      return this;
    },
  } as unknown as Response;
  const next: NextFunction = () => {
    resultado.passou = true;
  };

  guard(req, res, next);
  return resultado;
}

describe('permitirPerfis', () => {
  let somenteAdmin: ReturnType<typeof AuthMiddleware.permitirPerfis>;

  beforeEach(() => {
    somenteAdmin = AuthMiddleware.permitirPerfis('SUPER_ADMIN', 'ADMIN');
  });

  it('deixa passar um perfil listado', () => {
    const r = executar('ADMIN', somenteAdmin);
    assert.equal(r.passou, true);
    assert.equal(r.status, null);
  });

  it('deixa passar SUPER_ADMIN', () => {
    assert.equal(executar('SUPER_ADMIN', somenteAdmin).passou, true);
  });

  // O ponto central da correção: o token do totem não pode alcançar operações
  // administrativas. Antes ele chegava aqui como ADMIN e passava.
  it('bloqueia o totem em operação administrativa', () => {
    const r = executar(PERFIL_TOTEM, somenteAdmin);
    assert.equal(r.passou, false);
    assert.equal(r.status, 403);
  });

  it('bloqueia FUNCIONARIO em operação administrativa', () => {
    const r = executar('FUNCIONARIO', somenteAdmin);
    assert.equal(r.passou, false);
    assert.equal(r.status, 403);
  });

  it('bloqueia quando não há usuário na requisição', () => {
    const r = executar(undefined, somenteAdmin);
    assert.equal(r.passou, false);
    assert.equal(r.status, 403);
  });

  it('bloqueia um perfil desconhecido', () => {
    const r = executar('QUALQUER_COISA', somenteAdmin);
    assert.equal(r.passou, false);
    assert.equal(r.status, 403);
  });

  it('deixa o totem passar onde ele é explicitamente permitido', () => {
    // É o caso de GET /usuarios e POST /ponto/bater: o tablet precisa dos dois.
    const comTotem = AuthMiddleware.permitirPerfis('SUPER_ADMIN', 'ADMIN', PERFIL_TOTEM);
    assert.equal(executar(PERFIL_TOTEM, comTotem).passou, true);
  });

  it('não vaza qual perfil seria necessário na mensagem de erro', () => {
    const r = executar(PERFIL_TOTEM, somenteAdmin) as Resposta & { corpo: { erro?: string } };
    const mensagem = String((r.corpo as { erro?: string })?.erro ?? '');
    assert.ok(!mensagem.includes('ADMIN'), 'A mensagem de 403 não deve enumerar perfis.');
  });
});

describe('verificarAdmin', () => {
  // Guard antigo, ainda usado em várias rotas. O totem também não pode passar
  // por ele.
  it('bloqueia o totem', () => {
    const r = executar(PERFIL_TOTEM, AuthMiddleware.verificarAdmin as never);
    assert.equal(r.passou, false);
    assert.equal(r.status, 403);
  });

  it('deixa passar ADMIN e SUPER_ADMIN', () => {
    for (const perfil of ['ADMIN', 'SUPER_ADMIN']) {
      assert.equal(executar(perfil, AuthMiddleware.verificarAdmin as never).passou, true, perfil);
    }
  });
});
