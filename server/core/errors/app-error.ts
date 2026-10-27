/**
 * Um registro que a frase do erro cita e que a tela pode abrir — a licença ou o
 * item de estoque que precisa voltar antes de desativar quem está com ele (AA, AE).
 */
export interface ReferenciaDoErro {
  tipo: 'licenca' | 'estoque';
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
