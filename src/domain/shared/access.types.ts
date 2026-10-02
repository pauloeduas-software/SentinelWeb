/**
 * Uma chave de permissão, como `GET /api/permissions` a devolve.
 *
 * O catálogo vem do SERVIDOR, não de uma lista no painel: ele é declarado em
 * `server/domain/access/helpers/permission-catalog.ts`, e uma segunda lista aqui
 * ficaria velha na primeira chave acrescentada — a tela deixaria de oferecer uma
 * permissão que o sistema já reconhece, sem erro nenhum.
 */
export interface PermissaoDoCatalogo {
  /** `assets.viewCost`. */
  chave: string;
  /** "Ver custo de compra e valor contábil" — a frase que vai na caixa. */
  rotulo: string;
  /** `assets` — o pedaço antes do ponto, para a tela agrupar. */
  modulo: string;
}

/** Um grupo, como a listagem o devolve. */
export interface Grupo {
  id: string;
  name: string;
  description: string | null;
  /**
   * `{ "assets.view": true }` — só as chaves CONCEDIDAS aparecem.
   *
   * Nunca `false`: o D76 descartou negação por grupo, e a ausência é a única
   * forma de dizer "não concedido". Uma tela que gravasse `false` criaria uma
   * segunda forma de dizer a mesma coisa.
   */
  permissions: Record<string, boolean>;
  /**
   * Grupo de sistema (hoje só o `Administrador`): as permissões dele vêm do
   * código e o seed as repõe, então a API recusa editá-las ou apagá-lo (409).
   * A COMPOSIÇÃO continua livre — entrar e sair dele é como se dá e tira acesso
   * total.
   */
  isSystem: boolean;
  /** Quantas pessoas estão nele. Vem de `_count`, não da lista de membros. */
  _count: { users: number };
  createdAt: string;
  updatedAt: string;
}

/** O acesso de uma pessoa — `GET /api/users/:id/permissions`. */
export interface AcessoDoUsuario {
  /** A UNIÃO das chaves dos grupos dela (D76), ordenada. */
  permissoes: string[];
  grupos: { id: string; name: string }[];
}

export interface GrupoInput {
  name: string;
  description?: string | null;
  /**
   * As chaves CONCEDIDAS, como array.
   *
   * Array e não `Record`: um objeto aceitaria `{"assets.view": false}`, que é
   * uma terceira forma de dizer "não concedido" — e o D76 recusou o `deny`
   * justamente para não existir mais de uma. O servidor converte para o objeto
   * que a coluna guarda.
   */
  permissions: string[];
}

/**
 * O que está LIGADO neste servidor — `GET /api/access/directory`.
 *
 * Dois booleanos e nada mais: nenhum endpoint, nenhum DN, nenhum client id. A
 * tela de login lê `oidc` para decidir se desenha o botão de entrada única (e é
 * por isso que a rota é pública); a de Configurações lê `ldap` para decidir se
 * oferece o botão de sincronizar.
 */
export interface DiretorioLigado {
  ldap: boolean;
  oidc: boolean;
}

/**
 * O resultado de uma sincronização com o diretório.
 *
 * Números, e a lista de CONFLITOS — que é a única parte que exige ação humana:
 * e-mail que já existe como conta local (o vínculo explícito do D78) e entrada
 * sem identificador estável. `marcados` NÃO é desligamento: é a marca de revisão.
 */
export interface ResultadoDaSincronizacao {
  lidas: number;
  criados: number;
  atualizados: number;
  vinculados: number;
  marcados: number;
  desmarcados: number;
  conflitos: { identificacao: string; motivo: string }[];
}

/** As três origens de identidade de um colaborador (D78). */
export type OrigemDaIdentidade = 'LOCAL' | 'LDAP' | 'OIDC';
