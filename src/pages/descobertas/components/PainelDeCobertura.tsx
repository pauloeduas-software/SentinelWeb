import { Aviso } from '../../../components/ui/aviso';
import type { Cobertura } from '../../../types/reconciliation.types';

// O PAINEL DE COBERTURA — *quanto do parque o sistema realmente enxerga?*
//
// Antes não havia como responder: o cadastro sabia o que foi comprado, o agente
// sabia o que está ligado, e ninguém sabia o tamanho da diferença.
//
// O desenho é o dos cartões de contagem das listas, sem o clique: o número conta o
// parque inteiro, e não a lista de baixo. Quem diz o que olhar é a frase embaixo
// de cada um, e cor por dado o sistema não tem.

interface Props {
  cobertura: Cobertura | undefined;
  erro: string | null;
  /** O `ghostDays` da configuração, que a frase do Sumidos cita. */
  diasSemContato?: number;
}

interface Numero {
  rotulo: string;
  /** `undefined` enquanto a resposta não chega: o cartão mostra "—", e não 0. */
  valor: number | undefined;
  /** A frase que diz o que FAZER com o número. Um número sem ação é enfeite. */
  ajuda: string;
}

function numeros(cobertura: Cobertura | undefined, diasSemContato: number | undefined): Numero[] {
  return [
    {
      rotulo: 'Com agente',
      valor: cobertura?.comAgente,
      ajuda: cobertura ? `de ${cobertura.cadastrados} computadores cadastrados` : 'dos computadores cadastrados',
    },
    {
      rotulo: 'Sem agente',
      valor: cobertura?.semAgente,
      ajuda: 'cadastrados sem máquina vinculada',
    },
    {
      rotulo: 'Sumidos',
      valor: cobertura?.sumidos,
      // Sem a configuração não há prazo a citar: o número seria inventado.
      ajuda: diasSemContato === undefined
        ? 'já foram vistos e pararam de dar sinal: confira se ainda existem'
        : `sem contato há mais de ${diasSemContato} dias: confira se ainda existem`,
    },
  ];
}

export default function PainelDeCobertura({ cobertura, erro, diasSemContato }: Props) {
  // Sem isto, a consulta que falhou mostraria "—" para sempre, como se ainda viesse.
  if (!cobertura && erro) return <Aviso className="mb-4">Não foi possível carregar os números: {erro}</Aviso>;

  return (
    <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-[repeat(auto-fit,minmax(9rem,1fr))]">
      {numeros(cobertura, diasSemContato).map(({ rotulo, valor, ajuda }) => (
        <div key={rotulo} className="rounded-lg border border-border-sutil bg-surface-card px-4 py-3 shadow-sm">
          <span className="block truncate text-sm text-text-tertiary">{rotulo}</span>
          <span className="mt-1 block text-2xl font-bold tabular-nums text-text-primary">{valor ?? '—'}</span>
          <span className="mt-0.5 block text-xs leading-snug text-text-tertiary">{ajuda}</span>
        </div>
      ))}
    </div>
  );
}
