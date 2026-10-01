import type { ImportRowStatus, ImportTarget, Prisma } from '@prisma/client';
import { prisma } from '../../../core/database/prismaClient';
import { AppError } from '../../../core/errors/app-error';
import { createLogger } from '../../../core/logger/logger';
import { ADAPTADORES } from '../helpers/adaptadores.helper';
import { lerCsv } from '../helpers/csv-parse.helper';
import { mapearLinha, validarMapeamento, type MapeamentoValidado } from '../helpers/import-fields.helper';

const logger = createLogger('import.dry-run');

// O PRIMEIRO DOS DOIS PASSOS (D68) — e ele NÃO GRAVA NADA fora de
// `imports`/`import_rows`.
//
// ═════════════════════════════════════════════════════════════════════════════
// POR QUE O DRY-RUN É OBRIGATÓRIO, E NÃO UM BOTÃO "VERIFICAR" OPCIONAL.
//
// Import é a operação com a maior razão dano/esforço do sistema: um clique,
// milhares de linhas. E o dano não é só "cadastro errado" — na importação de
// ocupação (Etapa E) ele muda QUEM RESPONDE por centenas de equipamentos sem
// tocar em uma posse sequer.
//
// Ver antes o que vai acontecer é a única chance de perceber que a coluna
// *Local* veio trocada com a *Colaborador*, ou que a planilha tem a mesa
// "Mesa 1 " (com espaço) que não existe no cadastro. Depois do apply, o que
// sobra é desfazer à mão, linha por linha.
// ═════════════════════════════════════════════════════════════════════════════

/** Quantas linhas por `createMany`. Acima disto o INSERT vira um statement gigante. */
const LOTE_DE_GRAVACAO = 500;

export interface EntradaDoDryRun {
  filename: string;
  target: ImportTarget;
  bytes: Buffer;
  mapeamento: MapeamentoValidado;
  actorId: string | null;
}

interface LinhaSimulada {
  lineNumber: number;
  raw: Record<string, string>;
  status: ImportRowStatus;
  message: string | null;
}

/**
 * O motivo que vai para a linha do relatório.
 *
 * Só `AppError` tem texto escrito para ser lido por gente — é a regra do
 * `ARQUITETURA.md`, e a mesma escolha do `motivoDaRecusa` da entrega em massa
 * (D31). Qualquer outra coisa vira uma frase genérica AQUI, e o erro completo
 * vai para o log com o número da linha, para ser depurável depois.
 */
function motivoDaRecusa(lineNumber: number, erro: unknown): string {
  if (erro instanceof AppError) return erro.message;

  logger.error('[Import] Falha inesperada ao simular uma linha.', erro, { lineNumber });
  return 'Falha inesperada nesta linha.';
}

export async function dryRunImport(entrada: EntradaDoDryRun) {
  const { cabecalhos, linhas, delimitador } = lerCsv(entrada.bytes);

  // O MAPEAMENTO É VALIDADO CONTRA O ARQUIVO, e não só contra a allowlist:
  // mapear "Etiqueta" num arquivo cujo cabeçalho é "etiqueta " produziria uma
  // coluna sempre vazia, e o import "funcionaria" cadastrando 500 ativos sem
  // etiqueta nenhuma.
  const mapeamento = validarMapeamento(entrada.target, entrada.mapeamento, cabecalhos);

  if (linhas.length === 0) {
    throw new AppError('O arquivo tem cabeçalho mas nenhuma linha de dado.', 422);
  }

  const adaptador = ADAPTADORES[entrada.target]();
  const simuladas: LinhaSimulada[] = [];

  // SEQUENCIAL, e não `Promise.all`: as linhas compartilham os caches de
  // nome → id do adaptador (um `Promise.all` de 500 linhas com o mesmo modelo
  // dispararia 500 consultas antes de o primeiro cache preencher), e o banco é
  // o mesmo que está atendendo as telas.
  for (const linha of linhas) {
    const mapeada = mapearLinha(linha.valores, mapeamento);

    try {
      const plano = await adaptador.planejar(mapeada, mapeamento.chave);
      simuladas.push({
        lineNumber: linha.lineNumber,
        raw: linha.valores,
        status: plano.situacao === 'OK' ? 'OK' : 'IGNORADA',
        message: plano.descricao,
      });
    } catch (erro) {
      simuladas.push({
        lineNumber: linha.lineNumber,
        raw: linha.valores,
        status: 'ERRO',
        message: motivoDaRecusa(linha.lineNumber, erro),
      });
    }
  }

  const conta = (status: ImportRowStatus) => simuladas.filter((linha) => linha.status === status).length;

  // O EFEITO DE SEGUNDA ORDEM (Etapa E), calculado DEPOIS de todas as linhas:
  // ele é por POSTO, não por linha — duas pessoas entrando na mesma mesa vazia
  // produzem UMA mudança de responsabilidade, não duas.
  const efeito = adaptador.efeitoDeSegundaOrdem
    ? await adaptador.efeitoDeSegundaOrdem()
    : null;

  const importacao = await prisma.import.create({
    data: {
      filename: entrada.filename,
      target: entrada.target,
      status: 'SIMULADO',
      mapping: mapeamento as unknown as Prisma.InputJsonValue,
      delimiter: delimitador,
      totalLinhas: simuladas.length,
      ok: conta('OK'),
      erro: conta('ERRO'),
      ignorada: conta('IGNORADA'),
      ganhamResponsavel: efeito?.ganhamResponsavel ?? null,
      perdemResponsavel: efeito?.perdemResponsavel ?? null,
      actorId: entrada.actorId,
    },
    select: { id: true },
  });

  // `createMany` em lotes: 20.000 linhas num único INSERT estoura o limite de
  // parâmetros do Postgres (65.535), e o erro fala de "bind message" em vez de
  // falar de importação.
  for (let inicio = 0; inicio < simuladas.length; inicio += LOTE_DE_GRAVACAO) {
    const lote = simuladas.slice(inicio, inicio + LOTE_DE_GRAVACAO);

    await prisma.importRow.createMany({
      data: lote.map((linha) => ({
        importId: importacao.id,
        lineNumber: linha.lineNumber,
        raw: linha.raw as unknown as Prisma.InputJsonValue,
        status: linha.status,
        message: linha.message,
      })),
    });
  }

  logger.info(
    `[Import] Simulação de ${entrada.filename}: ${conta('OK')} ok, ${conta('ERRO')} erro(s), `
      + `${conta('IGNORADA')} ignorada(s).`,
    { importId: importacao.id, target: entrada.target },
  );

  return importacao.id;
}
