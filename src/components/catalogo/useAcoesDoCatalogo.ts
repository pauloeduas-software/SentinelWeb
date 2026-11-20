import {
  useCreateCatalogRow, useDeleteCatalogRow, usePurgeCatalogRow, useRestoreCatalogRow, useUpdateCatalogRow,
} from '../../queries/catalog.queries';
import type { CatalogRow } from '../../types/catalog.types';
import { confirmar } from '../../hooks/useConfirmacao';
import { useNotificacao } from '../../hooks/useNotificacao';
import type { CatalogUiSpec } from './catalog-ui.types';
import { linksDoErro } from '../../helpers/erro.helper';

// AS ESCRITAS DE UM CADASTRO DO CATÁLOGO, com as perguntas e as frases do sistema
// inteiro. A lista (`useCatalog`) e a ficha do colaborador usam as mesmas (CD): Editar,
// Desativar e Excluir dizem igual nos dois lugares.
//
// `aposGravar` é de quem tem mais o que reler além da tabela, como a ficha. Roda no erro
// também: depois de um 409 de versão, o Editar reaberto vem com a linha nova (AF).
export function useAcoesDoCatalogo(spec: CatalogUiSpec, aposGravar?: () => void) {
  const notificar = useNotificacao();
  const criar = useCreateCatalogRow(spec.slug);
  const editar = useUpdateCatalogRow(spec.slug);
  const excluir = useDeleteCatalogRow(spec.slug);
  const restaurar = useRestoreCatalogRow(spec.slug);
  const excluirDeVez = usePurgeCatalogRow(spec.slug);

  // "Categoria cadastrada.", "Status salvo.": o particípio concorda com a aba.
  const feito = (participio: string) => (
    `${spec.singular} ${spec.genero === 'f' ? participio.replace(/o$/, 'a') : participio}.`
  );

  // O erro sobe para o formulário mostrar a mensagem do servidor.
  const salvar = async (emEdicao: CatalogRow | null, valores: Record<string, unknown>, fechar: () => void) => {
    try {
      if (emEdicao) await editar.mutateAsync({ id: emEdicao.id, data: valores });
      else await criar.mutateAsync(valores);
    } finally {
      aposGravar?.();
    }
    fechar();
    notificar.sucesso(feito(emEdicao ? 'salvo' : 'cadastrado'));
  };

  // DESATIVAR NÃO ABRE FORMULÁRIO: grava só o campo alternado, o mesmo padrão de
  // Usuários. Confirma só na ida: desativar tira o registro das escolhas; reativar
  // não tem o que perder.
  const alternar = async (registro: CatalogRow, campo: string) => {
    const ligado = registro[campo] !== false;
    if (ligado && !(await confirmar({
      titulo: `Desativar "${registro.name}"?`,
      descricao: 'Continua no histórico, mas some das escolhas e não recebe nada novo.',
      acao: 'Desativar',
    }))) return;

    try {
      await editar.mutateAsync({ id: registro.id, data: { [campo]: !ligado } });
      notificar.sucesso(feito(ligado ? 'desativado' : 'ativado'));
    } catch (erro) {
      // A desativação do colaborador recusada traz o que está com ele, com link.
      notificar.erro((erro as Error).message, linksDoErro(erro));
    } finally {
      aposGravar?.();
    }
  };

  /** Devolve se excluiu: a ficha sai para a lista, e a lista fica onde está. */
  const excluirRegistro = async (registro: CatalogRow): Promise<boolean> => {
    if (!(await confirmar({
      titulo: `Excluir "${registro.name}"?`,
      descricao: spec.lixeira ? 'Se não estiver em uso, vai para a lixeira e pode ser restaurado.' : 'Esta ação não tem lixeira.',
      acao: 'Excluir',
      perigo: true,
    }))) return false;

    try {
      await excluir.mutateAsync(registro.id);
      notificar.sucesso(spec.lixeira ? `"${registro.name}" foi para a lixeira.` : feito('excluído'));
      return true;
    } catch (erro) {
      // É aqui que aparece o 409 de "em uso por N registros" — a regra que
      // impede apagar uma categoria que alguém está usando — e o do
      // colaborador, com o que está com ele em link.
      notificar.erro((erro as Error).message, linksDoErro(erro));
      return false;
    } finally {
      aposGravar?.();
    }
  };

  const restaurarRegistro = async (registro: CatalogRow) => {
    try {
      await restaurar.mutateAsync(registro.id);
      notificar.sucesso(feito('restaurado'));
    } catch (erro) {
      // O 409 do e-mail que foi reaproveitado enquanto ele estava na lixeira.
      notificar.erro((erro as Error).message);
    } finally {
      aposGravar?.();
    }
  };

  /**
   * EXCLUIR DE VEZ, da lixeira (DL). Devolve se excluiu: a ficha sai para a lista.
   * A pergunta diz o que se perde e o que fica — o histórico dos outros guarda o nome.
   */
  const excluirRegistroDeVez = async (registro: CatalogRow): Promise<boolean> => {
    if (!(await confirmar({
      titulo: `Excluir "${registro.name}" de vez?`,
      descricao: 'A ficha e o histórico somem, e não há como restaurar. O histórico dos computadores, '
        + 'postos, licenças e itens continua com o nome por escrito.',
      acao: 'Excluir de vez',
      perigo: true,
    }))) return false;

    try {
      await excluirDeVez.mutateAsync(registro.id);
      notificar.sucesso(`${spec.singular} ${spec.genero === 'f' ? 'excluída' : 'excluído'} de vez.`);
      return true;
    } catch (erro) {
      notificar.erro((erro as Error).message, linksDoErro(erro));
      // Só na recusa: excluído de vez, quem tem o que reler (a ficha) está saindo,
      // e a releitura pediria um registro que não existe mais.
      aposGravar?.();
      return false;
    }
  };

  return {
    salvar, alternar, excluir: excluirRegistro, restaurar: restaurarRegistro, excluirDeVez: excluirRegistroDeVez,
  };
}
