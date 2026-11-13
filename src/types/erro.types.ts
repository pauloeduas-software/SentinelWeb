// O QUE O ERRO DA API PODE TRAZER ALÉM DA FRASE.
//
// O servidor responde `{ error }`, e, quando a frase cita registros que a tela
// pode abrir, `refs` ao lado (`server/infra/errors/app-error.ts`): o computador,
// a licença ou o item de estoque que precisa voltar, ou o posto que precisa ser
// encerrado, antes de desativar quem está com ele; o item que impede excluir
// o posto onde ele está; ou a máquina que impede a baixa ou a lixeira do
// computador. A frase continua completa sem ele — os nomes estão escritos nela.

export interface ReferenciaDoErro {
  tipo: 'ativo' | 'licenca' | 'estoque' | 'posto' | 'maquina';
  id: string;
  nome: string;
}
