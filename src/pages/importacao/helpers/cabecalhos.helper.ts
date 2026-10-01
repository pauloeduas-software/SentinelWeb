import Papa from 'papaparse';

// OS CABEÇALHOS DO ARQUIVO, LIDOS NO NAVEGADOR (F10, Etapa D).
//
// ═════════════════════════════════════════════════════════════════════════════
// POR QUE A TELA LÊ O ARQUIVO ANTES DE SUBIR.
//
// O mapeamento é `{ cabeçalho do CSV → campo }`, e a pessoa só consegue
// escolher se vê os cabeçalhos do arquivo DELA. Sem esta leitura, a tela teria
// de subir o arquivo primeiro só para descobrir os títulos — e o servidor
// recusa upload sem mapeamento válido (é o que impede uma importação sem
// decisão).
//
// ISTO NÃO É VALIDAÇÃO, É APRESENTAÇÃO. Quem decide se o arquivo é aceitável é
// o servidor: ele detecta o delimitador de novo, exige UTF-8 estrito, recusa
// cabeçalho repetido ou vazio e confere o mapeamento contra o arquivo. Esta
// leitura pode errar o delimitador numa linha exótica sem nenhuma consequência
// além de a tela sugerir um mapeamento esquisito, que a pessoa corrige.
//
// SÓ O PRIMEIRO PEDAÇO DO ARQUIVO É LIDO (`slice`): um CSV de 20 MB não precisa
// entrar inteiro na memória da aba para a tela saber os títulos das colunas.
// ═════════════════════════════════════════════════════════════════════════════

/** 64 KB cobre uma linha de cabeçalho de qualquer planilha real. */
const PEDACO = 64 * 1024;

export interface CabecalhosLidos {
  cabecalhos: string[];
  /** O que o papaparse detectou — serve para a tela mostrar o que leu. */
  delimitador: string;
}

export async function lerCabecalhos(arquivo: File): Promise<CabecalhosLidos> {
  const texto = await arquivo.slice(0, PEDACO).text();

  const resultado = Papa.parse<string[]>(texto.replace(/^\uFEFF/, ''), {
    preview: 1,
    skipEmptyLines: 'greedy',
    header: false,
  });

  const primeira = resultado.data[0] ?? [];

  return {
    // O BOM sai aqui também: ele some do texto acima, mas um arquivo gravado
    // com BOM no meio (acontece em planilha concatenada à mão) deixaria resíduo
    // no primeiro título — e o título é a chave do mapeamento.
    cabecalhos: primeira.map((titulo) => (titulo ?? '').replace(/^\uFEFF/, '').trim()).filter(Boolean),
    delimitador: resultado.meta.delimiter ?? ';',
  };
}

/**
 * O mapeamento SUGERIDO: casa cabeçalho com campo pelo rótulo.
 *
 * Normaliza acento e caixa antes de comparar, porque é isso que faz "Nº de
 * série" do modelo casar com "N° de série" (outro caractere de ordinal) e com
 * "numero de serie" digitado à mão. Sugestão errada não custa nada — a pessoa
 * vê os `<select>` preenchidos e troca o que não serve; sugestão AUSENTE custa
 * quinze escolhas manuais em todo arquivo.
 */
function normalizar(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

export function sugerirMapeamento(
  cabecalhos: readonly string[],
  campos: readonly { token: string; rotulo: string }[],
): Record<string, string> {
  const porRotulo = new Map(campos.map((campo) => [normalizar(campo.rotulo), campo.token]));
  const porToken = new Map(campos.map((campo) => [normalizar(campo.token), campo.token]));

  const sugerido: Record<string, string> = {};
  const usados = new Set<string>();

  for (const titulo of cabecalhos) {
    const chave = normalizar(titulo);
    const token = porRotulo.get(chave) ?? porToken.get(chave);

    // Um campo só pode receber UMA coluna (o servidor recusa o contrário com
    // 422), então a primeira coluna que casar leva.
    if (token && !usados.has(token)) {
      sugerido[titulo] = token;
      usados.add(token);
    }
  }

  return sugerido;
}
