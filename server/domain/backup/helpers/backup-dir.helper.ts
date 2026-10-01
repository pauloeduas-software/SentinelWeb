import path from 'path';
import { diretorioDeUpload } from '../../../core/storage/storage';

// ONDE O DUMP MORA, E POR QUE ISSO É UMA PERGUNTA DE SEGURANÇA.
//
// Um dump do Postgres é o banco INTEIRO em um arquivo: toda chave de licença
// cifrada, todo hash de senha, todo custo de compra, o `cryptoCanary`. É o
// arquivo mais valioso do servidor, e por isso ele não pode cair em nenhuma
// raiz servida como estático.
//
// O GUARD DE SESSÃO LIBERA, EM PRODUÇÃO, TODO `GET` FORA DE `/api`
// (core/http/require-auth.ts, `estaticoPublico`). Então um dump dentro de
// `dist/` seria baixável por quem soubesse o nome — sem sessão, em produção, e
// SÓ em produção, que é o pior dos casos porque em desenvolvimento ninguém
// veria. É o mesmo raciocínio do D84, que tirou os anexos de uma rota estática.

/** Onde a pasta fica quando ninguém diz. Relativa ao diretório do processo. */
const PADRAO = 'backups';

/** O nome que `createBackup` gera. Nada aqui vem do cliente. */
const NOME_DO_DUMP = /^sentinel-\d{8}-\d{6}\.dump$/;

export function diretorioDeBackup(): string {
  return path.resolve(process.env.BACKUP_DIR?.trim() || PADRAO);
}

/**
 * O backup está ligado?
 *
 * DESLIGADO POR PADRÃO, e a decisão é da Etapa A da F10: baixar um backup é
 * baixar o banco inteiro, e enquanto a permissão por módulo não existir (F11)
 * quem tem sessão tem tudo. Uma variável de ambiente é a trava mais honesta
 * disponível hoje — quem liga sabe o que está ligando.
 */
export function backupHabilitado(): boolean {
  const valor = process.env.BACKUP_ENABLED?.trim().toLowerCase();
  return valor === '1' || valor === 'true';
}

/**
 * Recusa configuração que exporia o dump. Roda no registro das rotas, e só
 * quando o backup está ligado.
 *
 * Falhar no BOOT e não na primeira requisição é a escolha do `validateEnv`: uma
 * pasta de dump mal colocada é o tipo de erro que ninguém descobre por uso — ela
 * funciona perfeitamente e vaza em silêncio.
 */
export function assertDiretorioSeguro(): void {
  const destino = diretorioDeBackup();
  const proibidos = [
    { caminho: path.resolve(process.cwd(), 'dist'), motivo: 'o frontend buildado é servido como estático' },
    { caminho: diretorioDeUpload(), motivo: 'é a raiz dos anexos' },
    { caminho: path.resolve(process.cwd(), 'public'), motivo: 'é servido pelo Vite em desenvolvimento' },
  ];

  for (const { caminho, motivo } of proibidos) {
    // `caminho + sep` e não só `caminho`: sem o separador, uma pasta vizinha
    // chamada `dist-backups` casaria no `startsWith`.
    if (destino === caminho || destino.startsWith(caminho + path.sep)) {
      throw new Error(
        `BACKUP_DIR não pode ficar dentro de ${caminho} — ${motivo}. ` +
          'Um dump do Postgres é o banco inteiro em um arquivo: aponte BACKUP_DIR para fora do projeto.',
      );
    }
  }
}

/**
 * O caminho absoluto de um dump, CONFERIDO duas vezes.
 *
 * O nome chega pela URL (`/api/backups/:nome/download`), então ele é entrada do
 * cliente — e as duas conferências cobrem coisas diferentes: o regex garante
 * que o nome tem a FORMA que nós geramos, e a comparação de prefixo garante que
 * o caminho resolvido não saiu da pasta. Sem a segunda, um nome que casasse o
 * regex já seria seguro — mas a garantia tem de valer mesmo se o regex mudar.
 */
export function caminhoDoDump(nome: string): string | null {
  if (!NOME_DO_DUMP.test(nome)) return null;

  const base = diretorioDeBackup();
  const destino = path.resolve(base, nome);
  if (!destino.startsWith(base + path.sep)) return null;

  return destino;
}

/** O nome de um dump novo: `sentinel-20261001-143005.dump`, em UTC. */
export function nomeDeAgora(agora: Date = new Date()): string {
  const iso = agora.toISOString();
  const dia = iso.slice(0, 10).replace(/-/g, '');
  const hora = iso.slice(11, 19).replace(/:/g, '');
  return `sentinel-${dia}-${hora}.dump`;
}
