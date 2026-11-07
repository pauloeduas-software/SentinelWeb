import type { ReferenciaDoErro } from '../types/erro.types';
import type { LinkDaNotificacao } from '../hooks/useNotificacao';
import { caminhoDoItem } from './estoque.helper';
import { caminhoDaLicenca } from './licenca.helper';

// OS LINKS DE UMA RECUSA — as `refs` que o servidor manda ao lado da frase
// (`src/types/erro.types.ts`), como links para a tela de cada uma. O
// erro da API guarda o corpo como veio (`corpo`); a leitura dele mora aqui.

const CAMINHO: Record<ReferenciaDoErro['tipo'], (id: string) => string> = {
  ativo: (id) => `/computadores/${id}`,
  licenca: caminhoDaLicenca,
  estoque: caminhoDoItem,
  posto: (id) => `/postos/${id}`,
};

/** Só o 404 diz que o registro não existe: um 500 ou a rede caída dizem que não deu para abrir. */
export function erroDaFicha(error: Error | null, temFicha: boolean, nome: string): string | null {
  if (!error) return null;
  if ((error as { status?: number }).status === 404) return error.message;
  // Atualização que falha com a ficha já na tela não a fecha; o 404 fecha.
  return temFicha ? null : `Não foi possível abrir ${nome}: ${error.message}`;
}

/** Só as referências bem formadas: o corpo do erro vem de fora. */
function ehReferencia(valor: unknown): valor is ReferenciaDoErro {
  const ref = valor as ReferenciaDoErro | null;
  return typeof ref === 'object' && ref !== null
    && ref.tipo in CAMINHO && typeof ref.id === 'string' && typeof ref.nome === 'string';
}

/** Os links do erro, ou `undefined` quando ele não cita nada que se abra. */
export function linksDoErro(erro: unknown): LinkDaNotificacao[] | undefined {
  const refs = (erro as { corpo?: { refs?: unknown } } | null)?.corpo?.refs;
  if (!Array.isArray(refs)) return undefined;
  const validas = refs.filter(ehReferencia);
  if (validas.length === 0) return undefined;
  return validas.map((ref) => ({ rotulo: ref.nome, para: CAMINHO[ref.tipo](ref.id) }));
}
