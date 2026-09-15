/**
 * Testes de arquitetura.
 *
 * Não exercitam comportamento: leem o código e afirmam invariantes estruturais.
 * Existem porque cada item abaixo já foi um defeito real neste projeto, e todos
 * eles passariam despercebidos por um teste funcional — o sistema continuava
 * "funcionando" com o defeito presente.
 *
 * Rodam sem banco, sem servidor e em milissegundos.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const RAIZ = join(__dirname, '..', 'src');

function ler(caminhoRelativo: string): string {
  return readFileSync(join(RAIZ, caminhoRelativo), 'utf-8');
}

function arquivosDe(pasta: string): { nome: string; conteudo: string }[] {
  return readdirSync(join(RAIZ, pasta))
    .filter((n) => n.endsWith('.ts'))
    .map((nome) => ({ nome, conteudo: ler(join(pasta, nome)) }));
}

/** Agrupa as linhas de um arquivo por método (`async nomeDoMetodo(`). */
function porMetodo(conteudo: string): Map<string, string[]> {
  const mapa = new Map<string, string[]>();
  let atual = '(fora de metodo)';
  for (const linha of conteudo.split('\n')) {
    const m = linha.match(/async (\w+)\s*\(/);
    if (m) atual = m[1];
    if (!mapa.has(atual)) mapa.set(atual, []);
    mapa.get(atual)!.push(linha);
  }
  return mapa;
}

const ESCRITA = /(?:prisma|tx)\.(\w+)\.(create|update|updateMany|delete|deleteMany|upsert)\b/;

describe('auditoria', () => {
  // A extensão global do Prisma gravava um log por escrita, mas sem autor, sem
  // IP, sem estado anterior, com o `data` cru (incluindo senhaHash) e fora da
  // transação. Foi removida em favor do log explícito de cada controller. Sem
  // este teste, nada impede alguém de "restaurar a auditoria automática".
  it('todo método que escreve no banco também grava LogAuditoria', () => {
    const semLog: string[] = [];

    for (const { nome, conteudo } of arquivosDe('controllers')) {
      for (const [metodo, linhas] of porMetodo(conteudo)) {
        const escreve = linhas.some((l) => {
          const m = l.match(ESCRITA);
          return m !== null && m[1] !== 'logAuditoria';
        });
        const loga = linhas.some((l) => l.includes('logAuditoria.create'));
        if (escreve && !loga) semLog.push(`${nome} :: ${metodo}`);
      }
    }

    assert.deepEqual(
      semLog,
      [],
      'Métodos que alteram o banco sem registrar quem fez a alteração:\n' +
        semLog.map((m) => `  - ${m}`).join('\n')
    );
  });

  it('nenhum log de auditoria carrega senha ou hash', () => {
    const suspeitos: string[] = [];

    for (const { nome, conteudo } of arquivosDe('controllers')) {
      // Recorta cada bloco logAuditoria.create e procura campos sensíveis.
      const blocos = conteudo.split('logAuditoria.create').slice(1);
      for (const bloco of blocos) {
        const corpo = bloco.slice(0, 900);
        if (/\bsenhaHash\b|\bsenha\b\s*[,:}]/.test(corpo)) suspeitos.push(nome);
      }
    }

    assert.deepEqual(
      [...new Set(suspeitos)],
      [],
      'Logs de auditoria não podem registrar credenciais.'
    );
  });

  it('não existe extensão global de auditoria no cliente Prisma', () => {
    assert.ok(
      !ler('config/prisma.ts').includes('$extends'),
      'A auditoria automática por extensão foi removida de propósito: ela ' +
        'duplicava os logs dos controllers com dados piores e sem autor.'
    );
  });
});

describe('segredo de assinatura', () => {
  // Cinco pontos caíam num segredo escrito no fonte quando a variável faltava,
  // e dois deles usavam valores diferentes entre si.
  it('nenhum arquivo define um fallback para JWT_SECRET', () => {
    const comFallback: string[] = [];

    for (const pasta of ['controllers', 'middlewares', 'routes', 'config']) {
      for (const { nome, conteudo } of arquivosDe(pasta)) {
        // O comentário em config/env.ts cita os valores antigos ao explicar a
        // remoção; o que importa é não haver código com fallback.
        const codigo = conteudo
          .split('\n')
          .filter((l) => !l.trimStart().startsWith('//') && !l.trimStart().startsWith('*'))
          .join('\n');
        if (/process\.env\.JWT_SECRET\s*\|\|/.test(codigo)) comFallback.push(`${pasta}/${nome}`);
      }
    }

    assert.deepEqual(comFallback, [], 'JWT_SECRET não pode ter valor padrão no código.');
  });

  it('o segredo vem de um único módulo validado', () => {
    assert.ok(
      ler('config/env.ts').includes('throw new Error'),
      'config/env.ts precisa derrubar o boot quando JWT_SECRET faltar.'
    );
  });
});

describe('escopo do totem', () => {
  // O tablet da portaria recebia perfil ADMIN "para passar pelas checagens",
  // o que permitia criar um SUPER_ADMIN e atravessar o isolamento entre
  // empresas.
  it('o totem não recebe perfil ADMIN', () => {
    const injetam: string[] = [];

    for (const pasta of ['middlewares', 'routes']) {
      for (const { nome, conteudo } of arquivosDe(pasta)) {
        if (/perfil:\s*'ADMIN'/.test(conteudo)) injetam.push(`${pasta}/${nome}`);
      }
    }

    assert.deepEqual(
      injetam,
      [],
      'O totem deve receber PERFIL_TOTEM; ADMIN lhe daria poder administrativo.'
    );
  });

  it('escrita em /usuarios exige perfil administrativo', () => {
    const rotas = ler('routes/usuario.routes.ts');

    for (const metodo of ['post', 'put', 'delete']) {
      const linha = rotas
        .split('\n')
        .find((l) => l.includes(`usuarioRoutes.${metodo}(`));

      assert.ok(linha, `Rota ${metodo.toUpperCase()} de /usuarios não encontrada.`);
      assert.ok(
        linha!.includes('somenteAdmin'),
        `${metodo.toUpperCase()} /usuarios precisa do guard de administrador.`
      );
    }
  });

  it('operações que alteram jornada exigem administrador', () => {
    const rotas = ler('routes/ponto.routes.ts');

    // Ajustar, incluir manualmente e desconsiderar batida mudam a jornada
    // registrada e precisam ser atribuíveis. As três não tinham guard nenhum.
    for (const operacao of ['ajustar', 'incluir-manual', 'desconsiderar']) {
      const linha = rotas.split('\n').find((l) => l.includes(`'/${operacao}`));

      assert.ok(linha, `Rota de ${operacao} não encontrada.`);
      assert.ok(
        linha!.includes('somenteAdmin'),
        `A rota de ${operacao} precisa do guard de administrador.`
      );
    }
  });
});

describe('geração de PDF', () => {
  // O serviço roda em 0.1 CPU e 512 MB. Um Chromium headless não cabe nesse
  // orçamento: ocupava mais memória que a instância inteira em pico e disputava
  // CPU com o event loop, travando a API durante cada relatório. A geração
  // passou para o pdfkit, que desenha o documento direto.
  it('nenhum gerador baseado em navegador volta ao projeto', () => {
    const pacote = JSON.parse(
      readFileSync(join(RAIZ, '..', 'package.json'), 'utf-8')
    ) as { dependencies?: Record<string, string>; devDependencies?: Record<string, string> };

    const dependencias = Object.keys({ ...pacote.dependencies, ...pacote.devDependencies });
    const navegadores = dependencias.filter((d) =>
      ['puppeteer', 'puppeteer-core', 'html-pdf-node', 'html-pdf', 'playwright', 'chrome-aws-lambda'].includes(d)
    );

    assert.deepEqual(
      navegadores,
      [],
      'Dependência que embute navegador: ' + navegadores.join(', ') +
        '. O plano é 0.1 CPU / 512 MB — não há espaço para um Chromium.'
    );
  });

  it('o controller não monta HTML para o relatório', () => {
    // O espelho vinha como string de HTML interpolada com nome de funcionário,
    // razão social e justificativa de afastamento — todos preenchidos por
    // administradores de empresa. Sem parser de marcação no caminho, essa
    // classe de problema deixa de existir em vez de depender de escape.
    // Os comentários citam a marcação antiga ao explicar por que ela saiu; só
    // o código conta.
    const controller = ler('controllers/relatorio.controller.ts')
      .split('\n')
      .filter((l) => {
        const t = l.trimStart();
        return !t.startsWith('//') && !t.startsWith('*') && !t.startsWith('/*');
      })
      .join('\n');

    const suspeitos: string[] = [];
    if (/<(table|tr|td|div|span|html|style)\b/.test(controller)) suspeitos.push('marcação HTML no fonte');
    if (controller.includes('escaparHtml')) suspeitos.push('escape de HTML (não deveria ser necessário)');
    if (controller.includes('linhasHtml')) suspeitos.push('montagem de linhas em HTML');

    assert.deepEqual(
      suspeitos,
      [],
      'O relatório voltou a ser montado como HTML: ' + suspeitos.join(', ')
    );
  });

  it('a geração de PDF passa pelo módulo compartilhado', () => {
    const controller = ler('controllers/relatorio.controller.ts');

    assert.ok(
      controller.includes('gerarEspelhoDePonto('),
      'A geração de PDF deve passar por config/pdf.ts, onde o layout e o limite de página vivem.'
    );
  });

  it('o gerador confere a contagem de páginas antes de devolver', () => {
    // O relatório é impresso em uma folha só. Sem esta checagem, um layout que
    // cresça passa a gerar duas folhas em silêncio.
    const pdf = ler('config/pdf.ts');

    assert.ok(
      /bufferedPageRange\(\)\.count/.test(pdf),
      'config/pdf.ts precisa contar as páginas geradas.'
    );
    assert.ok(
      /paginas !== 1/.test(pdf),
      'A contagem só serve se o gerador recusar um resultado com mais de uma página.'
    );
  });

  it('nome e CPF são validados antes de chegar ao banco', () => {
    const usuarios = ler('controllers/usuario.controller.ts');

    assert.ok(usuarios.includes('function validarIdentidade'), 'validarIdentidade ausente.');

    // Criar e atualizar recebem nome e cpf do corpo: os dois precisam validar.
    const semValidacao: string[] = [];
    for (const metodo of ['criarUsuario', 'atualizarUsuario']) {
      const inicio = usuarios.indexOf(`async ${metodo}(`);
      assert.notEqual(inicio, -1, `${metodo} não encontrado.`);

      const proximo = usuarios.indexOf('async ', inicio + 10);
      const corpo = usuarios.slice(inicio, proximo === -1 ? undefined : proximo);
      if (!corpo.includes('validarIdentidade(')) semValidacao.push(metodo);
    }

    assert.deepEqual(semValidacao, [], 'Sem validação de identidade: ' + semValidacao.join(', '));
  });
});
