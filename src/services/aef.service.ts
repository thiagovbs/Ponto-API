import { prisma } from '../config/prisma';

// Função utilitária para formatar os campos no padrão rígido do MTE
function formatarCampo(texto: string | number | null | undefined, tamanho: number, tipo: 'texto' | 'numero'): string {
  let stringLimpa = texto ? String(texto) : '';
  
  // Remove acentos e caracteres especiais para não quebrar o alinhamento de bytes do arquivo txt
  stringLimpa = stringLimpa.normalize("NFD").replace(/[\u0300-\u036f]/g, "");

  if (tipo === 'numero') {
    // Remove tudo que não for dígito, alinha à direita e preenche com zeros à esquerda
    stringLimpa = stringLimpa.replace(/\D/g, '');
    return stringLimpa.padStart(tamanho, '0').substring(0, tamanho);
  } else {
    // Alinha à esquerda e preenche com espaços vazios à direita
    return stringLimpa.padEnd(tamanho, ' ').substring(0, tamanho);
  }
}

export const gerarConteudoAEF = async (dataInicio: Date, dataFim: Date, cnpjEmpresa: string, razaoSocial: string) => {
  let txt = '';

  // ---------------------------------------------------------------------------
  // REGISTRO TIPO 1: CABEÇALHO (Layout Anexo V - Portaria 671)
  // ---------------------------------------------------------------------------
  const tipo1 = "1";
  const cnpj = formatarCampo(cnpjEmpresa, 14, 'numero');
  const razao = formatarCampo(razaoSocial, 150, 'texto');
  const dataIniStr = formatarCampo(dataInicio.toISOString().split('T')[0], 8, 'numero'); // AAAAMMDD
  const dataFimStr = formatarCampo(dataFim.toISOString().split('T')[0], 8, 'numero'); // AAAAMMDD
  const dataGeracao = formatarCampo(new Date().toISOString().split('T')[0], 8, 'numero');
  
  txt += `${tipo1}${cnpj}${razao}${dataIniStr}${dataFimStr}${dataGeracao}\r\n`;

  // 🟢 CORRIGIDO: Busca dados respeitando as nomenclaturas exatas do seu schema.prisma
  const funcionarios = await prisma.usuario.findMany({
    where: {
      perfil: 'FUNCIONARIO', // Filtra por perfil em vez de usar o campo 'ativo' inexistente
    },
    include: {
      batidas: { // 🟢 Nome correto da relação no seu schema
        where: {
          dataHora: { // 🟢 Nome correto da coluna de data no seu schema
            gte: dataInicio,
            lte: dataFim,
          },
        },
      },
    },
  });

  // ---------------------------------------------------------------------------
  // REGISTRO TIPO 2: DADOS DOS EMPREGADOS
  // ---------------------------------------------------------------------------
  for (const func of funcionarios) {
    const tipo2 = "2";
    const cpfFunc = formatarCampo(func.cpf, 11, 'numero');
    const nomeFunc = formatarCampo(func.nome, 150, 'texto');
    
    txt += `${tipo2}${cpfFunc}${nomeFunc}\r\n`;

    // ---------------------------------------------------------------------------
    // REGISTRO TIPO 3: REGISTROS DE PONTO (BATIDAS)
    // ---------------------------------------------------------------------------
    // 🟢 Ajustado loop para mapear 'batidas' em vez de 'pontos'
    for (const batida of func.batidas) {
      const tipo3 = "3";
      const cpfPonto = formatarCampo(func.cpf, 11, 'numero');
      
      // Formata Data (AAAAMMDD) e Horário (HHMM) a partir do campo 'dataHora'
      const dataBatida = formatarCampo(batida.dataHora.toISOString().split('T')[0], 8, 'numero');
      
      const horas = String(batida.dataHora.getHours()).padStart(2, '0');
      const minutos = String(batida.dataHora.getMinutes()).padStart(2, '0');
      const horaBatida = `${horas}${minutos}`;
      
      // Se a latitude for 0, identifica contingência offline/sem GPS conforme combinado
      const localizacaoInfo = batida.latitude === 0 ? "OFFLINE/SEM_GPS       " : "ONLINE/GPS_OK        ";
      const infoAdicional = formatarCampo(localizacaoInfo, 30, 'texto');

      txt += `${tipo3}${cpfPonto}${dataBatida}${horaBatida}${infoAdicional}\r\n`;
    }
  }

  return txt;
};