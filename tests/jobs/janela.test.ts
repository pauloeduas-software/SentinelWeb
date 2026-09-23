import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '../../server/core/database/prismaClient';
import { executarUmaVezPorJanela, inicioDoDia, tomarJanela } from '../../server/core/jobs/claim-window';
import { criarApi, type ApiDeTeste } from '../helpers/app';

// A JANELA DE EXECUÇÃO — o D79 sob teste.
//
// O QUE ESTA SUÍTE EXISTE PARA IMPEDIR é o bug que a decisão descreve e que
// NINGUÉM notaria em produção: com uma coluna só (`AppSetting.lastAlertRunAt`),
// o lembrete de atraso e os alertas diários fariam compare-and-set no mesmo
// lugar. O primeiro a acordar venceria; o segundo receberia `count: 0`, leria
// como "já rodou hoje" e nunca executaria. Todo dia, sem erro e sem log.
//
// O primeiro teste deste arquivo é exatamente esse cenário — dois jobs, o mesmo
// dia — e ele só passa porque a tabela tem uma LINHA POR JOB.

let api: ApiDeTeste;

beforeAll(async () => {
  // A app não é usada pelo teste; ela sobe para o harness semear o banco e
  // para o `prisma` apontar para o banco de teste.
  api = await criarApi();
});

afterAll(async () => {
  await api.fechar();
});

describe('dois jobs diferentes', () => {
  it('ambos rodam no MESMO dia — um não bloqueia o outro (D79)', async () => {
    const janela = inicioDoDia();

    expect(await tomarJanela('job-alfa', janela)).toBe(true);
    expect(await tomarJanela('job-beta', janela)).toBe(true);
  });
});

describe('o mesmo job', () => {
  it('toma a janela uma vez e recusa a segunda tentativa', async () => {
    const janela = inicioDoDia();

    expect(await tomarJanela('job-diario', janela)).toBe(true);
    expect(await tomarJanela('job-diario', janela)).toBe(false);
    expect(await tomarJanela('job-diario', janela)).toBe(false);
  });

  it('volta a rodar quando a janela AVANÇA', async () => {
    const ontem = new Date(inicioDoDia().getTime() - 24 * 60 * 60 * 1000);

    expect(await tomarJanela('job-de-ontem', ontem)).toBe(true);
    expect(await tomarJanela('job-de-ontem', ontem)).toBe(false);

    // Amanhã a janela começa depois do `lastRunAt` gravado: ele roda de novo.
    const amanha = new Date(inicioDoDia().getTime() + 24 * 60 * 60 * 1000);
    expect(await tomarJanela('job-de-ontem', amanha)).toBe(true);
  });

  it('cria a linha na primeira execução da vida do sistema', async () => {
    expect(await prisma.jobRun.findUnique({ where: { name: 'job-novo' } })).toBeNull();

    expect(await tomarJanela('job-novo', inicioDoDia())).toBe(true);

    const linha = await prisma.jobRun.findUniqueOrThrow({ where: { name: 'job-novo' } });
    expect(linha.lastRunAt).toBeInstanceOf(Date);
  });
});

describe('executarUmaVezPorJanela', () => {
  it('roda a tarefa uma vez e pula a segunda chamada', async () => {
    let vezes = 0;
    const tarefa = async () => { vezes += 1; };

    await executarUmaVezPorJanela('job-contado', inicioDoDia(), tarefa);
    await executarUmaVezPorJanela('job-contado', inicioDoDia(), tarefa);

    expect(vezes).toBe(1);
  });

  it('tarefa que ESTOURA não derruba quem a chamou, e a janela fica tomada', async () => {
    // O `setInterval` que chama o job não pode morrer por uma falha
    // transitória — uma queda do banco desligaria o agendamento até o próximo
    // deploy. E a janela fica tomada de propósito: um job de e-mail que falha
    // no meio já mandou parte das mensagens, e reexecutar as mandaria de novo.
    await expect(
      executarUmaVezPorJanela('job-que-falha', inicioDoDia(), async () => {
        throw new Error('falha proposital');
      }),
    ).resolves.toBeUndefined();

    let rodouDeNovo = false;
    await executarUmaVezPorJanela('job-que-falha', inicioDoDia(), async () => {
      rodouDeNovo = true;
    });
    expect(rodouDeNovo).toBe(false);
  });
});
