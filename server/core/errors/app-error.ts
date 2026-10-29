/**
 * Um registro que a frase do erro cita e que a tela pode abrir — o computador,
 * a licença ou o item de estoque que precisa voltar, ou o posto que precisa ser
 * encerrado, antes de desativar quem está com ele (AA, AE).
 */
export interface ReferenciaDoErro {
  tipo: 'ativo' | 'licenca' | 'estoque' | 'posto';
  id: string;
  nome: string;
}

export class AppError extends Error {
  status: number;
  /** O que a frase cita, para a tela pôr um link em cada um. */
  refs?: ReferenciaDoErro[];

  // O corpo de erro é a FRASE (`{ error }`): ela já diz o que aconteceu e o que
  // fazer, e é o que a tela mostra. `refs` vai ao lado só quando a frase cita
  // registros que a tela pode abrir — e a frase continua completa sem ele, com
  // os nomes escritos nela.
  constructor(message: string, status: number, refs?: ReferenciaDoErro[]) {
    super(message);
    this.name = 'AppError';
    this.status = status;
    if (refs && refs.length > 0) this.refs = refs;
  }
}
