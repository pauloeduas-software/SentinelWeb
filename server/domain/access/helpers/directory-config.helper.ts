import { createLogger } from '../../../core/logger/logger';

// A CONFIGURAÇÃO DO DIRETÓRIO E DO SSO (F11, Etapa I).
//
// ═════════════════════════════════════════════════════════════════════════════
// POR QUE EM VARIÁVEL DE AMBIENTE, E NÃO NO `AppSetting` COMO O RESTO.
//
// O projeto tem o hábito certo de pôr configuração de produto no singleton do
// banco (hora do alerta, prefixo de etiqueta, limiares) — é o que permite mudar
// sem deploy, numa tela. Aqui a escolha é a oposta por três razões:
//
// 1. **São SEGREDOS de serviço.** `LDAP_BIND_PASSWORD` e `OIDC_CLIENT_SECRET`
//    autenticam o SISTEMA contra outro sistema. Guardá-los no banco pediria a
//    cifra do `core/crypto` e uma tela que os edita — ou seja, uma tela que
//    exibe (ou substitui) o segredo do diretório corporativo, alcançável por
//    quem tiver `settings.manage`. Em variável de ambiente, o alcance é quem
//    tem o servidor.
//
// 2. **Mudá-los não é operação de rotina.** Trocar o issuer do Entra ID ou a DN
//    de bind acontece uma vez na vida da instalação, junto de um deploy.
//
// 3. **Ausente quer dizer DESLIGADO**, e isso tem de valer no boot: as rotas de
//    SSO não são registradas sem configuração, como as de backup (F10, Etapa A).
//    Uma rota de callback de OIDC que existe sem provedor configurado é uma rota
//    pública que responde erro — e rota pública é o que esta fase mais evita.
//
// A CONSEQUÊNCIA ACEITA: ligar SSO exige editar o `.env` e reiniciar. É o mesmo
// preço do `BACKUP_ENABLED`, e pelo mesmo tipo de motivo.
// ═════════════════════════════════════════════════════════════════════════════

const logger = createLogger('directory-config');

/** Aspas em volta do valor no `.env` entrariam no valor — mesmo cuidado do `getDatabaseUrl`. */
function ler(nome: string): string {
  return (process.env[nome] ?? '').replace(/^"|"$/g, '').trim();
}

export interface ConfiguracaoLdap {
  url: string;
  bindDN: string;
  bindPassword: string;
  baseDN: string;
  filter: string;
  /** Quantos segundos esperar por operação. Diretório lento não pode pendurar o job. */
  timeoutSegundos: number;
}

/**
 * O filtro padrão: pessoa, habilitada, do Active Directory.
 *
 * `userAccountControl:1.2.840.113556.1.4.803:=2` é o bit de "conta desabilitada"
 * — então `!(...)` exclui quem o AD já desativou. Sem isso, o job traria de volta
 * gente que o departamento de pessoal desligou lá, e a "marca de revisão" nunca
 * apareceria para elas.
 *
 * Instalação com OpenLDAP sobrescreve pelo `.env`; o padrão é AD porque é o que
 * o D78 nomeia (Entra ID / Active Directory).
 */
const FILTRO_PADRAO =
  '(&(objectCategory=person)(objectClass=user)(!(userAccountControl:1.2.840.113556.1.4.803:=2)))';

/**
 * A configuração do LDAP, ou `null` quando não há.
 *
 * TODAS as quatro obrigatórias juntas: meia configuração é a pior das três
 * situações possíveis — o job sobe, falha no bind e enche o log de erro por dia.
 * Faltando qualquer uma, o diretório está DESLIGADO, e o log do boot diz isso uma
 * vez.
 */
export function lerConfiguracaoLdap(): ConfiguracaoLdap | null {
  const url = ler('LDAP_URL');
  const bindDN = ler('LDAP_BIND_DN');
  const bindPassword = ler('LDAP_BIND_PASSWORD');
  const baseDN = ler('LDAP_BASE_DN');

  if (!url || !bindDN || !bindPassword || !baseDN) {
    // O aviso só sai quando ALGUMA está preenchida: quem nunca configurou nada
    // não precisa de um log por boot dizendo que não configurou.
    if (url || bindDN || bindPassword || baseDN) {
      logger.warn(
        '[LDAP] Configuração incompleta: LDAP_URL, LDAP_BIND_DN, LDAP_BIND_PASSWORD e '
        + 'LDAP_BASE_DN são obrigatórias juntas. A sincronização fica DESLIGADA.',
      );
    }
    return null;
  }

  return {
    url,
    bindDN,
    bindPassword,
    baseDN,
    filter: ler('LDAP_FILTER') || FILTRO_PADRAO,
    timeoutSegundos: Number(ler('LDAP_TIMEOUT_SEGUNDOS')) || 30,
  };
}

export interface ConfiguracaoOidc {
  issuer: string;
  clientId: string;
  clientSecret: string;
  /** A URL que o provedor chama de volta. Tem de bater EXATAMENTE com a registrada lá. */
  redirectUri: string;
}

/**
 * A configuração do OIDC, ou `null`.
 *
 * `OIDC_REDIRECT_URI` é obrigatória e NÃO é deduzida da requisição de propósito:
 * montar a URL de callback a partir do `Host` que o cliente mandou é como se
 * constrói um open redirect — bastaria um `Host:` forjado para o provedor
 * devolver o código de autorização para outro servidor. O valor tem de ser o
 * mesmo registrado no provedor, e quem o escreve é quem configura o deploy.
 */
export function lerConfiguracaoOidc(): ConfiguracaoOidc | null {
  const issuer = ler('OIDC_ISSUER');
  const clientId = ler('OIDC_CLIENT_ID');
  const clientSecret = ler('OIDC_CLIENT_SECRET');
  const redirectUri = ler('OIDC_REDIRECT_URI');

  if (!issuer || !clientId || !clientSecret || !redirectUri) {
    if (issuer || clientId || clientSecret || redirectUri) {
      logger.warn(
        '[OIDC] Configuração incompleta: OIDC_ISSUER, OIDC_CLIENT_ID, OIDC_CLIENT_SECRET e '
        + 'OIDC_REDIRECT_URI são obrigatórias juntas. O SSO fica DESLIGADO.',
      );
    }
    return null;
  }

  return { issuer, clientId, clientSecret, redirectUri };
}

/** As duas respostas que o maestro e o painel precisam, sem expor segredo nenhum. */
export function diretorioLigado(): { ldap: boolean; oidc: boolean } {
  return { ldap: lerConfiguracaoLdap() !== null, oidc: lerConfiguracaoOidc() !== null };
}
