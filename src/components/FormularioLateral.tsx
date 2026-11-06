import type { FormEvent, ReactNode } from 'react';
import { Button } from './ui/button';
import { Aviso } from './ui/aviso';
import { Sheet, SheetContent, SheetDescription, SheetTitle } from './ui/sheet';

// TODO FORMULÁRIO DO SISTEMA: o painel à direita, com o título em cima e Cancelar e
// Salvar sempre à vista embaixo, por mais comprido que seja o conteúdo.
//
// Clicar fora não fecha: perderia o que foi digitado. Esc e Cancelar fecham, e
// esses são gestos de quem quer sair.
//
// UMA LARGURA SÓ (BB): o cadastro de dois campos e o de doze abrem iguais. O rótulo do
// envio é Salvar no cadastro e o verbo da operação no resto: Entregar, Devolver.

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
  /** No lugar de Cancelar e Salvar: depois de criar a conta, o que resta é Fechar. */
  rodape?: ReactNode;
  children: ReactNode;
}

export default function FormularioLateral({
  titulo, descricao, onClose, onSubmit, erro, salvando = false, bloqueado = false,
  rotuloDoEnvio = 'Salvar', rotuloEnviando = 'Salvando…', rodape, children,
}: FormularioLateralProps) {
  return (
    <Sheet open onOpenChange={(aberto) => { if (!aberto) onClose(); }}>
      <SheetContent onInteractOutside={(evento) => evento.preventDefault()}>
        <form onSubmit={onSubmit} className="flex h-full min-h-0 flex-col">
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
      </SheetContent>
    </Sheet>
  );
}
