/**
 * O termo como a PÁGINA PÚBLICA o recebe — `GET /aceite/:token`.
 *
 * Não tem o token (quem o tem é a URL), não tem o id do colaborador e não tem
 * nada de outro ativo. É o mínimo para ler e assinar UM documento: a rota é a
 * única do domínio sem sessão, e o que ela devolve é o que um estranho com o
 * link veria.
 */
export interface TermoPublico {
  id: string;
  eulaSnapshot: string;
  signerName: string;
  signerEmail: string;
  acceptedAt: string | null;
  declinedAt: string | null;
  declineReason: string | null;
  expiresAt: string;
  /**
   * A entrega já foi encerrada?
   *
   * O aceite não bloqueia a entrega (D88), então o equipamento pode ter sido
   * devolvido com o termo por assinar. Aí o documento perdeu o objeto: assinar
   * declararia a guarda de algo que já voltou. O servidor recusa, e a tela
   * precisa saber para não oferecer o botão.
   */
  entregaEncerrada: boolean;
  modelo: string;
  asset: {
    assetTag: string;
    name: string | null;
    serial: string | null;
  };
}

/** Um termo como o PAINEL o lista — `GET /api/acceptances`. */
export interface Termo {
  id: string;
  assignmentId: string;
  assetId: string;
  signerUserId: string | null;
  signerName: string;
  signerEmail: string;
  acceptedAt: string | null;
  declinedAt: string | null;
  declineReason: string | null;
  expiresAt: string;
  remindedAt: string | null;
  createdAt: string;
  asset: { id: string; assetTag: string; name: string | null };
}

export type VistaDeAceite = 'pendentes' | 'aceitos' | 'recusados' | 'todos';
