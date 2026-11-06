import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import EstadoDaLista from './EstadoDaLista';
import { Button } from './ui/button';
import { Card } from './ui/card';
import { TableVazia } from './ui/table';

// O QUE TODA LISTA SEM LINHA DIZ (BB), com as mesmas frases: buscou e não achou, filtrou
// e não sobrou nada, ou não há nada cadastrado, com o atalho para cadastrar quando quem
// olha pode.

interface ListaVaziaProps {
  icone: LucideIcon;
  carregando: boolean;
  erro: string | null;
  /** O nome no singular, em minúscula: "licença". Sem `frase`, é ele que monta a do vazio. */
  nome?: string;
  genero?: 'm' | 'f';
  /** O texto buscado. */
  busca?: string;
  filtrada?: boolean;
  /** A frase da vista: "A lixeira está vazia." */
  frase?: string;
  onCadastrar?: () => void;
  /** A linha embaixo da frase: o que falta saber antes do primeiro cadastro. */
  children?: ReactNode;
}

export default function ListaVazia({
  icone: Icone, carregando, erro, nome, genero = 'm', busca, filtrada, frase, onCadastrar, children,
}: ListaVaziaProps) {
  const [nenhum, cadastrado, encontrado] = genero === 'f'
    ? ['Nenhuma', 'cadastrada', 'encontrada']
    : ['Nenhum', 'cadastrado', 'encontrado'];

  return (
    <TableVazia>
      <Icone className="size-6 opacity-50" />
      <EstadoDaLista carregando={carregando} erro={erro}>
        {busca ? (
          <span>{nenhum} {nome} {encontrado} para "{busca}".</span>
        ) : filtrada ? (
          <span>{nenhum} {nome} com este filtro.</span>
        ) : frase ? (
          <>
            <span>{frase}</span>
            {children}
          </>
        ) : (
          <>
            <span>{nenhum} {nome} {cadastrado}.</span>
            {children}
            {onCadastrar && <Button variant="link" onClick={onCadastrar}>Cadastrar {nome}</Button>}
          </>
        )}
      </EstadoDaLista>
    </TableVazia>
  );
}

/** O mesmo vazio fora de tabela: a aba da ficha, a janela, a lista de cartões. */
export function CartaoVazio(props: ListaVaziaProps) {
  return <Card className="overflow-hidden"><ListaVazia {...props} /></Card>;
}
