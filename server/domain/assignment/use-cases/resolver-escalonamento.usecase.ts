import type { ClientePosse } from './resolve-responsibles.usecase';

// A OUTRA PERGUNTA: *para quem eu ligo?* (F11, Etapa C — D73)
//
// ═══════════════════════════════════════════════════════════════════════════
// POR QUE ISTO É UMA FUNÇÃO IRMÃ DE `resolverResponsaveis()`, E NUNCA UM `else`
// DENTRO DELA.
//
// O `else` é tentador: "se o posto está vago, devolve o gestor da localidade".
// Ele destrói o sinal mais útil do modelo de posse. Com ele, **todo ativo passa
// a ter responsável** — e *"ativo em posto vago"* deixa de ser expressável.
//
// Três leitores dependem de esse vazio continuar vazio:
//   `PosseResolvida.postoVago`           a marca na ficha do ativo;
//   `GET /api/workstations?view=vagos`   o relatório de posto sem ocupante (F4);
//   o alerta de ativo parado             o job diário da F8.
//
// São perguntas DIFERENTES, e é por isso que são duas funções:
//   *quem está com isto?*   admite vazio — o equipamento pode estar no estoque,
//                            ou numa mesa que ninguém ocupa. O vazio é o fato.
//   *para quem eu ligo?*    existe para PREENCHER o vazio da primeira. Ela não
//                            diz quem é responsável; diz quem atende o telefone.
//
// ⚠️ O QUE ESTA FUNÇÃO NÃO É: ela NÃO torna ninguém responsável. O gestor da
// localidade não está com o equipamento, não assinou nada por ele e não aparece
// em `resolverResponsaveis()`. Quem misturar os dois reabre o D72 por efeito
// colateral — e o `MODELO-POSSE.md` passa a ter duas respostas para "de quem é
// isto?".
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Teto de profundidade da subida.
 *
 * O MESMO 32 do `catalog/helpers/location-cycle.helper.ts`, e pelo MESMO
 * motivo: **o banco aceita ciclo**. `Matriz → Andar 2 → Matriz` foi gravado sem
 * erro nenhum no teste da F1 — a FK só exige que o pai exista, não que a cadeia
 * termine. Sem o teto, uma árvore com ciclo e sem gestor em lugar nenhum trava
 * este laço para sempre.
 *
 * E nenhuma empresa precisa de 32 níveis de "Matriz › Prédio › Andar › Sala".
 */
const MAX_PROFUNDIDADE = 32;

/** Como o escalonamento foi encontrado — vai para a tela. */
export type ViaEscalonamento = 'LOCAL' | 'ANCESTRAL';

export interface Escalonamento {
  userId: string;
  name: string;
  email: string;
  /** O local que TEM o gestor — pode ser um ancestral, não o do ativo. */
  locationId: string;
  locationName: string;
  /**
   * `LOCAL` quando o gestor é da própria localização do ativo; `ANCESTRAL`
   * quando a subida precisou passar por ela.
   *
   * A tela precisa da diferença: *"gestor da Mesa 1"* e *"gestor do Andar 2,
   * porque a Mesa 1 não tem"* são frases diferentes para quem vai ligar — a
   * segunda avisa que o contato é indireto.
   */
  via: ViaEscalonamento;
  /** Quantos níveis a subida andou. 0 = o próprio local. */
  saltos: number;
}

interface LocalNaSubida {
  id: string;
  name: string;
  parentId: string | null;
  managerId: string | null;
  manager: { id: string; name: string; email: string } | null;
}

/**
 * Sobe a árvore de `Location` até achar um `managerId`.
 *
 * Devolve `null` quando NENHUM ancestral tem gestor — e isso **não é erro**: é
 * o buraco do escalonamento, e é informação. A consulta recursiva que lista
 * esses buracos está em `docs/FASE-11-PLANO-ITAM.md`, na seção de verificação:
 * localidade sem gestor em ancestral nenhum é o que o desligamento com
 * `substitutoId` existe para não criar.
 *
 * `locationId` nulo devolve `null` sem consultar: ativo sem localização não tem
 * árvore para subir.
 */
export async function resolverEscalonamento(
  client: ClientePosse,
  locationId: string | null,
): Promise<Escalonamento | null> {
  if (!locationId) return null;

  let atual: string | null = locationId;
  let saltos = 0;

  while (atual) {
    // Uma consulta por nível. São no máximo 32, e na prática 2 ou 3 — a
    // alternativa (um `WITH RECURSIVE` em `$queryRaw`) seria uma segunda forma
    // de percorrer a árvore no projeto, ao lado da que o
    // `location-cycle.helper.ts` já usa, e o ganho em 3 níveis é nenhum.
    //
    // `findUnique` de propósito: `locations` não tem `deletedAt`, então não há
    // escopo de lixeira a respeitar aqui (mesma observação do helper de ciclo).
    const local: LocalNaSubida | null = await client.location.findUnique({
      where: { id: atual },
      select: {
        id: true, name: true, parentId: true, managerId: true,
        manager: { select: { id: true, name: true, email: true } },
      },
    });

    // Pai inexistente no meio da cadeia: não há mais para onde subir. Quem
    // reclamaria de um pai quebrado é a FK, e ela não deixou isso acontecer.
    if (!local) return null;

    if (local.manager) {
      return {
        userId: local.manager.id,
        name: local.manager.name,
        email: local.manager.email,
        locationId: local.id,
        locationName: local.name,
        via: saltos === 0 ? 'LOCAL' : 'ANCESTRAL',
        saltos,
      };
    }

    if (++saltos > MAX_PROFUNDIDADE) {
      // SILENCIOSO, e não `throw`: escalonamento é informação acessória numa
      // ficha de ativo. Derrubar a leitura do ativo inteiro porque a árvore de
      // localizações tem um ciclo seria o acessório quebrando o principal — e o
      // ciclo é problema do cadastro de locais, onde o
      // `assertSemCicloDeLocalizacao` já o recusa na escrita.
      return null;
    }

    atual = local.parentId;
  }

  return null;
}
