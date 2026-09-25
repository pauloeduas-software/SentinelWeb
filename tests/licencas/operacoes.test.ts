import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { criarApi, type ApiDeTeste } from '../helpers/app';
import { cenarioDePosse, criarLicenca } from '../helpers/fixtures';
import { prisma } from '../../server/core/database/prismaClient';

// O STATUS DERIVADO E OS DOIS ALERTAS — a parte da F6 que não é corrida nem
// segredo, e a que o plano de execução listava sem ter arquivo.
//
// ═════════════════════════════════════════════════════════════════════════════
// POR QUE O STATUS PRECISA DE TESTE DE BORDA, SE É UM HELPER PURO
//
// Porque ele é uma função do DIA DE HOJE, e todo erro dele é de um dia: a
// licença que vence hoje virando EXPIRADA às 00:00:01, a que vence em 30 dias
// caindo fora do aviso por uma hora de fuso, a rescisão marcada para o mês que
// vem encerrando o contrato hoje. Nada disso aparece num teste que usa "daqui a
// um ano" e "no ano passado" — e todos os três mudam o que a tela cobra de quem
// a lê.
//
// As datas aqui são construídas a partir de MEIA-NOITE UTC, a mesma referência
// que o `dataOpcional` usa para gravar e que o `license-status.helper.ts` usa
// para comparar. Escrever `new Date()` em vez disso daria um teste que passa de
// manhã e falha à noite, conforme o fuso da máquina.
// ═════════════════════════════════════════════════════════════════════════════

let api: ApiDeTeste;
let cenario: Awaited<ReturnType<typeof cenarioDePosse>>;

beforeAll(async () => {
  api = await criarApi();
  cenario = await cenarioDePosse(api);
});

afterAll(async () => {
  await api.fechar();
});

/** `AAAA-MM-DD` a N dias de hoje, em UTC. Negativo é passado. */
function emDias(dias: number): string {
  const data = new Date();
  data.setUTCHours(0, 0, 0, 0);
  data.setUTCDate(data.getUTCDate() + dias);
  return data.toISOString().slice(0, 10);
}

interface LicencaLida {
  status: string;
  diasParaVencer: number | null;
  livres: number;
  productKeyMask: string | null;
}

async function lerStatus(id: string): Promise<LicencaLida> {
  const { status, body } = await api.get<LicencaLida>(`/api/licenses/${id}`);
  expect(status).toBe(200);
  return body;
}

describe('o status sai das datas, e as bordas são de um dia', () => {
  it('sem data de vencimento é ATIVA, e não há dias a contar', async () => {
    const licenca = await criarLicenca(api, {
      name: 'Perpétua', categoryId: cenario.categoriaLicencaId, seatsTotal: 1,
    });

    expect(await lerStatus(licenca.id)).toMatchObject({ status: 'ATIVA', diasParaVencer: null });
  });

  it('fora da janela de aviso é ATIVA', async () => {
    const licenca = await criarLicenca(api, {
      name: 'Renova em 40 dias', categoryId: cenario.categoriaLicencaId, seatsTotal: 1,
      expirationDate: emDias(40),
    });

    expect(await lerStatus(licenca.id)).toMatchObject({ status: 'ATIVA', diasParaVencer: 40 });
  });

  it('dentro da janela é VENCENDO, e os dias vêm do SERVIDOR', async () => {
    const licenca = await criarLicenca(api, {
      name: 'Renova em 10 dias', categoryId: cenario.categoriaLicencaId, seatsTotal: 1,
      expirationDate: emDias(10),
    });

    // `diasParaVencer` na resposta porque "VENCENDO" sozinho não diz se é para
    // agir hoje ou no mês que vem — e a tela não pode recalcular: o "hoje" do
    // navegador pode não ser o do servidor.
    expect(await lerStatus(licenca.id)).toMatchObject({ status: 'VENCENDO', diasParaVencer: 10 });
  });

  it('A BORDA EXATA: vence HOJE ainda é VENCENDO, nunca EXPIRADA', async () => {
    // Se a comparação fosse contra `new Date()` em vez de meia-noite UTC, esta
    // licença viraria EXPIRADA às 00:00:01 — e o inventário cobraria renovação
    // de um contrato que ainda vale o dia inteiro.
    const licenca = await criarLicenca(api, {
      name: 'Vence hoje', categoryId: cenario.categoriaLicencaId, seatsTotal: 1,
      expirationDate: emDias(0),
    });

    expect(await lerStatus(licenca.id)).toMatchObject({ status: 'VENCENDO', diasParaVencer: 0 });
  });

  it('vencida ontem é EXPIRADA, e os dias saem NEGATIVOS', async () => {
    const licenca = await criarLicenca(api, {
      name: 'Venceu ontem', categoryId: cenario.categoriaLicencaId, seatsTotal: 1,
      expirationDate: emDias(-1),
    });

    expect(await lerStatus(licenca.id)).toMatchObject({ status: 'EXPIRADA', diasParaVencer: -1 });
  });

  it('rescisão JÁ PASSADA vence tudo: ENCERRADA mesmo com vencimento futuro', async () => {
    // A ordem é a regra (D44): um contrato rescindido não fica "vencendo", ele
    // acabou por decisão. Com a ordem invertida, esta licença sairia ATIVA.
    const licenca = await criarLicenca(api, {
      name: 'Rescindida', categoryId: cenario.categoriaLicencaId, seatsTotal: 1,
      expirationDate: emDias(40), terminationDate: emDias(-5),
    });

    expect(await lerStatus(licenca.id)).toMatchObject({ status: 'ENCERRADA' });
  });

  it('rescisão FUTURA não encerra nada — o contrato vale até o dia marcado', async () => {
    // A contraparte do teste acima, e a que o texto do plano deixava ambígua ao
    // dizer só "preenchida": rescindir PARA o dia 30 não tira o direito de uso
    // hoje. Quem manda é a comparação com hoje.
    const licenca = await criarLicenca(api, {
      name: 'Rescinde no mês que vem', categoryId: cenario.categoriaLicencaId, seatsTotal: 1,
      expirationDate: emDias(10), terminationDate: emDias(30),
    });

    expect(await lerStatus(licenca.id)).toMatchObject({ status: 'VENCENDO' });
  });

  it('e NÃO existe coluna de status: ele não pode divergir porque não guarda nada', async () => {
    // A prova do D44 no banco. Uma coluna exigiria um job diário para continuar
    // verdadeira, e no dia em que ele falhasse o inventário mentiria sem
    // sintoma: a tela mostraria "ATIVA" e nada discordaria, porque a coluna
    // *seria* a resposta.
    const colunas = await prisma.$queryRaw<{ column_name: string }[]>`
      SELECT column_name FROM information_schema.columns
       WHERE table_name = 'licenses' AND column_name IN ('status', 'livres')
    `;
    expect(colunas).toEqual([]);
  });
});

describe('os alertas de vencimento', () => {
  it('trazem a que vence na janela e a que JÁ venceu, e deixam de fora a de 40 dias', async () => {
    const { body } = await api.get<{ vencendo: { name: string; status: string }[] }>(
      '/api/licenses/alerts',
    );
    const nomes = body.vencendo.map((linha) => linha.name);

    // A VENCIDA ENTRA de propósito: software em uso sem direito de uso é o
    // achado mais caro de uma auditoria de fornecedor, e sumir com ela da lista
    // no dia seguinte ao vencimento esconderia o problema no instante em que
    // ele passa a existir.
    expect(nomes).toContain('Venceu ontem');
    expect(nomes).toContain('Vence hoje');
    expect(nomes).toContain('Renova em 10 dias');

    expect(nomes).not.toContain('Renova em 40 dias');
    expect(nomes).not.toContain('Perpétua');
  });

  it('e deixam de fora a ENCERRADA: alguém já tratou', async () => {
    // Continuar cobrando ação sobre contrato rescindido treina quem lê a tela a
    // ignorar a lista.
    const { body } = await api.get<{ vencendo: { name: string }[] }>('/api/licenses/alerts');
    expect(body.vencendo.map((linha) => linha.name)).not.toContain('Rescindida');
  });

  it('ordenados por vencimento: o mais urgente primeiro', async () => {
    const { body } = await api.get<{ vencendo: { expirationDate: string }[] }>(
      '/api/licenses/alerts',
    );
    const datas = body.vencendo.map((linha) => linha.expirationDate);
    expect([...datas].sort()).toEqual(datas);
  });
});

describe('o alerta de assentos abaixo do mínimo', () => {
  it('só entra quem TEM piso e está abaixo dele', async () => {
    const comPiso = await criarLicenca(api, {
      name: 'Com piso', categoryId: cenario.categoriaLicencaId, seatsTotal: 3, minSeats: 2,
    });
    await criarLicenca(api, {
      name: 'Sem piso', categoryId: cenario.categoriaLicencaId, seatsTotal: 3,
    });

    let { body } = await api.get<{ assentosBaixos: { id: string; livres: number }[] }>(
      '/api/licenses/alerts',
    );
    // 3 livres e piso 2: ainda não é alerta.
    expect(body.assentosBaixos.map((linha) => linha.id)).not.toContain(comPiso.id);

    // Duas entregas deixam 1 livre, abaixo do piso 2.
    for (const alvo of [{ assignedUserId: cenario.laura }, { assignedUserId: cenario.ana }]) {
      expect((await api.post(`/api/licenses/${comPiso.id}/checkout-seat`, alvo)).status).toBe(201);
    }

    ({ body } = await api.get('/api/licenses/alerts'));
    expect(body.assentosBaixos).toContainEqual(
      expect.objectContaining({ id: comPiso.id, livres: 1 }),
    );

    // `minSeats` nulo NUNCA entra: sem piso, sem alerta. E é por isso que o
    // schema transforma string vazia em `null` em vez de deixar o
    // `z.coerce.number()` gravar 0.
    const semPiso = body.assentosBaixos.find((linha) => linha.id !== comPiso.id);
    expect(semPiso).toBeUndefined();
  });

  it('o tipo é FILTRO: `?tipo=` devolve uma categoria e a outra vazia', async () => {
    const soVencendo = await api.get<{ vencendo: unknown[]; assentosBaixos: unknown[] }>(
      '/api/licenses/alerts?tipo=vencendo',
    );
    expect(soVencendo.body.vencendo.length).toBeGreaterThan(0);
    expect(soVencendo.body.assentosBaixos).toEqual([]);

    const soAssentos = await api.get<{ vencendo: unknown[]; assentosBaixos: unknown[] }>(
      '/api/licenses/alerts?tipo=assentosBaixos',
    );
    expect(soAssentos.body.assentosBaixos.length).toBeGreaterThan(0);
    expect(soAssentos.body.vencendo).toEqual([]);
  });

  it('tipo escrito errado é 422, não silêncio', async () => {
    // Sem o `strictObject` na query, `?tip=vencendo` devolveria as duas
    // categorias e ninguém saberia que o filtro não pegou.
    expect((await api.get('/api/licenses/alerts?tipo=vencerndo')).status).toBe(422);
    expect((await api.get('/api/licenses/alerts?tip=vencendo')).status).toBe(422);
  });
});

describe('a máscara da chave', () => {
  it('preserva a pontuação e revela só os quatro últimos', async () => {
    const licenca = await criarLicenca(api, {
      name: 'Com chave longa', categoryId: cenario.categoriaLicencaId, seatsTotal: 1,
      productKey: 'AAAA-BBBB-CCCC-AB12',
    });

    expect((await lerStatus(licenca.id)).productKeyMask).toBe('••••-••••-••••-AB12');
  });

  it('chave curta demais para esconder algo sai INTEIRA mascarada', async () => {
    // Mostrar "AB12" de uma chave que É "AB12" seria revelar o segredo com
    // aparência de máscara — pior que não mascarar, porque quem lê a tela
    // acredita que não está vendo.
    const licenca = await criarLicenca(api, {
      name: 'Com chave curta', categoryId: cenario.categoriaLicencaId, seatsTotal: 1,
      productKey: 'AB12',
    });

    expect((await lerStatus(licenca.id)).productKeyMask).toBe('••••');
  });
});

describe('o piso do contrato quando a perda já aconteceu', () => {
  it('encolher abaixo dos assentos QUEIMADOS é 409, e a frase não manda devolver nada', async () => {
    // Não há o que devolver: os dois assentos já voltaram e queimaram. A frase
    // antiga ("Devolva assentos antes de reduzir") mandava o operador tentar
    // uma ação que não existe.
    const licenca = await criarLicenca(api, {
      name: 'OEM no piso', categoryId: cenario.categoriaLicencaId, seatsTotal: 2,
      reassignable: false,
    });

    for (const alvo of [{ assignedUserId: cenario.laura }, { assignedUserId: cenario.ana }]) {
      const entrega = await api.post<{ seatId: string }>(
        `/api/licenses/${licenca.id}/checkout-seat`, alvo,
      );
      expect(entrega.status).toBe(201);
      expect((await api.post(`/api/licenses/seats/${entrega.body.seatId}/checkin`, {})).status).toBe(200);
    }

    const recusa = await api.put<{ error: string }>(`/api/licenses/${licenca.id}`, { seatsTotal: 1 });
    expect(recusa.status).toBe(409);
    expect(recusa.body.error).toContain('queimados');
    expect(recusa.body.error).not.toContain('Devolva assentos');

    // E o contrato não mudou: 2 comprados, 0 utilizáveis, 2 queimados.
    const { body } = await api.get<{ seatsTotal: number; livres: number; queimados: number }>(
      `/api/licenses/${licenca.id}`,
    );
    expect(body).toMatchObject({ seatsTotal: 2, livres: 0, queimados: 2 });
  });
});

describe('entregar assento exige contrato de pé', () => {
  // A REGRA MORAVA SÓ NA TELA: `LicencaTable` desabilita o botão em licença
  // EXPIRADA e ENCERRADA, com um comentário dizendo que o servidor responderia
  // 409 — e ele não respondia. Quem chamasse a API registrava, no próprio
  // inventário, software em uso sem direito de uso.

  it('licença ENCERRADA responde 409 e diz como voltar atrás', async () => {
    const licenca = await prisma.license.findFirstOrThrow({
      where: { name: 'Rescindida' }, select: { id: true },
    });

    const recusa = await api.post<{ error: string; status: string }>(
      `/api/licenses/${licenca.id}/checkout-seat`, { assignedUserId: cenario.laura },
    );
    expect(recusa.status).toBe(409);
    expect(recusa.body.error).toContain('ENCERRADA');
    expect(recusa.body.error).toContain('limpe a data de encerramento');
  });

  it('licença EXPIRADA responde 409 e diz há quanto tempo venceu', async () => {
    const licenca = await prisma.license.findFirstOrThrow({
      where: { name: 'Venceu ontem' }, select: { id: true },
    });

    const recusa = await api.post<{ error: string }>(
      `/api/licenses/${licenca.id}/checkout-seat`, { assignedUserId: cenario.laura },
    );
    expect(recusa.status).toBe(409);
    expect(recusa.body.error).toContain('venceu há 1 dia');
    // A saída é atualizar o contrato, não tentar de novo.
    expect(recusa.body.error).toContain('atualize a data de vencimento');
  });

  it('VENCENDO entrega normalmente — é a janela em que se renova', async () => {
    // Recusar aqui seria pior que o problema: a licença ainda VALE, e travar a
    // entrega no mês da renovação impediria o trabalho que a renovação existe
    // para continuar.
    const licenca = await prisma.license.findFirstOrThrow({
      where: { name: 'Vence hoje' }, select: { id: true },
    });

    const entrega = await api.post(
      `/api/licenses/${licenca.id}/checkout-seat`, { assignedUserId: cenario.laura },
    );
    expect(entrega.status).toBe(201);
  });
});
