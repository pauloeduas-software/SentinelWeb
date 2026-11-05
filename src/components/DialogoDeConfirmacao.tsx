import * as AlertDialog from '@radix-ui/react-alert-dialog';
import { Button } from './ui/button';
import { CLASSE_DO_VEU } from './ui/dialog';
import { useConfirmacao } from '../hooks/useConfirmacao';

// A PERGUNTA ANTES DO QUE NÃO TEM VOLTA. Só desenha: quem pergunta é
// `confirmar()`, em `hooks/useConfirmacao`. Montado uma vez, no App.
export default function DialogoDeConfirmacao() {
  const pedido = useConfirmacao((estado) => estado.pedido);
  const responder = useConfirmacao((estado) => estado.responder);

  return (
    <AlertDialog.Root open={pedido !== null} onOpenChange={(aberto) => { if (!aberto) responder(false); }}>
      <AlertDialog.Portal>
        <AlertDialog.Overlay className={CLASSE_DO_VEU} />
        <AlertDialog.Content
          aria-describedby={undefined}
          className="fixed left-1/2 top-1/2 z-50 w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 space-y-4 rounded-lg border border-border-sutil bg-surface-card p-6 shadow-lg duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95"
        >
          <div className="space-y-2">
            <AlertDialog.Title className="break-words text-lg font-semibold leading-tight text-text-primary">
              {pedido?.titulo}
            </AlertDialog.Title>
            {pedido?.descricao && (
              <AlertDialog.Description className="text-sm leading-relaxed text-text-tertiary">
                {pedido.descricao}
              </AlertDialog.Description>
            )}
          </div>
          <div className="flex justify-end gap-2">
            <AlertDialog.Cancel asChild>
              <Button variant="outline">Cancelar</Button>
            </AlertDialog.Cancel>
            <AlertDialog.Action asChild>
              <Button variant={pedido?.perigo ? 'destructive' : 'default'} onClick={() => responder(true)}>
                {pedido?.acao ?? 'Confirmar'}
              </Button>
            </AlertDialog.Action>
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}
