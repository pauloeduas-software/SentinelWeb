import { useCallback, useRef, type FormEvent, type ReactNode } from 'react';
import { Button } from './ui/button';
import { Aviso } from './ui/aviso';
import { MarcarAlteracaoContext } from './ui/formulario.context';
import { Sheet, SheetContent, SheetDescription, SheetTitle } from './ui/sheet';
import { confirmar, type PedidoDeConfirmacao } from '../hooks/useConfirmacao';

// TODO FORMULÁRIO DO SISTEMA: o painel à direita, com o título em cima e Cancelar e
// Salvar sempre à vista embaixo, por mais comprido que seja o conteúdo.
//
// CLICAR FORA FECHA (BG), com Esc e o X. Se a pessoa mexeu em algo, pergunta antes:
// o clique errado não custa a edição inteira. Cancelar fecha direto, porque já é a
// decisão de descartar.
//
// O que conta é a pessoa ter mexido, e não o valor diferente do inicial: comparar
// pediria a cada formulário que entregasse os seus valores ao painel.
//
// UMA LARGURA SÓ (BB): o cadastro de dois campos e o de doze abrem iguais. O rótulo do
// envio é Salvar no cadastro e o verbo da operação no resto: Entregar, Devolver.

const PERGUNTA_AO_DESCARTAR: PedidoDeConfirmacao = {
  titulo: 'Descartar as alterações?',
  descricao: 'O que foi alterado neste formulário será perdido.',
  acao: 'Descartar',
  voltar: 'Continuar editando',
  perigo: true,
};

interface FormularioLateralProps {
  titulo: string;
  descricao?: ReactNode;
  onClose: () => void;
  onSubmit: (evento: FormEvent<HTMLFormElement>) => void;
  /** A recusa do servidor, que pode vir com os links do que resolver antes. */
  erro?: ReactNode;
  salvando?: boolean;
  /** Bloqueia o envio sem mudar o rótulo: falta escolher o destino. */
  bloqueado?: boolean;
  rotuloDoEnvio?: string;
  rotuloEnviando?: string;
  /** A pergunta ao sair mesmo sem alteração: o que está na tela não volta. */
  perguntaAoSair?: PedidoDeConfirmacao;
  /** No lugar de Cancelar e Salvar: depois de criar a conta, o que resta é Fechar. */
  rodape?: ReactNode;
  children: ReactNode;
}

export default function FormularioLateral({
  titulo, descricao, onClose, onSubmit, erro, salvando = false, bloqueado = false,
  rotuloDoEnvio = 'Salvar', rotuloEnviando = 'Salvando…', perguntaAoSair, rodape, children,
}: FormularioLateralProps) {
  const alterado = useRef(false);
  const marcarAlteracao = useCallback(() => { alterado.current = true; }, []);

  // A busca do seletor mora num portal: o evento sobe pela árvore do React até
  // aqui, mas procurar uma opção não é alterar o formulário.
  const aoAlterarCampo = (evento: FormEvent<HTMLFormElement>) => {
    if (evento.currentTarget.contains(evento.target as Node)) marcarAlteracao();
  };

  const sair = async () => {
    if (salvando) return;
    const pergunta = perguntaAoSair ?? (alterado.current ? PERGUNTA_AO_DESCARTAR : null);
    if (pergunta && !(await confirmar(pergunta))) return;
    onClose();
  };

  return (
    <Sheet open onOpenChange={(aberto) => { if (!aberto) void sair(); }}>
      <SheetContent>
        <MarcarAlteracaoContext.Provider value={marcarAlteracao}>
          <form onSubmit={onSubmit} onChange={aoAlterarCampo} className="flex h-full min-h-0 flex-col">
            <div className="shrink-0 space-y-1.5 border-b border-border-sutil p-6 pr-12">
              <SheetTitle>{titulo}</SheetTitle>
              {descricao && <SheetDescription>{descricao}</SheetDescription>}
            </div>

            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-6">
              {children}
            </div>

            {/* Fora da rolagem: quem salvou está no fim do formulário, e a recusa no
                topo ficaria longe da vista. */}
            {erro && <div className="shrink-0 border-t border-border-sutil px-6 py-3"><Aviso>{erro}</Aviso></div>}

            <div className="flex shrink-0 justify-end gap-2 border-t border-border-sutil p-4">
              {rodape ?? (
                <>
                  <Button variant="outline" onClick={onClose}>Cancelar</Button>
                  <Button type="submit" disabled={salvando || bloqueado}>
                    {salvando ? rotuloEnviando : rotuloDoEnvio}
                  </Button>
                </>
              )}
            </div>
          </form>
        </MarcarAlteracaoContext.Provider>
      </SheetContent>
    </Sheet>
  );
}
