import type { ReactNode } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from './ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';

// O DETALHE DE UM REGISTRO, em janela: nome, situação, ações e as abas. É o
// `AtivoDetailsModal` da IntraNet, e as três janelas (item, licença e posto) saem
// dele para terem a mesma cara.

export interface AbaDoDetalhe {
  id: string;
  rotulo: ReactNode;
  conteudo: ReactNode;
}

interface JanelaDeDetalheProps {
  titulo: ReactNode;
  subtitulo?: ReactNode;
  /** Os botões embaixo do título. */
  acoes?: ReactNode;
  abas: readonly AbaDoDetalhe[];
  abaInicial?: string;
  onClose: () => void;
}

export default function JanelaDeDetalhe({ titulo, subtitulo, acoes, abas, abaInicial, onClose }: JanelaDeDetalheProps) {
  return (
    <Dialog open onOpenChange={(aberto) => { if (!aberto) onClose(); }}>
      {/* O foco vai para a janela, e não para o primeiro botão: um anel aceso em
          Entregar parece escolha, e Esc continua fechando. */}
      <DialogContent
        className="max-h-[85vh] min-h-[28rem] outline-none"
        // `data-esc-proprio`: o campo cujo Esc desfaz só a própria edição.
        onEscapeKeyDown={(evento) => {
          if ((evento.target as HTMLElement).closest('[data-esc-proprio]')) evento.preventDefault();
        }}
        onOpenAutoFocus={(evento) => {
          evento.preventDefault();
          (evento.currentTarget as HTMLElement).focus();
        }}
      >
        <DialogHeader>
          <DialogTitle>{titulo}</DialogTitle>
          {subtitulo && <DialogDescription>{subtitulo}</DialogDescription>}
          {acoes && <div className="flex flex-wrap items-center gap-2 pt-2">{acoes}</div>}
        </DialogHeader>

        <Tabs defaultValue={abaInicial ?? abas[0]?.id} className="flex min-h-0 flex-1 flex-col">
          <div className="shrink-0 px-6 pt-4">
            <TabsList>
              {abas.map((aba) => <TabsTrigger key={aba.id} value={aba.id}>{aba.rotulo}</TabsTrigger>)}
            </TabsList>
          </div>
          {abas.map((aba) => (
            <TabsContent key={aba.id} value={aba.id} className="min-h-0 flex-1 space-y-4 overflow-y-auto p-6">
              {aba.conteudo}
            </TabsContent>
          ))}
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
