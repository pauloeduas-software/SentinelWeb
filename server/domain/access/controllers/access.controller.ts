import type { FastifyRequest } from 'fastify';
import { parseListQuery } from '../../../core/http/list-query';
import { atorDaRequisicao } from '../../auth/helpers/actor.helper';
import { idParamSchema } from '../../shared/params.schema';
import { PERMISSION_CATALOG, TODAS_AS_PERMISSOES } from '../helpers/permission-catalog';
import {
  createGroupSchema, setAuthSourceSchema, setUserGroupsSchema, updateGroupSchema,
} from '../schemas/access.schema';
import {
  createGroup, deleteGroup, getGroup, listGroupOptions, listGroups, updateGroup,
} from '../use-cases/manage-groups.usecase';
import { permissoesDoUsuario } from '../use-cases/effective-permissions.usecase';
import { setUserGroups } from '../use-cases/set-user-groups.usecase';
import { setAuthSource } from '../use-cases/set-auth-source.usecase';
import { sincronizarComLdap } from '../use-cases/sync-ldap.usecase';
import { diretorioLigado } from '../helpers/directory-config.helper';

const GROUP_SORTABLE = ['name', 'createdAt'] as const;

export const accessController = {
  /**
   * O CATÁLOGO DE CHAVES, para a tela desenhar as caixas de seleção.
   *
   * Sai do código, não do banco: é `permission-catalog.ts`. Uma lista montada a
   * partir do que está gravado nos grupos mostraria só o que alguém já usou — e
   * esconderia justamente a chave nova que ninguém concedeu ainda.
   *
   * Dispensada de permissão (`route-permissions.ts`): é código público, e sem
   * ela a tela de grupos não tem como se desenhar nem para quem a administra.
   */
  async permissoes() {
    return {
      data: TODAS_AS_PERMISSOES.map((chave) => ({
        chave,
        rotulo: PERMISSION_CATALOG[chave],
        // O módulo sai da própria chave, e não de uma segunda lista: `<módulo>.<ação>`
        // é o formato, então agrupar a tela por módulo é partir no ponto.
        modulo: chave.split('.')[0],
      })),
    };
  },

  async list(request: FastifyRequest) {
    const query = parseListQuery(request.query, {
      sortable: GROUP_SORTABLE,
      defaultSort: 'name',
      defaultOrder: 'asc',
    });
    return listGroups(query);
  },

  async options() {
    return { data: await listGroupOptions() };
  },

  async get(request: FastifyRequest) {
    const { id } = idParamSchema.parse(request.params);
    return getGroup(id);
  },

  async create(request: FastifyRequest) {
    const corpo = createGroupSchema.parse(request.body);
    return createGroup(corpo, atorDaRequisicao(request));
  },

  async update(request: FastifyRequest) {
    const { id } = idParamSchema.parse(request.params);
    const corpo = updateGroupSchema.parse(request.body);
    return updateGroup(id, corpo, atorDaRequisicao(request));
  },

  async remove(request: FastifyRequest) {
    const { id } = idParamSchema.parse(request.params);
    await deleteGroup(id, atorDaRequisicao(request));
    return { ok: true };
  },

  /** O que uma pessoa alcança, e por quais grupos — a tela de acesso dela. */
  async permissoesDoUsuario(request: FastifyRequest) {
    const { id } = idParamSchema.parse(request.params);
    return permissoesDoUsuario(id);
  },

  async definirGrupos(request: FastifyRequest) {
    const { id } = idParamSchema.parse(request.params);
    const { groupIds } = setUserGroupsSchema.parse(request.body);
    return setUserGroups(id, groupIds, atorDaRequisicao(request));
  },

  // ── O DIRETÓRIO E O SSO (F11, Etapa I) ──────────────────────────────────

  /**
   * O que está LIGADO neste servidor — sem revelar nada de como.
   *
   * Nenhum endpoint, nenhum DN, nenhum client id: dois booleanos. É o que a tela
   * de Acesso precisa para decidir se oferece o botão de sincronizar, e o que a
   * tela de login precisa para decidir se oferece o botão de entrada única.
   */
  async diretorio() {
    return diretorioLigado();
  },

  /**
   * Roda a sincronização AGORA, à mão.
   *
   * Existe por três motivos práticos: conferir a configuração no dia em que ela é
   * escrita (sem esperar a janela diária), trazer uma contratação recém-criada no
   * diretório, e revisar os conflitos depois de resolvê-los. O job continua sendo
   * o caminho normal.
   *
   * O RESULTADO VOLTA NO CORPO — números e a lista de conflitos. Sem isso, a única
   * forma de saber o que aconteceu seria abrir o log do servidor, e quem clica no
   * botão é quem administra o inventário, não quem tem acesso ao contêiner.
   */
  async sincronizarDiretorio() {
    return sincronizarComLdap();
  },

  /**
   * Muda a origem da identidade — o vínculo explícito do D78.
   *
   * `access.manage` e não `users.edit`: marcar uma conta como federada CONCEDE um
   * caminho de login. Ver o use-case.
   */
  async definirOrigemDaIdentidade(request: FastifyRequest) {
    const { id } = idParamSchema.parse(request.params);
    const { authSource } = setAuthSourceSchema.parse(request.body ?? {});
    return setAuthSource(id, authSource, atorDaRequisicao(request));
  },
};
