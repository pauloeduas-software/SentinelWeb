import { Aviso } from '../../../components/ui/aviso';
import type { Cobertura } from '../../../types/reconciliation.types';

// O PAINEL DE COBERTURA — *quanto do parque o sistema realmente enxerga?*
//
// Antes não havia como responder: o ITAM sabia o que foi cadastrado, o RMM
// sabia o que está ligado, e ninguém sabia o tamanho da diferença.
//
// O desenho é o dos cartões de contagem das listas, sem o clique: o número conta o
// parque inteiro, e não a lista de baixo. Quem diz o que olhar é a frase embaixo
// de cada um, e cor por dado o sistema não tem.

interface Props {
  cobertura: Cobertura | undefined;
  erro: string | null;
  /** O `shadowHours` da configuração, que a frase do Shadow IT cita. */
  horasDeShadow?: number;
}

interface Numero {
  rotulo: string;
  /** `undefined` enquanto a resposta não chega: o cartão mostra "—", e não 0. */
  valor: number | undefined;
  /** A frase que diz o que FAZER com o número. Um número sem ação é enfeite. */
  ajuda: string;
}

function numeros(cobertura: Cobertura | undefined, horasDeShadow: number | undefined): Numero[] {
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
      rotulo: 'Nunca vistos',
      valor: cobertura?.nuncaVistos,
      ajuda: 'cadastrados e nenhum agente jamais os viu',
    },
    {
      rotulo: 'Fantasmas',
      valor: cobertura?.fantasmas,
      ajuda: 'já foram vistos e sumiram: confira se ainda existem',
    },
    {
      rotulo: 'Sem vínculo',
      valor: cobertura?.orfaos,
      ajuda: 'máquinas que o agente vê e o cadastro não conhece',
    },
    {
      rotulo: 'Shadow IT',
      valor: cobertura?.shadowIt,
      // Sem a configuração não há prazo a citar: o número seria inventado.
      ajuda: horasDeShadow === undefined
        ? 'sem vínculo há tempo e ainda sem triagem'
        : `sem vínculo há mais de ${horasDeShadow}h e ainda sem triagem`,
    },
  ];
}

export default function PainelDeCobertura({ cobertura, erro, horasDeShadow }: Props) {
  // Sem isto, a consulta que falhou mostraria "—" para sempre, como se ainda viesse.
  if (!cobertura && erro) return <Aviso className="mb-4">Não foi possível carregar os números: {erro}</Aviso>;

  return (
    <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-[repeat(auto-fit,minmax(9rem,1fr))]">
      {numeros(cobertura, horasDeShadow).map(({ rotulo, valor, ajuda }) => (
        <div key={rotulo} className="rounded-lg border border-border-sutil bg-surface-card px-4 py-3 shadow-sm">
          <span className="block truncate text-sm text-text-tertiary">{rotulo}</span>
          <span className="mt-1 block text-2xl font-bold tabular-nums text-text-primary">{valor ?? '—'}</span>
          <span className="mt-0.5 block text-xs leading-snug text-text-tertiary">{ajuda}</span>
        </div>
      ))}
    </div>
  );
}
