import { userInfo } from 'node:os';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { closeDatabase } from '../../../infra/database/prismaClient';
import { formatZodError } from '../../../infra/errors/zod-error';
import { createLogger } from '../../../infra/logger/logger';
import { createUserSchema } from '../../user/schemas/user.schema';
import { senhaNova } from '../../auth/schemas/auth.schema';
import { createUser } from '../../user/use-cases/create-user.usecase';

// CRIAR UM ADMINISTRADOR — comando de linha, no modelo do `snipeit:create-admin`
// do Snipe-IT (AP).
//
// ═════════════════════════════════════════════════════════════════════════════
// OS DOIS CASOS QUE ELE RESOLVE, E POR QUE É DE LINHA DE COMANDO.
//
// 1. A INSTALAÇÃO NOVA. O seed principal não cria conta (T), e sem conta
//    ninguém entra para cadastrar a primeira pela tela de Usuários.
// 2. O SISTEMA TRANCADO. O único administrador esqueceu a senha: o comando
//    cria OUTRO, que entra e gera a senha temporária da conta antiga em Usuários.
//
// Por isso ele não recusa quando já há administrador: o segundo caso é
// justamente esse. Quem roda o comando já tem o servidor nas mãos.
//
// Uma rota de emergência no painel seria uma rota que cria Administrador sem
// sessão nenhuma — a porta que a invariante 17 existe para não abrir
// (`ultimo-administrador.ts`).
//
// A conta nasce pelo MESMO cadastro da tela (`createUserSchema` e
// `createUser`): as mesmas regras de nome e e-mail, o mesmo 409 de e-mail em
// uso, a mesma linha na auditoria — assinada pelo sistema. A diferença é a
// senha: a tela não recebe nenhuma (AU), e aqui ela é da própria pessoa, com a
// regra da troca de senha (`senhaNova`).
const comandoSchema = createUserSchema.extend({ password: senhaNova });
//
// A SENHA VAI NO PRÓPRIO COMANDO, como o `--password` do Snipe-IT: quem
// instala escolhe a senha ali mesmo, e não há senha padrão a trocar depois. O
// preço, aceito: ela fica no histórico do terminal de quem rodou.
//
// USO:
//   npm run acesso:administrador -- --nome "Maria Silva" --email "maria.silva@empresa.com" --senha "uma senha qualquer"
//
// O `--` depois do nome do script é do npm: sem ele, o npm toma `--nome`,
// `--email` e `--senha` como opções dele e só repassa os valores, sem os nomes.
// ═════════════════════════════════════════════════════════════════════════════

const logger = createLogger('cli:acesso');

const USO = 'Uso: npm run acesso:administrador -- --nome "Nome Completo" --email "e-mail" --senha "senha"';

/**
 * Quem roda o comando, pelo usuário do sistema operacional. Sem lançar:
 * `userInfo()` falha no contêiner cujo usuário não está no /etc/passwd, e a
 * linha de escape não pode cair por causa do nome.
 */
function usuarioDoTerminal(): string {
  try {
    return userInfo().username;
  } catch {
    return process.env.USER ?? `uid ${process.getuid?.() ?? '?'}`;
  }
}

export async function criarAdministrador(dados: { nome: string; email: string; senha: string }) {
  const entrada = comandoSchema.safeParse({ name: dados.nome, email: dados.email, password: dados.senha });
  if (!entrada.success) throw new Error(formatZodError(entrada.error));

  // `role` explícito, e não o `@default` da coluna: se a separação de cargos
  // vier, o padrão pode deixar de ser Administrador, e este comando não.
  //
  // SEM SESSÃO: quem roda está no servidor, não no painel. A auditoria leva o
  // usuário do sistema operacional na origem (AB).
  return createUser(
    { ...entrada.data, role: 'ADMIN' },
    { tipo: 'SYSTEM', origem: `cli:criar-administrador:${usuarioDoTerminal()}` },
  );
}

async function executar(): Promise<void> {
  // Parâmetro a mais ou sem valor é recusado com a frase de uso, e não com o
  // "Unknown option" em inglês do `parseArgs`.
  let values: { nome?: string; email?: string; senha?: string };
  try {
    ({ values } = parseArgs({
      options: { nome: { type: 'string' }, email: { type: 'string' }, senha: { type: 'string' } },
    }));
  } catch {
    throw new Error(USO);
  }
  if (!values.nome || !values.email || !values.senha) throw new Error(USO);

  const conta = await criarAdministrador({ nome: values.nome, email: values.email, senha: values.senha });
  logger.warn(`[Acesso] Administrador criado: ${conta.name} <${conta.email}>. Entre com esse e-mail e a senha do comando.`);
}

const executadoDireto =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;

if (executadoDireto) {
  executar()
    .catch((erro: unknown) => {
      logger.error(`[Acesso] ${erro instanceof Error ? erro.message : String(erro)}`);
      process.exitCode = 1;
    })
    .finally(closeDatabase);
}
