import { useState } from 'react';
import {
  useCheckoutLicense, useDeleteLicense, useTerminateLicense, useUpdateLicense,
} from '../../../queries/license.queries';
import type { AlvoDaEntrega, Licenca, LicencaInput } from '../../../types/license.types';
import { confirmar } from '../../../hooks/useConfirmacao';
import { useNotificacao } from '../../../hooks/useNotificacao';

/** Qual formulário está aberto. Um de cada vez, como nas outras telas. */
type FormularioDaLicenca = 'editar' | 'entregar' | null;

// O QUE SE FAZ COM UMA LICENÇA, na linha da lista e na ficha: as mesmas regras e as
// mesmas frases nos dois lugares. É o cadastro das Configurações (`useCatalog`, AF),
// com Encerrar/Reabrir no lugar do Desativar/Ativar.
export function useAcoesDaLicenca({ aoExcluir }: { aoExcluir?: () => void } = {}) {
  const notificar = useNotificacao();
  const editar = useUpdateLicense();
  const excluir = useDeleteLicense();
  const encerrar = useTerminateLicense();
  const entregar = useCheckoutLicense();

  const [formulario, setFormulario] = useState<FormularioDaLicenca>(null);
  const [licencaAberta, setLicencaAberta] = useState<Licenca | null>(null);

  const abrir = (proximo: Exclude<FormularioDaLicenca, null>, licenca: Licenca) => {
    setLicencaAberta(licenca);
    setFormulario(proximo);
  };

  const fechar = () => {
    setFormulario(null);
    setLicencaAberta(null);
  };

  // O formulário inteiro vai, como nas Configurações (AF). O erro sobe para ele
  // mostrar a mensagem do servidor: o 422 de categoria do tipo errado e o 409 de
  // reduzir a quantidade abaixo do que está em uso.
  const handleEditar = async (dados: LicencaInput) => {
    if (!licencaAberta) return;
    await editar.mutateAsync({ id: licencaAberta.id, data: dados });
    fechar();
    notificar.sucesso('Licença salva.');
  };

  const handleEntregar = async (alvo: AlvoDaEntrega) => {
    if (!licencaAberta) return;
    await entregar.mutateAsync({ licenseId: licencaAberta.id, alvo });
    fechar();
    notificar.sucesso('Licença entregue.');
  };

  // ─────────────────────────────────────────────────────────────────────────
  // OS CLIQUES DIRETOS — encerrar, reabrir, excluir — não têm campo de erro
  // para a mensagem subir, e por isso cada um tem o seu `try/catch` com
  // notificação (`useNotificacao`). Sem ele a rejeição vira *unhandled
  // rejection* e a tela não faz NADA: o 409 daqui é escrito para ensinar, e
  // engoli-lo transforma uma recusa explicada numa tela que parece travada.
  // ─────────────────────────────────────────────────────────────────────────

  // ENCERRAR/REABRIR é o Desativar/Ativar das Configurações (AF), com data: o
  // encerramento grava hoje em `terminationDate`, e reabrir apaga a data — a
  // mesma edição do formulário. Confirma só na ida, com a frase do padrão. O
  // botão sempre clica: com entrega aberta, o 409 do servidor manda devolver.
  const handleAlternarEncerrada = async (licenca: Licenca) => {
    const encerrada = licenca.status === 'ENCERRADA';
    if (!encerrada && !(await confirmar({
      titulo: `Encerrar "${licenca.name}" hoje?`,
      descricao: 'Continua no histórico, mas some das escolhas e não recebe nada novo.',
      acao: 'Encerrar',
    }))) return;
    try {
      if (encerrada) await editar.mutateAsync({ id: licenca.id, data: { terminationDate: null } });
      else await encerrar.mutateAsync(licenca.id);
      notificar.sucesso(encerrada ? 'Licença reaberta.' : 'Licença encerrada.');
    } catch (erro) {
      // O 409 da entrega aberta e o da licença que já estava encerrada (duas
      // abas), e o 422 do encerramento antes da data da compra.
      notificar.erro((erro as Error).message);
    }
  };

  // EXCLUIR, com a frase de Configurações (`useCatalog`). O botão sempre clica:
  // a licença em uso recebe o 409 do servidor, que diz com quem e manda
  // devolver (AG).
  const handleExcluir = async (licenca: Licenca) => {
    if (!(await confirmar({
      titulo: `Excluir "${licenca.name}"?`,
      descricao: 'Esta ação não tem lixeira.',
      acao: 'Excluir',
      perigo: true,
    }))) return;
    try {
      await excluir.mutateAsync(licenca.id);
      aoExcluir?.();
      notificar.sucesso('Licença excluída.');
    } catch (erro) {
      notificar.erro((erro as Error).message);
    }
  };

  return {
    formulario,
    licencaAberta,
    abrir,
    fechar,

    // Enquanto uma ação corre, os botões dela ficam desabilitados: o duplo
    // clique dava "já foi devolvida" DEPOIS de a devolução ter dado certo.
    ocupado: excluir.isPending || encerrar.isPending || editar.isPending,

    handleEditar,
    handleEntregar,
    handleAlternarEncerrada,
    handleExcluir,
  };
}
