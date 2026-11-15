import { userInfo } from 'node:os';
import { pathToFileURL } from 'node:url';
import { closeDatabase, prisma } from '../../../infra/database/prismaClient';
import { createLogger } from '../../../infra/logger/logger';
import { recordAudit } from '../../audit/use-cases/record-audit.usecase';
import { sanitizeHwid, shortHwid } from '../../endpoint/helpers/hwid.helper';

// REVOGAR O TOKEN DE UMA MÁQUINA (CR) — a máquina roubada, o disco que saiu da
// empresa, o agente que não deveria estar ali.
//
// Apaga a credencial: a partir da próxima conexão, o `/agent-hub` responde 401
// àquele token. O agente não volta sozinho, porque ele apaga o segredo de
// instalação depois de usar; voltar é reinstalar com o segredo.
//
// A CONEXÃO ABERTA NÃO CAI AGORA. O hub confere o token na abertura, e o comando
// roda fora do processo do servidor, sem acesso ao socket. Para cortar na hora,
// reinicie o servidor depois de revogar: todas as conexões fecham, e a revogada
// não abre de novo.
//
// Linha de comando, e não botão no painel, pelo mesmo motivo do
// `criar-administrador.cli.ts`: quem revoga tem o servidor nas mãos.
//
// USO:
//   bun run agente:revogar <hwid>

const logger = createLogger('cli:agente');

const USO = 'Uso: bun run agente:revogar <hwid>';

function usuarioDoTerminal(): string {
  try {
    return userInfo().username;
  } catch {
    return process.env.USER ?? `uid ${process.getuid?.() ?? '?'}`;
  }
}

/** Apaga a credencial do HWID. Devolve `false` quando não havia nenhuma. */
export async function revogarAgente(hwidBruto: string, origem = `cli:revogar-agente:${usuarioDoTerminal()}`): Promise<boolean> {
  const hwid = sanitizeHwid(hwidBruto);
  const maquina = await prisma.endpoint.findUnique({ where: { hwid }, select: { id: true, hostname: true } });

  return prisma.$transaction(async (tx) => {
    const { count } = await tx.agentCredential.deleteMany({ where: { hwid } });
    if (count === 0) return false;

    // Na história da MÁQUINA, quando ela existe. A credencial que nunca mandou
    // handshake não tem máquina no painel nem id a que a linha pertença
    // (`audit_logs_registro_com_id`): dela fica a linha do log do comando.
    if (maquina) {
      await recordAudit(tx, {
        entityType: 'Endpoint',
        entityId: maquina.id,
        entityLabel: maquina.hostname,
        action: 'DELETE',
        // O que saiu foi a credencial, não a máquina: o retrato diz isso, sem o hash.
        changes: { credencialDoAgente: 'revogada' },
      }, { tipo: 'SYSTEM', origem });
    }
    return true;
  });
}

async function executar(): Promise<void> {
  // O `--` que o npm pede antes dos argumentos pode chegar até aqui: não é o HWID.
  const [hwid, ...sobra] = process.argv.slice(2).filter((argumento) => argumento !== '--');
  if (!hwid || sobra.length > 0) throw new Error(USO);

  if (await revogarAgente(hwid)) {
    logger.warn(`[Agente] Token de ${shortHwid(hwid)} revogado. A conexão aberta, se houver, cai quando o servidor reiniciar.`);
  } else {
    logger.warn(`[Agente] ${shortHwid(hwid)} não tem token: nada a revogar.`);
  }
}

const executadoDireto =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;

if (executadoDireto) {
  executar()
    .catch((erro: unknown) => {
      logger.error(`[Agente] ${erro instanceof Error ? erro.message : String(erro)}`);
      process.exitCode = 1;
    })
    .finally(closeDatabase);
}
