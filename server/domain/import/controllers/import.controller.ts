import { z } from 'zod';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { parseListQuery } from '../../../core/http/list-query';
import { atorDaRequisicao } from '../../auth/helpers/actor.helper';
import { idParamSchema } from '../../shared/params.schema';
import { cabecalhosDeCsv } from '../../shared/csv.helper';
import { lerArquivo } from '../../shared/multipart.helper';
import { lerConfiguracaoDoSistema } from '../../settings/helpers/system-settings.helper';
import { importTargetSchema, lerMapeamento, linhasQuerySchema } from '../schemas/import.schema';
import { dryRunImport } from '../use-cases/dry-run-import.usecase';
import { applyImport } from '../use-cases/apply-import.usecase';
import {
  IMPORT_SORTABLE, getImport, listImportRows, listImports,
} from '../use-cases/get-import.usecase';
import { camposParaATela, modeloDeCsv } from '../use-cases/import-template.usecase';

// Só HTTP. A entrada do upload não é JSON — é `multipart/form-data` com UM
// arquivo e DOIS campos de texto (`target` e `mapping`).
//
// ═════════════════════════════════════════════════════════════════════════════
// O TETO DO ARQUIVO É DESTA ROTA, E NÃO O GLOBAL.
//
// O `@fastify/multipart` está registrado com 10 MB para a aplicação inteira — um
// número escolhido para nota fiscal e foto de equipamento (server/app.ts). Um
// CSV de carga inicial é de outra natureza: 20.000 linhas de ativo com quinze
// colunas passam de 4 MB com folga, e o teto de anexo cortaria o arquivo com uma
// mensagem que fala de MB em vez de falar de linhas.
//
// 25 MB aqui, e o limite REAL que importa é o de LINHAS (20.000, no
// `csv-parse.helper.ts`): é ele que protege a memória do processo, porque o
// arquivo é decodificado e parseado inteiro antes da simulação.
// ═════════════════════════════════════════════════════════════════════════════
const LIMITE_DO_CSV_BYTES = 25 * 1024 * 1024;

/**
 * Os tipos que um navegador manda num `.csv`.
 *
 * A lista é larga de propósito, e isso NÃO é frouxidão: o `Content-Type` de
 * upload vem do sistema operacional de quem envia, e o mesmo arquivo sai como
 * `text/csv` no Linux, `application/vnd.ms-excel` numa máquina com Office
 * instalado e `application/octet-stream` quando o SO não reconhece a extensão.
 * Recusar por aí rejeitaria arquivos corretos.
 *
 * QUEM VALIDA DE VERDADE É O CONTEÚDO: o `lerCsv()` decodifica em UTF-8 estrito
 * (byte inválido = 422 com instrução) e exige uma linha de cabeçalho com títulos
 * únicos. Um `.exe` renomeado para `.csv` morre ali, não aqui.
 */
const TIPOS_DE_CSV = new Set([
  'text/csv',
  'text/plain',
  'application/csv',
  'application/vnd.ms-excel',
  'application/octet-stream',
  '',
]);

const alvoQuerySchema = z.strictObject({ target: importTargetSchema });

export const importController = {
  /**
   * PASSO 1 (D68): sobe o arquivo, SIMULA e grava o relatório por linha.
   *
   * Nada fora de `imports`/`import_rows` é escrito aqui — nem um ativo, nem uma
   * pessoa, nem uma posse.
   */
  async criar(request: FastifyRequest, reply: FastifyReply) {
    const arquivo = await lerArquivo(request, {
      limiteBytes: LIMITE_DO_CSV_BYTES,
      aceitar: (mimeType) => TIPOS_DE_CSV.has(mimeType),
      descricaoDosAceitos: ['text/csv'],
    });

    const target = importTargetSchema.parse(arquivo.campos.target);
    const mapeamento = lerMapeamento(arquivo.campos.mapping);

    const id = await dryRunImport({
      filename: arquivo.originalName,
      target,
      bytes: arquivo.bytes,
      mapeamento,
      actorId: atorDaRequisicao(request),
    });

    // 201 com o relatório inteiro: quem subiu o arquivo quer ver os totais na
    // mesma resposta, sem um segundo GET só para descobrir se vale aplicar.
    return reply.status(201).send(await getImport(id));
  },

  /** PASSO 2 (D68): aplica o que a simulação marcou como `OK`. */
  async aplicar(request: FastifyRequest) {
    const { id } = idParamSchema.parse(request.params);
    return applyImport(id, atorDaRequisicao(request));
  },

  async listar(request: FastifyRequest) {
    const query = parseListQuery(request.query, {
      sortable: IMPORT_SORTABLE,
      defaultSort: 'createdAt',
      defaultOrder: 'desc',
    });

    return listImports(query);
  },

  async porId(request: FastifyRequest) {
    const { id } = idParamSchema.parse(request.params);
    return getImport(id);
  },

  async linhas(request: FastifyRequest) {
    const { id } = idParamSchema.parse(request.params);

    // O filtro do domínio sai ANTES: o parser do `core` é `strictObject` e
    // responderia 422 a `?status=`, que ele não conhece (é o D20 outra vez).
    const { status, ...resto } = (request.query ?? {}) as Record<string, unknown>;
    const filtro = linhasQuerySchema.parse({ status });

    const query = parseListQuery(resto, {
      sortable: ['lineNumber'] as const,
      defaultSort: 'lineNumber',
      defaultOrder: 'asc',
    });

    return listImportRows(id, query, filtro);
  },

  /** Os campos de um alvo — é com isto que a tela monta o `<select>` do mapeamento. */
  async campos(request: FastifyRequest) {
    const { target } = alvoQuerySchema.parse(request.query ?? {});
    return camposParaATela(target);
  },

  /** O CSV-modelo, com os títulos na ordem certa e uma linha de exemplo. */
  async modelo(request: FastifyRequest, reply: FastifyReply) {
    const { target } = alvoQuerySchema.parse(request.query ?? {});
    const { csvDelimiter } = await lerConfiguracaoDoSistema();

    return reply
      .headers(cabecalhosDeCsv(`modelo-${target.toLowerCase()}`))
      .send(modeloDeCsv(target, csvDelimiter));
  },
};
