import { useState } from 'react';
import { useParams } from 'react-router-dom';
import {
  useOffboardUser,
  useUserHistoryQuery,
  useUserQuery,
  type OffboardInput,
  type ResultadoDesligamento,
} from '../../../../domain/user/user.queries';
import { useUserHoldingsQuery } from '../../../../domain/assignment/assignment.queries';
import { useUserOccupanciesQuery } from '../../../../domain/occupancy/occupancy.queries';

// Estado de TELA do perfil do colaborador. O dado vem das queries de domínio;
// aqui só mora o que é da tela: qual modal está aberto e o relatório do
// desligamento depois de confirmado.
//
// QUATRO consultas, e nenhuma delas é redundante:
//
//   `useUserQuery`            quem é a pessoa + o placar de posse aberta;
//   `useUserHoldingsQuery`    os ATIVOS, nos dois baldes (diretos e por posto),
//                             e os ACESSÓRIOS, em lista única com a `via` (F5);
//   `useUserOccupanciesQuery` os POSTOS que ela ocupa, com o turno;
//   `useUserHistoryQuery`     o que JÁ aconteceu — as três primeiras são o
//                             estado de hoje, esta é a linha do tempo.
//
// A terceira parece contida na segunda e não está: uma pessoa pode ocupar um
// posto que não tem ativo nenhum entregue. Sem ela, a Mesa 3 vazia sumiria da
// tela — e é justamente uma ocupação aberta que o desligamento precisa fechar
// e que o 409 do DELETE conta.
//
// A quarta parece contida nas outras três e é o oposto delas: as abertas
// mostram o que ESTÁ, o histórico mostra o que FOI. Um ativo devolvido mês
// passado não aparece em nenhuma das três — e é ele que responde "a Laura já
// teve um notebook?".

export function useUserDetail() {
  // O id vem da URL, não de quem navegou até aqui: `/users/:id` aberto direto,
  // colado de um chamado ou recarregado com F5 tem que funcionar igual.
  const { id = null } = useParams<{ id: string }>();

  const { data: user, isPending: carregandoUsuario, error } = useUserQuery(id);
  const { data: holdings } = useUserHoldingsQuery(id);
  const { data: ocupacoes } = useUserOccupanciesQuery(id);
  const { data: historico, isPending: carregandoHistorico } = useUserHistoryQuery(id);
  const desligar = useOffboardUser();

  const [modalDesligamento, setModalDesligamento] = useState(false);
  const [resultado, setResultado] = useState<ResultadoDesligamento | null>(null);

  const abrirDesligamento = () => {
    setResultado(null);
    setModalDesligamento(true);
  };

  const fecharDesligamento = () => setModalDesligamento(false);

  // O erro SOBE para o modal mostrar a mensagem do servidor (mutação propaga —
  // docs/ARQUITETURA.md). Um `catch` aqui transformaria "já foi desligado" num
  // modal que fecha sozinho sem ninguém entender.
  const handleDesligar = async (data: OffboardInput) => {
    if (!id) return;
    setResultado(await desligar.mutateAsync({ id, data }));
  };

  return {
    user,
    // Os dois baldes de `GET /api/users/:id/holdings`, separados como o
    // servidor os devolve: devolver é ato sobre o DIRETO, e o do posto se
    // desfaz mudando a escala (docs/MODELO-POSSE.md).
    diretos: holdings?.diretos ?? [],
    porPosto: holdings?.porPosto ?? [],
    // ACESSÓRIOS (F5) — lista única com `via` por item. Não somar com nada:
    // 1 direto + 5 do posto não são "6 mouses desta pessoa" (D33).
    acessorios: holdings?.acessorios ?? [],
    // Só as ABERTAS: a rota responde `?view=current` por padrão.
    ocupacoes: ocupacoes ?? [],
    // `total` vem separado das linhas de propósito: ele conta o universo, e as
    // linhas vêm cortadas no teto — é o que deixa a tela dizer "100 de 340" em
    // vez de mentir que são 100.
    historico: historico?.rows ?? [],
    totalDoHistorico: historico?.total ?? 0,
    carregandoHistorico,
    carregando: carregandoUsuario,
    erro: error ? (error as Error).message : null,
    modalDesligamento,
    abrirDesligamento,
    fecharDesligamento,
    handleDesligar,
    desligando: desligar.isPending,
    resultado,
  };
}
