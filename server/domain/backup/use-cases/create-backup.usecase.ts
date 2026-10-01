import { execFile } from 'child_process';
import fs from 'fs/promises';
import path from 'path';
import { promisify } from 'util';
import { getDatabaseUrl } from '../../../core/config/env';
import { AppError } from '../../../core/errors/app-error';
import { createLogger } from '../../../core/logger/logger';
import { diretorioDeBackup, nomeDeAgora } from '../helpers/backup-dir.helper';
import { pruneBackups, type ExpurgoDeBackup } from './prune-backups.usecase';

const logger = createLogger('backup.create');
const executar = promisify(execFile);

// O DUMP — `pg_dump -Fc`, pelo caminho que não dá para injetar comando.
//
// ═════════════════════════════════════════════════════════════════════════════
// `execFile` E NUNCA `exec`.
//
// `exec` entrega a string a um SHELL. Com ela, qualquer pedaço do comando que
// venha de dado — e aqui vem: host, porta, usuário e nome do banco saem da
// `DATABASE_URL` — carrega `;`, `&&` e `$(...)` para dentro de um processo que
// roda como o dono da aplicação. `execFile` recebe um ARRAY de argumentos e não
// abre shell nenhum: um `;` num nome de banco é um caractere do nome.
//
// E A SENHA NÃO VAI NO ARGV. Passar a URL inteira como argumento posicional
// (`pg_dump "postgresql://user:senha@host/db"`) funciona e deixa a senha
// visível para qualquer `ps` da máquina, inclusive de outro usuário. Ela vai em
// `PGPASSWORD`, no ambiente do FILHO — que não é listável por outro processo.
// ═════════════════════════════════════════════════════════════════════════════

/** Dez minutos. Um dump de banco pequeno leva segundos; o teto é contra o travado. */
const TIMEOUT_MS = 10 * 60 * 1000;

/** Quanto de `stderr` vai para a mensagem do erro. O resto vai para o log. */
const MAX_STDERR_NA_MENSAGEM = 400;

export interface BackupCriado {
  nome: string;
  sizeBytes: number;
  criadoEm: Date;
  /** O expurgo que rodou junto — retenção é parte de fazer backup, não um botão. */
  expurgo: ExpurgoDeBackup;
}

/**
 * Os argumentos do `pg_dump`, montados a partir da `DATABASE_URL`.
 *
 * `--no-owner` e `--no-privileges`: um dump que carrega dono e GRANT só
 * restaura num servidor que tenha os MESMOS papéis — e restaurar em outra
 * máquina é metade da razão de existir um backup.
 */
function argumentosDoDump(destino: string): { args: string[]; senha: string; host: string } {
  const url = new URL(getDatabaseUrl());
  // `pathname` é `/sentineldb`; o banco é o que vem depois da barra.
  const banco = decodeURIComponent(url.pathname.replace(/^\//, ''));

  if (!banco) {
    throw new AppError('DATABASE_URL não aponta para um banco: o backup não tem o que copiar.', 500);
  }

  return {
    host: url.hostname,
    senha: decodeURIComponent(url.password),
    args: [
      '--format=custom',
      '--no-owner',
      '--no-privileges',
      '--file', destino,
      '--host', url.hostname,
      '--port', url.port || '5432',
      '--username', decodeURIComponent(url.username),
      '--dbname', banco,
    ],
  };
}

/**
 * Traduz a falha do `pg_dump` em frase que ensina o que fazer.
 *
 * As duas que acontecem de verdade:
 *
 * - **binário ausente** (`ENOENT`): o `pg_dump` não está no servidor. É o caso
 *   normal num contêiner de aplicação Node, que não traz cliente de Postgres.
 * - **versão do cliente menor que a do servidor**: o `pg_dump` RECUSA o dump,
 *   com uma mensagem que fala de "server version mismatch" e que ninguém
 *   relaciona com "instale a versão certa".
 */
function traduzirFalha(erro: unknown, host: string): AppError {
  const codigo = (erro as NodeJS.ErrnoException).code;
  const stderr = String((erro as { stderr?: unknown }).stderr ?? '');

  if (codigo === 'ENOENT') {
    return new AppError(
      'O utilitário pg_dump não está instalado neste servidor. Instale o cliente do PostgreSQL '
        + 'na MESMA versão principal do servidor de banco, ou aponte PG_DUMP_BIN para o executável.',
      503,
    );
  }

  if (/server version|version mismatch/i.test(stderr)) {
    return new AppError(
      `A versão do pg_dump deste servidor é mais antiga que a do banco em ${host}. `
        + 'Um cliente mais antigo recusa o dump: instale o cliente na mesma versão principal do servidor.',
      503,
      { stderr: stderr.slice(0, MAX_STDERR_NA_MENSAGEM) },
    );
  }

  if (codigo === 'ETIMEDOUT') {
    return new AppError(
      `O dump passou de ${TIMEOUT_MS / 60000} minutos e foi interrompido. `
        + 'Rode o backup por fora da interface para um banco deste tamanho.',
      504,
    );
  }

  return new AppError(
    `O pg_dump falhou. ${stderr.slice(0, MAX_STDERR_NA_MENSAGEM) || 'Sem saída de erro.'}`,
    500,
  );
}

/**
 * Cria um dump e roda o expurgo da retenção.
 *
 * A ORDEM IMPORTA: o expurgo roda DEPOIS de o dump novo estar no disco. Antes,
 * uma retenção curta apagaria o penúltimo backup para em seguida falhar ao
 * criar o novo — e o sistema terminaria com menos backup do que começou.
 *
 * O ARQUIVO PARCIAL É APAGADO na falha. O `pg_dump -Fc` cria o arquivo e
 * escreve nele enquanto trabalha: interrompido, ele deixa um `.dump` truncado
 * que a listagem mostraria ao lado dos válidos, com tamanho plausível e sem
 * nada que o distinga — e alguém restauraria esse.
 */
export async function createBackup(): Promise<BackupCriado> {
  const base = diretorioDeBackup();
  await fs.mkdir(base, { recursive: true });

  const nome = nomeDeAgora();
  const destino = path.join(base, nome);
  const { args, senha, host } = argumentosDoDump(destino);
  const binario = process.env.PG_DUMP_BIN?.trim() || 'pg_dump';

  try {
    await executar(binario, args, {
      timeout: TIMEOUT_MS,
      // `-Fc` com `--file` não escreve no stdout; o teto é só contra o
      // inesperado virar consumo de memória.
      maxBuffer: 1024 * 1024,
      env: { ...process.env, PGPASSWORD: senha },
    });
  } catch (erro) {
    await fs.rm(destino, { force: true });
    logger.error('[Backup] pg_dump falhou.', erro, { host, binario });
    throw traduzirFalha(erro, host);
  }

  const info = await fs.stat(destino);
  logger.info(`[Backup] Dump criado: ${nome} (${info.size} bytes).`);

  return {
    nome,
    sizeBytes: info.size,
    criadoEm: info.mtime,
    expurgo: await pruneBackups(),
  };
}
