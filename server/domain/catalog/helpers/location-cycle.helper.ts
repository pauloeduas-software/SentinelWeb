import { AppError } from '../../../core/errors/app-error';
import type { ClienteCatalogo } from '../specs/catalog-spec.types';

// Teto de profundidade da hierarquia. Existe por dois motivos: impede que a
// subida vire dezenas de consultas, e nenhuma empresa precisa de 32 níveis de
// "Matriz › Prédio › Andar › Sala".
const MAX_PROFUNDIDADE = 32;

/**
 * Impede que uma localização vire ancestral de si mesma.
 *
 * O BANCO NÃO FAZ ISTO. Testado: `Matriz → Andar 2 → Matriz` foi aceito sem
 * erro nenhum pelo Postgres — a FK só exige que o pai exista, não que a cadeia
 * termine. Um ciclo trava qualquer renderização de árvore em laço infinito.
 *
 * A subida começa no pai proposto: se ela reencontrar a própria linha em
 * qualquer ponto, gravar fecharia o ciclo.
 */
export async function assertSemCicloDeLocalizacao(
  client: ClienteCatalogo,
  id: string | null,
  parentId: unknown,
): Promise<void> {
  if (typeof parentId !== 'string' || !id) return;

  let atual: string | null = parentId;
  let saltos = 0;

  while (atual) {
    if (atual === id) {
      throw new AppError(
        'Esta localização não pode ficar abaixo dela mesma nem de uma das suas filhas.',
        409,
      );
    }

    if (++saltos > MAX_PROFUNDIDADE) {
      throw new AppError(`Hierarquia de localizações acima de ${MAX_PROFUNDIDADE} níveis.`, 409);
    }

    // `findUnique` de propósito: `location` não tem `deletedAt`, então não há
    // escopo de lixeira para respeitar aqui.
    // Anotação explícita: sem ela o TS vê `atual` sendo alimentado por uma
    // consulta que depende de `atual` e desiste de inferir (TS7022).
    const pai: { parentId: string | null } | null = await client.location.findUnique({
      where: { id: atual },
      select: { parentId: true },
    });

    // Pai inexistente: quem reclama é a FK, com mensagem própria.
    if (!pai) return;
    atual = pai.parentId;
  }
}
