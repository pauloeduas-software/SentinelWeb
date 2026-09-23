import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '../../server/core/database/prismaClient';
import { enviar } from '../../server/core/mail/mailer';
import { enviarLembretesDeAtraso } from '../../server/domain/assignment/jobs/overdue-reminder.job';
import { criarApi, type ApiDeTeste } from '../helpers/app';
import { cenarioDePosse, criarAtivo } from '../helpers/fixtures';

// O CORREIO — e o D86, que é o que esta suíte prova.
//
// A decisão: e-mail é *best-effort* com log. Sem SMTP configurado o transporte
// é NO-OP que registra o que teria mandado, e uma falha de envio NUNCA desfaz a
// operação de negócio. O preço está escrito na decisão: um aviso perdido está
// perdido, e só o log sabe.
//
// A suíte roda SEM `SMTP_URL` (o `.env.test` não a define), então tudo aqui
// exercita o caminho no-op — que é justamente o que precisa ser garantido: o
// checkout não pode depender de haver servidor de e-mail.

let api: ApiDeTeste;
let cenario: Awaited<ReturnType<typeof cenarioDePosse>>;

beforeAll(async () => {
  api = await criarApi();
  cenario = await cenarioDePosse(api);
});

afterAll(async () => {
  await api.fechar();
});

async function ativoNovo() {
  const { id } = await criarAtivo(api, {
    statusId: cenario.statusDeployableId,
    modelId: cenario.modelId,
  });
  return id;
}

describe('o transporte no-op', () => {
  it('não lança, e devolve `false` para dizer que não entregou', async () => {
    await expect(
      enviar({ para: ['alguem@teste.local'], assunto: 'Teste', texto: 'corpo' }),
    ).resolves.toBe(false);
  });

  it('sem destinatário não tenta nada', async () => {
    await expect(enviar({ para: [], assunto: 'Teste', texto: 'corpo' })).resolves.toBe(false);
    await expect(enviar({ para: ['  '], assunto: 'Teste', texto: 'corpo' })).resolves.toBe(false);
  });
});

describe('a entrega não depende do correio', () => {
  it('checkout responde 201 com o correio em no-op, e a posse fica gravada', async () => {
    const assetId = await ativoNovo();

    const { status } = await api.post(`/api/assets/${assetId}/checkout`, {
      targetType: 'USER',
      targetUserId: cenario.laura,
    });
    expect(status).toBe(201);

    // O que importa: o BANCO tem a posse. O e-mail é consequência, não condição.
    const abertas = await prisma.assignment.count({ where: { assetId, checkinAt: null } });
    expect(abertas).toBe(1);
  });

  it('checkin responde 200 e fecha a posse, idem', async () => {
    const assetId = await ativoNovo();
    await api.post(`/api/assets/${assetId}/checkout`, {
      targetType: 'USER',
      targetUserId: cenario.ana,
    });

    const { status } = await api.post(`/api/assets/${assetId}/checkin`, {});
    expect(status).toBe(200);

    const abertas = await prisma.assignment.count({ where: { assetId, checkinAt: null } });
    expect(abertas).toBe(0);
  });

  it('entrega a um POSTO com dois ocupantes também conclui', async () => {
    // O alvo `LOCATION` é o que faz o aviso ir para N pessoas (D27). O caminho
    // é mais longo — consulta os ocupantes abertos — e continua não podendo
    // segurar nem derrubar a entrega.
    await api.post(`/api/locations/${cenario.mesa1}/occupants`, {
      userId: cenario.laura, shift: 'Manhã',
    });
    await api.post(`/api/locations/${cenario.mesa1}/occupants`, {
      userId: cenario.ana, shift: 'Tarde',
    });

    const assetId = await ativoNovo();
    const { status } = await api.post(`/api/assets/${assetId}/checkout`, {
      targetType: 'LOCATION',
      targetLocationId: cenario.mesa1,
    });
    expect(status).toBe(201);
  });
});

describe('o lembrete de atraso', () => {
  it('não avisa ninguém quando não há vencidos', async () => {
    expect(await enviarLembretesDeAtraso()).toBe(0);
  });

  it('agrupa por pessoa: dois atrasos da mesma pessoa viram UM destinatário', async () => {
    const ontem = new Date();
    ontem.setUTCHours(0, 0, 0, 0);
    ontem.setUTCDate(ontem.getUTCDate() - 3);

    // O schema recusa prazo no passado (Leva 1), e é a regra certa — então o
    // atraso é fabricado como ele acontece de verdade: a data passa.
    for (let i = 0; i < 2; i += 1) {
      const assetId = await ativoNovo();
      await api.post(`/api/assets/${assetId}/checkout`, {
        targetType: 'USER',
        targetUserId: cenario.laura,
      });
      await prisma.assignment.updateMany({
        where: { assetId, checkinAt: null },
        data: { expectedCheckinAt: ontem },
      });
    }

    // DOIS equipamentos vencidos, UMA pessoa: um e-mail, não dois. Quem tem
    // três atrasos não precisa de três cobranças na mesma manhã.
    expect(await enviarLembretesDeAtraso()).toBe(1);
  });
});
