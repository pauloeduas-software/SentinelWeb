import { AppError } from '../../core/errors/app-error';

// O CONTROLE DE CONCORRÊNCIA OTIMISTA DO EDITAR (AF).
//
// O Editar manda o formulário inteiro. Sem conferência, o formulário aberto há
// tempo desfazia em silêncio o que outra pessoa salvou no meio — o Encerrar da
// licença, o total do item que alguém aumentou, o status que a entrega do
// computador trocou. Agora ele manda junto o `updatedAt` que leu, e o servidor
// compara com o da linha TRAVADA: diferente, ninguém grava por cima de ninguém.
//
// O `updatedAt` muda em toda gravação da linha, e só nela: a entrega de licença
// e a de estoque gravam em outra tabela e não esbarram no Editar aberto.
// Usuários ficam de fora: o login grava na linha da conta a cada entrada, e o
// formulário daria 409 sem ninguém ter editado nada.

/** 409 quando a linha mudou desde que o formulário a leu. `lida` ausente não confere. */
export function assertVersaoLida(atual: Date, lida: Date | undefined, nome: string): void {
  if (lida && lida.getTime() !== atual.getTime()) {
    throw new AppError(
      `Outra pessoa salvou "${nome}" enquanto você editava. Feche e abra de novo para ver o que mudou.`,
      409,
    );
  }
}
