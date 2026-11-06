import { useState } from 'react';
import { Copy, Eye, EyeOff } from 'lucide-react';
import { Button } from '../../../components/ui/button';
import { useCopiar } from '../../../hooks/useCopiar';
import { esconderChave } from '../helpers/licenca.helper';

// A CHAVE DE PRODUTO NA TELA — escondida até alguém pedir (AA). "Copiar" leva a
// chave inteira sem precisar mostrá-la: quem instala não precisa expô-la na
// tela para colar no instalador.

interface ChaveEscondidaProps {
  chave: string;
}

/** Menor que `size="sm"`: os dois botões acompanham a linha do texto, em cada chave da lista. */
const BOTAO = 'h-7 px-2 text-xs';

export default function ChaveEscondida({ chave }: ChaveEscondidaProps) {
  const [visivel, setVisivel] = useState(false);
  const { copiado, copiar } = useCopiar(chave, 'Não foi possível copiar a chave. Use "Mostrar" e copie à mão.');

  return (
    <div className="flex flex-wrap items-center gap-2">
      <code className="whitespace-pre-wrap break-all font-mono text-text-primary">
        {visivel ? chave : esconderChave(chave)}
      </code>
      <div className="flex shrink-0 gap-1">
        <Button variant="ghost" size="sm" className={BOTAO} onClick={() => setVisivel(!visivel)}>
          {visivel ? <EyeOff /> : <Eye />} {visivel ? 'Esconder' : 'Mostrar'}
        </Button>
        <Button variant="ghost" size="sm" className={BOTAO} onClick={() => void copiar()}>
          <Copy /> {copiado ? 'Copiada' : 'Copiar'}
        </Button>
      </div>
    </div>
  );
}
