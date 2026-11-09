import type { MouseEvent, ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { cn } from '../helpers/cn.helper';
import { useVoltaParaEstaFicha } from '../hooks/useVoltaComFiltros';

// A LINHA DA ABA RESPONSÁVEIS (BQ) abre a ficha do responsável, como toda linha de aba abre
// o registro dela (CJ): o colaborador, o posto ou o computador. A seta de lá volta para cá.
//
// O clique num botão, num campo ou numa opção da linha é dele, e não abre nada: é assim que
// o Devolver, a chave e o turno continuam na linha sem `stopPropagation` em cada um.

/** O que dentro da linha tem clique próprio. O seletor abre num portal, mas o evento sobe até aqui. */
const CONTROLES = 'button, a, input, label, select, textarea, [role="option"], [role="listbox"], [role="combobox"]';

interface LinhaDoResponsavelProps {
  /** A ficha que a linha abre. Nula, a linha não clica: sem registro, ou com um pedido aberto nela. */
  para: string | null;
  className?: string;
  children: ReactNode;
}

export default function LinhaDoResponsavel({ para, className, children }: LinhaDoResponsavelProps) {
  const navigate = useNavigate();
  const volta = useVoltaParaEstaFicha();

  const abrir = (evento: MouseEvent<HTMLLIElement>) => {
    if (!para || (evento.target as HTMLElement).closest(CONTROLES)) return;
    navigate(para, { state: volta });
  };

  return (
    <li
      onClick={para ? abrir : undefined}
      className={cn(className, para && 'cursor-pointer transition-colors hover:bg-surface-muted/50')}
    >
      {children}
    </li>
  );
}
