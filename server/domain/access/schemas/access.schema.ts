import { z } from 'zod';
import { ehPermissaoConhecida, TODAS_AS_PERMISSOES } from '../helpers/permission-catalog';

// Contrato de entrada das rotas de acesso. `strictObject` como no resto do
// projeto: campo desconhecido vira 422, não gravação silenciosa.

const nome = z.string('nome é obrigatório').trim()
  .min(1, 'nome não pode ser vazio')
  .max(80, 'nome: máximo de 80 caracteres');

const descricao = z.string().trim().max(240, 'descrição: máximo de 240 caracteres').nullish()
  .transform((valor) => (valor === undefined ? undefined : valor || null));

/**
 * AS PERMISSÕES, VALIDADAS CONTRA O CATÁLOGO — e é esta a rede que fecha o
 * risco do D76.
 *
 * O risco não é o óbvio. Chave digitada errada em JsonB **não dá erro nenhum**:
 * `{"assets.viw": true}` grava, o `preHandler` não encontra a chave que
 * procura, e a pessoa simplesmente não vê ativo. Nada falha, nada loga, e a
 * investigação começa procurando bug na autorização em vez de erro de digitação
 * no grupo.
 *
 * Então a chave desconhecida é **422 na gravação**, com o nome dela na
 * mensagem. É o oposto de negar em silêncio: o erro aparece no momento em que
 * alguém o comete, na tela em que o cometeu.
 *
 * A ENTRADA É UM ARRAY, e a coluna é um objeto. A conversão é aqui de
 * propósito: um `Record<string, boolean>` vindo do cliente aceitaria
 * `{"assets.view": false}`, que é uma terceira forma de dizer "não concedido" —
 * e o D76 recusou o `deny` justamente para não existir mais de uma. Array de
 * chaves concedidas só sabe dizer uma coisa.
 */
const permissoes = z.array(z.string().trim())
  .max(TODAS_AS_PERMISSOES.length, 'permissões: lista maior que o catálogo')
  .superRefine((lista, ctx) => {
    for (const chave of lista) {
      if (ehPermissaoConhecida(chave)) continue;
      ctx.addIssue({
        code: 'custom',
        message: `permissão desconhecida: "${chave}". Confira o catálogo em /api/permissions.`,
        path: [lista.indexOf(chave)],
      });
    }
  })
  // `Set` antes de montar: chave repetida no array vinha de caixa de seleção
  // duplicada na tela e viraria a mesma chave duas vezes no objeto — inofensivo,
  // mas o `ActivityLog` registraria uma mudança que não houve.
  .transform((lista): Record<string, true> =>
    Object.fromEntries([...new Set(lista)].map((chave) => [chave, true as const])));

export const createGroupSchema = z.strictObject({
  name: nome,
  description: descricao,
  permissions: permissoes,
});

export const updateGroupSchema = z.strictObject({
  name: nome.optional(),
  description: descricao,
  permissions: permissoes.optional(),
});

/**
 * Os grupos de UMA pessoa — substituição, não acréscimo.
 *
 * `PUT` e lista inteira, e não `POST`/`DELETE` por vínculo: a pergunta da tela é
 * "de quais grupos esta pessoa participa", respondida com caixas de seleção. Com
 * verbos por vínculo, duas abas abertas na mesma pessoa aplicariam duas
 * alterações parciais e o resultado dependeria da ordem de chegada.
 */
export const setUserGroupsSchema = z.strictObject({
  groupIds: z.array(z.uuid('grupo: id inválido')).max(50, 'grupos: no máximo 50 por pessoa'),
});

/**
 * A ORIGEM DA IDENTIDADE de uma pessoa (F11, Etapa I — D78).
 *
 * Enum e não texto livre: os três valores são o contrato do schema
 * (`AuthSource`), e um quarto só existe depois de uma migração.
 *
 * `strictObject` com UM campo, e não um `PATCH` genérico de usuário: esta
 * operação concede um caminho de LOGIN (ver o use-case), e ela não pode viajar
 * escondida no meio de um formulário de cadastro.
 */
export const setAuthSourceSchema = z.strictObject({
  authSource: z.enum(
    ['LOCAL', 'LDAP', 'OIDC'],
    'origem inválida: use LOCAL, LDAP ou OIDC',
  ),
});
