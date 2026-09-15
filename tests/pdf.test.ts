/**
 * Testes do espelho de ponto em PDF.
 *
 * Diferente de tests/arquitetura.test.ts, estes exercitam o gerador de verdade:
 * produzem o PDF e conferem o arquivo resultante. Rodam sem banco e sem
 * servidor, em milissegundos, porque não há navegador envolvido.
 *
 * A invariante principal é de negócio: o espelho tem que sair em uma folha A4
 * só, em qualquer mês e com qualquer volume de marcações.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { inflateSync } from 'node:zlib';

import { gerarEspelhoDePonto, type DiaDoEspelho, type EspelhoDePonto, type StatusDoDia } from '../src/config/pdf';

/**
 * Conta páginas lendo o próprio arquivo, e não o contador interno do pdfkit —
 * senão o teste só confirmaria que o gerador concorda consigo mesmo.
 */
function contarPaginas(pdf: Buffer): number {
  return (pdf.toString('latin1').match(/\/Type\s*\/Page[^s]/g) || []).length;
}

/** Extrai o texto desenhado. O pdfkit emite arrays TJ com strings hexadecimais. */
function textoDo(pdf: Buffer): string {
  const bruto = pdf.toString('latin1');
  let conteudo = '';

  const streams = /stream\r?\n([\s\S]*?)\r?\nendstream/g;
  let m: RegExpExecArray | null;
  while ((m = streams.exec(bruto)) !== null) {
    try {
      conteudo += inflateSync(Buffer.from(m[1], 'latin1')).toString('latin1');
    } catch {
      // Nem todo stream do PDF é texto comprimido.
    }
  }

  return [...conteudo.matchAll(/\[([^\]]*)\]\s*TJ/g)]
    .map((bloco) =>
      [...bloco[1].matchAll(/<([0-9a-fA-F]*)>/g)]
        .map((hex) => Buffer.from(hex[1], 'hex').toString('latin1'))
        .join('')
    )
    .join('\n');
}

function dia(numero: number, ajustes: Partial<DiaDoEspelho> = {}): DiaDoEspelho {
  return {
    data: `${String(numero).padStart(2, '0')}/01/2026`,
    status: 'TRABALHADO',
    batidas: ['08:00', '12:00', '13:00', '17:00'],
    horasTrabalhadas: '08:00',
    saldoDoDia: '+00:00',
    ...ajustes,
  };
}

function espelho(dias: DiaDoEspelho[], ajustes: Partial<EspelhoDePonto> = {}): EspelhoDePonto {
  return {
    empresa: { razaoSocial: 'Construções Assunção Ltda', cnpj: '12.345.678/0001-90' },
    funcionario: { nome: 'José da Conceição', cpf: '123.456.789-00' },
    periodo: '01/2026',
    emitidoEm: '15/09/2026',
    dias,
    totalFaltas: 0,
    saldoAcumulado: '+00:00',
    ...ajustes,
  };
}

const mesDe = (n: number) => Array.from({ length: n }, (_, i) => dia(i + 1));

describe('espelho de ponto em uma folha', () => {
  // Requisito de negócio explícito: o espelho é impresso em uma folha A4.
  // Fevereiro tem 28, ano bissexto 29, e há meses de 30 e 31 dias.
  for (const dias of [28, 29, 30, 31]) {
    it(`mês de ${dias} dias cabe em uma página`, async () => {
      const pdf = await gerarEspelhoDePonto(espelho(mesDe(dias)));

      assert.equal(contarPaginas(pdf), 1, `Mês de ${dias} dias gerou mais de uma folha.`);
      assert.equal(pdf.subarray(0, 5).toString(), '%PDF-', 'Saída não é um PDF.');
    });
  }

  it('um dia com muitas marcações não empurra para a segunda folha', async () => {
    // Quem bate ponto a cada saída para cliente acumula marcações. A célula
    // encolhe a fonte em vez de quebrar linha, e é isso que segura a página.
    const dias = mesDe(31);
    dias[10] = dia(11, {
      batidas: Array.from({ length: 24 }, (_, i) => `${String(i).padStart(2, '0')}:30`),
    });

    const pdf = await gerarEspelhoDePonto(espelho(dias));
    assert.equal(contarPaginas(pdf), 1);
  });

  it('nomes e razões sociais longos não empurram para a segunda folha', async () => {
    const pdf = await gerarEspelhoDePonto(
      espelho(mesDe(31), {
        empresa: { razaoSocial: 'Ind'.padEnd(160, 'ustria e Comercio de Componentes '), cnpj: '12.345.678/0001-90' },
        funcionario: { nome: 'Jose'.padEnd(140, ' Antonio da Conceicao Goncalves'), cpf: '123.456.789-00' },
      })
    );

    assert.equal(contarPaginas(pdf), 1);
  });

  it('estourar a folha vira erro, não uma segunda página silenciosa', async () => {
    // Sem esta checagem, um crescimento futuro do layout passaria despercebido:
    // o PDF continuaria "funcionando", só que com duas folhas.
    await assert.rejects(
      () => gerarEspelhoDePonto(espelho(mesDe(400))),
      /uma folha A4 leg.vel/,
      'O gerador deveria recusar um espelho que não cabe em uma folha.'
    );
  });
});

describe('conteúdo do espelho', () => {
  it('o rótulo do dia vem do status, não de marcação embutida no dado', async () => {
    // Regressão real: "FOLGA" viajava dentro do dado como
    // `<span style="...">FOLGA</span>`, e o escape de HTML que foi adicionado
    // depois passou a imprimir a marcação crua no relatório.
    const pdf = await gerarEspelhoDePonto(
      espelho([
        dia(1, { status: 'FOLGA', batidas: [], horasTrabalhadas: '00:00', saldoDoDia: '00:00' }),
        dia(2, { status: 'FALTA', batidas: [], horasTrabalhadas: '00:00', saldoDoDia: '-08:00' }),
      ])
    );

    const texto = textoDo(pdf);
    assert.match(texto, /FOLGA/, 'O dia de folga deve sair rotulado.');
    assert.match(texto, /FALTA UNIFICADA/, 'O dia de falta deve sair rotulado.');
    assert.doesNotMatch(texto, /<span|style=|&lt;|&amp;/, 'Nenhuma marcação pode aparecer no PDF.');
  });

  it('dado com marcação sai como texto literal, não interpretado', async () => {
    const pdf = await gerarEspelhoDePonto(
      espelho(mesDe(2), {
        funcionario: { nome: '<script>alert(1)</script>', cpf: '000' },
      })
    );

    const texto = textoDo(pdf);
    assert.match(texto, /<script>alert\(1\)<\/script>/, 'O nome deve ser desenhado como está, sem interpretação.');
    assert.equal(contarPaginas(pdf), 1);
  });

  it('acentuação do português é preservada', async () => {
    const pdf = await gerarEspelhoDePonto(espelho(mesDe(1)));
    const texto = textoDo(pdf);

    assert.match(texto, /Constru..es Assun..o/, 'A razão social perdeu a acentuação.');
    assert.match(texto, /Jos. da Concei..o/, 'O nome perdeu a acentuação.');
  });

  it('caracteres fora do WinAnsi são removidos sem quebrar a geração', async () => {
    // A justificativa de afastamento é montada com um emoji no controller, e as
    // fontes embutidas do pdfkit não o codificam.
    const pdf = await gerarEspelhoDePonto(
      espelho([
        dia(1, {
          status: 'AFASTADO',
          batidas: [],
          observacao: '\u{1F3DD}️ [AFASTAMENTO] - FERIAS',
          horasTrabalhadas: '00:00',
          saldoDoDia: '00:00',
        }),
      ])
    );

    const texto = textoDo(pdf);
    assert.match(texto, /\[AFASTAMENTO\] - FERIAS/);
    assert.equal(contarPaginas(pdf), 1);
  });

  it('o cabeçalho e o rodapé legal saem no documento', async () => {
    const pdf = await gerarEspelhoDePonto(espelho(mesDe(5), { totalFaltas: 3, saldoAcumulado: '-02:45' }));
    const texto = textoDo(pdf).replace(/\s+/g, '');

    for (const esperado of [
      'ESPELHODEPONTOELETRONICO',
      'Empregador:',
      'TotaldeFaltasnoPeriodo:3dia(s)',
      'SaldoAcumuladonoMes:-02:45',
      'artigo74',
      'AssinaturadoFuncionario',
      'AssinaturadoEmpregador',
    ]) {
      assert.ok(texto.includes(esperado), `Faltou no PDF: ${esperado}`);
    }
  });

  it('todo status conhecido gera uma folha válida', async () => {
    const todos: StatusDoDia[] = ['TRABALHADO', 'FOLGA', 'FALTA', 'AFASTADO', 'AGENDADO', 'EXTRA_FOLGA'];

    for (const status of todos) {
      const pdf = await gerarEspelhoDePonto(
        espelho([dia(1, { status, batidas: status === 'TRABALHADO' ? ['08:00', '17:00'] : [] })])
      );
      assert.equal(contarPaginas(pdf), 1, `Status ${status} quebrou a geração.`);
    }
  });
});
