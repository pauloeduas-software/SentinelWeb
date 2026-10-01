import fs from 'fs/promises';
import path from 'path';
import { createLogger } from '../../../core/logger/logger';
import { diretorioDeBackup } from '../helpers/backup-dir.helper';

const logger = createLogger('backup.list');

export interface DumpNoDisco {
  nome: string;
  sizeBytes: number;
  criadoEm: Date;
}

/**
 * Os dumps que estão no disco — a VERDADE é o diretório, não uma tabela.
 *
 * POR QUE NÃO EXISTE TABELA `Backup`: ela seria a segunda fonte de verdade
 * sobre um arquivo (D16 aplicado ao disco), e divergiria no primeiro `rm` que
 * alguém der no servidor para liberar espaço — a tela ofereceria o download de
 * um dump que não existe mais. Pior: um dump RESTAURADO traz de volta a tabela
 * do backup, então a lista passaria a descrever o disco de outro dia.
 *
 * Pasta inexistente devolve lista vazia, e não erro: antes do primeiro backup é
 * exatamente isso que ela é.
 */
export async function listBackups(): Promise<DumpNoDisco[]> {
  const base = diretorioDeBackup();

  let nomes: string[];
  try {
    nomes = await fs.readdir(base);
  } catch (erro) {
    const codigo = (erro as NodeJS.ErrnoException).code;
    if (codigo === 'ENOENT') return [];
    throw erro;
  }

  const dumps: DumpNoDisco[] = [];

  for (const nome of nomes) {
    if (!nome.endsWith('.dump')) continue;

    try {
      const info = await fs.stat(path.join(base, nome));
      if (!info.isFile()) continue;
      dumps.push({ nome, sizeBytes: info.size, criadoEm: info.mtime });
    } catch (erro) {
      // Arquivo que sumiu entre o `readdir` e o `stat` não é falha da listagem:
      // ele já não está lá, que é o estado que a resposta descreve.
      logger.warn(`[Backup] Dump desapareceu durante a listagem: ${nome}.`, {
        codigo: (erro as NodeJS.ErrnoException).code,
      });
    }
  }

  // Mais novo primeiro: é o que alguém quer baixar depois de criar.
  return dumps.sort((a, b) => b.criadoEm.getTime() - a.criadoEm.getTime());
}
