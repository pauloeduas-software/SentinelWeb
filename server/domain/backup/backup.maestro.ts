import type { FastifyInstance } from 'fastify';
import { createLogger } from '../../core/logger/logger';
import { DESTRUCTIVE_RATE_LIMIT, WRITE_RATE_LIMIT } from '../../core/http/write-rate-limit';
import { backupController } from './controllers/backup.controller';
import {
  assertDiretorioSeguro, backupHabilitado, diretorioDeBackup,
} from './helpers/backup-dir.helper';

const logger = createLogger('backup.maestro');

// BACKUP DO BANCO (F10, Etapa A) — e ele nasce DESLIGADO.
//
// ═════════════════════════════════════════════════════════════════════════════
// AS ROTAS NEM EXISTEM QUANDO `BACKUP_ENABLED` ESTÁ DESLIGADO.
//
// Não é um `if` dentro do handler devolvendo 403: é o `setupRoutes` não
// registrando nada. A diferença importa — uma rota que existe e recusa continua
// sendo superfície (ela revela que o recurso existe, consome o rate limit e
// vira o lugar onde alguém, um dia, afrouxa a condição para "testar"). Sem
// registro, a resposta é o 404 do notFoundHandler, igual a qualquer caminho
// inexistente.
//
// POR QUE DESLIGADO POR PADRÃO: baixar um backup é baixar O BANCO INTEIRO —
// hash de senha, chave de licença cifrada, custo de compra, o canário da
// cifra. Enquanto a permissão por módulo não existir (F11), quem tem sessão tem
// tudo, e a sessão de um estagiário vale o mesmo que a do administrador. Na F11
// esta rota entra atrás da permissão de dado sensível e a variável deixa de ser
// a única trava.
// ═════════════════════════════════════════════════════════════════════════════
export class BackupMaestro {
  static async setupRoutes(server: FastifyInstance): Promise<void> {
    if (!backupHabilitado()) {
      logger.info('[Maestro] Backup DESLIGADO (BACKUP_ENABLED). Nenhuma rota registrada.');
      return;
    }

    // Falha no BOOT, e não na primeira requisição: `BACKUP_DIR` dentro de uma
    // raiz estática funciona perfeitamente e vaza em silêncio.
    assertDiretorioSeguro();

    server.get('/api/backups', backupController.list);

    // `DESTRUCTIVE_RATE_LIMIT` (10/min) nas duas pontas, e nenhuma delas apaga
    // nada: criar um dump é a operação mais CARA do sistema (lê o banco
    // inteiro), e baixá-lo é a que mais DADO move de uma vez. O teto de escrita
    // normal, de 40/min, seria quarenta cópias do banco por minuto.
    server.post('/api/backups', DESTRUCTIVE_RATE_LIMIT, backupController.create);
    server.get('/api/backups/:nome/download', DESTRUCTIVE_RATE_LIMIT, backupController.download);

    // O expurgo é escrita comum: ele só apaga o que a retenção já condenou.
    server.post('/api/backups/prune', WRITE_RATE_LIMIT, backupController.prune);

    logger.warn(`[Maestro] Backup LIGADO. Dumps em ${diretorioDeBackup()}.`);
  }
}
