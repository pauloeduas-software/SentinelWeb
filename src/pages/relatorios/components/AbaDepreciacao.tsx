import { lazy, Suspense } from 'react';
import { Link } from 'react-router-dom';
import Indicador from './Indicador';
import type { RelatorioDeDepreciacao } from '../../../domain/shared/lifecycle.types';
import { formatarData, formatarMoeda } from '../../helpers/format.helper';

// A ABA DEPRECIAÇÃO — e a decisão dela são os TRÊS BALDES.
//
// ═════════════════════════════════════════════════════════════════════════════
// `null` NÃO É ZERO, E A TELA MOSTRA OS TRÊS MOTIVOS SEPARADOS.
//
// Um ativo pode não ter valor contábil por três razões — sem custo de compra, sem
// regra no modelo, sem data de compra — e nenhuma delas vale zero. Se a tela
// mostrasse só o total, ele seria um número plausível e MENOR que a realidade, do
// tipo que ninguém confere porque aparece formatado.
//
// Os três contadores ao lado do total são o que transforma "a frota vale X" em "a
// frota vale X, e 43 ativos não entram nessa conta — por estes motivos".
// ═════════════════════════════════════════════════════════════════════════════

/**
 * O GRÁFICO CHEGA EM PEDIDO SEPARADO — e é isto que a decisão da fase prometia.
 *
 * `recharts` são ~250 kB minificados. Com `import` comum, ele entra no chunk de
 * ENTRADA: quem abre a lista de ativos e nunca clica em Relatórios baixa a
 * biblioteca de gráfico de qualquer jeito. Medido neste projeto: o chunk de entrada
 * caiu de 1.030 kB para 694 kB, e os 336 kB do gráfico viraram um pedido que só sai
 * quando alguém abre esta aba.
 *
 * `lazy` no escopo do MÓDULO, nunca dentro do componente: lá ele criaria um
 * componente novo a cada render, e o React remontaria o gráfico inteiro (e
 * baixaria o chunk de novo) a cada mudança de estado da página.
 */
const CurvaDeDepreciacao = lazy(() => import('./CurvaDeDepreciacao'));

const MOTIVO: Record<string, string> = {
  SEM_CUSTO: 'sem custo de compra',
  SEM_REGRA: 'modelo sem regra',
  SEM_DATA: 'sem data de compra',
};

const CABECALHO = 'px-3 py-2 text-left text-[10px] uppercase tracking-widest text-text-tertiary font-normal';

export default function AbaDepreciacao({ dados }: { dados: RelatorioDeDepreciacao }) {
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <Indicador rotulo="Custo de aquisição" valor={formatarMoeda(dados.custoTotal)} />
        <Indicador
          rotulo="Valor contábil hoje"
          valor={formatarMoeda(dados.valorAtualTotal)}
          cor="var(--color-chart-serie)"
        />
        <Indicador
          rotulo="Depreciação acumulada"
          valor={formatarMoeda(dados.depreciacaoAcumulada)}
          nota={`sobre ${formatarMoeda(dados.custoDepreciavel)} depreciáveis`}
        />
        <Indicador rotulo="Ativos com valor" valor={`${dados.comValor} / ${dados.total}`} />
      </div>

      {/* Os três baldes, com o motivo escrito. Eles não são erro: são cadastro
          incompleto, e cada um tem uma ação diferente. */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-[11px]">
        <Balde rotulo="Sem custo de compra" quantos={dados.semCusto} acao="preencher o valor pago" />
        <Balde rotulo="Modelo sem regra" quantos={dados.semDepreciacao} acao="pendurar uma depreciação no modelo" />
        <Balde rotulo="Sem data de compra" quantos={dados.semData} acao="preencher a data da nota" />
      </div>

      <Suspense
        fallback={
          <div className="border border-border-sutil bg-surface-card px-4 py-16 text-center text-text-tertiary text-[11px]">
            Carregando o gráfico…
          </div>
        }
      >
        <CurvaDeDepreciacao curva={dados.curva} />
      </Suspense>

      {/* A TABELA É A VISTA ALTERNATIVA do gráfico, e por isso ela existe mesmo
          com a curva ali em cima: quem não distingue a cor, quem imprime e quem
          precisa do número exato lê aqui.

          Ela tem TETO, e os totais acima não: uma resposta com dez mil linhas são
          megabytes de JSON por abertura de aba. O aviso existe porque cortar sem
          dizer que cortou é o erro que esta aba inteira combate. */}
      {dados.linhasTruncadas && (
        <p className="text-[10px] text-text-tertiary border-l-2 border-border-sutil pl-3">
          A tabela mostra os primeiros {dados.linhas.length} de {dados.total} ativos,
          por etiqueta. Os totais e a curva acima são da frota inteira.
        </p>
      )}

      <div className="border border-border-sutil bg-surface-card overflow-x-auto">
        <table className="w-full">
          <thead className="border-b border-border-sutil bg-bg-base/40">
            <tr>
              <th className={CABECALHO}>Ativo</th>
              <th className={CABECALHO}>Modelo</th>
              <th className={CABECALHO}>Regra</th>
              <th className={CABECALHO}>Compra</th>
              <th className={`${CABECALHO} text-right`}>Custo</th>
              <th className={`${CABECALHO} text-right`}>Decorrido</th>
              <th className={`${CABECALHO} text-right`}>Valor hoje</th>
            </tr>
          </thead>
          <tbody>
            {dados.linhas.map((linha) => (
              <tr key={linha.assetId} className="border-b border-border-sutil/40 last:border-0 hover:bg-bg-base/40 transition-colors">
                <td className="px-3 py-2">
                  <Link to={`/ativos/${linha.assetId}`} className="text-text-primary hover:text-status-success transition-colors">
                    {linha.assetTag}
                  </Link>
                  {linha.name && <span className="text-text-tertiary"> · {linha.name}</span>}
                </td>
                <td className="px-3 py-2 text-text-tertiary">{linha.modelName}</td>
                <td className="px-3 py-2 text-text-tertiary">{linha.depreciationName ?? '—'}</td>
                <td className="px-3 py-2 text-text-tertiary">{formatarData(linha.purchaseDate)}</td>
                <td className="px-3 py-2 text-right text-text-secondary">{formatarMoeda(linha.purchaseCost)}</td>
                <td className="px-3 py-2 text-right text-text-tertiary">
                  {linha.mesesDecorridos !== null && linha.mesesTotais !== null
                    ? `${Math.min(linha.mesesDecorridos, linha.mesesTotais)}/${linha.mesesTotais} m`
                    : '—'}
                </td>
                <td className="px-3 py-2 text-right">
                  {linha.valorAtual !== null ? (
                    <span className="text-text-primary">{formatarMoeda(linha.valorAtual)}</span>
                  ) : (
                    // O MOTIVO no lugar do número, e não um traço: "—" faria o
                    // leitor supor zero, que é justamente o erro que esta aba evita.
                    <span className="text-text-tertiary text-[10px]">{MOTIVO[linha.motivo ?? ''] ?? '—'}</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Balde({ rotulo, quantos, acao }: { rotulo: string; quantos: number; acao: string }) {
  return (
    <div className="border border-border-sutil bg-surface-card px-3 py-2">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[10px] uppercase tracking-widest text-text-tertiary">{rotulo}</span>
        <span className={quantos > 0 ? 'text-status-warning' : 'text-text-tertiary'}>{quantos}</span>
      </div>
      {quantos > 0 && (
        <div className="text-[10px] text-text-tertiary mt-1 leading-relaxed">Para entrar na conta: {acao}.</div>
      )}
    </div>
  );
}
