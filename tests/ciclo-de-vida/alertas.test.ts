import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '../../server/core/database/prismaClient';
import { criarApi, type ApiDeTeste } from '../helpers/app';
import {
  criarAtivo, criarFabricante, criarManutencao, criarModelo, diasAtras, idsDoSeed,
} from '../helpers/fixtures';

// A CENTRAL DE ALERTAS — docs/historico/fase-08-ciclo-de-vida.md, Etapa E.
//
// ═════════════════════════════════════════════════════════════════════════════
// O QUE ESTA SUÍTE EXISTE PARA IMPEDIR é o alerta que nasce DE NOVO todo dia.
//
// A chave de deduplicação tem uma regra POR TIPO (D125), e a versão ingênua
// (`tipo:ativo:prazo` para os quatro) falha em dois casos, sempre para o lado de
// repetir:
//
//   ativo NUNCA conferido não tem prazo — a única data à mão é a do CORTE, que
//   anda todo dia. A chave mudaria diariamente e o aviso nasceria de novo
//   diariamente, que é o oposto do que o dedupe existe para fazer.
//
//   manutenção aberta não tem data-alvo, e a chave tem que ser DELA e não do
//   ativo: duas manutenções abertas no mesmo notebook são dois problemas, e uma
//   chave por ativo colapsaria as duas num aviso só.
//
// ═════════════════════════════════════════════════════════════════════════════
//
// POR QUE O RECORTE E A CONFIGURAÇÃO ESTÃO EM `alertas-recorte.test.ts`.
//
// `POST /api/alerts/run` tem teto de 10/min (`DESTRUCTIVE_RATE_LIMIT`), e é o teto
// certo: cada chamada varre a frota quatro vezes e pode mandar e-mail. O harness
// cria UMA instância do Fastify por ARQUIVO, e o `@fastify/rate-limit` conta em
// memória por instância — então dividir os testes em dois arquivos dá a cada um o
// próprio orçamento.
//
// Sem a divisão, o arquivo pararia de passar no dia em que alguém acrescentasse o
// décimo caso — e falharia com 429, que se lê como defeito de lógica.
// ═════════════════════════════════════════════════════════════════════════════

let api: ApiDeTeste;
let modelId: string;
let statusId: string;

beforeAll(async () => {
  api = await criarApi();
  const seed = await idsDoSeed();
  statusId = seed.statusDeployableId;
  const fabricanteId = await criarFabricante(api, 'Fabricante dos alertas');
  modelId = await criarModelo(api, { categoriaId: seed.categoriaId, fabricanteId });
});

afterAll(async () => {
  await api.fechar();
});

beforeEach(async () => {
  // A central é global e cada teste conta linhas: limpar antes de cada um é o que
  // permite contar. `deleteMany` de verdade porque `alerts` não tem lixeira.
  await prisma.alert.deleteMany({});
});

/** Roda a varredura e devolve o que ela criou. */
async function rodar() {
  const resposta = await api.post<{ criados: number; notificados: number; desligado: boolean }>('/api/alerts/run');
  expect(resposta.status).toBe(200);
  return resposta.body;
}

describe('a idempotência (D125)', () => {
  it('a segunda rodada do mesmo dia cria ZERO', async () => {
    const ativo = await criarAtivo(api, { statusId, modelId, name: 'Notebook do dedupe' });
    // Garantia vencendo dentro da janela padrão de 30 dias.
    await api.put(`/api/assets/${ativo.id}`, { purchaseDate: diasAtras(360), warrantyMonths: 12 });

    const primeira = await rodar();
    expect(primeira.criados).toBeGreaterThan(0);

    // `createMany({ skipDuplicates: true })` sobre o índice único de `dedupeKey`:
    // sem SELECT prévio e sem corrida entre dois processos.
    const segunda = await rodar();
    expect(segunda.criados).toBe(0);
  });

  it('ativo NUNCA conferido gera UM alerta, e não um por dia', async () => {
    const ativo = await criarAtivo(api, { statusId, modelId, name: 'Notebook nunca conferido' });

    await rodar();
    await rodar();

    const alertas = await prisma.alert.findMany({
      where: { assetId: ativo.id, type: 'AUDITORIA_VENCIDA' },
      select: { dedupeKey: true },
    });

    expect(alertas).toHaveLength(1);
    // A chave carrega `nunca`, e NÃO a data do corte — que mudaria amanhã.
    expect(alertas[0].dedupeKey).toContain(':nunca');
  });

  it('duas manutenções abertas no mesmo ativo geram DOIS alertas', async () => {
    const ativo = await criarAtivo(api, { statusId, modelId, name: 'Notebook das duas abertas' });

    // Abertas há mais que o `maintenanceOpenDays` padrão (15).
    await criarManutencao(api, ativo.id, { title: 'Reparo antigo', startDate: diasAtras(40) });
    await criarManutencao(api, ativo.id, { title: 'Contrato parado', type: 'SUPORTE', startDate: diasAtras(50) });

    await rodar();

    const alertas = await prisma.alert.findMany({
      where: { assetId: ativo.id, type: 'MANUTENCAO_EM_ABERTO' },
      select: { dedupeKey: true },
    });

    // DOIS: a chave é da MANUTENÇÃO. Com chave por ativo, o segundo problema
    // nunca apareceria.
    expect(alertas).toHaveLength(2);
    expect(new Set(alertas.map((alerta) => alerta.dedupeKey)).size).toBe(2);
  });
});
