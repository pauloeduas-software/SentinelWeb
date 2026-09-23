import { AppError } from '../../../core/errors/app-error';
import { INCLUINDO_LIXEIRA } from '../../../core/database/soft-delete.extension';
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

export const statusLabelSpec: CatalogSpec = {
  slug: 'status-labels',
  entityType: 'StatusLabel',
  rotulo: 'status',

  delegate: (client) => client.statusLabel as unknown as CatalogDelegate,
  createSchema: createStatusLabelSchema,
  updateSchema: updateStatusLabelSchema,

  select: {
    id: true, name: true, type: true, color: true,
    showInNav: true, notes: true, createdAt: true,
  },
  sortable: ['name', 'type', 'createdAt'],
  defaultSort: 'name',
  searchable: ['name'],
  audited: ['name', 'type', 'color', 'showInNav', 'notes'],

  // Aqui o `optionFilter` NÃO restringe a lista: os cinco valores do enum estão
  // presentes, e é de propósito. Ele existe para que `?type=` seja um parâmetro
  // VALIDADO — o `catalog.controller.ts` monta um `z.enum` a partir desta lista,
  // então `?type=EM_USO` responde 422 em vez de ser ignorado em silêncio e
  // devolver a lista inteira como se o filtro tivesse valido.
  //
  // (O motivo da categoria é outro e não se aplica: lá o `optionFilter` evita
  // dois "Notebook" no `<select>`, porque a chave dela é `@@unique([name, type])`.
  // `StatusLabel.name` é `@unique` global — dois rótulos de mesmo nome e tipos
  // diferentes são impossíveis por construção.)
  optionFilter: { campo: 'type', valores: ['DEPLOYABLE', 'IN_USE', 'PENDING', 'ARCHIVED', 'UNDEPLOYABLE'] },

  // Apagar um status em uso deixaria ativos apontando para o nada.
  countUsages: contarUsos,

  // Trocar o TIPO de um status em uso muda, de uma vez, o significado de todo
  // ativo que aponta para ele — sem tocar em nenhum. Mesma guarda do delete.
  //
  // POR QUE AQUI É MAIS GRAVE QUE NA CATEGORIA: o tipo da categoria diz a que
  // MÓDULO o registro pertence (ativo, licença, consumível) — errar isso põe a
  // linha na tela errada. O tipo do status decide se o equipamento PODE SER
  // ENTREGUE A ALGUÉM: `DEPLOYABLE` é o único que libera o checkout, e
  // `ARCHIVED` tira o ativo de operação. Trocar o tipo de "Pronto p/ Uso" para
  // `ARCHIVED` arquiva 200 ativos em silêncio, em uma requisição, sem nenhuma
  // linha de `assets` ser escrita — e o `ActivityLog` dos 200 fica vazio,
  // porque do ponto de vista deles nada mudou.
  //
  // A saída correta é a mesma do delete: criar o status novo e mover os ativos
  // um a um, que é uma operação visível e auditada.
  async beforeWrite(client, id, data) {
    if (!id || data.type === undefined) return;

    const atual = await client.statusLabel.findUnique({ where: { id }, select: { type: true } });
    if (!atual || atual.type === data.type) return;

    const usos = await contarUsos(client, id);
    if (usos > 0) {
      throw new AppError(
        `Não é possível mudar o tipo: status em uso por ${usos} ${usos === 1 ? 'registro' : 'registros'}.`,
        409,
        { emUso: usos },
      );
    }
  },
};
