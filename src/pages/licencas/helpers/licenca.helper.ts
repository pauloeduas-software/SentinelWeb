import type { ChaveDaLicenca, EventoDaLicenca, Licenca, LicencaInput } from '../../../domain/shared/license.types';
import { paraCampoDeData } from '../../helpers/format.helper';

// Funções puras da tela de licenças (docs/referencia/arquitetura.md). O que as
// outras telas também mostram — prazo, resumo da conta, devolução — mora em
// `src/pages/helpers/licenca.helper.ts`.

/**
 * SÓ OS CAMPOS QUE MUDARAM, para a edição.
 *
 * Mandar o formulário inteiro fazia um formulário aberto há tempo desfazer a
 * edição que outra pessoa salvou no meio — a quantidade voltava ao número
 * velho sem ninguém ter mexido nela.
 *
 * A comparação normaliza o que o servidor devolve de outro jeito: data chega
 * como ISO e o campo tem `AAAA-MM-DD`; custo chega como "1234.5" e o campo pode
 * ter "1234.50". Sem isso, todo campo "mudaria" e iria no corpo — e voltaria a
 * desfazer a edição de quem salvou no meio.
 */
export function camposAlterados(original: LicencaInput, dados: LicencaInput): Partial<LicencaInput> {
  const normalizar = (campo: keyof LicencaInput, valor: unknown): unknown => {
    // A lista de chaves vai inteira ou não vai: muda se qualquer chave mudou.
    if (campo === 'keys') return JSON.stringify(valor ?? []);
    if (valor === undefined || valor === '') return null;
    if (campo.endsWith('Date')) return paraCampoDeData(valor) || null;
    if (campo === 'purchaseCost' && valor !== null) return Number(String(valor).replace(',', '.'));
    return valor;
  };

  const alterados: Partial<LicencaInput> = {};
  for (const campo of Object.keys(dados) as (keyof LicencaInput)[]) {
    if (normalizar(campo, dados[campo]) !== normalizar(campo, original[campo])) {
      (alterados as Record<string, unknown>)[campo] = dados[campo];
    }
  }
  return alterados;
}

/** O vocabulário do histórico DESTA tela: só entrega e devolução. */
export const ACOES_DA_LICENCA: Record<EventoDaLicenca['action'], string> = {
  CHECKOUT: 'Entregue',
  CHECKIN: 'Devolvida',
};

/**
 * Por que esta licença não pode ser entregue agora — `null` quando pode.
 *
 * A mesma regra na tabela e no detalhe: o servidor recusa vencida, encerrada e
 * sem livre, e o botão não convida ao 409. O texto vai no `title` do botão.
 */
export function motivoParaNaoEntregar(licenca: Pick<Licenca, 'status' | 'livres'>): string | null {
  if (licenca.status === 'ENCERRADA') return 'Encerrada';
  if (licenca.status === 'EXPIRADA') return 'Vencida: renove a data de vencimento para entregar';
  if (licenca.livres <= 0) return 'Sem licença livre';
  return null;
}

/**
 * Por que esta licença não pode ser excluída — `null` quando pode.
 *
 * Só a que nunca foi entregue se exclui (o cadastro errado). O 409 do servidor
 * continua sendo a rede; o botão desabilitado só não convida a ele.
 */
export function motivoParaNaoExcluir(licenca: Pick<Licenca, 'jaEntregue'>): string | null {
  return licenca.jaEntregue ? 'Já foi entregue: use Encerrar' : null;
}

/**
 * A chave como a tela a mostra ANTES de "Mostrar": o começo de cada linha e o
 * resto em pontos — "ABCDE-FGHIJ-•••••-•••••-•••••". O começo basta para achar
 * a chave certa numa lista; o resto não fica na tela de quem passa atrás.
 *
 * Com três grupos ou mais, ficam os dois primeiros; com dois, o primeiro. Os
 * grupos só valem quando nenhum é vazio e o que fica escondido pesa ao menos
 * metade do que aparece — com o hífen no fim ou perto dele ("…XY-Z"), o
 * primeiro grupo seria quase a chave inteira. Fora disso, os primeiros
 * caracteres (um terço, até quatro). Linha vazia continua vazia.
 */
export function esconderChave(chave: string): string {
  return chave.split('\n').map((linha) => {
    if (linha === '') return '';
    const grupos = linha.split('-');
    if (grupos.length >= 2 && grupos.every((grupo) => grupo !== '')) {
      const visiveis = grupos.length >= 3 ? 2 : 1;
      const mostrados = grupos.slice(0, visiveis).join('').length;
      const escondidos = grupos.slice(visiveis).join('').length;
      if (escondidos * 2 >= mostrados) {
        return grupos.map((grupo, indice) => (indice < visiveis ? grupo : '•'.repeat(grupo.length))).join('-');
      }
    }
    const visiveis = Math.min(4, Math.floor(linha.length / 3));
    return linha.slice(0, visiveis) + '•'.repeat(Math.max(4, linha.length - visiveis));
  }).join('\n');
}

/**
 * Uma chave como as listas a nomeiam: a posição na licença e o começo, escondido
 * — "3. ABCDE-FGHIJ-•••••-•••••-•••••". A posição separa duas chaves que começam
 * igual, e é o mesmo número no detalhe, no "Com quem está" e na entrega.
 */
export function rotuloDaChave(chave: Pick<ChaveDaLicenca, 'productKey'>, posicao: number): string {
  return `${posicao}. ${esconderChave(chave.productKey)}`;
}

/** Quanto da chave está tomado: "livre", "em uso", ou "cobre 10 · 3 livres". */
export function lugarDaChave(chave: Pick<ChaveDaLicenca, 'seats' | 'emUso'>): string {
  const livres = chave.seats - chave.emUso;
  if (chave.seats === 1) return livres > 0 ? 'livre' : 'em uso';
  return `cobre ${chave.seats} · ${livres} ${livres === 1 ? 'livre' : 'livres'}`;
}

/** As chaves que ainda recebem entrega: as que cobrem mais do que está com elas. */
export function chavesComLugar(chaves: readonly ChaveDaLicenca[]): ChaveDaLicenca[] {
  return chaves.filter((chave) => chave.emUso < chave.seats);
}

/**
 * Uma chave no formulário (AC). `seats` é texto até o envio, como todo campo
 * numérico.
 */
export interface LinhaDeChave {
  /** A identidade da linha na tela — o `id` da chave, ou um provisório da nova. */
  uid: string;
  /** Ausente na chave nova. */
  id?: string;
  productKey: string;
  seats: string;
  emUso: number;
  jaEntregue: boolean;
}

let proximaLinha = 0;

/** Uma linha nova, vazia ou com o texto colado. */
export function linhaNova(productKey = ''): LinhaDeChave {
  proximaLinha += 1;
  return { uid: `nova-${proximaLinha}`, productKey, seats: '1', emUso: 0, jaEntregue: false };
}

/** Quanto as linhas cobrem juntas — o "cobre" que ainda não é número conta zero. */
export function cobertasPelas(linhas: readonly LinhaDeChave[]): number {
  return linhas.reduce((soma, linha) => {
    const seats = Number(linha.seats);
    return soma + (linha.seats.trim() !== '' && Number.isInteger(seats) ? seats : 0);
  }, 0);
}
