import type { EventoDaLicenca, Licenca, LicencaInput } from '../../../domain/shared/license.types';
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
 * Com três grupos ou mais, ficam os dois primeiros; com dois, o primeiro; sem
 * hífen, os primeiros caracteres (um terço, até quatro).
 */
export function esconderChave(chave: string): string {
  return chave.split('\n').map((linha) => {
    const grupos = linha.split('-');
    if (grupos.length >= 2) {
      const visiveis = grupos.length >= 3 ? 2 : 1;
      return grupos.map((grupo, indice) => (indice < visiveis ? grupo : '•'.repeat(grupo.length))).join('-');
    }
    const visiveis = Math.min(4, Math.floor(linha.length / 3));
    return linha.slice(0, visiveis) + '•'.repeat(Math.max(4, linha.length - visiveis));
  }).join('\n');
}
