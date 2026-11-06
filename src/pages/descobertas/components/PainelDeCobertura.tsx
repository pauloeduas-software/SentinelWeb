import { AlertTriangle, EyeOff, Ghost, MonitorCheck, MonitorX, ShieldQuestion } from 'lucide-react';
import { Aviso } from '../../../components/ui/aviso';
import { Card } from '../../../components/ui/card';
import type { Cobertura } from '../../../types/reconciliation.types';

// O PAINEL DE COBERTURA — *quanto do parque o sistema realmente enxerga?*
//
// Antes não havia como responder: o ITAM sabia o que foi cadastrado, o RMM
// sabia o que está ligado, e ninguém sabia o tamanho da diferença.
//
// Os números saem todos na mesma cor: quem diz o que olhar é a frase embaixo de
// cada um, e cor por dado o sistema não tem.

interface Props {
  cobertura: Cobertura | undefined;
  carregando: boolean;
  erro: string | null;
  /** O `shadowHours` da configuração, que a frase do Shadow IT cita. */
  horasDeShadow?: number;
}

interface Numero {
  rotulo: string;
  valor: number;
  icone: typeof MonitorCheck;
  /** A frase que diz o que FAZER com o número. Um número sem ação é enfeite. */
  ajuda: string;
}

function numeros(cobertura: Cobertura, horasDeShadow: number): Numero[] {
  return [
    {
      rotulo: 'Com agente',
      valor: cobertura.comAgente,
      icone: MonitorCheck,
      ajuda: `de ${cobertura.cadastrados} ativos cadastrados`,
    },
    {
      rotulo: 'Sem agente',
      valor: cobertura.semAgente,
      icone: MonitorX,
      ajuda: 'cadastrados sem máquina vinculada',
    },
    {
      rotulo: 'Nunca vistos',
      valor: cobertura.nuncaVistos,
      icone: ShieldQuestion,
      ajuda: 'cadastrados e nenhum agente jamais os viu',
    },
    {
      rotulo: 'Fantasmas',
      valor: cobertura.fantasmas,
      icone: Ghost,
      ajuda: 'já foram vistos e sumiram: confira se ainda existem',
    },
    {
      rotulo: 'Órfãos',
      valor: cobertura.orfaos,
      icone: EyeOff,
      ajuda: 'máquinas que o agente vê e o cadastro não conhece',
    },
    {
      rotulo: 'Shadow IT',
      valor: cobertura.shadowIt,
      icone: AlertTriangle,
      ajuda: `órfãos vistos há mais de ${horasDeShadow}h e ainda sem triagem`,
    },
  ];
}

export default function PainelDeCobertura({ cobertura, carregando, erro, horasDeShadow = 24 }: Props) {
  if (!cobertura) {
    // Sem isto, a consulta que falhou ficava pulsando para sempre, como se ainda viesse.
    if (erro && !carregando) return <Aviso className="mb-4">Não foi possível carregar os números: {erro}</Aviso>;
    return <Card className="mb-4 h-28 animate-pulse" />;
  }

  return (
    <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
      {numeros(cobertura, horasDeShadow).map(({ rotulo, valor, icone: Icone, ajuda }) => (
        <Card key={rotulo} className="flex flex-col gap-1 p-4">
          <div className="flex items-center gap-2 text-sm text-text-tertiary">
            <Icone className="size-4" /> {rotulo}
          </div>
          <span className="text-2xl font-bold tabular-nums text-text-primary">{valor}</span>
          <span className="text-xs leading-snug text-text-tertiary">{ajuda}</span>
        </Card>
      ))}
    </div>
  );
}
