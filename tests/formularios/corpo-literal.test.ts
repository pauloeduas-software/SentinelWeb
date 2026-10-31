import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { criarApi, type ApiDeTeste } from '../helpers/app';
import { prisma } from '../../server/infra/database/prismaClient';
import { criarFabricante, criarModelo, idsDoSeed } from '../helpers/fixtures';

// O CORPO LITERAL DO FORMULÁRIO — o teste que teria pego o defeito 1.
//
// A auditoria da F0/F1 encontrou a etiqueta automática INALCANÇÁVEL pela tela:
// ela funcionava por `curl` e respondia 422 pelo formulário. Passou porque foi
// verificada pelo caminho que funciona, e não pelo que o usuário usa.
//
// A causa é sempre a mesma e é estrutural: um formulário React inicializa todo
// campo de texto com `''` e MANDA A CHAVE, vazia. `.optional()` do zod aceita a
// chave AUSENTE, não a chave vazia. Os dois corpos são diferentes, e só um deles
// existe na vida real.
//
// Por isso este arquivo não escreve corpo "de teste". Ele copia o objeto que a
// tela monta, campo por campo, e o manda inteiro. Quando alguém acrescentar um
// campo ao formulário sem tratar o `''` no schema, é aqui que aparece.
//
// A auditoria: "O teste que teria pego os defeitos 1, 3, 4 e 5 é o mesmo:
// enviar o corpo literal que o formulário monta."
// (docs/historico/fase-01-catalogo-e-ativo.md, "Auditoria das F0 e F1")

let api: ApiDeTeste;
let statusId = '';
let modelId = '';

beforeAll(async () => {
  api = await criarApi();
  const seed = await idsDoSeed();
  statusId = seed.statusDeployableId;
  const fabricanteId = await criarFabricante(api);
  modelId = await criarModelo(api, { categoriaId: seed.categoriaId, fabricanteId });
});

afterAll(async () => {
  await api.fechar();
});

/**
 * CÓPIA FIEL de `valoresIniciais(null)` de
 * `src/pages/computadores/components/AssetFormModal.tsx`.
 *
 * Os dois `ReferenceSelect` obrigatórios (modelo e status) chegam preenchidos
 * porque o formulário não envia sem eles — e o status já NASCE preenchido com
 * o primeiro de tipo `DEPLOYABLE` (`useAssets`, `statusPadraoId`), que é o
 * mesmo usado aqui. TODO O RESTO vai como a tela monta: string vazia em cada
 * campo de texto.
 *
 * `assignedToId` NÃO está aqui de propósito — o campo saiu do formulário na F4,
 * e o `strictObject` do servidor recusa a chave. A ausência é a regra
 * (docs/referencia/modelo-de-posse.md, D14).
 */
function corpoDoFormularioDeAtivo(sobrescrever: Record<string, unknown> = {}) {
  return {
    assetTag: '',
    serial: '',
    name: '',
    statusId,
    modelId,
    locationId: '',
    orderNumber: '',
    purchaseDate: '',
    purchaseCost: '',
    notes: '',
    ...sobrescrever,
  };
}

describe('POST /api/assets com o corpo literal do AssetFormModal', () => {
  it('aceita e gera a etiqueta automática (regressão do defeito 1)', async () => {
    const { status, body } = await api.post<{ id: string; assetTag: string }>(
      '/api/assets',
      corpoDoFormularioDeAtivo(),
    );

    // Antes da correção isto era 422 {"error":"etiqueta não pode ser vazio"}.
    expect(status).toBe(201);
    // O contador de `AppSetting`, que é a funcionalidade-título da Etapa G.
    expect(body.assetTag).toMatch(/^ATV-\d{5}$/);
  });

  it('transforma em `null` os campos de texto que a tela manda vazios', async () => {
    const { status, body } = await api.post<Record<string, unknown>>(
      '/api/assets',
      corpoDoFormularioDeAtivo(),
    );

    expect(status).toBe(201);
    // `''` gravado como string vazia seria pior que `null`: "tem número de
    // série, e ele é vazio" é diferente de "não tem número de série", e as duas
    // frases responderiam diferente a `WHERE serial IS NULL`.
    expect(body.serial).toBeNull();
    expect(body.name).toBeNull();
    expect(body.notes).toBeNull();
    expect(body.orderNumber).toBeNull();
    // Numéricos e datas pelo mesmo caminho: `''` não pode virar `0` nem
    // `Invalid Date`. O custo é lido do banco: a resposta da escrita não o leva
    // para cargo nenhum (D77).
    const gravado = await prisma.asset.findUniqueOrThrow({ where: { id: String(body.id) }, select: { purchaseCost: true } });
    expect(gravado.purchaseCost).toBeNull();
    expect(body.purchaseDate).toBeNull();
  });

  it('não confunde FK vazia com FK inválida', async () => {
    // `locationId: ''` é o caso normal da tela: o `<select>` é opcional e
    // começa sem seleção. Um `uuid()` cru aqui responderia 422 "identificador
    // inválido" para quem simplesmente não escolheu localização.
    const { status, body } = await api.post<Record<string, unknown>>(
      '/api/assets',
      corpoDoFormularioDeAtivo(),
    );

    expect(status).toBe(201);
    expect(body.locationId).toBeNull();
  });

  it('respeita a etiqueta digitada quando o usuário preenche o campo', async () => {
    // A outra metade da regra: vazio significa "gere", preenchido significa
    // "use esta". Sem este teste, um `preprocess` que ignorasse o valor
    // passaria despercebido.
    const { status, body } = await api.post<{ assetTag: string }>(
      '/api/assets',
      corpoDoFormularioDeAtivo({ assetTag: 'ETIQUETA-A-MAO' }),
    );

    expect(status).toBe(201);
    expect(body.assetTag).toBe('ETIQUETA-A-MAO');
  });

  it('recusa campo desconhecido no corpo (mass assignment)', async () => {
    // `strictObject`. A chave escolhida é a que mais importa: `assignedToId`
    // saiu do contrato na F4 e voltar a aceitá-la criaria a SEGUNDA fonte de
    // verdade sobre quem responde pelo ativo.
    const { status } = await api.post(
      '/api/assets',
      corpoDoFormularioDeAtivo({ assignedToId: '00000000-0000-4000-8000-000000000000' }),
    );

    expect(status).toBe(422);
  });
});

describe('PUT /api/assets/:id com o corpo literal do formulário de edição', () => {
  it('editar só o nome não apaga o resto nem quebra nas strings vazias', async () => {
    const criado = await api.post<{ id: string; assetTag: string }>(
      '/api/assets',
      corpoDoFormularioDeAtivo({ serial: 'SN-EDICAO', purchaseDate: '2026-01-31' }),
    );
    expect(criado.status).toBe(201);

    // O formulário de edição carrega os valores atuais e manda TODOS de volta.
    // Campo que estava nulo volta como `''` — que é exatamente o caso que
    // precisa continuar sendo lido como "sem valor", e não como "limpe isto".
    const { status, body } = await api.put<Record<string, unknown>>(`/api/assets/${criado.body.id}`, {
      ...corpoDoFormularioDeAtivo({
        assetTag: criado.body.assetTag,
        serial: 'SN-EDICAO',
        name: 'Nome novo',
        purchaseDate: '2026-01-31',
      }),
    });

    expect(status).toBe(200);
    expect(body.name).toBe('Nome novo');
    // O que não foi tocado continua lá: era este o erro mais provável da
    // edição, segundo a auditoria.
    expect(body.serial).toBe('SN-EDICAO');
    expect(body.purchaseDate).not.toBeNull();
  });
});

describe('POST /api/users com o corpo literal do UserFormModal', () => {
  /**
   * Cópia fiel de `src/pages/usuarios/components/UserFormModal.tsx`: nome e
   * e-mail, sem senha (AU) — a conta nasce com a temporária.
   */
  function corpoDoFormularioDeUsuario(sobrescrever: Record<string, unknown> = {}) {
    return { name: '', email: '', ...sobrescrever };
  }

  it('aceita o corpo mínimo da tela', async () => {
    const { status, body } = await api.post<Record<string, unknown>>(
      '/api/users',
      corpoDoFormularioDeUsuario({
        name: 'Laura Souza', email: 'laura.formulario@teste.local',
      }),
    );

    expect(status).toBe(201);
    expect(body.id).toBeTruthy();
  });

  it('recusa nome e e-mail vazios com 422 por campo', async () => {
    // O formulário deixa enviar (o `required` do HTML é do navegador, não da
    // API), então o 422 tem que dizer QUAL campo falhou: a frase nomeia os dois.
    const { status, body } = await api.post<{ error: string }>(
      '/api/users',
      corpoDoFormularioDeUsuario(),
    );

    expect(status).toBe(422);
    expect(body.error).toMatch(/nome/);
    expect(body.error).toMatch(/e-mail/);
  });
});

describe('POST /api/people com o corpo literal da página Colaboradores', () => {
  /** Os `campos` da spec `colaborador` (src/pages/colaboradores/specs/index.ts), em branco. */
  function corpoDoFormularioDeColaborador(sobrescrever: Record<string, unknown> = {}) {
    return { name: '', email: '', notes: '', ...sobrescrever };
  }

  it('aceita o e-mail e as notas em branco, e grava nulo — colaborador não faz login', async () => {
    const { status, body } = await api.post<{ email: string | null; notes: string | null }>(
      '/api/people',
      corpoDoFormularioDeColaborador({ name: 'Sem E-mail' }),
    );

    expect(status).toBe(201);
    expect(body.email).toBeNull();
    expect(body.notes).toBeNull();
  });

  it('e-mail é único e gravado em minúsculas', async () => {
    const primeiro = await api.post<{ email: string }>(
      '/api/people',
      corpoDoFormularioDeColaborador({ name: 'Com E-mail', email: '  Colab.Unico@Teste.Local ' }),
    );
    expect(primeiro.status).toBe(201);
    expect(primeiro.body.email).toBe('colab.unico@teste.local');

    const repetido = await api.post<{ error: string }>(
      '/api/people',
      corpoDoFormularioDeColaborador({ name: 'Outro', email: 'colab.unico@teste.local' }),
    );
    expect(repetido.status).toBe(409);
    expect(repetido.body.error).toMatch(/e-mail/i);
  });
});
