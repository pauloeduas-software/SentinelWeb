import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  useDeleteWorkstation, useUpdateWorkstation, useWorkstationQuery, type PostoInput,
} from '../../../../queries/workstation.queries';
import { useCheckinAsset } from '../../../../queries/assignment.queries';
import { confirmar } from '../../../../hooks/useConfirmacao';
import { useNotificacao } from '../../../../hooks/useNotificacao';
import { useVoltaComFiltros } from '../../../../hooks/useVoltaComFiltros';
import { linksDoErro } from '../../../../helpers/erro.helper';
import type { AtivoDoPosto } from '../../../../types/workstation.types';
import { useOcupantes } from '../../hooks/useOcupantes';

// Estado da FICHA DO POSTO: o formulário aberto, a devolução e o caminho de volta.
// Quem busca dado é a query do domínio; nenhum componente da pasta fala HTTP.

/** Só o 404 diz que o posto não existe: um 500 ou a rede caída dizem que não deu para abrir. */
function mensagemDoErro(error: Error | null, temFicha: boolean): string | null {
  if (!error) return null;
  if ((error as { status?: number }).status === 404) return error.message;
  // Atualização que falha com a ficha já na tela não a fecha; o 404 fecha.
  return temFicha ? null : `Não foi possível abrir o posto: ${error.message}`;
}

export function useFichaDoPosto() {
  const notificar = useNotificacao();
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const voltar = useVoltaComFiltros('/postos');

  const [editando, setEditando] = useState(false);

  const { data: posto, isPending, error } = useWorkstationQuery(id ?? null);
  // Os ocupantes vêm de hook próprio, que também serve o histórico — que o
  // detalhe do posto (`GET /api/workstations/:id`) não traz.
  const ocupantes = useOcupantes(id ?? null);
  const editar = useUpdateWorkstation();
  const excluir = useDeleteWorkstation();
  const devolver = useCheckinAsset();

  // O erro sobe para o formulário mostrar a mensagem do servidor — é por aqui
  // que aparece o 409 de nome repetido e o da edição de outra pessoa (AF).
  const handleSalvar = async (dados: PostoInput) => {
    if (!id) return;
    await editar.mutateAsync({ id, data: dados });
    setEditando(false);
    notificar.sucesso('Posto salvo.');
  };

  // A mesma frase da linha da lista (`usePostos`). Sem Desativar (AN): o posto com
  // algo nele recebe o 409 do servidor, que diz o que tirar.
  const handleExcluir = async () => {
    if (!posto) return;
    if (!(await confirmar({
      titulo: `Excluir "${posto.name}"?`,
      descricao: 'Esta ação não tem lixeira.',
      acao: 'Excluir',
      perigo: true,
    }))) return;

    try {
      await excluir.mutateAsync(posto.id);
      // Sem os filtros: o posto excluído podia ser o último da página guardada neles.
      navigate('/postos');
      notificar.sucesso('Posto excluído.');
    } catch (falha) {
      notificar.erro((falha as Error).message, linksDoErro(falha));
    }
  };

  /**
   * DEVOLVER O ATIVO DA MESA, daqui mesmo.
   *
   * Antes a devolução só existia na tela Computadores — e o ativo entregue a um
   * posto SAIU dela (`asset-filters.helper.ts`). O computador da Mesa 1 ficava
   * visível só nesta ficha, e a única operação possível sobre ele estava na tela
   * que não o mostrava mais: para devolvê-lo era preciso chegar à ficha do ativo
   * por busca ou por URL. Esta é a ponta que faltava.
   *
   * SÓ O ESCOPO E O DIA no corpo (AM): o servidor resolve o status de volta para
   * o primeiro `DEPLOYABLE` (`checkin-asset.usecase.ts`). O formulário completo
   * da devolução — status de volta e observação — continua na tela Computadores,
   * onde cabe; aqui o que se quer é tirar o equipamento DESTA mesa.
   *
   * E é por isso que o `targetWorkstationId` vai: a ficha pode estar velha. Entre
   * ela carregar e o clique, o ativo pode ter sido devolvido e entregue à Laura,
   * e um corpo vazio fecharia a posse dela. Com o posto no corpo, o servidor
   * recusa com 409 e diz com quem o ativo está — a mensagem sobe para a ficha.
   *
   * A confirmação é a da linha, com o dia em que o ativo voltou, como a
   * devolução da licença.
   */
  const handleDevolver = async (ativo: AtivoDoPosto, dia: string) => {
    if (!id) return;
    await devolver.mutateAsync({ id: ativo.id, data: { targetWorkstationId: id, checkinAt: dia } });
  };

  return {
    posto: posto ?? null,
    carregando: isPending,
    // O 404 de `/postos/<id-que-não-existe>`. Sem isto a ficha abriria com zero
    // ativos e zero ocupantes, que é indistinguível de um posto novo e vazio — a
    // tela mentiria em vez de dizer que o link está morto.
    erro: mensagemDoErro(error, posto != null),
    voltar,
    ocupantes,

    editando,
    abrirEdicao: () => setEditando(true),
    fecharEdicao: () => setEditando(false),
    handleSalvar,
    handleExcluir,

    devolvendo: devolver.isPending,
    handleDevolver,
  };
}
