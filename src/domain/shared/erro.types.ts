// O QUE O ERRO DA API PODE TRAZER ALÉM DA FRASE.
//
// O servidor responde `{ error }`, e, quando a frase cita registros que a tela
// pode abrir, `refs` ao lado (`server/core/errors/app-error.ts`): a licença ou
// o item de estoque que precisa voltar antes de desativar quem está com ele, ou
// de excluir o posto onde ele está. A frase continua completa sem ele — os
// nomes estão escritos nela.

export interface ReferenciaDoErro {
  tipo: 'licenca' | 'estoque';
  id: string;
  nome: string;
}
