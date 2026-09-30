import {
  Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import type { PontoDaCurva } from '../../../domain/shared/lifecycle.types';
import { formatarMoeda } from '../../helpers/format.helper';

// A CURVA DO VALOR CONTÁBIL — o primeiro uso de `recharts` no projeto.
//
// A biblioteca estava no `package.json` desde a F1 e NUNCA foi importada. Ela
// entra por import DESTA PÁGINA, jamais do `App.tsx`: no bundle de entrada ela
// custaria o download do gráfico a quem só abre a lista de ativos.
//
// ═════════════════════════════════════════════════════════════════════════════
// A SÉRIE VEM PRONTA DO SERVIDOR (D55), e isso não é otimização.
//
// Cada ponto é o valor contábil da frota INTEIRA naquele mês, calculado pela
// mesma função pura que devolve o valor de hoje. Somar isso no navegador exigiria
// a fórmula escrita duas vezes — o lint impede `src/` importar de `server/` —, e
// duas implementações divergem na primeira regra de arredondamento: o último
// ponto do gráfico deixaria de fechar com o total impresso ao lado dele.
// ═════════════════════════════════════════════════════════════════════════════
//
// UMA SÉRIE SÓ, então NÃO HÁ LEGENDA: o título nomeia o que está desenhado, e uma
// caixinha de legenda com um item é ruído. A identidade da série também não
// depende da cor — o eixo, o título e a tabela abaixo dizem a mesma coisa.

interface Props {
  curva: PontoDaCurva[];
}

/** `2026-09` → `set/26`. Rótulo curto: doze deles dividem a largura do eixo. */
function rotuloDoMes(mes: string): string {
  const [ano, numero] = mes.split('-');
  const nomes = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
  return `${nomes[Number(numero) - 1] ?? numero}/${ano.slice(2)}`;
}

/** Eixo y em milhares quando o número é grande: "R$ 1.2M" cabe, o valor cru não. */
function rotuloDoValor(valor: number): string {
  if (valor >= 1_000_000) return `${(valor / 1_000_000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}M`;
  if (valor >= 1_000) return `${(valor / 1_000).toLocaleString('pt-BR', { maximumFractionDigits: 0 })}k`;
  return valor.toLocaleString('pt-BR', { maximumFractionDigits: 0 });
}

/** A cor da série é um TOKEN, e não `status-success`: cor de status é reservada. */
const SERIE = 'var(--color-chart-serie)';
const GRADE = 'var(--color-border-sutil)';
const TINTA_FRACA = 'var(--color-text-tertiary)';

interface PontoDoTooltip {
  payload: { mes: string; valor: number; ativos: number };
}

/**
 * O tooltip é obrigatório numa curva, e é ele que dispensa rótulo em cada ponto.
 *
 * Um número sobre cada um dos doze pontos transformaria o gráfico em tabela
 * desalinhada; o valor exato sai no hover, e o total do mês corrente já está
 * impresso nos indicadores acima.
 *
 * O texto dele usa TINTA, nunca a cor da série: quem carrega a identidade é o
 * quadradinho ao lado, e texto colorido perde contraste sobre a superfície.
 *
 * E ELE DIZ QUANTOS ATIVOS O PONTO SOMA, porque sem isso a curva engana: a frota de
 * doze meses atrás era menor que a de hoje, então a série mistura valor CAINDO por
 * depreciação com valor SUBINDO por compra. Um trecho ascendente parece defeito de
 * cálculo; "eram 40 ativos, hoje são 61" explica em uma linha.
 */
function TooltipDaCurva({ active, payload }: { active?: boolean; payload?: PontoDoTooltip[] }) {
  if (!active || !payload?.length) return null;
  const ponto = payload[0].payload;

  return (
    <div className="border border-border-sutil bg-bg-base px-3 py-2 font-mono text-xs">
      <div className="text-text-tertiary text-[10px] uppercase tracking-widest">
        {rotuloDoMes(ponto.mes)}
      </div>
      <div className="flex items-center gap-2 mt-1">
        <span className="inline-block w-2 h-2" style={{ backgroundColor: SERIE }} />
        <span className="text-text-primary">{formatarMoeda(String(ponto.valor))}</span>
      </div>
      <div className="text-text-tertiary text-[10px] mt-1">
        {ponto.ativos} ativo{ponto.ativos === 1 ? '' : 's'} com valor contábil
      </div>
    </div>
  );
}

export default function CurvaDeDepreciacao({ curva }: Props) {
  if (curva.length === 0) {
    return (
      <p className="text-text-tertiary text-[11px] border border-border-sutil bg-surface-card px-3 py-6 text-center">
        Sem série para desenhar: nenhum ativo tem custo de compra e regra de depreciação.
      </p>
    );
  }

  // `Number` só aqui, na borda de desenho: o valor viaja como string porque a
  // coluna é `Decimal`, e o gráfico é o único lugar que precisa dele como número.
  const dados = curva.map((ponto) => ({
    mes: ponto.mes,
    valor: Number(ponto.valor),
    ativos: ponto.ativos,
  }));

  return (
    <div className="border border-border-sutil bg-surface-card p-4">
      <h3 className="text-[10px] uppercase tracking-widest text-text-tertiary mb-4">
        Valor contábil da frota · últimos 12 meses
      </h3>

      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={dados} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
            <defs>
              {/* Preenchimento com alfa, não uma segunda cor: a área é a MESMA
                  série, e um tom diferente sugeriria uma segunda. */}
              <linearGradient id="curvaDeDepreciacao" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={SERIE} stopOpacity={0.28} />
                <stop offset="100%" stopColor={SERIE} stopOpacity={0.02} />
              </linearGradient>
            </defs>

            {/* Grade RECESSIVA e só horizontal: linha vertical em série temporal
                compete com o traço sem ajudar a ler valor. */}
            <CartesianGrid stroke={GRADE} strokeDasharray="2 4" vertical={false} />

            <XAxis
              dataKey="mes"
              tickFormatter={rotuloDoMes}
              tick={{ fill: TINTA_FRACA, fontSize: 10, fontFamily: 'var(--font-mono)' }}
              stroke={GRADE}
              tickLine={false}
            />
            <YAxis
              tickFormatter={rotuloDoValor}
              tick={{ fill: TINTA_FRACA, fontSize: 10, fontFamily: 'var(--font-mono)' }}
              stroke={GRADE}
              tickLine={false}
              width={52}
            />

            <Tooltip
              content={<TooltipDaCurva />}
              // A cruz é o que torna o hover legível numa curva: sem ela, o ponteiro
              // aponta para o meio do nada entre dois meses.
              cursor={{ stroke: TINTA_FRACA, strokeWidth: 1, strokeDasharray: '2 3' }}
            />

            <Area
              type="monotone"
              dataKey="valor"
              stroke={SERIE}
              strokeWidth={2}
              fill="url(#curvaDeDepreciacao)"
              // Sem marcador em cada ponto; só no ponto sob o ponteiro, e com anel
              // da superfície para ele não se fundir com o traço.
              dot={false}
              activeDot={{ r: 4, fill: SERIE, stroke: 'var(--color-bg-base)', strokeWidth: 2 }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
