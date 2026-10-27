import { AppError } from '../../../core/errors/app-error';
import { contarPosseAberta, motivoParaRecusar } from '../../person/use-cases/count-person-posse.usecase';
import { travarPessoa } from '../../person/use-cases/lock-person.usecase';
import { createPersonSchema, updatePersonSchema } from '../schemas/catalog-entities.schema';
import type { CatalogDelegate, CatalogSpec } from './catalog-spec.types';

// O COLABORADOR — quem RECEBE equipamento: ativo, posto, licença,
// unidade de estoque. Não entra no sistema; quem opera é usuário (`user`), e um
// não vira o outro: quem opera o sistema e também tem um notebook é cadastrado
// aqui à parte.
//
// É catálogo, e não domínio próprio, porque o cadastro é o mesmo das outras
// cinco abas: nome, desativar, excluir. O que ele tem a mais é a LIXEIRA — o
// único do catálogo com histórico de posse próprio, que recadastrar partiria em
// dois — e a ficha com o que está com a pessoa, que mora no domínio `person`.
export const personSpec: CatalogSpec = {
  slug: 'people',
  entityType: 'Person',
  tabela: 'people',
  rotulo: 'colaborador',

  delegate: (client) => client.person as unknown as CatalogDelegate,
  createSchema: createPersonSchema,
  updateSchema: updatePersonSchema,

  select: { id: true, name: true, email: true, isActive: true, createdAt: true, updatedAt: true },
  searchable: ['name', 'email'],
  audited: ['name', 'email', 'isActive'],

  // SEM `nomeUnicoPor`: dois "João Silva" existem, e quem os separa é o
  // e-mail (`beforeWrite`).

  // O seletor de pessoa da entrega, do posto, da licença e do estoque só
  // oferece quem está ativo: desativado não recebe nada novo, e oferecê-lo era
  // convidar ao 409. O da lixeira, a extension de soft delete já esconde.
  optionsWhere: { isActive: true },
  // O e-mail ao lado do nome: é ele que separa os dois "João Silva" no seletor.
  optionDetail: 'email',

  // EXCLUIR VAI PARA A LIXEIRA: a linha fica, e o histórico de posse — o dos
  // ativos e o da ficha dela — continua apontando para ela e mostrando o nome.
  // Restaurar devolve a MESMA pessoa, com o histórico inteiro.
  lixeira: true,

  // O que ela tem AGORA — as quatro pontas da invariante 6. O passado não
  // segura: ele fica com a linha na lixeira.
  countUsages: async (client, id) => {
    const posse = await contarPosseAberta(client, id);
    return posse.ativosEmPosse + posse.postosOcupados + posse.licencas.length + posse.itens.length;
  },

  // A recusa diz O QUÊ — "responde por 1 ativo e ocupa 1 posto" —, e não "em
  // uso por 2 registros": cada ponta se resolve numa tela diferente. A trava
  // vem antes da contagem, pelo mesmo motivo da desativação: sem ela, uma
  // entrega simultânea nasceria depois da contagem e a pessoa iria para a
  // lixeira com o equipamento na mão.
  async motivoParaNaoExcluir(client, id) {
    await travarPessoa(client, id);
    return motivoParaRecusar(await contarPosseAberta(client, id), 'excluir');
  },

  // O e-mail fica livre enquanto ela está na lixeira (índice parcial), então
  // pode ter sido recadastrado. Restaurar às cegas estouraria a unicidade crua.
  async beforeRestore(client, id) {
    const naLixeira = await client.person.findFirst({
      where: { id, deletedAt: { not: null } },
      select: { email: true },
    });
    if (!naLixeira?.email) return;

    const emUso = await client.person.findFirst({ where: { email: naLixeira.email }, select: { id: true } });
    if (emUso) throw new AppError('O e-mail deste colaborador já está em uso por outro cadastro.', 409);
  },

  async beforeWrite(client, id, data) {
    // A TRAVA DA LINHA, primeira trava da transação: é ela que faz a
    // desativação e uma entrega simultânea à mesma pessoa pararem de se
    // atropelar (`lock-person.usecase.ts`).
    if (id) await travarPessoa(client, id);

    // O e-mail é único quando preenchido. O `@unique` do banco segura a colisão
    // exata; a checagem aqui é a que devolve a frase em vez do P2002.
    if (typeof data.email === 'string') {
      const emUso = await client.person.findFirst({
        where: { email: data.email, ...(id ? { id: { not: id } } : {}) },
        select: { id: true },
      });
      if (emUso) throw new AppError('E-mail já está em uso por outro colaborador.', 409);
    }

    // DESATIVADO NÃO RESPONDE POR NADA (invariante 6). Só na TRANSIÇÃO: quem
    // já estava desativado não tem o que contar. Relido DEPOIS da trava, e não
    // o "antes" do CRUD genérico, que foi lido sem ela.
    if (!id || data.isActive !== false) return;
    const atual = await client.person.findFirst({ where: { id }, select: { isActive: true } });
    if (!atual?.isActive) return;

    const motivo = motivoParaRecusar(await contarPosseAberta(client, id), 'desativar');
    if (motivo) throw new AppError(motivo.mensagem, 409, motivo.refs);
  },
};
