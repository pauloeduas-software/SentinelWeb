import type { FastifyRequest } from 'fastify';
import { AppError } from '../../core/errors/app-error';
import {
  TAMANHO_MAXIMO_BYTES, ehImagem, extensaoDoMime, tiposAceitos, tiposDeImagemAceitos,
} from '../../core/storage/mime';

// A LEITURA DE UM ARQUIVO DO CORPO MULTIPART — a borda que o zod não cobre.
//
// POR QUE MORA EM `domain/shared/` E NÃO DENTRO DE UM DOMÍNIO: eram as três
// mesmas recusas em três rotas de dois domínios diferentes — anexo e imagem
// (F2), logo e favicon da marca (F10), e o CSV do importador (F10). Copiada,
// ela divergiria justamente onde não pode: a allowlist de tipo e o corte do
// teto são o que impede subir executável e gravar arquivo pela metade.
//
// NÃO É `core/`: `core/storage/mime.ts` responde "este MIME é aceito?" sem
// saber o que é uma requisição. Aqui se fala HTTP — `request.file()`, 422, 413 —
// e isso é borda de domínio.

export interface ArquivoRecebido {
  bytes: Buffer;
  originalName: string;
  mimeType: string;
  /**
   * Os campos de TEXTO que vieram no mesmo formulário.
   *
   * Quem precisa: o importador de CSV, que manda `target` e `mapping` ao lado
   * do arquivo. As rotas de anexo e de imagem não leem nada daqui — para elas o
   * objeto é vazio, e é por isso que ele não atrapalha.
   *
   * ⚠️ SÓ CHEGAM OS CAMPOS DECLARADOS **ANTES** DO ARQUIVO no corpo multipart.
   * O `@fastify/multipart` entrega o `request.file()` assim que encontra a parte
   * do arquivo, e o que vem depois dela ainda não foi lido. É a ordem que um
   * `<form>` produz naturalmente (campos, depois o `<input type=file>`), e é a
   * ordem que o `corpoMultipart()` dos testes monta.
   */
  campos: Record<string, string>;
}

export interface OpcoesDeLeitura {
  /**
   * Teto DESTA rota, em bytes. Omitido, vale o do anexo (10 MB).
   *
   * Existe porque o teto global do `@fastify/multipart` (server/app.ts) foi
   * escolhido para nota fiscal e foto de equipamento, e uma rota que recebe
   * outro tipo de arquivo tem outro número — o CSV de uma carga inicial é maior
   * que qualquer PDF, e a logo da empresa é menor que qualquer um dos dois.
   */
  limiteBytes?: number;

  /** Só imagem: PDF é anexo legítimo, mas `<img src>` não o renderiza. */
  apenasImagem?: boolean;

  /**
   * Allowlist própria, para o tipo que não está na do anexo — o CSV.
   *
   * Recebe o MIME e devolve se aceita. A lista do que é aceito vai junto, em
   * `descricaoDosAceitos`, porque a mensagem do 422 precisa dizer o que ENVIAR:
   * "tipo não aceito" sozinho manda a pessoa adivinhar.
   */
  aceitar?: (mimeType: string) => boolean;
  descricaoDosAceitos?: string[];
}

/**
 * Lê o arquivo do corpo multipart e o valida.
 *
 * AS QUATRO RECUSAS, e a ordem importa:
 *
 * 1. **Sem arquivo** → 422. Formulário enviado vazio é erro de quem chamou, não
 *    um upload de zero bytes.
 * 2. **MIME fora da allowlist** → 422 dizendo o que É aceito. Allowlist, nunca
 *    blocklist: uma lista de "o que não pode" está sempre um formato atrás.
 * 3. **Maior que o teto** → 413. O `@fastify/multipart` já corta no `limits`,
 *    mas a checagem aqui é o que transforma o corte num erro com mensagem —
 *    sem ela o `file.truncated` passaria e gravaríamos um PDF pela metade.
 * 4. **Vazio** → 422, pelo mesmo motivo do primeiro.
 *
 * O `mimetype` vem do CLIENTE e não é confiável; ele serve para escolher a
 * extensão e recusar o que não está na lista, nunca para provar o conteúdo.
 * Quem garante que um `.exe` renomeado não vira executável no servidor é o fato
 * de nada aqui executar arquivo — e de o nome no disco nunca vir de fora.
 */
export async function lerArquivo(
  request: FastifyRequest,
  opcoes: OpcoesDeLeitura = {},
): Promise<ArquivoRecebido> {
  const limiteBytes = opcoes.limiteBytes ?? TAMANHO_MAXIMO_BYTES;

  const parte = await request.file({ limits: { fileSize: limiteBytes } });
  if (!parte) throw new AppError('Envie um arquivo no campo "file".', 422);

  const mimeType = parte.mimetype;

  if (opcoes.apenasImagem && !ehImagem(mimeType)) {
    throw new AppError(
      `Tipo de imagem não aceito: ${mimeType}. Aceitos: ${tiposDeImagemAceitos().join(', ')}.`,
      422,
    );
  }

  const aceito = opcoes.aceitar ? opcoes.aceitar(mimeType) : extensaoDoMime(mimeType) !== null;
  if (!aceito) {
    const lista = opcoes.descricaoDosAceitos ?? tiposAceitos();
    throw new AppError(`Tipo de arquivo não aceito: ${mimeType}. Aceitos: ${lista.join(', ')}.`, 422);
  }

  const bytes = await parte.toBuffer();

  // `truncated` é como o plugin avisa que cortou no teto. Sem isto, o arquivo
  // seria gravado incompleto e o defeito só apareceria ao abrir o PDF.
  if (parte.file.truncated) {
    throw new AppError(`Arquivo maior que o limite de ${Math.round(limiteBytes / 1024 / 1024)} MB.`, 413);
  }

  if (bytes.byteLength === 0) throw new AppError('O arquivo enviado está vazio.', 422);

  return {
    bytes,
    mimeType,
    originalName: parte.filename || 'arquivo',
    campos: camposDeTexto(parte.fields),
  };
}

/**
 * Os campos de texto do formulário, achatados em `{ nome: valor }`.
 *
 * O `@fastify/multipart` entrega cada campo como um objeto com `value` — ou um
 * ARRAY desses objetos, quando o mesmo nome aparece mais de uma vez. O último
 * vence, que é o comportamento de um `<form>`; aceitar o array inteiro faria o
 * `JSON.parse` do mapeamento receber `[object Object]`.
 *
 * A parte do ARQUIVO também aparece em `fields` (sem `value`), e é por isso que
 * a checagem de `typeof` existe: sem ela, o `file` entraria como um campo de
 * texto chamado "file" com valor `undefined`.
 */
function camposDeTexto(fields: unknown): Record<string, string> {
  if (!fields || typeof fields !== 'object') return {};

  const campos: Record<string, string> = {};

  for (const [nome, bruto] of Object.entries(fields as Record<string, unknown>)) {
    const ultimo = Array.isArray(bruto) ? bruto[bruto.length - 1] : bruto;
    const valor = (ultimo as { value?: unknown } | null)?.value;

    if (typeof valor === 'string') campos[nome] = valor;
  }

  return campos;
}
