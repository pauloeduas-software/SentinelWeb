import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ScanLine } from 'lucide-react';
import { useBuscaDoLeitor } from '../../domain/asset/asset.queries';
import type { ResultadoDaBusca } from '../../domain/shared/label.types';

// O CAMPO DO BIPE (F10, Etapa G) — no cabeçalho, em toda tela.
//
// ═════════════════════════════════════════════════════════════════════════════
// SEM DEBOUNCE, E SEM `trim` QUE COMA ZERO À ESQUERDA.
//
// Um leitor de código de barras em modo "teclado" digita a etiqueta inteira em
// milissegundos e manda `Enter`. As duas tentações aqui são erradas:
//
//   debounce      engoliria a submissão — o `Enter` chega antes do timer, e a
//                 busca dispararia DEPOIS, com a tela já em outro lugar;
//   normalizar    `ATV-00042` sem o zero é outra etiqueta. Qualquer "limpeza"
//                 esperta do texto faz o bipe achar o ativo errado, que é pior
//                 que não achar.
//
// O QUE ACONTECE DEPENDE DO ACERTO: exato (etiqueta, série ou o QR inteiro)
// NAVEGA direto para o ativo — é o gesto do bipe, e uma lista de um item só
// seria um clique a mais em cada equipamento conferido. Aproximado abre a lista.
// ═════════════════════════════════════════════════════════════════════════════

export default function BuscaDoLeitor() {
  const [termo, setTermo] = useState('');
  const [resultado, setResultado] = useState<ResultadoDaBusca | null>(null);
  const campo = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();
  const busca = useBuscaDoLeitor();

  const submeter = async (evento: React.FormEvent) => {
    evento.preventDefault();
    if (termo.trim() === '') return;

    const achado = await busca.mutateAsync(termo);

    if (achado.tipo === 'EXATO') {
      // Limpa ANTES de navegar: o campo fica pronto para o próximo bipe, que é
      // o que acontece quando alguém está conferindo uma prateleira.
      setTermo('');
      setResultado(null);
      navigate(`/ativos/${achado.ativos[0].id}`);
      campo.current?.focus();
      return;
    }

    setResultado(achado);
  };

  return (
    <form onSubmit={submeter} className="relative">
      <ScanLine size={13} className="absolute left-2 top-1/2 -translate-y-1/2 text-text-tertiary pointer-events-none" />
      <input
        ref={campo}
        type="text"
        value={termo}
        onChange={(evento) => setTermo(evento.target.value)}
        onBlur={() => setResultado(null)}
        placeholder="Bipe ou digite a etiqueta"
        aria-label="Buscar ativo por etiqueta, número de série ou QR"
        className="w-44 lg:w-56 pl-7 pr-2 py-1.5 bg-bg-base border border-border-sutil font-mono text-[11px] text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-text-secondary transition-colors"
      />

      {resultado && (
        <div className="absolute right-0 mt-1 z-50 w-80 bg-surface-card border border-border-sutil shadow-xl font-mono">
          {resultado.tipo === 'NENHUM' ? (
            <p className="px-3 py-3 text-[11px] text-text-tertiary">
              Nada encontrado para "{termo}".
            </p>
          ) : (
            <>
              <p className="px-3 py-2 text-[10px] uppercase tracking-widest text-text-tertiary border-b border-border-sutil">
                {resultado.total} aproximado(s)
              </p>
              <ul className="max-h-72 overflow-auto">
                {resultado.ativos.map((ativo) => (
                  <li key={ativo.id}>
                    {/* `onMouseDown` e não `onClick`: o `onBlur` do campo fecha
                        a lista antes de o clique chegar, e o item nunca seria
                        acionado. */}
                    <button
                      type="button"
                      onMouseDown={() => {
                        setTermo('');
                        setResultado(null);
                        navigate(`/ativos/${ativo.id}`);
                      }}
                      className="w-full text-left px-3 py-2 text-[11px] hover:bg-bg-base transition-colors"
                    >
                      <span className="text-text-primary">{ativo.assetTag}</span>
                      {ativo.name && <span className="text-text-tertiary"> · {ativo.name}</span>}
                      {ativo.serial && (
                        <span className="block text-[10px] text-text-tertiary">SN {ativo.serial}</span>
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}
    </form>
  );
}
