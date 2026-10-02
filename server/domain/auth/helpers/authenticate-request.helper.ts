import type { FastifyRequest } from 'fastify';
import { AppError } from '../../../core/errors/app-error';
import { carregarSessaoParaValidacao } from '../use-cases/current-user.usecase';
import { authenticateApiToken } from '../use-cases/authenticate-api-token.usecase';
// O `declare module` que dá tipo a `request.autenticadoPorToken`. Mesmo motivo
// do import de efeito abaixo: sem a linha, o campo não existe no tipo.
import '../auth.types';
// O `declare module` que dá tipo a `request.permissions`. Import de efeito, com
// `type` nenhum para trazer: sem esta linha o campo não existe no tipo.
import '../../access/access.types';

// O que o `preHandler` global de `core/http/require-auth.ts` chama.
//
// Fica no DOMÍNIO porque é aqui que "sessão" quer dizer alguma coisa: um JWT
// assinado por nós, num cookie httpOnly, cujo `sub` ainda corresponde a um
// usuário vivo e ativo. O core sabe só a ordem (allowlist primeiro, sessão
// depois) e não pode importar nada disto (eslint.config.js).

const SEM_SESSAO = 'Sessão ausente ou expirada. Faça login.';

/** `Authorization: Bearer <token>` — o caminho do token pessoal (F11, Etapa H). */
const BEARER = /^Bearer\s+(.+)$/i;

/**
 * A SEGUNDA PORTA: um `ApiToken` de `ownerType: 'USER'` no cabeçalho.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * POR QUE O TOKEN PESSOAL AUTENTICA PELO MESMO `preHandler`, E NÃO POR UMA ROTA
 * DE TROCA ("me dá um cookie com este token").
 *
 * Uma rota de troca significaria duas formas de uma requisição estar autenticada,
 * com dois lugares decidindo o que é sessão — e a de troca ainda daria ao script
 * um cookie de 8 horas que ninguém consegue revogar sem derrubar as sessões
 * humanas da mesma pessoa. Aqui a credencial é conferida a cada requisição, e
 * revogar o token (`revokedAt`) corta o acesso na requisição seguinte.
 *
 * O QUE O TOKEN NÃO TRAZ, e as ausências são deliberadas:
 *
 * - **não há conferência de `tokenVersion`.** O `tv` é a geração do COOKIE; um
 *   token de API não foi assinado com número nenhum. Então trocar a senha NÃO
 *   revoga token pessoal — e isso é o certo: são credenciais separadas, e quem
 *   trocou a senha não pediu para derrubar a integração que deixou rodando. O que
 *   revoga em massa é o desligamento (`offboard-user.usecase.ts`), onde a intenção
 *   é exatamente cortar tudo.
 *
 * - **não há cookie de resposta.** A requisição é autenticada e acabou; nada de
 *   `Set-Cookie` numa chamada de script.
 *
 * - **não alcança rota de credencial.** Ver `exigirSessaoDeCookie`, logo abaixo.
 *
 * E o resto é IGUAL ao caminho do cookie, de propósito: a mesma releitura do
 * usuário (apagado ou desligado perde o acesso na requisição seguinte) e as
 * mesmas permissões, vindas da mesma consulta. Um token não é um atalho para
 * escapar da autorização — ele é a pessoa, por outro meio.
 * ═══════════════════════════════════════════════════════════════════════════
 */
async function autenticarPorTokenPessoal(request: FastifyRequest, bruto: string): Promise<void> {
  const token = await authenticateApiToken(bruto, 'USER');
  // Forma errada, prefixo inexistente, segredo que não bate, token revogado e
  // token de AGENTE caem todos aqui — e todos viram a mesma resposta, pelo mesmo
  // motivo das três recusas do login: dizer qual das cinco foi é ajudar quem está
  // tentando. `userId` nulo é defeito de dado (a FK da Etapa H o proíbe) e
  // também cai aqui, porque credencial sem dono não autentica ninguém.
  if (!token?.userId) throw new AppError(SEM_SESSAO, 401);

  const sessao = await carregarSessaoParaValidacao(token.userId);
  if (!sessao) throw new AppError(SEM_SESSAO, 401);

  request.user = sessao.usuario;
  request.permissions = sessao.permissoes;
  request.autenticadoPorToken = true;
  request.apiTokenId = token.id;
}

/**
 * Esta rota exige COOKIE — token pessoal não serve.
 *
 * `preHandler` de rota (não global): roda depois dos hooks de instância, então o
 * `autenticadoPorToken` já está pendurado. Em `/api/auth/login` ele é `undefined`
 * e a rota segue — é o que mantém o login funcionando para quem ainda não tem
 * sessão nenhuma.
 *
 * 403 e não 401: a credencial é VÁLIDA, o que ela não é é suficiente para esta
 * operação. Um 401 faria o cliente achar que o token expirou e emitir outro.
 */
export async function exigirSessaoDeCookie(request: FastifyRequest): Promise<void> {
  if (!request.autenticadoPorToken) return;

  throw new AppError(
    'Esta operação mexe na sua credencial e exige uma sessão do painel. '
    + 'Um token de API não pode trocar senha, emitir outro token nem alterar o segundo fator.',
    403,
  );
}

export async function autenticarRequisicao(request: FastifyRequest): Promise<void> {
  // O CABEÇALHO VEM PRIMEIRO, e a ordem importa num caso só: o navegador de
  // quem está logado no painel manda o cookie em TODA requisição. Se o cookie
  // ganhasse, um script que mandasse `Authorization` de dentro do navegador
  // autenticaria pela sessão do operador sem ninguém notar — e o `lastUsedAt`
  // do token nunca andaria. Explícito ganha de implícito.
  const cabecalho = request.headers.authorization;
  const bearer = typeof cabecalho === 'string' ? BEARER.exec(cabecalho)?.[1]?.trim() : undefined;
  if (bearer) {
    await autenticarPorTokenPessoal(request, bearer);
    return;
  }

  let sub: string;
  let tv: number | undefined;

  try {
    // `jwtVerify` lê o token do cookie (configurado no server.ts). Assinatura
    // inválida, token expirado e cookie ausente caem todos aqui — e todos viram
    // a MESMA resposta: dizer ao cliente que a assinatura não bateu é ajudar
    // quem está tentando forjar.
    ({ sub, tv } = await request.jwtVerify<{ sub: string; tv?: number }>());
  } catch {
    throw new AppError(SEM_SESSAO, 401);
  }

  // A releitura que faz o token NÃO sobreviver ao usuário: apagado ou desligado
  // perde o acesso na requisição seguinte, sem esperar o token expirar.
  const sessao = await carregarSessaoParaValidacao(sub);
  if (!sessao) throw new AppError(SEM_SESSAO, 401);

  // A GERAÇÃO DA SESSÃO — o que a releitura acima sozinha NÃO cobre.
  //
  // Apagar ou desligar o usuário já derrubava a sessão (a consulta não o
  // encontra). Trocar a senha, não: a pessoa continua sendo um usuário válido e
  // ativo, então quem tivesse roubado o cookie seguia dentro por até 8 horas
  // depois de a vítima fazer exatamente o que se faz ao desconfiar.
  // Comparar o número assinado com o do banco fecha isso: `setUserPassword`
  // incrementa a coluna e todo token emitido antes morre na requisição seguinte.
  //
  // `tv` AUSENTE é aceito de propósito, e só por isto: os tokens que já estavam
  // em navegadores no momento do deploy foram assinados sem o campo, e recusá-los
  // deslogaria todo mundo de uma vez sem ganho de segurança nenhum — o
  // `tokenVersion` de quem nunca trocou a senha é 0. Assim que essas sessões
  // expirarem (8h), todo token em circulação terá o campo. Tolerar um campo
  // ausente NÃO é tolerar um campo DIVERGENTE: `tv` presente e diferente é 401.
  if (tv !== undefined && tv !== sessao.tokenVersion) {
    throw new AppError(SEM_SESSAO, 401);
  }

  // Sobrescreve o que o @fastify/jwt colocou (o payload cru) pelo usuário
  // recém-lido. É daqui que sai o `actorId` de todo ActivityLog (D23).
  request.user = sessao.usuario;

  // AS PERMISSÕES, num campo IRMÃO e não dentro de `request.user` (D136): a
  // allowlist do usuário é o contrato do que SAI dele, e o que ele PODE não é
  // dado dele — além de que ela viaja embutida em toda posse e toda ocupação.
  // Vieram da mesma consulta acima, então penduram de graça.
  request.permissions = sessao.permissoes;
}
