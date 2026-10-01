import fs from 'fs/promises';
import path from 'path';
import { createLogger } from '../../../core/logger/logger';
import { lerConfiguracaoDoSistema } from '../../settings/helpers/system-settings.helper';
import { diretorioDeBackup } from '../helpers/backup-dir.helper';
import { listBackups } from './list-backups.usecase';

const logger = createLogger('backup.prune');

export interface ExpurgoDeBackup {
  /** Quantos dias de dump a política manda guardar. */
  retentionDays: number;
  apagados: string[];
  /** Quantos ficaram. Sai na resposta para a tela não precisar listar de novo. */
  restantes: number;
}

/**
 * Apaga o que passou da retenção.
 *
 * POR QUE O EXPURGO TEM NOME PRÓPRIO E ROTA: sem ele, "backup pela interface" é
 * uma forma lenta de encher o volume do servidor — e o primeiro sintoma não é
 * um aviso de disco, é o Postgres parando de aceitar escrita. Um dump por dia de
 * um banco de 2 GB são 60 GB em dois meses.
 *
 * NUNCA APAGA O MAIS RECENTE, mesmo que ele já tenha passado da retenção. Uma
 * retenção de 1 dia com o último dump de três dias atrás deixaria o sistema SEM
 * backup nenhum depois do expurgo — e é justamente quando o backup está
 * atrasado que não se pode jogar fora o único que existe.
 */
export async function pruneBackups(): Promise<ExpurgoDeBackup> {
  const { backupRetentionDays } = await lerConfiguracaoDoSistema();
  const dumps = await listBackups();

  const corte = new Date();
  corte.setUTCDate(corte.getUTCDate() - backupRetentionDays);

  // `slice(1)` protege o mais recente (a lista vem do mais novo para o mais
  // velho). Com um dump só, não há nada a expurgar.
  const candidatos = dumps.slice(1).filter((dump) => dump.criadoEm < corte);
  const apagados: string[] = [];

  for (const dump of candidatos) {
    try {
      await fs.unlink(path.join(diretorioDeBackup(), dump.nome));
      apagados.push(dump.nome);
    } catch (erro) {
      // Apagar é sempre best-effort: o arquivo pode ter saído por fora. O que
      // não pode é a falha derrubar a criação do backup que chamou o expurgo.
      logger.warn(`[Backup] Falha ao expurgar ${dump.nome}.`, {
        codigo: (erro as NodeJS.ErrnoException).code,
      });
    }
  }

  if (apagados.length > 0) {
    logger.info(`[Backup] Expurgo: ${apagados.length} dump(s) acima de ${backupRetentionDays} dia(s).`);
  }

  return {
    retentionDays: backupRetentionDays,
    apagados,
    restantes: dumps.length - apagados.length,
  };
}
