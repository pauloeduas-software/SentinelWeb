import { Client, type Entry } from 'ldapts';
import { prisma } from '../../../core/database/prismaClient';
import { AppError } from '../../../core/errors/app-error';
import { createLogger } from '../../../core/logger/logger';
import { recordActivity } from '../../activity/use-cases/record-activity.usecase';
import { lerConfiguracaoLdap, type ConfiguracaoLdap } from '../helpers/directory-config.helper';

// A SINCRONIZAÇÃO COM O DIRETÓRIO (F11, Etapa I — D78).
//
// ═════════════════════════════════════════════════════════════════════════════
// "LDAP SINCRONIZA; OIDC AUTENTICA; NINGUÉM ENTRA SEM CADASTRO."
//
// Este arquivo faz a PRIMEIRA parte, e só ela: ele não autentica ninguém, não lê
// senha e não valida credencial. Ele traz dados de pessoas do diretório para
// dentro do inventário, para que o equipamento tenha a quem ser entregue sem
// alguém redigitar trezentos nomes.
//
// AS TRÊS REGRAS QUE ELE NÃO QUEBRA:
//
// 1. **Sumir do diretório MARCA para revisão, nunca desliga.** Um filtro LDAP mal
//    escrito, uma OU renomeada ou um controlador fora do ar devolvem "zero
//    pessoas" — e um job que desligasse por isso devolveria o inventário da
//    empresa ao estoque numa madrugada, com `terminatedAt` em todo mundo e
//    checkin em massa de cada posse aberta (é o que o desligamento faz, F11
//    Etapa G). A marca é uma data numa coluna; a decisão é de uma pessoa.
//
// 2. **E-mail que já existe como conta LOCAL não é fundido.** Fundir seria deixar
//    quem controla um e-mail no diretório herdar uma conta criada aqui — com os
//    grupos dela. O caso vira CONFLITO no resultado, e o vínculo é explícito
//    (`PUT /api/users/:id/auth-source`).
//
// 3. **Nada aqui cria credencial.** A pessoa importada não tem senha e não tem
//    token: ela existe para RECEBER equipamento. Entrar no painel depende de SSO
//    (Etapa I) ou de alguém definir uma senha — que é o estado em que a base
//    nasceu, e continua sendo o padrão.
// ═════════════════════════════════════════════════════════════════════════════

const logger = createLogger('ldap-sync');

/** O que o job e a rota manual devolvem. Números, não linhas: a lista é o log. */
export interface ResultadoDaSincronizacao {
  /** Entradas que o diretório devolveu. */
  lidas: number;
  criados: number;
  atualizados: number;
  /** Casados por e-mail e amarrados ao `externalId` pela primeira vez. */
  vinculados: number;
  /** Deixaram de aparecer: ganharam `directoryMissingAt`. NÃO foram desligados. */
  marcados: number;
  /** Voltaram a aparecer: a marca saiu. */
  desmarcados: number;
  /** O que o job NÃO resolve sozinho, com o motivo de cada um. */
  conflitos: { identificacao: string; motivo: string }[];
}

/**
 * Os atributos que pedimos — e a lista é curta de propósito.
 *
 * O diretório sabe muito mais do que isto (gerente, sala, foto, grupos) e nada
 * disso entra: `managerId` aqui é a hierarquia DO INVENTÁRIO, que alguém decide
 * (D72), e grupo de diretório não é grupo de permissão — mapear os dois
 * automaticamente faria o acesso ao inventário mudar quando o AD mudar, sem
 * ninguém ter decidido isso. O que vem é identidade: nome, e-mail, matrícula,
 * cargo, telefone.
 */
const ATRIBUTOS = [
  'objectGUID', 'entryUUID',
  'mail', 'userPrincipalName',
  'displayName', 'cn',
  'employeeID', 'employeeNumber',
  'title', 'telephoneNumber', 'mobile',
];

/** Atributos que vêm como bytes e não como texto — o GUID do AD é um deles. */
const BINARIOS = ['objectGUID'];

/** O primeiro valor de um atributo, como texto limpo — ou `null`. */
function texto(entry: Entry, ...nomes: string[]): string | null {
  for (const nome of nomes) {
    const bruto = entry[nome];
    const valor = Array.isArray(bruto) ? bruto[0] : bruto;
    if (typeof valor === 'string' && valor.trim() !== '') return valor.trim();
  }
  return null;
}

/**
 * O identificador ESTÁVEL da pessoa no diretório.
 *
 * Três tentativas, em ordem de estabilidade:
 *
 * 1. `objectGUID` (Active Directory) — bytes. Vira hexadecimal, sem tentar
 *    remontar a ordem mista do formato de GUID da Microsoft: o valor só precisa
 *    ser ESTÁVEL e único, não bonito. Reinterpretá-lo criaria um segundo formato
 *    para o mesmo dado e um dia alguém compararia os dois.
 * 2. `entryUUID` (OpenLDAP) — texto, e já é estável.
 * 3. a **DN**, como último recurso.
 *
 * ⚠️ O recurso 3 tem uma consequência escrita: DN muda quando a pessoa é movida
 * de OU. Quando isso acontece, a sincronização seguinte não a encontra pelo
 * identificador, cai no casamento por e-mail e RE-VINCULA (ela aparece em
 * `vinculados`). Nada é duplicado, porque o e-mail é único — mas o número de
 * vínculos num dia diz que o diretório não expõe GUID, e é esse o sinal.
 */
function identificadorDoDiretorio(entry: Entry): string | null {
  const bruto = entry.objectGUID;
  const bytes = Array.isArray(bruto) ? bruto[0] : bruto;
  if (Buffer.isBuffer(bytes)) return `guid:${bytes.toString('hex')}`;

  const uuid = texto(entry, 'entryUUID');
  if (uuid) return `uuid:${uuid.toLowerCase()}`;

  return entry.dn ? `dn:${entry.dn.toLowerCase()}` : null;
}

export interface PessoaDoDiretorio {
  externalId: string;
  email: string;
  name: string;
  employeeNumber: string | null;
  jobTitle: string | null;
  phone: string | null;
}

/**
 * O que o diretório devolveu, traduzido para o vocabulário do inventário.
 *
 * EXPORTADA para o teste, e isto é deliberado: ela é a única parte deste arquivo
 * que dá para exercitar sem um controlador de domínio de pé — e é onde moram as
 * decisões que erram na prática (qual atributo vira e-mail, o que fazer com o
 * GUID em bytes, o que descartar). O mesmo critério que exportou `unirPermissoes`
 * do `effective-permissions.usecase.ts`.
 *
 * Devolve `null` para a entrada que não serve, em vez de lançar: um objeto de
 * serviço sem e-mail no meio de mil pessoas não pode derrubar a rodada.
 */
export function traduzirEntradaDoDiretorio(entry: Entry): PessoaDoDiretorio | null {
  const externalId = identificadorDoDiretorio(entry);
  // `mail` antes de `userPrincipalName`: os dois existem no AD e o segundo é o
  // login, que pode ser `f.silva@tenant.onmicrosoft.com` — endereço que ninguém
  // lê. Sem nenhum dos dois, a pessoa não entra: e-mail é o que o sistema usa
  // para avisar de atraso e mandar termo de aceite.
  const email = texto(entry, 'mail', 'userPrincipalName')?.toLowerCase() ?? null;
  const name = texto(entry, 'displayName', 'cn');

  if (!externalId || !email || !name) return null;

  return {
    externalId,
    email,
    name,
    employeeNumber: texto(entry, 'employeeID', 'employeeNumber'),
    jobTitle: texto(entry, 'title'),
    phone: texto(entry, 'telephoneNumber', 'mobile'),
  };
}

/**
 * Busca as pessoas no diretório.
 *
 * `paged: true` NÃO é otimização: o Active Directory corta a resposta em 1000
 * entradas por padrão (`MaxPageSize`), e sem paginação a sincronização de uma
 * empresa de 1200 pessoas traria 1000 — e marcaria as outras 200 como ausentes do
 * diretório. Um defeito que só aparece depois de a empresa crescer.
 *
 * O `unbind` fica no `finally` porque a conexão é um socket: um `throw` no meio
 * do `search` deixaria o descritor aberto até o timeout do servidor, e um job
 * que roda todo dia acumularia conexões no controlador de domínio.
 */
async function buscarNoDiretorio(config: ConfiguracaoLdap): Promise<Entry[]> {
  const client = new Client({
    url: config.url,
    timeout: config.timeoutSegundos * 1000,
    connectTimeout: config.timeoutSegundos * 1000,
  });

  try {
    await client.bind(config.bindDN, config.bindPassword);
    const { searchEntries } = await client.search(config.baseDN, {
      scope: 'sub',
      filter: config.filter,
      attributes: ATRIBUTOS,
      explicitBufferAttributes: BINARIOS,
      paged: true,
    });
    return searchEntries;
  } finally {
    await client.unbind().catch(() => undefined);
  }
}

/** Os campos que o diretório manda — e que uma edição local não deve "ganhar". */
function camposDoDiretorio(pessoa: PessoaDoDiretorio) {
  return {
    name: pessoa.name,
    // Os três só sobrescrevem quando o diretório TEM valor: um `title` vazio no
    // AD não pode apagar o cargo que alguém preencheu à mão aqui. Ausência no
    // diretório é falta de informação, não ordem de apagar.
    ...(pessoa.employeeNumber ? { employeeNumber: pessoa.employeeNumber } : {}),
    ...(pessoa.jobTitle ? { jobTitle: pessoa.jobTitle } : {}),
    ...(pessoa.phone ? { phone: pessoa.phone } : {}),
  };
}

/**
 * Roda a sincronização inteira.
 *
 * SEM UMA TRANSAÇÃO ÚNICA EM VOLTA DE TUDO, e isso é decisão: mil pessoas numa
 * transação só é uma transação longa segurando linhas de `users` enquanto o
 * painel opera — e, se a entrada 999 falhar (uma matrícula duplicada no
 * diretório), as 998 anteriores voltam atrás por causa de um dado que não é
 * nosso. Cada pessoa é a sua própria unidade, e o que falha vira CONFLITO no
 * relatório em vez de derrubar a rodada.
 */
export async function sincronizarComLdap(): Promise<ResultadoDaSincronizacao> {
  const config = lerConfiguracaoLdap();
  if (!config) {
    throw new AppError(
      'Sincronização com diretório não configurada. Defina LDAP_URL, LDAP_BIND_DN, '
      + 'LDAP_BIND_PASSWORD e LDAP_BASE_DN no ambiente do servidor.',
      409,
    );
  }

  const resultado: ResultadoDaSincronizacao = {
    lidas: 0, criados: 0, atualizados: 0, vinculados: 0, marcados: 0, desmarcados: 0, conflitos: [],
  };

  const entradas = await buscarNoDiretorio(config);
  resultado.lidas = entradas.length;

  // A RODADA VAZIA NÃO MARCA NINGUÉM, e esta é a guarda mais importante do
  // arquivo. Zero entradas quase nunca significa "a empresa não tem ninguém":
  // significa filtro errado, base DN errada, bind sem permissão de leitura. Marcar
  // a frota inteira para revisão por causa disso transformaria um erro de
  // configuração numa planilha de 1200 linhas para alguém conferir à mão.
  if (entradas.length === 0) {
    logger.warn(
      '[LDAP] O diretório devolveu ZERO entradas. Nenhuma pessoa foi marcada para revisão — '
      + 'confira LDAP_BASE_DN e LDAP_FILTER.',
    );
    return resultado;
  }

  const vistos = new Set<string>();

  for (const entry of entradas) {
    const pessoa = traduzirEntradaDoDiretorio(entry);
    if (!pessoa) {
      resultado.conflitos.push({
        identificacao: String(entry.dn ?? '(sem dn)'),
        motivo: 'Entrada sem identificador estável, sem e-mail ou sem nome.',
      });
      continue;
    }

    vistos.add(pessoa.externalId);

    try {
      // Casa primeiro pelo identificador: é o único campo que não muda quando a
      // pessoa troca de nome ou de endereço.
      const porId = await prisma.user.findFirst({
        where: { externalId: pessoa.externalId },
        select: { id: true, directoryMissingAt: true },
      });

      if (porId) {
        await prisma.user.update({
          where: { id: porId.id },
          data: {
            ...camposDoDiretorio(pessoa),
            email: pessoa.email,
            directorySyncedAt: new Date(),
            directoryMissingAt: null,
          },
        });
        resultado.atualizados += 1;
        if (porId.directoryMissingAt) resultado.desmarcados += 1;
        continue;
      }

      // Não achou pelo id: tenta o e-mail. É o caminho do PRIMEIRO encontro com
      // alguém que já estava cadastrado aqui.
      const porEmail = await prisma.user.findFirst({
        where: { email: pessoa.email },
        select: { id: true, authSource: true, externalId: true },
      });

      if (porEmail) {
        // CONTA LOCAL NÃO É FUNDIDA (D78). O e-mail bate, e isso não basta: quem
        // controla o e-mail no diretório herdaria os grupos da conta local.
        if (porEmail.authSource === 'LOCAL') {
          resultado.conflitos.push({
            identificacao: pessoa.email,
            motivo: 'Já existe uma conta LOCAL com este e-mail. Vincule explicitamente '
              + '(Usuários › Acesso › origem da identidade) antes de sincronizar.',
          });
          continue;
        }

        await prisma.user.update({
          where: { id: porEmail.id },
          data: {
            ...camposDoDiretorio(pessoa),
            externalId: pessoa.externalId,
            directorySyncedAt: new Date(),
            directoryMissingAt: null,
          },
        });
        resultado.vinculados += 1;
        continue;
      }

      // Ninguém: nasce uma pessoa, SEM credencial.
      const criado = await prisma.user.create({
        data: {
          ...camposDoDiretorio(pessoa),
          email: pessoa.email,
          externalId: pessoa.externalId,
          authSource: 'LDAP',
          directorySyncedAt: new Date(),
        },
        select: { id: true },
      });

      // O `ActivityLog` com ator NULO é o fato: quem agiu foi o job, não uma
      // pessoa. A coluna é nulável desde a F0 exatamente para isto, e é o que
      // permite responder "de onde veio este cadastro?" seis meses depois.
      await recordActivity(prisma, {
        entityType: 'User',
        entityId: criado.id,
        action: 'CREATE',
        changes: { fonte: 'LDAP', email: pessoa.email, externalId: pessoa.externalId },
      }, null);

      resultado.criados += 1;
    } catch (erro) {
      // Uma entrada ruim não derruba a rodada. O caso real: matrícula duplicada
      // no diretório (P2002 do índice parcial de `employeeNumber`) — que é
      // problema de lá e tem de aparecer como conflito, não como job quebrado.
      resultado.conflitos.push({
        identificacao: pessoa.email,
        motivo: erro instanceof Error ? erro.message : String(erro),
      });
    }
  }

  // ── A MARCA DE REVISÃO (D78) ──────────────────────────────────────────────
  //
  // Quem veio do diretório, está ativo, não está na lixeira e NÃO apareceu nesta
  // rodada. `updateMany` com `directoryMissingAt: null` no `where`: a data é a do
  // PRIMEIRO desaparecimento, e reescrevê-la a cada rodada apagaria exatamente a
  // informação que ela carrega ("some há quantos dias?").
  const { count } = await prisma.user.updateMany({
    where: {
      authSource: { in: ['LDAP', 'OIDC'] },
      externalId: { notIn: [...vistos] },
      isActive: true,
      directoryMissingAt: null,
      // `externalId` nulo é quem nunca foi vinculado — não "desapareceu".
      NOT: { externalId: null },
    },
    data: { directoryMissingAt: new Date() },
  });
  resultado.marcados = count;

  logger.info(
    `[LDAP] ${resultado.lidas} lidas · ${resultado.criados} criadas · ${resultado.atualizados} atualizadas · `
    + `${resultado.vinculados} vinculadas · ${resultado.marcados} marcadas para revisão · `
    + `${resultado.conflitos.length} conflitos.`,
  );

  return resultado;
}
