import { z, ZodError } from 'zod';

// O sistema é só pt-BR. A mensagem padrão da zod sai em português para o campo
// que o schema não deu frase própria; carregado aqui porque o error-handler e o
// comando do administrador passam por este arquivo antes de qualquer `parse`.
z.config(z.locales.ptBR());

// Traduz um ZodError na frase de erro do projeto.
//
// Fica em `infra/errors` junto com o resto da tradução de erro: `zod` é
// biblioteca, não `domain` — o lint não reclama e o error-handler continua sendo
// o ÚNICO lugar do sistema que monta resposta de erro.

// Quantos campos entram na mensagem curta antes de virar "e mais N".
const MAX_NA_MENSAGEM = 3;

// `unrecognized_keys` (o que `strictObject` recusa) chega com `path` vazio,
// porque o campo não está no schema — não há onde pendurar uma mensagem
// customizada. É o único caso que precisa de frase montada aqui.
function descreverIssue(issue: ZodError['issues'][number]): { campo: string; mensagem: string } {
  if (issue.code === 'unrecognized_keys') {
    const chaves = issue.keys.join('", "');
    return { campo: issue.keys[0] ?? '(desconhecido)', mensagem: `campo não reconhecido: "${chaves}"` };
  }
  return { campo: issue.path.join('.') || '(corpo)', mensagem: issue.message };
}

export function formatZodError(error: ZodError): string {
  const fields: Record<string, string> = {};

  for (const issue of error.issues) {
    const { campo, mensagem } = descreverIssue(issue);
    // Primeira falha de cada campo é a que o formulário mostra; as seguintes são
    // consequência (ex.: "obrigatório" e depois "não pode ser vazio").
    if (!(campo in fields)) fields[campo] = mensagem;
  }

  // A mensagem legível não repete o nome técnico do campo: ela vai direto para o
  // formulário, e "category: categoria é obrigatório" é ruído para quem lê. Cada
  // mensagem do schema já se explica sozinha.
  const mensagens = Object.values(fields);
  const visiveis = mensagens.slice(0, MAX_NA_MENSAGEM);
  const restantes = mensagens.length - visiveis.length;
  const resumo = visiveis.join('; ') + (restantes > 0 ? ` (e mais ${restantes})` : '');

  // O frontend mostra esta string direto no formulário (src/api/apiClient.ts), e ela
  // sai como toda recusa do sistema: maiúscula no começo e ponto no fim.
  if (!resumo) return 'Dados inválidos.';
  return `${resumo.charAt(0).toUpperCase()}${resumo.slice(1)}`.replace(/\.?$/, '.');
}
