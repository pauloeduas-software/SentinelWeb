export class AppError extends Error {
  status: number;

  // O corpo de erro é só a FRASE (`{ error }`): ela já diz o que aconteceu e o
  // que fazer, e é tudo que a tela mostra. Um campo estruturado ao lado dela
  // seria um segundo contrato que nenhum cliente lê — e que divergiria da frase
  // no primeiro ajuste de texto.
  constructor(message: string, status: number) {
    super(message);
    this.name = 'AppError';
    this.status = status;
  }
}
