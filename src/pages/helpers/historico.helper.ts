// A LEITURA DE UM EVENTO DE HISTÓRICO — funções puras, compartilhadas pelas
// abas Histórico do ativo e da pessoa.
//
// Nasceu dentro de `gestao-itam/detalhe/helpers/`, quando o ativo era o único
// com linha do tempo, e mudou para cá quando a pessoa ganhou a dela (Leva 1 do
// docs/FECHAMENTO-F2-F4-PLANO-ITAM.md). O que ficou lá é o que É do ativo — os
// nomes das colunas dele e a frase do título; o que veio para cá é o que vale
// para qualquer trilha.
//
// O `changes` do `ActivityLog` é `Json`: o formato muda com a operação, de
// propósito. Uma edição grava `{ campo: { de, para } }`; um checkout grava ids
// soltos; um lote grava `batchId` junto com o diff. Tipar isso campo a campo
// obrigaria a mexer neste arquivo a cada operação nova — e a alternativa
// (`JSON.stringify` na tela) mostraria chave crua para quem só quer saber o que
// mudou. Então aqui ele é LIDO, não tipado.

/** O mínimo que um evento precisa ter para ser lido. */
export interface EventoComChanges {
  changes: unknown;
}

/**
 * As ações que QUALQUER trilha pode ter — as do soft delete e do ciclo de vida
 * comum a toda tabela.
 *
 * O que é de um domínio só (`RETIRE` do ativo, `OFFBOARD` da pessoa) não entra
 * aqui: entra no mapa que o domínio passa a `rotuloDaAcao`. Uma lista central
 * com tudo faria a próxima fase acrescentar vocabulário de licença e de
 * manutenção num arquivo que nenhuma das duas telas lê inteiro.
 */
const ROTULO_DA_ACAO: Record<string, string> = {
  CREATE: 'Cadastrado',
  UPDATE: 'Editado',
  DELETE: 'Movido para a lixeira',
  RESTORE: 'Restaurado da lixeira',
  CHECKOUT: 'Entregue',
  CHECKIN: 'Devolvido',
  END: 'Vínculo encerrado',
};

/**
 * O que a ação quer dizer, em português.
 *
 * Ação desconhecida aparece como ela é, em vez de virar "Outro": uma operação
 * nova do servidor que os mapas ainda não conheçam continua legível — e o nome
 * cru é o sinal de que falta uma linha em algum deles.
 */
export function rotuloDaAcao(action: string, extras: Record<string, string> = {}): string {
  return extras[action] ?? ROTULO_DA_ACAO[action] ?? action;
}

const VAZIO = '—';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Um valor do log como texto.
 *
 * UUID vira os 8 primeiros caracteres: o log guarda o id que valia NAQUELE
 * momento, e o nome correspondente pode nem existir mais (o status foi
 * renomeado, a localização foi apagada). Resolver id para nome aqui exigiria
 * guardar a história de toda tabela do catálogo — o preço que o D18 recusou ao
 * não criar uma segunda trilha. O valor inteiro fica no `title` da célula.
 */
export function valorLegivel(valor: unknown): string {
  if (valor === null || valor === undefined || valor === '') return VAZIO;
  if (typeof valor === 'boolean') return valor ? 'sim' : 'não';

  const texto = String(valor);
  if (UUID.test(texto)) return `${texto.slice(0, 8)}…`;

  // Data ISO completa vira dia: o histórico já mostra a hora do evento na
  // lateral, e "2026-01-15T00:00:00.000Z" no meio da frase não se lê.
  const data = /^(\d{4})-(\d{2})-(\d{2})T/.exec(texto);
  return data ? `${data[3]}/${data[2]}/${data[1]}` : texto;
}

/** Um campo que mudou de valor: o par que a edição gravou. */
export interface Mudanca {
  campo: string;
  rotulo: string;
  de: string;
  para: string;
  /** O valor inteiro, para o `title` — ver `valorLegivel`. */
  cru: string;
}

/** Um dado solto do evento (o `batchId` do lote, a observação da saída). */
export interface Detalhe {
  campo: string;
  rotulo: string;
  valor: string;
  cru: string;
}

export interface LeituraDoEvento {
  mudancas: Mudanca[];
  detalhes: Detalhe[];
}

function ehDiff(valor: unknown): valor is { de: unknown; para: unknown } {
  return typeof valor === 'object' && valor !== null && 'de' in valor && 'para' in valor;
}

/**
 * Separa o `changes` em DIFF e DETALHE.
 *
 * As duas formas convivem no mesmo objeto — o checkout grava
 * `{ assignmentId, targetType, statusId: { de, para } }` — e é por isso que a
 * separação é por FORMA do valor, não por nome de campo: qualquer operação
 * futura que grave um par `{de, para}` aparece como mudança sozinha.
 *
 * Os RÓTULOS vêm por parâmetro, e não de um mapa global: é a mesma inversão do
 * `parseListQuery` recebendo a allowlist do domínio (docs/ARQUITETURA.md). Um
 * mapa único com as colunas de `assets` e de `users` juntas traduziria `name`
 * como "Nome" nos dois e erraria no primeiro campo homônimo com sentidos
 * diferentes.
 */
export function lerEvento(evento: EventoComChanges, rotulos: Record<string, string>): LeituraDoEvento {
  const mudancas: Mudanca[] = [];
  const detalhes: Detalhe[] = [];

  if (typeof evento.changes !== 'object' || evento.changes === null) {
    return { mudancas, detalhes };
  }

  const rotuloDoCampo = (campo: string) => rotulos[campo] ?? campo;

  for (const [campo, valor] of Object.entries(evento.changes as Record<string, unknown>)) {
    if (ehDiff(valor)) {
      mudancas.push({
        campo,
        rotulo: rotuloDoCampo(campo),
        de: valorLegivel(valor.de),
        para: valorLegivel(valor.para),
        cru: `${String(valor.de ?? '')} → ${String(valor.para ?? '')}`,
      });
      continue;
    }

    detalhes.push({
      campo,
      rotulo: rotuloDoCampo(campo),
      valor: valorLegivel(valor),
      cru: String(valor ?? ''),
    });
  }

  return { mudancas, detalhes };
}

/** Data e hora do evento, no formato que o Brasil lê. */
export function momentoDoEvento(iso: string): string {
  const data = new Date(iso);
  if (Number.isNaN(data.getTime())) return iso;

  // Aqui é hora LOCAL de propósito, ao contrário da data de compra: o evento é
  // um INSTANTE ("às 14h32"), não um dia de calendário, e quem lê quer saber
  // que horas eram no relógio dele.
  return data.toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}
