import { ZodError } from 'zod';

// Traduz um ZodError na resposta de erro do projeto.
//
// Fica em `core/errors` junto com o resto da tradução de erro: `zod` é
// biblioteca, não `domain` — o lint não reclama e o error-handler continua sendo
// o ÚNICO lugar do sistema que monta resposta de erro.

// Quantos campos entram na mensagem curta antes de virar "e mais N".
const MAX_NA_MENSAGEM = 3;

export interface ZodErrorBody {
  error: string;
  fields: Record<string, string>;
}

// `unrecognized_keys` (o que `strictObject` recusa) chega com `path` vazio e
// mensagem em inglês, porque o campo não está no schema — não há onde pendurar
// uma mensagem customizada. É o único caso que precisa de tradução aqui.
function descreverIssue(issue: ZodError['issues'][number]): { campo: string; mensagem: string } {
  if (issue.code === 'unrecognized_keys') {
    const chaves = issue.keys.join('", "');
    return { campo: issue.keys[0] ?? '(desconhecido)', mensagem: `campo não reconhecido: "${chaves}"` };
  }
  return { campo: issue.path.join('.') || '(corpo)', mensagem: issue.message };
}

export function formatZodError(error: ZodError): ZodErrorBody {
  const fields: Record<string, string> = {};

  for (const issue of error.issues) {
    const { campo, mensagem } = descreverIssue(issue);
    // Primeira falha de cada campo é a que o formulário mostra; as seguintes são
    // consequência (ex.: "obrigatório" e depois "não pode ser vazio").
    if (!(campo in fields)) fields[campo] = mensagem;
  }

  // A mensagem legível não repete o nome técnico do campo: ela vai direto para o
  // formulário, e "category: categoria é obrigatório" é ruído para quem lê. Cada
  // mensagem do schema já se explica sozinha. O mapa `fields` continua com a
  // chave técnica, que é o que a tela usa para destacar o input certo.
  const mensagens = Object.values(fields);
  const visiveis = mensagens.slice(0, MAX_NA_MENSAGEM);
  const restantes = mensagens.length - visiveis.length;
  const resumo = visiveis.join('; ') + (restantes > 0 ? ` (e mais ${restantes})` : '');

  return {
    // O frontend mostra esta string direto no formulário (src/core/api/apiClient.ts)
    error: resumo || 'Dados inválidos.',
    fields,
  };
}
