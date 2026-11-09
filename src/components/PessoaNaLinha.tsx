import type { ReactNode } from 'react';
import { Avatar } from './ui/avatar';
import { TableNome, TableSublinha } from './ui/table';

// A PESSOA NA LISTA: o avatar, o nome e o e-mail embaixo, numa coluna só (CC).
// Usuários e Colaboradores são as duas listas de gente, e se leem igual.

interface PessoaNaLinhaProps {
  nome: string;
  /** Sem e-mail, como o colaborador que não tem, a linha fica só com o nome. */
  email?: string | null;
  /** O que vai ao lado do nome, como o selo Senha temporária de Usuários (CB). */
  selo?: ReactNode;
}

export default function PessoaNaLinha({ nome, email, selo }: PessoaNaLinhaProps) {
  return (
    <div className="flex items-center gap-3">
      <Avatar nome={nome} />
      <div className="min-w-0">
        <div className="flex min-w-0 items-center gap-2">
          <TableNome className="min-w-0">{nome}</TableNome>
          {selo}
        </div>
        {email && <TableSublinha>{email}</TableSublinha>}
      </div>
    </div>
  );
}
