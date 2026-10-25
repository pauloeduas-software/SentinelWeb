import { useState } from 'react';
import { Copy, Eye, EyeOff } from 'lucide-react';
import { useNotificacao } from '../../hooks/useNotificacao';
import { esconderChave } from '../helpers/licenca.helper';

// A CHAVE DE PRODUTO NA TELA — escondida até alguém pedir (AA). "Copiar" leva a
// chave inteira sem precisar mostrá-la: quem instala não precisa expô-la na
// tela para colar no instalador.

interface ChaveEscondidaProps {
  chave: string;
}

const BOTAO = 'flex items-center gap-1 px-1.5 py-0.5 border border-border-sutil text-[10px] uppercase tracking-widest text-text-tertiary hover:text-text-primary transition-colors';

export default function ChaveEscondida({ chave }: ChaveEscondidaProps) {
  const notificar = useNotificacao();
  const [visivel, setVisivel] = useState(false);
  const [copiada, setCopiada] = useState(false);

  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(chave);
      setCopiada(true);
      setTimeout(() => setCopiada(false), 2000);
    } catch {
      // Sem permissão de área de transferência (HTTP sem TLS, navegador que
      // recusa): a chave continua a um "Mostrar" de distância.
      notificar.erro('Não foi possível copiar a chave. Use "Mostrar" e copie à mão.');
    }
  };

  return (
    <div className="flex flex-wrap items-start gap-2">
      <code className="whitespace-pre-wrap break-all text-text-secondary">
        {visivel ? chave : esconderChave(chave)}
      </code>
      <div className="flex gap-1 shrink-0">
        <button type="button" onClick={() => setVisivel(!visivel)} className={BOTAO}>
          {visivel ? <EyeOff size={11} /> : <Eye size={11} />} {visivel ? 'Esconder' : 'Mostrar'}
        </button>
        <button type="button" onClick={() => void copiar()} className={BOTAO}>
          <Copy size={11} /> {copiada ? 'Copiada' : 'Copiar'}
        </button>
      </div>
    </div>
  );
}
