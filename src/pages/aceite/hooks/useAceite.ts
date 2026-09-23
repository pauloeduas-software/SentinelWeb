import { useState } from 'react';
import { useParams } from 'react-router-dom';
import {
  useAceitarTermo, useRecusarTermo, useTermoPublicoQuery,
} from '../../../domain/acceptance/acceptance.queries';

// Estado da PÁGINA PÚBLICA de aceite.
//
// A tela tem três estados que não são "carregando / pronto / erro": o termo
// pode estar PENDENTE (mostra o formulário), ACEITO (mostra o comprovante e o
// PDF) ou RECUSADO (mostra o que foi registrado). Quem decide qual é o servidor,
// pelas duas datas — a tela não deduz nada.

export function useAceite() {
  const { token } = useParams<{ token: string }>();

  const { data: termo, isPending, error } = useTermoPublicoQuery(token);
  const aceitar = useAceitarTermo();
  const recusar = useRecusarTermo();

  const [assinatura, setAssinatura] = useState<string | null>(null);
  const [motivo, setMotivo] = useState('');
  const [confirmandoRecusa, setConfirmandoRecusa] = useState(false);

  const handleAceitar = () => {
    if (!token) return;
    // `assinatura ?? undefined`: o schema aceita o campo AUSENTE, não o campo
    // nulo. Mandar `null` cairia no 422 por tipo, e a pessoa leria "assinatura
    // inválida" depois de escolher, legitimamente, não assinar.
    aceitar.mutate({ token, assinatura: assinatura ?? undefined });
  };

  const handleRecusar = () => {
    if (!token) return;
    recusar.mutate({ token, motivo: motivo.trim() || undefined });
  };

  const erroDaOperacao = aceitar.error ?? recusar.error;

  return {
    token,
    termo,
    carregando: isPending,
    // O erro da LEITURA é a tela inteira (404 de link errado, 410 de expirado);
    // o da OPERAÇÃO é uma linha acima do botão. São mensagens diferentes.
    erro: error ? (error as Error).message : null,
    erroDaOperacao: erroDaOperacao ? (erroDaOperacao as Error).message : null,

    assinatura,
    setAssinatura,
    motivo,
    setMotivo,
    confirmandoRecusa,
    abrirRecusa: () => setConfirmandoRecusa(true),
    cancelarRecusa: () => setConfirmandoRecusa(false),

    handleAceitar,
    handleRecusar,
    enviando: aceitar.isPending || recusar.isPending,
  };
}
