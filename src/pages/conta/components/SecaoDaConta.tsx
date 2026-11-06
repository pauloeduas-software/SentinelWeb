import type { ReactNode } from 'react';
import { Card } from '../../../components/ui/card';

// UMA ABA DE MINHA CONTA: os campos no cartão, em duas colunas, e o botão embaixo,
// à direita. A tela tem pouca coisa e ocupa a página: os campos e o botão crescem
// aqui, num lugar só, e não nos primitivos, que seguem o tamanho do resto do painel.
// A altura mínima é a da aba Senha, a mais alta: trocar de aba não mexe em nada.

interface SecaoDaContaProps {
  titulo: string;
  botao: ReactNode;
  children: ReactNode;
}

export default function SecaoDaConta({ titulo, botao, children }: SecaoDaContaProps) {
  return (
    <div className="space-y-6">
      <Card className="space-y-8 p-8 lg:min-h-90">
        <h3 className="text-xl font-semibold text-text-primary">{titulo}</h3>
        <div className="grid gap-6 md:grid-cols-2 [&_input]:h-12 [&_input]:text-base [&_label]:text-base">{children}</div>
      </Card>
      <div className="flex justify-end [&>button]:h-12 [&>button]:px-6 [&>button]:text-base">{botao}</div>
    </div>
  );
}
