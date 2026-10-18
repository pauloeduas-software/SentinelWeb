import type { FastifyRequest } from 'fastify';
import { AppError } from '../../../core/errors/app-error';
import { carregarSessaoParaValidacao } from '../use-cases/current-user.usecase';
// O `declare module` que dá tipo a `request.cargo`. Import de efeito, com
// `type` nenhum para trazer: sem esta linha o campo não existe no tipo.
import '../../access/access.types';

// O que o `preHandler` global de `core/http/require-auth.ts` chama.
//
// Fica no DOMÍNIO porque é aqui que "sessão" quer dizer alguma coisa: um JWT
// assinado por nós, num cookie httpOnly, cujo `sub` ainda corresponde a um
// usuário vivo e ativo. O core sabe só a ordem (allowlist primeiro, sessão
// depois) e não pode importar nada disto (eslint.config.js).

const SEM_SESSAO = 'Sessão ausente ou expirada. Faça login.';

export async function autenticarRequisicao(request: FastifyRequest): Promise<void> {
  let sub: string;
  let tv: number | undefined;

  try {
    // `jwtVerify` lê o token do cookie (configurado no app.ts). Assinatura
    // inválida, token expirado e cookie ausente caem todos aqui — e todos viram
    // a MESMA resposta: dizer ao cliente que a assinatura não bateu é ajudar
    // quem está tentando forjar.
    ({ sub, tv } = await request.jwtVerify<{ sub: string; tv?: number }>());
  } catch {
    throw new AppError(SEM_SESSAO, 401);
  }

  // A releitura que faz o token NÃO sobreviver ao usuário: apagado ou desativado
  // perde o acesso na requisição seguinte, sem esperar o token expirar.
  const sessao = await carregarSessaoParaValidacao(sub);
  if (!sessao) throw new AppError(SEM_SESSAO, 401);

  // A GERAÇÃO DA SESSÃO — o que a releitura acima sozinha NÃO cobre.
  //
  // Apagar ou desativar o usuário já derrubava a sessão (a consulta não o
  // encontra). Trocar a senha, não: a pessoa continua sendo um usuário válido e
  // ativo, então quem tivesse roubado o cookie seguia dentro por até 8 horas
  // depois de a vítima fazer exatamente o que se faz ao desconfiar.
  // Comparar o número assinado com o do banco fecha isso: trocar a senha na
  // edição do usuário (`update-user.usecase.ts`) incrementa a coluna, e todo
  // token emitido antes morre na requisição seguinte.
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

  // O CARGO, num campo IRMÃO e não dentro de `request.user`: a allowlist do
  // usuário é o contrato do que SAI dele, e o que ele PODE não é dado dele. Veio
  // da mesma consulta acima, então pendura de graça.
  request.cargo = sessao.cargo;
}
