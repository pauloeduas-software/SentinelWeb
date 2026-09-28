import { AlertTriangle, EyeOff, Ghost, MonitorCheck, MonitorX, ShieldQuestion } from 'lucide-react';
import type { Cobertura } from '../../../domain/shared/reconciliation.types';

// O PAINEL DE COBERTURA — *quanto do parque o sistema realmente enxerga?*
//
// Antes da F7 não havia como responder: o ITAM sabia o que foi cadastrado, o RMM
// sabia o que está ligado, e ninguém sabia o tamanho da diferença.

interface Props {
  cobertura: Cobertura | undefined;
  carregando: boolean;
}

interface Numero {
  rotulo: string;
  valor: number;
  icone: typeof MonitorCheck;
  cor: string;
  /** A frase que diz o que FAZER com o número. Um número sem ação é enfeite. */
  ajuda: string;
}

function numeros(cobertura: Cobertura): Numero[] {
  return [
    {
      rotulo: 'Com agente',
      valor: cobertura.comAgente,
      icone: MonitorCheck,
      cor: 'text-status-success',
      ajuda: `de ${cobertura.cadastrados} ativos cadastrados`,
    },
    {
      rotulo: 'Sem agente',
      valor: cobertura.semAgente,
      icone: MonitorX,
      cor: 'text-text-secondary',
      ajuda: 'monitores, cadeiras e cabos entram aqui — nem todo ativo tem agente',
    },
    {
      rotulo: 'Nunca vistos',
      valor: cobertura.nuncaVistos,
      icone: ShieldQuestion,
      cor: 'text-status-warning',
      ajuda: 'cadastrados e nenhum agente jamais os viu',
    },
    {
      rotulo: 'Fantasmas',
      valor: cobertura.fantasmas,
      icone: Ghost,
      cor: 'text-status-warning',
      ajuda: 'já foram vistos e sumiram — confira se ainda existem',
    },
    {
      rotulo: 'Órfãos',
      valor: cobertura.orfaos,
      icone: EyeOff,
      cor: 'text-status-info',
      ajuda: 'máquinas que o agente vê e o cadastro não conhece',
    },
    {
      rotulo: 'Shadow IT',
      valor: cobertura.shadowIt,
      icone: AlertTriangle,
      cor: cobertura.shadowIt > 0 ? 'text-status-danger' : 'text-text-tertiary',
      ajuda: 'órfãos vistos há mais de 24h e ainda sem triagem',
    },
  ];
}

export default function PainelDeCobertura({ cobertura, carregando }: Props) {
  if (carregando || !cobertura) {
    return <div className="h-24 border border-border-sutil mb-6 animate-pulse bg-bg-surface" />;
  }

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-px bg-border-sutil border border-border-sutil mb-6">
      {numeros(cobertura).map(({ rotulo, valor, icone: Icone, cor, ajuda }) => (
        <div key={rotulo} className="bg-bg-base p-4 flex flex-col gap-1" title={ajuda}>
          <div className="flex items-center gap-2 text-[10px] uppercase tracking-widest text-text-tertiary">
            <Icone size={12} className={cor} /> {rotulo}
          </div>
          <span className={`text-2xl font-mono ${cor}`}>{valor}</span>
          <span className="text-[10px] text-text-tertiary leading-tight">{ajuda}</span>
        </div>
      ))}
    </div>
  );
}
