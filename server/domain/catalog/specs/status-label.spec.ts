import { $Enums } from '@prisma/client';
import { AppError } from '../../../core/errors/app-error';
import { INCLUINDO_LIXEIRA } from '../../../core/database/soft-delete.extension';
import { travarStatusDoTipo, travarStatusParaEscrita } from '../helpers/catalog-lock.helper';
import { createStatusLabelSchema, updateStatusLabelSchema } from '../schemas/catalog-entities.schema';
import type { CatalogDelegate, CatalogSpec, ClienteCatalogo } from './catalog-spec.types';

// Quantos ativos seguram este status.
//
// A FK é `Restrict`, então aqui a lixeira não causa perda de dado — o banco
// recusa de qualquer forma. `INCLUINDO_LIXEIRA` está aqui pela MENSAGEM: sem
// ele a contagem dá 0, o P2003 sobe cru e o usuário lê "Registro está em uso
// por outro cadastro" em vez de saber quantos ativos seguram o status.
//
// O ativo na lixeira conta pelo mesmo motivo da categoria: ele continua
// apontando para este status e ainda pode ser restaurado.
const contarUsos = (client: ClienteCatalogo, id: string) =>
  client.asset.count({ where: { statusId: id, ...INCLUINDO_LIXEIRA } });

// Os tipos que a entrega e a devolução aplicam SOZINHAS (`escolherStatusPorTipo`),
// com o nome que a tela dá a cada um. Sempre tem que sobrar um ativo de cada.
const TIPOS_AUTOMATICOS: Partial<Record<$Enums.StatusLabelType, string>> = {
  DEPLOYABLE: 'Disponível',
  IN_USE: 'Em uso',
};

/**
 * Sobra OUTRO status ativo do mesmo tipo automático? Senão, 409.
 *
 * Chamada com o tipo inteiro já travado (`travarStatusDoTipo`): é o que impede
 * duas saídas simultâneas — desativar, trocar de tipo ou excluir — de contarem
 * "sobra o outro" cada uma e deixarem zero.
 */
async function assertSobraOutroAtivo(
  client: ClienteCatalogo,
  id: string,
  atual: { name: string; type: $Enums.StatusLabelType },
): Promise<void> {
  const rotuloDoTipo = TIPOS_AUTOMATICOS[atual.type];
  if (!rotuloDoTipo) return;

  const outros = await client.statusLabel.count({
    where: { type: atual.type, isActive: true, id: { not: id } },
  });
  if (outros > 0) return;

  throw new AppError(
    `"${atual.name}" é o único status ativo do tipo ${rotuloDoTipo}, e é ele que ${
      atual.type === 'IN_USE' ? 'a entrega' : 'a devolução'
    } aplica sozinha. Crie ou reative outro do mesmo tipo antes.`,
    409,
  );
}

export const statusLabelSpec: CatalogSpec = {
  slug: 'status-labels',
  entityType: 'StatusLabel',
  tabela: 'status_labels',
  rotulo: 'status',

  delegate: (client) => client.statusLabel as unknown as CatalogDelegate,
  createSchema: createStatusLabelSchema,
  updateSchema: updateStatusLabelSchema,

  select: {
    id: true, name: true, type: true,
    notes: true, isActive: true, createdAt: true, updatedAt: true,
  },
  searchable: ['name'],
  audited: ['name', 'type', 'notes', 'isActive'],

  // Aqui o `optionFilter` NÃO restringe a lista: os quatro valores do enum estão
  // presentes, e é de propósito. Ele existe para que `?type=` seja um parâmetro
  // VALIDADO — o `catalog.controller.ts` monta um `z.enum` a partir desta lista,
  // então `?type=EM_USO` responde 422 em vez de ser ignorado em silêncio e
  // devolver a lista inteira como se o filtro tivesse valido.
  //
  // (O motivo da categoria é outro e não se aplica: lá o `optionFilter` evita
  // dois "Notebook" no `<select>`, porque a chave dela é `@@unique([name, type])`.
  // `StatusLabel.name` é `@unique` global — dois rótulos de mesmo nome e tipos
  // diferentes são impossíveis por construção.)
  //
  // Os valores vêm do `$Enums`: um tipo novo no schema entra no filtro sem
  // ninguém precisar lembrar deste arquivo.
  optionFilter: {
    campo: 'type',
    valores: Object.values($Enums.StatusLabelType) as [$Enums.StatusLabelType, ...$Enums.StatusLabelType[]],
  },

  // Apagar um status em uso deixaria ativos apontando para o nada.
  countUsages: contarUsos,
  dicaEmUso: 'Desative-o em vez de excluir: ele some das escolhas e continua no histórico.',

  nomeUnicoPor: [],
  // Desativado some das escolhas e continua no histórico (configuracoes.md).
  optionsWhere: { isActive: true },

  // Trocar o TIPO de um status em uso muda, de uma vez, o significado de todo
  // ativo que aponta para ele — sem tocar em nenhum. Mesma guarda do delete.
  //
  // POR QUE AQUI É MAIS GRAVE QUE NA CATEGORIA: o tipo da categoria diz a que
  // MÓDULO o registro pertence (ativo, licença, estoque) — errar isso põe a
  // linha na tela errada. O tipo do status decide se o equipamento PODE SER
  // ENTREGUE A ALGUÉM: `DEPLOYABLE` é o único que libera o checkout. Trocar o
  // tipo de um status disponível para `UNDEPLOYABLE` inutiliza 200 ativos em
  // silêncio, em uma requisição, sem nenhuma
  // linha de `assets` ser escrita — e o `AuditLog` dos 200 fica vazio,
  // porque do ponto de vista deles nada mudou.
  //
  // A saída correta é a mesma do delete: criar o status novo e mover os ativos
  // um a um, que é uma operação visível e auditada.
  //
  // E O ÚLTIMO ATIVO DE UM TIPO AUTOMÁTICO NÃO SAI. A entrega aplica sozinha o
  // primeiro `IN_USE` ativo, e a devolução o primeiro `DEPLOYABLE` ativo
  // (`escolherStatusPorTipo`). Desativar — ou mudar de tipo — o único que
  // sobra derrubava TODA entrega e devolução sem status escolhido à mão.
  async beforeWrite(client, id, data) {
    if (!id || (data.type === undefined && data.isActive === undefined)) return;

    const lido = await client.statusLabel.findUnique({ where: { id }, select: { type: true } });
    if (!lido) return;

    // A trava ANTES de ler de novo e contar. O `UPDATE` do tipo não conflita
    // com o `FOR KEY SHARE` da FK de `assets.statusId`, então sem ela uma edição
    // de ativo que leu o tipo velho grava depois da contagem e o ativo entregue
    // fica com status de estoque (`catalog-lock.helper.ts`). Nos tipos
    // automáticos trava o TIPO inteiro, que inclui esta linha.
    if (TIPOS_AUTOMATICOS[lido.type]) await travarStatusDoTipo(client, lido.type);
    else await travarStatusParaEscrita(client, id);

    const atual = await client.statusLabel.findUnique({
      where: { id }, select: { name: true, type: true, isActive: true },
    });
    if (!atual) return;
    const mudaTipo = data.type !== undefined && data.type !== atual.type;

    if (mudaTipo) {
      const usos = await contarUsos(client, id);
      if (usos > 0) {
        throw new AppError(
          `Não é possível mudar o tipo: status em uso por ${usos} ${usos === 1 ? 'registro' : 'registros'}.`,
          409,
        );
      }
    }

    if (atual.isActive && (data.isActive === false || mudaTipo)) await assertSobraOutroAtivo(client, id, atual);
  },

  // A mesma guarda na EXCLUSÃO: apagar o último ativo do tipo derrubava a
  // entrega ou a devolução automática igual a desativá-lo — e o DELETE não
  // passa pelo `beforeWrite`.
  async beforeDelete(client, id) {
    const lido = await client.statusLabel.findUnique({ where: { id }, select: { type: true } });
    if (!lido || !TIPOS_AUTOMATICOS[lido.type]) return;

    await travarStatusDoTipo(client, lido.type);
    const atual = await client.statusLabel.findUnique({
      where: { id }, select: { name: true, type: true, isActive: true },
    });
    if (atual?.isActive) await assertSobraOutroAtivo(client, id, atual);
  },
};
