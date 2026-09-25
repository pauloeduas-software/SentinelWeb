import type { AssentoDeLicenca } from '../../../domain/shared/license.types';
import {
  estadoDoAssento, ocupanteDoAssento, ROTULO_DO_ESTADO, type EstadoDoAssento,
} from '../helpers/licenca.helper';

// A GRADE DE ASSENTOS — o que o módulo existe para mostrar.
//
// Cada quadrado é UMA LINHA de `license_seats` (D40), não uma fatia de um
// contador. É essa materialização que permite a tela dizer *"o assento 7 é da
// Laura"* em vez de *"7 dos 10 estão em uso"* — e é a mesma linha que o servidor
// trava na hora de entregar.
//
// OS APOSENTADOS APARECEM, e é de propósito: eles explicam por que a grade tem
// mais quadrados que o contrato. Escondê-los deixaria um buraco na numeração
// (1, 2, 3, 6, 7) sem nada que dissesse por quê.

interface AssentosGradeProps {
  assentos: AssentoDeLicenca[];
  /**
   * `reassignable = false`: devolver QUEIMA. Aqui isto muda só a COR e o texto
   * do botão — o aviso com os números é de quem tem o contrato em mão, e é por
   * isso que `onDevolver` não repete de volta um booleano que veio daqui.
   */
  queimaAoDevolver: boolean;
  onDevolver: (seatId: string) => void;
}

const COR: Record<EstadoDoAssento, string> = {
  livre: '#22c55e',
  pessoa: '#3b82f6',
  ativo: '#0ea5e9',
  queimado: '#ef4444',
  aposentado: '#888888',
};

const ORDEM_DA_LEGENDA: EstadoDoAssento[] = ['livre', 'pessoa', 'ativo', 'queimado', 'aposentado'];

export default function AssentosGrade({ assentos, queimaAoDevolver, onDevolver }: AssentosGradeProps) {
  if (assentos.length === 0) {
    return (
      <p className="font-mono text-xs text-text-tertiary py-6 text-center border border-border-sutil">
        Esta licença não tem assentos. Edite o contrato para definir quantos foram comprados.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-x-4 gap-y-1 font-mono text-[10px] text-text-tertiary">
        {ORDEM_DA_LEGENDA.map((estado) => (
          <span key={estado} className="flex items-center gap-1.5">
            <span className="w-2 h-2 inline-block" style={{ backgroundColor: COR[estado] }} />
            {ROTULO_DO_ESTADO[estado]}
          </span>
        ))}
      </div>

      <div className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-2">
        {assentos.map((assento) => {
          const estado = estadoDoAssento(assento);
          const ocupante = ocupanteDoAssento(assento);
          const ocupado = estado === 'pessoa' || estado === 'ativo';

          return (
            <div
              key={assento.id}
              className="border border-border-sutil bg-surface-card p-2.5 font-mono text-[10px]"
              style={{ borderLeftWidth: 3, borderLeftColor: COR[estado] }}
            >
              <div className="flex items-baseline justify-between">
                <span className="text-text-primary">#{assento.seatNumber}</span>
                <span style={{ color: COR[estado] }}>{ROTULO_DO_ESTADO[estado]}</span>
              </div>

              <div className="text-text-secondary mt-1.5 truncate" title={ocupante ?? undefined}>
                {ocupante ?? '—'}
              </div>

              {ocupado && (
                <button
                  type="button"
                  onClick={() => onDevolver(assento.id)}
                  className={`mt-2 w-full py-1 uppercase tracking-widest transition-colors border ${
                    queimaAoDevolver
                      // A cor do BOTÃO já avisa, antes do texto da confirmação:
                      // devolver aqui destrói valor, e um botão idêntico ao da
                      // devolução comum esconderia isso até o `confirm`.
                      ? 'border-status-danger/40 text-status-danger hover:bg-status-danger hover:text-bg-base'
                      : 'border-border-sutil text-text-tertiary hover:border-text-primary hover:text-text-primary'
                  }`}
                >
                  {queimaAoDevolver ? 'Devolver e queimar' : 'Devolver'}
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
