import PDFDocument from 'pdfkit';

/**
 * Geração do espelho de ponto em PDF.
 *
 * Não há navegador envolvido. A versão anterior montava HTML e o renderizava
 * num Chromium headless (html-pdf-node e, depois, puppeteer). O serviço roda
 * num plano de 0.1 CPU e 512 MB: o Chromium sozinho ocupava mais memória que
 * isso em pico e disputava a mesma fatia de CPU do event loop, travando a API
 * inteira enquanto alguém emitia um relatório.
 *
 * O espelho é uma tabela de no máximo 31 linhas, sem imagem, sem fonte externa
 * e sem layout dinâmico. O pdfkit desenha isso direto, em ~95 ms e ~90 MB no
 * processo todo.
 *
 * Duas consequências além do custo:
 *
 * - Não existe mais parser de marcação no caminho. Nome de funcionário e
 *   justificativa de afastamento são desenhados como texto, não interpretados.
 *   O escape de HTML deixou de ser necessário porque não há HTML.
 * - Estilo é parâmetro de desenho, não string. Antes, "FOLGA" viajava como
 *   `<span style="...">FOLGA</span>` dentro do próprio dado, e o escape que eu
 *   adicionei depois passou a imprimir essa marcação crua no relatório.
 */

export type StatusDoDia =
  | 'TRABALHADO'
  | 'FOLGA'
  | 'FALTA'
  | 'AFASTADO'
  | 'AGENDADO'
  | 'EXTRA_FOLGA';

export interface DiaDoEspelho {
  data: string;
  status: StatusDoDia;
  /** Horários já formatados (HH:MM). Vazio em folga, falta ou afastamento. */
  batidas: string[];
  /** Preenchido apenas em AFASTADO. */
  observacao?: string;
  horasTrabalhadas: string;
  saldoDoDia: string;
}

export interface EspelhoDePonto {
  empresa: { razaoSocial: string; cnpj: string };
  funcionario: { nome: string; cpf: string };
  /** MM/AAAA */
  periodo: string;
  emitidoEm: string;
  dias: DiaDoEspelho[];
  totalFaltas: number;
  saldoAcumulado: string;
}

// A4 em pontos (1 pt = 1/72"). Margens equivalentes às 12 mm do layout antigo.
const LARGURA_A4 = 595.28;
const ALTURA_A4 = 841.89;
const MARGEM_X = 34;
const MARGEM_TOPO = 34;
const MARGEM_BASE = 28;

const LARGURA_UTIL = LARGURA_A4 - MARGEM_X * 2;

// Alturas reservadas para o que não é a tabela. A altura de linha é derivada do
// que sobra, e é isso que mantém o relatório em uma folha só para qualquer mês.
const ALTURA_CABECALHO = 74;
const ALTURA_TITULO_TABELA = 15;
const ALTURA_RESUMO = 32;
const ALTURA_DECLARACAO = 26;
const ALTURA_ASSINATURAS = 62;
const ESPACO = 6;

const ALTURA_MAXIMA_LINHA = 16;
// Abaixo disto a linha deixa de ser legível. Um mês tem no máximo 31 dias e a
// faixa disponível dá ~17 pt por linha, então o piso nunca é atingido com dado
// real: ele existe para que um volume inesperado vire erro em vez de uma folha
// ilegível ou uma segunda página.
const ALTURA_MINIMA_LINHA = 9;
const CORPO_BASE = 8;
const CORPO_MINIMO = 5;

const PRETO = '#000000';
const CINZA_BORDA = '#444444';
const CINZA_TEXTO = '#777777';
const CINZA_FUNDO = '#eaeaea';
const VERMELHO = '#dc2626';
const VERDE = '#155724';
const VERDE_FUNDO = '#f4fbf7';
const CINZA_CLARO = '#fafafa';

/** Larguras das colunas, na mesma proporção do layout anterior. */
const COLUNAS = [0.15, 0.55, 0.15, 0.15].map((p) => p * LARGURA_UTIL);

type Doc = InstanceType<typeof PDFDocument>;

/**
 * As fontes embutidas do pdfkit usam WinAnsi, que cobre o português mas não
 * emoji. A justificativa de afastamento já vinha com um emoji montado no
 * controller; sem isto o caractere quebraria a codificação do texto.
 */
function apenasWinAnsi(valor: unknown): string {
  if (valor === null || valor === undefined) return '';

  // Filtrado por ponto de codigo, e nao por faixa em expressao regular: a faixa
  // exigiria escrever o caractere nulo no fonte, que torna o arquivo binario
  // para o git e para varias ferramentas.
  const LIMITE_WINANSI = 0xff;

  return Array.from(String(valor))
    .filter((caractere) => caractere.charCodeAt(0) <= LIMITE_WINANSI)
    .join('')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Maior corpo de fonte, entre `CORPO_BASE` e `CORPO_MINIMO`, em que o texto
 * cabe na largura dada. Evita truncar marcações: um dia com muitas batidas
 * encolhe em vez de perder informação.
 */
function corpoQueCabe(doc: Doc, texto: string, largura: number, fonte: string): number {
  for (let corpo = CORPO_BASE; corpo > CORPO_MINIMO; corpo -= 0.25) {
    doc.font(fonte).fontSize(corpo);
    if (doc.widthOfString(texto) <= largura) return corpo;
  }
  return CORPO_MINIMO;
}

/** Escreve uma célula sem deixar o pdfkit quebrar linha nem paginar. */
function celula(
  doc: Doc,
  texto: string,
  x: number,
  y: number,
  largura: number,
  altura: number,
  opcoes: {
    alinhamento?: 'left' | 'center' | 'right';
    fonte?: string;
    cor?: string;
    recuo?: number;
  } = {}
): void {
  const fonte = opcoes.fonte ?? 'Helvetica';
  const recuo = opcoes.recuo ?? 3;
  const disponivel = largura - recuo * 2;
  const limpo = apenasWinAnsi(texto);

  const corpo = corpoQueCabe(doc, limpo, disponivel, fonte);
  doc
    .font(fonte)
    .fontSize(corpo)
    .fillColor(opcoes.cor ?? PRETO)
    .text(limpo, x + recuo, y + (altura - corpo) / 2 - 0.5, {
      width: disponivel,
      align: opcoes.alinhamento ?? 'center',
      lineBreak: false,
      ellipsis: true,
    });
}

function retangulo(doc: Doc, x: number, y: number, largura: number, altura: number, fundo?: string): void {
  if (fundo) doc.rect(x, y, largura, altura).fill(fundo);
  doc.rect(x, y, largura, altura).lineWidth(0.5).strokeColor(CINZA_BORDA).stroke();
}

function desenharCabecalho(doc: Doc, dados: EspelhoDePonto, y: number): void {
  retangulo(doc, MARGEM_X, y, LARGURA_UTIL, ALTURA_CABECALHO);

  doc
    .font('Helvetica-Bold')
    .fontSize(11)
    .fillColor(PRETO)
    .text('ESPELHO DE PONTO ELETRONICO', MARGEM_X, y + 7, {
      width: LARGURA_UTIL,
      align: 'center',
      lineBreak: false,
    });

  const linhas: [string, string, string, string][] = [
    ['Empregador:', dados.empresa.razaoSocial, 'CNPJ:', dados.empresa.cnpj],
    ['Funcionario:', dados.funcionario.nome, 'Periodo de Referencia:', dados.periodo],
    ['CPF:', dados.funcionario.cpf, 'Data de Emissao:', dados.emitidoEm],
  ];

  const metade = LARGURA_UTIL / 2;
  let linhaY = y + 26;

  for (const [rotuloEsq, valorEsq, rotuloDir, valorDir] of linhas) {
    doc.font('Helvetica-Bold').fontSize(8).fillColor(PRETO);
    const larguraRotulo = doc.widthOfString(rotuloEsq + ' ');
    doc.text(rotuloEsq, MARGEM_X + 8, linhaY, { lineBreak: false });
    celula(doc, valorEsq, MARGEM_X + 8 + larguraRotulo, linhaY - 2, metade - larguraRotulo - 16, 10, {
      alinhamento: 'left',
      recuo: 0,
    });

    doc.font('Helvetica-Bold').fontSize(8).fillColor(PRETO);
    doc.text(rotuloDir + ' ' + apenasWinAnsi(valorDir), MARGEM_X + metade, linhaY, {
      width: metade - 8,
      align: 'right',
      lineBreak: false,
    });

    linhaY += 13;
  }
}

function desenharTabela(doc: Doc, dias: DiaDoEspelho[], y: number, alturaDisponivel: number): void {
  const cabecalhos = ['Data', 'Marcacoes Registradas (Horas)', 'Trabalhadas', 'Saldo do Dia'];

  let x = MARGEM_X;
  for (let i = 0; i < COLUNAS.length; i++) {
    retangulo(doc, x, y, COLUNAS[i], ALTURA_TITULO_TABELA, CINZA_FUNDO);
    celula(doc, cabecalhos[i], x, y, COLUNAS[i], ALTURA_TITULO_TABELA, { fonte: 'Helvetica-Bold' });
    x += COLUNAS[i];
  }

  // A altura da linha sai do espaço que sobrou, limitada pelo máximo legível.
  // É isto que garante a folha única: fevereiro e um mês de 31 dias ocupam a
  // mesma faixa vertical, só com linhas de altura diferente.
  const alturaLinha = Math.min(ALTURA_MAXIMA_LINHA, alturaDisponivel / Math.max(dias.length, 1));

  if (alturaLinha < ALTURA_MINIMA_LINHA) {
    throw new Error(
      `O espelho de ponto deve caber em uma folha A4 legível, mas ${dias.length} linhas exigiriam ` +
        `${alturaLinha.toFixed(1)} pt cada (mínimo ${ALTURA_MINIMA_LINHA} pt).`
    );
  }

  let linhaY = y + ALTURA_TITULO_TABELA;

  for (const dia of dias) {
    if (dia.status === 'AFASTADO') {
      retangulo(doc, MARGEM_X, linhaY, COLUNAS[0], alturaLinha, VERDE_FUNDO);
      celula(doc, dia.data, MARGEM_X, linhaY, COLUNAS[0], alturaLinha);

      const larguraRestante = COLUNAS[1] + COLUNAS[2] + COLUNAS[3];
      retangulo(doc, MARGEM_X + COLUNAS[0], linhaY, larguraRestante, alturaLinha, VERDE_FUNDO);
      celula(doc, dia.observacao ?? 'AFASTAMENTO', MARGEM_X + COLUNAS[0], linhaY, larguraRestante, alturaLinha, {
        fonte: 'Helvetica-Bold',
        cor: VERDE,
      });

      linhaY += alturaLinha;
      continue;
    }

    // Marcações e estilo saem do status, não de marcação embutida no dado.
    let marcacoes = dia.batidas.join('  |  ');
    let fonte = 'Helvetica';
    let cor = PRETO;
    let alinhamento: 'left' | 'center' = 'left';

    if (dia.batidas.length === 0) {
      alinhamento = 'center';
      if (dia.status === 'FOLGA') {
        marcacoes = 'FOLGA';
        fonte = 'Helvetica-Oblique';
        cor = CINZA_TEXTO;
      } else if (dia.status === 'AGENDADO') {
        marcacoes = '-';
        cor = CINZA_TEXTO;
      } else {
        marcacoes = 'FALTA UNIFICADA';
        fonte = 'Helvetica-Bold';
        cor = VERMELHO;
      }
    }

    const valores: [string, 'left' | 'center', string, string][] = [
      [dia.data, 'center', 'Helvetica', PRETO],
      [marcacoes, alinhamento, fonte, cor],
      [dia.horasTrabalhadas, 'center', 'Helvetica', PRETO],
      [dia.saldoDoDia, 'center', 'Helvetica', PRETO],
    ];

    let colunaX = MARGEM_X;
    for (let i = 0; i < COLUNAS.length; i++) {
      const [texto, alinha, fonteCelula, corCelula] = valores[i];
      retangulo(doc, colunaX, linhaY, COLUNAS[i], alturaLinha);
      celula(doc, texto, colunaX, linhaY, COLUNAS[i], alturaLinha, {
        alinhamento: alinha,
        fonte: fonteCelula,
        cor: corCelula,
        recuo: alinha === 'left' ? 6 : 3,
      });
      colunaX += COLUNAS[i];
    }

    linhaY += alturaLinha;
  }
}

function desenharResumo(doc: Doc, dados: EspelhoDePonto, y: number): void {
  const largura = LARGURA_UTIL * 0.4;
  const x = MARGEM_X + LARGURA_UTIL - largura;

  retangulo(doc, x, y, largura, ALTURA_RESUMO, CINZA_CLARO);

  doc.font('Helvetica-Bold').fontSize(8).fillColor(PRETO);
  doc.text(`Total de Faltas no Periodo: ${dados.totalFaltas} dia(s)`, x + 5, y + 7, {
    width: largura - 10,
    lineBreak: false,
  });
  doc.text(`Saldo Acumulado no Mes: ${apenasWinAnsi(dados.saldoAcumulado)}`, x + 5, y + 19, {
    width: largura - 10,
    lineBreak: false,
  });
}

function desenharAssinaturas(doc: Doc, dados: EspelhoDePonto, y: number): void {
  doc
    .font('Helvetica')
    .fontSize(7.5)
    .fillColor('#222222')
    .text(
      'Reconheco a fidelidade e a exatidao das marcacoes de horarios e periodos aqui expostas, em total ' +
        'conformidade com o artigo 74 da Consolidacao das Leis do Trabalho (CLT).',
      MARGEM_X,
      y,
      { width: LARGURA_UTIL, align: 'justify' }
    );

  const assinaturaY = y + ALTURA_DECLARACAO + 24;
  const metade = LARGURA_UTIL / 2;
  const larguraLinha = metade * 0.8;

  const blocos: [number, string, string][] = [
    [MARGEM_X, dados.funcionario.nome, 'Assinatura do Funcionario'],
    [MARGEM_X + metade, 'Representante Legal', 'Assinatura do Empregador'],
  ];

  for (const [base, nome, papel] of blocos) {
    const inicio = base + (metade - larguraLinha) / 2;
    doc
      .moveTo(inicio, assinaturaY)
      .lineTo(inicio + larguraLinha, assinaturaY)
      .lineWidth(0.5)
      .strokeColor(PRETO)
      .stroke();

    celula(doc, nome, base, assinaturaY + 3, metade, 10, { fonte: 'Helvetica-Bold' });
    doc
      .font('Helvetica')
      .fontSize(7.5)
      .fillColor('#444444')
      .text(papel, base, assinaturaY + 14, { width: metade, align: 'center', lineBreak: false });
  }
}

/**
 * Monta o espelho e devolve o PDF.
 *
 * Tudo é desenhado em coordenadas absolutas, com `lineBreak: false`, para que o
 * pdfkit nunca pagine por conta própria. A contagem de páginas é conferida
 * antes de devolver: se um dia o layout crescer além da folha, isso vira erro
 * em vez de um segundo papel silencioso.
 */
export function gerarEspelhoDePonto(dados: EspelhoDePonto): Promise<Buffer> {
  return new Promise((resolver, rejeitar) => {
    const doc = new PDFDocument({
      size: 'A4',
      margins: { top: MARGEM_TOPO, bottom: MARGEM_BASE, left: MARGEM_X, right: MARGEM_X },
      bufferPages: true,
      info: {
        Title: `Espelho de Ponto - ${apenasWinAnsi(dados.funcionario.nome)} - ${dados.periodo}`,
        Author: apenasWinAnsi(dados.empresa.razaoSocial),
      },
    });

    const pedacos: Buffer[] = [];
    let paginas = 0;

    doc.on('data', (pedaco: Buffer) => pedacos.push(pedaco));
    doc.on('error', rejeitar);
    doc.on('end', () => {
      if (paginas !== 1) {
        rejeitar(new Error(`O espelho de ponto deve caber em uma folha A4, mas gerou ${paginas}.`));
        return;
      }
      resolver(Buffer.concat(pedacos));
    });

    try {
      let y = MARGEM_TOPO;

      desenharCabecalho(doc, dados, y);
      y += ALTURA_CABECALHO + ESPACO;

      const rodape = ALTURA_RESUMO + ESPACO + ALTURA_DECLARACAO + ALTURA_ASSINATURAS;
      const fimUtil = ALTURA_A4 - MARGEM_BASE;
      const alturaTabela = fimUtil - rodape - y - ESPACO;

      desenharTabela(doc, dados.dias, y, alturaTabela - ALTURA_TITULO_TABELA);

      const inicioRodape = fimUtil - rodape;
      desenharResumo(doc, dados, inicioRodape);
      desenharAssinaturas(doc, dados, inicioRodape + ALTURA_RESUMO + ESPACO);

      // Conferido antes do `end()`: depois dele o pdfkit esvazia o buffer de
      // páginas e a contagem volta a zero.
      paginas = doc.bufferedPageRange().count;

      doc.end();
    } catch (erro) {
      rejeitar(erro);
    }
  });
}
