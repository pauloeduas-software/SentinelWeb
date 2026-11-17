import { normalizeHostname, normalizeSerial } from './normalize-identity.helper';

// A REGRA DO VÍNCULO — função pura. Recebe a máquina e o parque, devolve o que
// fazer com ela. Nenhuma consulta aqui dentro, de propósito: é testável linha a
// linha sem banco nenhum (DC).
//
// É a regra 14 de importação do GLPI ("update by serial", `RuleImportAsset.xml`)
// contra o computador cadastrado: a série que a máquina manda igual à de UM
// computador sem máquina liga as duas sozinha. O UUID não entra porque o
// computador não o guarda (ele reconhece a máquina reinstalada, na CV), e o nome
// só sugere: é renomeável e se repete, e o vínculo errado reescreve o inventário.

export interface MaquinaDoParque {
  id: string;
  hostname: string;
  biosSerial: string | null;
  /** A máquina que alguém desvinculou não volta sozinha (DC). */
  autoLinkOff: boolean;
}

export interface AtivoDoParque {
  id: string;
  assetTag: string;
  serial: string | null;
  name: string | null;
  retiredAt: Date | null;
  /** A máquina que já está nele, quando está. */
  endpoint: { id: string; hostname: string } | null;
}

export interface DicaDoVinculo {
  ativo: Pick<AtivoDoParque, 'id' | 'assetTag'>;
  /** Por que este computador: a mesma série, ou o mesmo nome. */
  sinal: 'SERIE' | 'NOME';
}

export interface AnaliseDaMaquina {
  /** O computador a que ela se liga sozinha, quando há. */
  vincularA: AtivoDoParque | null;
  /** O computador que o Vincular já abre escolhido, quando não ligou sozinha. */
  dica: DicaDoVinculo | null;
  /** Por que a série não ligou, quando ela bate com algo. */
  aviso: string | null;
}

/**
 * As séries que aparecem em mais de uma MÁQUINA. A lista de fábrica do
 * `normalize-identity.helper` nunca vai conter todos os textos que um
 * fabricante inventa; o parque descobre o resto. Uma série repetida em duas
 * máquinas não identifica nenhuma das duas (D46).
 */
export function seriesRepetidas(series: (string | null)[]): Set<string> {
  const contagem = new Map<string, number>();
  for (const serie of series) {
    const valor = normalizeSerial(serie);
    if (valor) contagem.set(valor, (contagem.get(valor) ?? 0) + 1);
  }
  return new Set([...contagem].filter(([, vezes]) => vezes > 1).map(([valor]) => valor));
}

/** O que fazer com a máquina sem computador. */
export function analisarMaquina(
  maquina: MaquinaDoParque,
  ativos: AtivoDoParque[],
  repetidas: Set<string>,
): AnaliseDaMaquina {
  const pelaSerie = analisarSerie(maquina, ativos, repetidas);
  if (pelaSerie.vincularA || pelaSerie.dica) return pelaSerie;
  return { ...pelaSerie, dica: dicaPeloNome(maquina, ativos) };
}

function analisarSerie(maquina: MaquinaDoParque, ativos: AtivoDoParque[], repetidas: Set<string>): AnaliseDaMaquina {
  const nada = { vincularA: null, dica: null, aviso: null };
  const serie = normalizeSerial(maquina.biosSerial);
  if (!serie) return nada;
  if (repetidas.has(serie)) return { ...nada, aviso: 'A série se repete em outra máquina.' };

  // O índice `assets_serial_unique_undeleted` já impede dois computadores vivos
  // com a mesma série; os dois aqui seriam um deles na lixeira, que o chamador
  // não passa. Fica a guarda, porque pegar o primeiro seria pior que não ligar.
  const casados = ativos.filter((ativo) => normalizeSerial(ativo.serial) === serie);
  if (casados.length === 0) return nada;
  if (casados.length > 1) return { ...nada, aviso: 'A série bate com mais de um computador.' };

  const [ativo] = casados;
  if (ativo.retiredAt) return { ...nada, aviso: `A série é a de ${ativo.assetTag}, que teve baixa.` };
  if (ativo.endpoint && ativo.endpoint.id !== maquina.id) {
    // A troca de placa-mãe com a série regravada cai aqui: a máquina antiga
    // continua no computador até alguém desvinculá-la.
    return { ...nada, aviso: `A série é a de ${ativo.assetTag}, que já tem a máquina ${ativo.endpoint.hostname}.` };
  }
  if (maquina.autoLinkOff) return { ...nada, dica: { ativo, sinal: 'SERIE' } };
  return { ...nada, vincularA: ativo };
}

/**
 * O nome da máquina igual ao nome ou à etiqueta de UM computador. Conta todos os
 * vivos, inclusive os que já têm máquina: tirá-los de vista transformaria "não
 * sei qual dos dois" em "é este" (D46).
 */
function dicaPeloNome(maquina: MaquinaDoParque, ativos: AtivoDoParque[]): DicaDoVinculo | null {
  const nome = normalizeHostname(maquina.hostname);
  if (!nome) return null;

  const casados = ativos.filter((ativo) => !ativo.retiredAt
    && (normalizeHostname(ativo.name) === nome || normalizeHostname(ativo.assetTag) === nome));
  if (casados.length !== 1 || casados[0].endpoint) return null;
  return { ativo: casados[0], sinal: 'NOME' };
}
