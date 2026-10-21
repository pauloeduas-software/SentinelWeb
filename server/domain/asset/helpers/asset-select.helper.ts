// O que de um ativo pode sair para o cliente — em UM lugar só, usado pela
// listagem, pelo detalhe e, sem o custo, pelas respostas de escrita.
//
// Allowlist, não `include`: coluna nova na tabela não aparece em resposta
// nenhuma até alguém escrever o nome dela aqui.
//
// As relações vêm embutidas com allowlist própria porque a tabela mostra o NOME
// do status, do modelo e do fabricante, não o uuid — e uma consulta por linha
// seria N+1.
//
// A CATEGORIA do ativo vem pelo modelo (`model.category`), não por coluna
// própria — é assim no Snipe-IT, e é o que impede ativo e modelo divergirem.
export const ASSET_SELECT = {
  id: true,
  assetTag: true,
  serial: true,
  name: true,
  notes: true,

  statusId: true,
  modelId: true,
  locationId: true,

  orderNumber: true,
  purchaseDate: true,
  // Decimal: sai no JSON como STRING.
  purchaseCost: true,

  // BAIXA. Sai na resposta porque a tela precisa mostrar o selo
  // "baixado" na linha e na aba Detalhes — e porque, sem ele, a
  // listagem `?view=retired` devolveria linhas indistinguíveis das outras.
  //
  // NÃO é `deletedAt`: as duas colunas respondem perguntas diferentes (D19,
  // docs/historico/fase-02-ativos.md).
  retiredAt: true,
  retiredReason: true,

  createdAt: true,

  status: { select: { id: true, name: true, type: true } },
  model: {
    select: {
      id: true, name: true, modelNumber: true,
      // Os canais de suporte vêm junto: é na ficha do ativo que se precisa do
      // telefone da garantia, não na tela de Configurações.
      manufacturer: {
        select: { id: true, name: true, url: true, supportPhone: true, supportEmail: true },
      },
      category: { select: { id: true, name: true, type: true } },
    },
  },
  location: { select: { id: true, name: true } },
} as const;

// ═══════════════════════════════════════════════════════════════════════════
// O CUSTO POR PERMISSÃO (F11, D77) — e ele é OMITIDO DO SELECT, não mascarado
// depois.
//
// Ler a coluna e apagá-la do objeto antes de responder ainda
// deixa o valor passar pelo processo. Ele entra no objeto, e daí em diante vaza
// por qualquer caminho que não seja a resposta "feliz" — a linha de log de um
// erro que serializa o objeto, um `JSON.stringify` num handler de exceção, o
// `changes` de um `ActivityLog` montado com spread. Na LEITURA, o dado que não
// deve sair não é lido. A exceção é a edição, que lê o custo para o diff da
// auditoria e o tira do objeto antes de responder (`update-asset.usecase.ts`).
//
// POR QUE UMA FUNÇÃO E NÃO DOIS `const`: os dois selects têm que ser o MESMO
// menos uma coluna. Dois literais lado a lado divergem na primeira coluna
// acrescentada — e a que divergiria é a versão restrita, que ninguém olha no
// dia a dia porque o administrador vê tudo.
//
// AS ESCRITAS devolvem o ativo SEM custo, para qualquer cargo
// (`ASSET_WRITE_SELECT`). Criar, editar, entregar, devolver, dar baixa e
// restaurar respondem com o ativo atualizado, e quem não é `ADMIN` chamaria
// quase todas: com o select cheio, o custo que a leitura esconde sairia pela
// resposta da escrita. Enfiar a sessão em cada use-case de escrita espalharia autorização
// por toda a camada de posse — e a tela não usa o custo da resposta de escrita
// nenhuma. O custo sai por LEITURA, e é a leitura que filtra.
// ═══════════════════════════════════════════════════════════════════════════

/** As colunas que só o `ADMIN` vê (D77). Uma lista, num lugar só. */
const COLUNAS_DE_CUSTO = ['purchaseCost'] as const;

/**
 * Remove as colunas de custo de um select — ou de uma linha já lida.
 *
 * Genérica porque serve o select da listagem, o do detalhe e a resposta da
 * edição, que lê o custo para o diff e não o devolve.
 */
export function semCusto<T extends Record<string, unknown>>(select: T): Omit<T, (typeof COLUNAS_DE_CUSTO)[number]> {
  const copia: Record<string, unknown> = { ...select };
  for (const coluna of COLUNAS_DE_CUSTO) delete copia[coluna];
  // O tipo diz o que o objeto tem: sem a coluna de custo, para o compilador
  // recusar quem tentar lê-la de uma resposta de escrita.
  return copia as Omit<T, (typeof COLUNAS_DE_CUSTO)[number]>;
}

/** O select das RESPOSTAS DE ESCRITA: sem custo, qualquer que seja o cargo. */
export const ASSET_WRITE_SELECT = semCusto(ASSET_SELECT);

/**
 * O custo que chega numa ESCRITA de quem não é `ADMIN` é descartado.
 *
 * O formulário de quem não é `ADMIN` não tem o campo, porque não vê o valor.
 * Aceitar o que chegasse deixaria um `purchaseCost: ''` (o campo vazio vira
 * `null`) apagar o custo que só o administrador enxerga.
 */
export function custoSoDoAdmin<T extends { purchaseCost?: string | null }>(
  data: T,
  podeVerCusto: boolean,
): T {
  return podeVerCusto ? data : { ...data, purchaseCost: undefined };
}

/** O select da LISTAGEM, conforme a sessão enxergue custo ou não. */
export function assetSelect(podeVerCusto: boolean) {
  return podeVerCusto ? ASSET_SELECT : semCusto(ASSET_SELECT);
}

/**
 * O select do DETALHE, conforme a sessão enxergue custo ou não.
 *
 * É o select compartilhado (`ASSET_SELECT`) — menos a coluna de custo, quando a
 * sessão não é `ADMIN` (D77).
 */
export function assetDetailSelect(podeVerCusto: boolean) {
  if (podeVerCusto) return ASSET_SELECT;

  return {
    ...semCusto(ASSET_SELECT),
    model: { select: ASSET_SELECT.model.select },
  };
}
