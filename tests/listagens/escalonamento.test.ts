import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '../../server/core/database/prismaClient';
import { criarApi, type ApiDeTeste } from '../helpers/app';
import {
  criarAtivo, criarColaborador, criarFabricante, criarLocal, criarModelo, idsDoSeed,
} from '../helpers/fixtures';

// PARA QUEM EU LIGO? — `resolverEscalonamento()` (F11, Etapa F — D73, D139).
//
// ═════════════════════════════════════════════════════════════════════════════
// O QUE ESTE ARQUIVO PROVA, E POR QUE ELE É IRMÃO DE `invariantes/posse.test.ts`
// EM VEZ DE UM `describe` DENTRO DELE.
//
// Lá se prova *quem está com o equipamento* (Camada 3). Aqui, *quem responde
// pelo espaço* — a pergunta vizinha. A asserção que amarra as duas é a primeira
// deste arquivo, e ela é de AUSÊNCIA: o escalonamento vem preenchido E
// `responsaveis` continua **vazio** na mesma resposta.
//
// Essa asserção é o teste de regressão do D73. O dia que alguém "resolver" o
// posto vago devolvendo o gestor da localidade dentro de `resolverResponsaveis`,
// este arquivo fica vermelho — e sem ele o sintoma seria `postoVago` deixando de
// acender em três telas, sem nenhum teste reclamando.
//
// Em `listagens/` e não em `invariantes/`: escalonamento é dado que uma tela LÊ,
// não regra que o banco garante. O arquivo responde "o que a ficha do ativo
// mostra" — é o mesmo critério que pôs `historico-da-pessoa.test.ts` aqui.
// ═════════════════════════════════════════════════════════════════════════════

/** O recorte da ficha do ativo que este arquivo interroga. */
interface FichaDoAtivo {
  posse: {
    responsaveis: { name: string; via: string }[];
    postoVago: boolean;
  } | null;
  escalonamento: {
    name: string;
    email: string;
    locationName: string;
    via: 'LOCAL' | 'ANCESTRAL';
    saltos: number;
  } | null;
}

let api: ApiDeTeste;
let modelId = '';
let statusDeployableId = '';
let statusEmUsoId = '';

/** O gestor do prédio — o ancestral que responde quando a mesa não tem ninguém. */
let marinaId = '';

beforeAll(async () => {
  api = await criarApi();
  const seed = await idsDoSeed();
  statusDeployableId = seed.statusDeployableId;
  statusEmUsoId = seed.statusEmUsoId;

  const fabricanteId = await criarFabricante(api, 'Fabricante do Escalonamento');
  modelId = await criarModelo(api, {
    name: 'Modelo do Escalonamento', fabricanteId, categoriaId: seed.categoriaId,
  });

  marinaId = await criarColaborador(api, {
    name: 'Marina Prédio', email: 'marina.predio@teste.local',
  });
});

afterAll(async () => { await api.fechar(); });

/**
 * Um ativo entregue a um POSTO, e a ficha dele.
 *
 * Pelo caminho do checkout, nunca por `prisma.assignment.create`: é a posse
 * aberta que faz `resolverResponsaveis` ter o que ler, e é ela que marca
 * `postoVago`. Uma linha gravada à mão passaria pelo índice único mas pularia a
 * troca de status e o `ActivityLog`.
 */
async function fichaDeAtivoNoPosto(locationId: string, etiqueta: string): Promise<FichaDoAtivo> {
  const { id } = await criarAtivo(api, {
    assetTag: etiqueta, statusId: statusDeployableId, modelId, locationId,
  });

  const entrega = await api.post(`/api/assets/${id}/checkout`, {
    targetType: 'LOCATION', targetLocationId: locationId,
  });
  expect(entrega.status).toBe(201);

  const ficha = await api.get<FichaDoAtivo>(`/api/assets/${id}`);
  expect(ficha.status).toBe(200);
  return ficha.body;
}

describe('o posto sem ocupante tem escalonamento E não tem responsável', () => {
  it('sobe a árvore até o ancestral com gestor, e `responsaveis` continua vazio', async () => {
    // Prédio (gestor: Marina) › Andar 3 (sem gestor) › Mesa 9 (posto, sem gestor
    // e sem ninguém). É a forma real: ninguém cadastra gestor de mesa.
    const predio = await criarLocal(api, { name: 'Prédio Central', managerId: marinaId });
    const andar = await criarLocal(api, { name: 'Andar 3', parentId: predio });
    const mesa = await criarLocal(api, { name: 'Mesa 9', parentId: andar, isWorkstation: true });

    const ficha = await fichaDeAtivoNoPosto(mesa, 'ATV-ESC-ANCESTRAL');

    // AS DUAS ASSERÇÕES JUNTAS SÃO O D73. Separadas, cada uma passa com a
    // implementação errada: só a primeira passaria com o gestor virando
    // responsável, e só a segunda passaria com o escalonamento inexistente.
    expect(ficha.posse?.responsaveis).toEqual([]);
    expect(ficha.posse?.postoVago).toBe(true);

    expect(ficha.escalonamento).toMatchObject({
      name: 'Marina Prédio',
      email: 'marina.predio@teste.local',
      locationName: 'Prédio Central',
      via: 'ANCESTRAL',
      // Dois saltos: Mesa 9 → Andar 3 → Prédio Central. É o número que a tela
      // usa para avisar que o contato é indireto.
      saltos: 2,
    });
  });

  it('gestor na PRÓPRIA localização do ativo é `LOCAL`, com zero saltos', async () => {
    const gestorDaSala = await criarColaborador(api, {
      name: 'Rui Sala', email: 'rui.sala@teste.local',
    });
    const sala = await criarLocal(api, {
      name: 'Sala Própria', managerId: gestorDaSala, isWorkstation: true,
    });

    const ficha = await fichaDeAtivoNoPosto(sala, 'ATV-ESC-LOCAL');

    expect(ficha.escalonamento).toMatchObject({
      name: 'Rui Sala', via: 'LOCAL', saltos: 0, locationName: 'Sala Própria',
    });
  });
});

describe('a ausência de escalonamento não é erro', () => {
  it('árvore sem gestor em ancestral nenhum: `escalonamento` nulo e a ficha abre', async () => {
    const predio = await criarLocal(api, { name: 'Prédio Sem Gestor' });
    const mesa = await criarLocal(api, {
      name: 'Mesa Órfã', parentId: predio, isWorkstation: true,
    });

    const ficha = await fichaDeAtivoNoPosto(mesa, 'ATV-ESC-ORFA');

    // NULO, E 200. A ficha do ativo não pode deixar de abrir porque a árvore de
    // localizações está incompleta: escalonamento é informação acessória, e
    // derrubar a leitura do principal por causa dela seria o acessório mandando.
    expect(ficha.escalonamento).toBeNull();
    // E o buraco fica VISÍVEL ao lado do sinal que o motiva: posto vago sem
    // ninguém a quem escalar é o estado que a guarda de substituto do
    // desligamento (Etapa G) existe para não criar.
    expect(ficha.posse?.postoVago).toBe(true);
  });

  it('ativo sem localização nenhuma: nulo sem nem consultar a árvore', async () => {
    const { id } = await criarAtivo(api, {
      assetTag: 'ATV-ESC-SEM-LOCAL', statusId: statusDeployableId, modelId,
    });
    // Entregue para uma PESSOA: há responsável, e mesmo assim não há árvore
    // para subir — `locationId` é nulo. Os dois campos são independentes.
    const laura = await criarColaborador(api, {
      name: 'Laura Sem Local', email: 'laura.semlocal@teste.local',
    });
    const entrega = await api.post(`/api/assets/${id}/checkout`, {
      targetType: 'USER', targetUserId: laura,
    });
    expect(entrega.status).toBe(201);

    const ficha = await api.get<FichaDoAtivo>(`/api/assets/${id}`);
    expect(ficha.status).toBe(200);
    expect(ficha.body.escalonamento).toBeNull();
    expect(ficha.body.posse?.responsaveis).toHaveLength(1);
  });
});

describe('ciclo na árvore não enforca a subida', () => {
  it('o teto de 32 níveis devolve nulo em vez de travar o processo', async () => {
    // O CICLO É GRAVADO PELO PRISMA DIRETO, e isto é a única escrita fora da API
    // em todo o arquivo. Não é atalho: `POST`/`PUT /api/locations` passam pelo
    // `assertSemCicloDeLocalizacao`, então pela API este estado é
    // INALCANÇÁVEL — a guarda recusa com 409.
    //
    // O estado existe de qualquer forma, e foi provado na F1: a FK exige que o
    // pai exista, não que a cadeia termine. Um `UPDATE` por psql, uma carga de
    // migração ou um bug futuro fora da guarda o produzem. O teto de
    // profundidade existe para esse mundo, e testá-lo exige entrar nele.
    const topo = await criarLocal(api, { name: 'Ciclo Topo' });
    const baixo = await criarLocal(api, { name: 'Ciclo Baixo', parentId: topo });

    await prisma.location.update({
      where: { id: topo },
      data: { parentId: baixo },
    });

    const { id } = await criarAtivo(api, {
      assetTag: 'ATV-ESC-CICLO', statusId: statusEmUsoId, modelId, locationId: baixo,
    });

    // SEM `expect` DE TEMPO, e sem `vi.useFakeTimers`: o que prova o teto é a
    // requisição RESPONDER. Sem ele, o laço roda para sempre e o teste morre no
    // `testTimeout` do vitest — que é o sintoma certo, com a mensagem certa.
    const ficha = await api.get<FichaDoAtivo>(`/api/assets/${id}`);

    expect(ficha.status).toBe(200);
    expect(ficha.body.escalonamento).toBeNull();

    // DESFAZ O CICLO. Sem isto, qualquer consulta posterior que suba esta árvore
    // — neste arquivo ou em outro, porque o banco é um só e o `each-file.ts`
    // trunca por tabela — herdaria o laço. O estado é anormal de propósito e não
    // pode sobreviver ao `it` que precisa dele.
    await prisma.location.update({ where: { id: topo }, data: { parentId: null } });
  });
});

