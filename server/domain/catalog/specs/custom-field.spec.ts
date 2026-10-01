import { AppError } from '../../../core/errors/app-error';
import { motivoParaRecusarPadrao } from '../../custom-field/helpers/field-validator.helper';
import { countAssetsWithField } from '../../custom-field/use-cases/count-assets-with-field.usecase';
import { createCustomFieldSchema, updateCustomFieldSchema } from '../schemas/catalog-entities.schema';
import type { CatalogDelegate, CatalogSpec, ClienteCatalogo } from './catalog-spec.types';

// CAMPO CUSTOMIZADO — a parte PLANA dele, que é CRUD de catálogo (D64).
//
// ═════════════════════════════════════════════════════════════════════════════
// O QUE ESTÁ AQUI E O QUE NÃO ESTÁ.
//
// Listar, buscar, ordenar, `ActivityLog` e 409-por-uso é o que o motor genérico
// do catálogo já faz, e o `ARQUITETURA.md` diz que acrescentar tabela de
// catálogo *é escrever a spec*. O que NÃO cabe numa spec é ordem,
// obrigatoriedade por vínculo e validação de valor: isso tem regra, e regra mora
// em use-case — `server/domain/custom-field/`.
//
// As três guardas do `beforeWrite` abaixo são a exceção, e todas pelo mesmo
// motivo: as três dependem do estado ATUAL da linha ou dos valores já gravados,
// que é justamente o que um schema de entrada não alcança.
// ═════════════════════════════════════════════════════════════════════════════

// A contagem de ativos com a chave presente mora em
// `custom-field/use-cases/count-assets-with-field.usecase.ts`, em SQL cru: o
// `?` do Postgres usa o índice GIN e o `path`/`not: DbNull` do Prisma tipado
// não (medido — 0,05 ms contra 5,2 ms em 50 mil linhas). Ela recebe o cliente
// da TRANSAÇÃO, então o 409 do delete continua serializado com a exclusão.
//
// E ela NÃO filtra a lixeira, de propósito: um ativo apagado ainda usa o campo —
// restaurá-lo traz o valor de volta —, então apagar o campo no meio deixaria a
// chave órfã sem aviso. É a mesma decisão do `INCLUINDO_LIXEIRA` das outras
// specs, escrita lá porque a extension de soft delete não alcança `$queryRaw`.

/**
 * O uso de um campo é a soma de DUAS coisas diferentes, e isso é de propósito
 * (D64): os vínculos com conjuntos ("algum conjunto pede este campo") e os
 * ativos com a chave presente ("algum ativo tem valor gravado nele").
 *
 * Contar só os vínculos deixaria apagar um campo que saiu de todos os conjuntos
 * mas tem valor em mil ativos — e os mil valores ficariam órfãos, sem aviso e
 * sem forma de voltar a aparecer em tela nenhuma.
 */
async function contarUsos(client: ClienteCatalogo, id: string): Promise<number> {
  const campo = await client.customField.findUnique({ where: { id }, select: { slug: true } });
  if (!campo) return 0;

  const [vinculos, ativos] = await Promise.all([
    client.customFieldsetField.count({ where: { fieldId: id } }),
    countAssetsWithField(client, campo.slug),
  ]);

  return vinculos + ativos;
}

/** Elementos em que cifrar faz sentido: os dois que aceitam texto digitado. */
const CIFRAVEIS = new Set<string>(['TEXT', 'TEXTAREA']);
/** Elementos que se alimentam de `listValues` e por isso a exigem. */
const COM_LISTA = new Set<string>(['LISTBOX', 'RADIO']);

export const customFieldSpec: CatalogSpec = {
  slug: 'custom-fields',
  entityType: 'CustomField',
  rotulo: 'campo customizado',

  delegate: (client) => client.customField as unknown as CatalogDelegate,
  createSchema: createCustomFieldSchema,
  updateSchema: updateCustomFieldSchema,

  select: {
    id: true, name: true, slug: true, element: true, format: true,
    regexPattern: true, listValues: true, helpText: true, encrypted: true,
    showInListView: true, displayInUserView: true, showInEmail: true,
    createdAt: true,
  },
  sortable: ['name', 'slug', 'element', 'format', 'createdAt'],
  defaultSort: 'name',
  // O `slug` entra na busca porque é por ele que se escreve o filtro
  // `?cf[slug]=` — quem procura "qual era o identificador do patrimônio?"
  // procura pelo identificador.
  searchable: ['name', 'slug'],
  audited: [
    'name', 'slug', 'element', 'format', 'regexPattern', 'listValues', 'helpText',
    'encrypted', 'showInListView', 'displayInUserView', 'showInEmail',
  ],

  countUsages: contarUsos,

  /**
   * AS TRÊS GUARDAS, e nenhuma delas cabe no schema de entrada.
   *
   * 1. **O `slug` é imutável** (D60). Ele é a chave do JSON em N mil linhas.
   * 2. **`encrypted` não vira depois que há valor gravado.** Ligar exigiria
   *    recifrar N mil linhas; desligar deixaria `enc:v1:…` aparecendo em tela.
   * 3. **Coerência entre elemento e formato.** Precisa do estado ATUAL: numa
   *    edição, `format: 'REGEX'` chega sem `regexPattern` quando o padrão já
   *    está gravado.
   */
  async beforeWrite(client, id, data) {
    const atual = id
      ? await client.customField.findUnique({
        where: { id },
        select: {
          slug: true, element: true, format: true, regexPattern: true,
          listValues: true, encrypted: true, showInListView: true,
        },
      })
      : null;

    if (id && !atual) throw new AppError('Registro não encontrado', 404);

    // ── 1. O SLUG É IMUTÁVEL (D60) ─────────────────────────────────────────
    //
    // Uma regra de três linhas no lugar de um script de migração e de um modo de
    // falha: renomear o slug é um `UPDATE` sobre `assets` inteira que teria que
    // ser transacional com esta linha, e um meio-caminho deixa valores órfãos.
    // O `name` muda à vontade — é ele que aparece na tela.
    if (atual && typeof data.slug === 'string' && data.slug !== atual.slug) {
      throw new AppError(
        `O identificador de um campo não muda depois de criado: ele é a chave do valor em cada ativo. `
        + `Este campo é "${atual.slug}". Para trocar o identificador, crie outro campo — `
        + 'o nome visível, esse sim, pode ser editado à vontade.',
        409,
        { slug: atual.slug },
      );
    }
    // Recusado acima quando difere; igual, não precisa ir ao UPDATE.
    if (atual) delete data.slug;

    // O estado FINAL, que é o que as duas guardas seguintes precisam ver.
    const element = String(data.element ?? atual?.element ?? 'TEXT');
    const format = String(data.format ?? atual?.format ?? 'ANY');
    const encrypted = Boolean(data.encrypted ?? atual?.encrypted ?? false);
    const regexPattern = data.regexPattern === undefined ? atual?.regexPattern ?? null : data.regexPattern;
    const listValues = (data.listValues ?? atual?.listValues ?? []) as string[];
    const showInListView = Boolean(data.showInListView ?? atual?.showInListView ?? false);

    // ── 2. `encrypted` NÃO VIRA COM VALOR GRAVADO ──────────────────────────
    //
    // Nos dois sentidos, e são dois estragos diferentes: ligar deixaria os
    // valores antigos em CLARO dentro do JsonB com o sistema tratando-os como
    // cifrados (e a leitura falharia com "formato desconhecido"); desligar
    // faria a tela mostrar `enc:v1:…` como se fosse o valor.
    //
    // O caminho para trocar é o mesmo do slug: outro campo. Não há migração em
    // massa aqui porque ela teria que decifrar e recifrar N mil linhas numa
    // transação, e o que falhasse no meio ficaria ilegível.
    if (atual && encrypted !== atual.encrypted) {
      const comValor = await countAssetsWithField(client, atual.slug);
      if (comValor > 0) {
        throw new AppError(
          `Não é possível ${encrypted ? 'ligar' : 'desligar'} a cifra de "${atual.slug}": `
          + `${comValor} ${comValor === 1 ? 'ativo já tem' : 'ativos já têm'} valor gravado neste campo. `
          + `${encrypted
            ? 'Os valores existentes estão em claro e não seriam cifrados retroativamente.'
            : 'Os valores existentes estão cifrados e apareceriam como texto ilegível.'} `
          + 'Crie um campo novo com a configuração desejada.',
          409,
          { emUso: comValor },
        );
      }
    }

    // ── 3. COERÊNCIA ENTRE ELEMENTO, FORMATO E CIFRA ───────────────────────
    //
    // Estas três recusas evitam campo que GRAVA e não FUNCIONA — o pior tipo de
    // configuração aceita, porque só se descobre na tela de quem preenche.
    if (format === 'REGEX' && !regexPattern) {
      throw new AppError('Formato "expressão regular" exige o padrão a validar.', 422);
    }

    // ── A GUARDA DE ReDoS RODA AQUI, NO CADASTRO DO CAMPO (D63) ───────────
    //
    // ═════════════════════════════════════════════════════════════════════
    // ELA EXISTIA E NÃO ERA CHAMADA NESTE CAMINHO — e o lugar importa mais do
    // que parece.
    //
    // O `validadorDoFormato` também a consulta, e um padrão recusado por ele
    // vira um validador que RECUSA TUDO. Seguro, e na tela errada: o padrão
    // entrava no catálogo sem reclamação, e quem descobria era a pessoa
    // preenchendo o formulário de um ativo — recebendo "a expressão regular
    // deste campo foi recusada" sobre uma configuração que ela não fez e não
    // pode corrigir.
    //
    // Aqui a mensagem chega a quem digitou o padrão, no momento em que digitou.
    // A checagem no motor FICA, e as duas não são redundantes: aquela protege
    // contra padrão que entrou por outro caminho (um `psql` à mão, um seed).
    // ═════════════════════════════════════════════════════════════════════
    if (format === 'REGEX' && typeof regexPattern === 'string') {
      const problema = motivoParaRecusarPadrao(regexPattern);
      if (problema) {
        throw new AppError(
          `Expressão regular recusada porque ${problema}.`,
          422,
          { fields: { regexPattern: `recusada porque ${problema}` } },
        );
      }
    }

    if (COM_LISTA.has(element) && listValues.length === 0) {
      throw new AppError(
        `O elemento ${element === 'LISTBOX' ? 'lista' : 'botões de opção'} exige ao menos um valor na lista.`,
        422,
      );
    }

    if (encrypted && !CIFRAVEIS.has(element)) {
      throw new AppError(
        'Só campo de texto pode ser cifrado: uma lista ou caixa de seleção mascarada não deixaria nada para escolher.',
        422,
      );
    }

    // Campo cifrado SAI DE TUDO (D62): não é buscável, não é ordenável e não vira
    // coluna. Uma coluna de `••••••` repetido em toda linha da tabela ocuparia
    // espaço para não informar nada — e sugeriria que o valor está ali.
    if (encrypted && showInListView) {
      throw new AppError(
        'Campo cifrado não pode virar coluna da listagem: a coluna mostraria a máscara em toda linha.',
        422,
      );
    }

    // ── TEXTO DE VÁRIAS LINHAS NÃO VIRA COLUNA ─────────────────────────────
    //
    // A ajuda do elemento, no formulário, diz exatamente isto ("Não entra como
    // coluna da listagem de ativos") — e até aqui NADA cumpria a frase: marcar a
    // caixa punha o `TEXTAREA` na tabela, e uma observação de duas mil letras numa
    // célula estoura a altura da linha e empurra as colunas seguintes para fora.
    //
    // Um rótulo que promete uma regra sem a regra existir é pior que a ausência
    // dos dois: quem leu a ajuda confia nela e não confere.
    if (element === 'TEXTAREA' && showInListView) {
      throw new AppError(
        'Campo de texto com várias linhas não pode virar coluna da listagem: uma observação longa '
        + 'numa célula de tabela deixa a linha ilegível. Use "Texto (uma linha)" para isso.',
        422,
      );
    }
  },
};
