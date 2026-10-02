import { prisma } from '../../../core/database/prismaClient';
import { AppError } from '../../../core/errors/app-error';
import { USER_LIST_SELECT } from '../helpers/user-select.helper';

// OS LIDERADOS — quem responde a esta pessoa (F11, Etapa E).
//
// ═══════════════════════════════════════════════════════════════════════════
// ESTA É A HIERARQUIA DE GENTE, E ELA NÃO DIZ NADA SOBRE EQUIPAMENTO (D72).
//
// Vale escrever aqui porque é o lugar onde a confusão nasce: tendo a lista de
// liderados na ficha, a próxima pergunta natural é "então mostro os ativos dos
// liderados aqui também?". A resposta é **não** — "quem responde pelo notebook"
// é a posse aberta, ou os ocupantes do posto quando o alvo é um posto
// (`resolverResponsaveis`, D16). O gestor é rota de ESCALONAMENTO: ele recebe o
// aviso de atraso e aprova a baixa; ele não está com o equipamento.
//
// Se um dia "o gestor responde junto" for regra do cliente, é decisão NOVA e
// explícita — não efeito colateral de esta rota existir.
// ═══════════════════════════════════════════════════════════════════════════

/**
 * UM NÍVEL, não a árvore inteira.
 *
 * Liderados diretos respondem "com quem eu falo sobre a equipe dele". A árvore
 * completa exigiria recursão com teto de profundidade (o banco aceita ciclo —
 * provado na F1) e responderia uma pergunta de organograma, que não é de
 * inventário. Quem quiser descer um nível abre a ficha do liderado.
 */
export async function listUserReports(id: string) {
  // `findFirst` pelo escopo da lixeira: perguntar os liderados de um cadastro
  // apagado é 404, como toda leitura dele.
  const gestor = await prisma.user.findFirst({ where: { id }, select: { id: true } });
  if (!gestor) throw new AppError('Registro não encontrado', 404);

  const liderados = await prisma.user.findMany({
    where: { managerId: id },
    select: USER_LIST_SELECT,
    // Desligado por último e depois por nome: a lista é de trabalho, e quem
    // continua na empresa importa mais. Ordem estável entre dois refreshes.
    orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
  });

  return { data: liderados };
}
