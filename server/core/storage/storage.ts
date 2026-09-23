import crypto from 'crypto';
import fs from 'fs/promises';
import { createReadStream, type ReadStream } from 'fs';
import path from 'path';
import { createLogger } from '../logger/logger';
import { extensaoDoMime } from './mime';

// ONDE OS BYTES MORAM — e só isso.
//
// Este arquivo NÃO sabe o que é um anexo, um termo de aceite ou um ativo. Ele
// grava, lê e apaga arquivo. É `core` por isso (D83): quando a Leva 4 precisar
// guardar a imagem da assinatura e o PDF do termo — que não são anexos de ativo
// —, ela chama daqui, sem `domain/acceptance` importar `domain/attachment`.
//
// E NÃO É ROTA ESTÁTICA (D84). O `UPLOAD_DIR` fica fora de qualquer raiz do
// `@fastify/static`, porque o guard de autenticação libera, em produção, todo
// GET fora de `/api`:
//
//   if (estaticoPublico && request.method === 'GET' && !path.startsWith('/api'))
//
// Um `GET /uploads/<uuid>.pdf` não começa com `/api` — então nota fiscal,
// contrato, assinatura e termo assinado seriam legíveis sem sessão, em produção
// e só em produção (em desenvolvimento quem serve o estático é o Vite). Quem
// entrega o arquivo é uma rota `/api/…` que confere a sessão e transmite.

const logger = createLogger('storage');

/** Onde a pasta fica quando ninguém diz. Relativa ao diretório do processo. */
const PADRAO = 'uploads';

/**
 * As subpastas. Uma por tipo de conteúdo, e não uma pasta só:
 * `ls` numa pasta com 40 mil arquivos é inútil, e separar por origem deixa o
 * backup escolher o que levar.
 */
export type Pasta = 'anexos' | 'imagens' | 'assinaturas' | 'termos';

function raiz(): string {
  return path.resolve(process.env.UPLOAD_DIR?.trim() || PADRAO);
}

/**
 * O caminho absoluto de um arquivo, CONFERIDO contra a raiz.
 *
 * `path.resolve` sozinho não protege: `resolve(raiz, '../../etc/passwd')` sai
 * da raiz sem reclamar. A conferência aqui é o que transforma um nome hostil em
 * erro em vez de leitura arbitrária do disco — e ela roda em TODA operação,
 * inclusive nas que só leem um nome que nós mesmos geramos, porque a garantia
 * tem que valer mesmo se um caminho vier do banco depois de uma edição à mão.
 */
function caminhoAbsoluto(relativo: string): string {
  const base = raiz();
  const destino = path.resolve(base, relativo);

  // `base + path.sep` e não só `base`: sem o separador, uma pasta vizinha
  // chamada `uploads-antigo` passaria no `startsWith`.
  if (destino !== base && !destino.startsWith(base + path.sep)) {
    throw new Error(`caminho fora do UPLOAD_DIR: ${relativo}`);
  }
  return destino;
}

/** O que a gravação devolve: é o `path` que vai para a coluna. */
export interface ArquivoGravado {
  /** Relativo à raiz — `anexos/a3f1….pdf`. É isto que o banco guarda. */
  path: string;
  sizeBytes: number;
}

/**
 * Grava os bytes e devolve o caminho relativo.
 *
 * O NOME É NOSSO: `uuid` + a extensão derivada do MIME da allowlist. O nome que
 * o cliente mandou não chega aqui — quem o guarda é a coluna `originalName`, e
 * ele nunca toca o sistema de arquivos.
 *
 * SOBRE TRANSAÇÃO: este arquivo não participa da `$transaction` do Prisma, e
 * não tem como participar — o disco não faz rollback. Quem chama grava a LINHA
 * primeiro, commita, e só então chama aqui. O custo dessa ordem é um arquivo
 * órfão quando a gravação do disco falha depois do commit; o custo da ordem
 * inversa seria uma linha apontando para um arquivo que nunca existiu, que é
 * pior — a tela mostra o anexo e o download dá 404.
 */
export async function gravar(
  pasta: Pasta,
  mimeType: string,
  bytes: Buffer,
): Promise<ArquivoGravado> {
  const extensao = extensaoDoMime(mimeType);
  if (!extensao) throw new Error(`MIME fora da allowlist: ${mimeType}`);

  const relativo = path.join(pasta, `${crypto.randomUUID()}${extensao}`);
  const destino = caminhoAbsoluto(relativo);

  await fs.mkdir(path.dirname(destino), { recursive: true });
  await fs.writeFile(destino, bytes);

  return { path: relativo, sizeBytes: bytes.byteLength };
}

/**
 * Abre o arquivo para transmissão.
 *
 * `ReadStream`, não `readFile`: um PDF de 10 MB lido inteiro para a memória são
 * 10 MB por download simultâneo, e o processo é um só.
 */
export function abrir(relativo: string): ReadStream {
  return createReadStream(caminhoAbsoluto(relativo));
}

/** O arquivo existe? Usado pela rota de download para escolher 404 em vez de 500. */
export async function existe(relativo: string): Promise<boolean> {
  try {
    await fs.access(caminhoAbsoluto(relativo));
    return true;
  } catch {
    return false;
  }
}

/**
 * Apaga, e NUNCA lança.
 *
 * Apagar arquivo é sempre o ÚLTIMO passo, depois do commit que já removeu a
 * linha. Se lançasse, uma falha aqui derrubaria uma operação que já aconteceu —
 * o cliente veria erro numa exclusão que funcionou, e tentaria de novo contra
 * uma linha que não existe mais.
 *
 * O preço é o arquivo órfão, e ele é aceitável: ocupa disco e não aparece em
 * lugar nenhum. O log é o que permite achá-lo depois.
 */
export async function apagar(relativo: string | null | undefined): Promise<void> {
  if (!relativo) return;

  try {
    await fs.unlink(caminhoAbsoluto(relativo));
  } catch (error) {
    const codigo = (error as NodeJS.ErrnoException).code;
    // Já não estava lá: é o estado desejado, não uma falha.
    if (codigo === 'ENOENT') return;
    logger.warn(`[Storage] Arquivo órfão: falha ao apagar ${relativo}.`, { codigo });
  }
}

/** Para o boot dizer onde os arquivos estão, em vez de deixar adivinhar. */
export function diretorioDeUpload(): string {
  return raiz();
}
