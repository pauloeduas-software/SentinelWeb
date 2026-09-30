import Indicador from './Indicador';
import type { RelatorioDeManutencoes } from '../../../domain/shared/lifecycle.types';
import { formatarMoeda } from '../../helpers/format.helper';
import { rotuloDoTipo } from '../../manutencoes/helpers/manutencao.helper';

// MANUTENÇÕES: CUSTO ACUMULADO, EM ABERTO E POR TIPO.
//
// O resumo vem do DOMÍNIO de manutenção, não de um agregado escrito aqui: a regra
// de o que conta como custo — ativo vivo, `Decimal` somado, garantia contada à
// parte — mora num lugar só. Relatório LÊ do domínio.
//
// A DISTRIBUIÇÃO POR TIPO É BARRA, e não pizza: a pergunta é "onde o dinheiro
// está indo", que se responde comparando comprimentos. Pizza pede comparação de
// ângulos, que ninguém faz bem — e com cinco fatias fica ilegível.

export default function AbaManutencoes({ dados }: { dados: RelatorioDeManutencoes }) {
  // Cálculo fora do JSX (docs/ARQUITETURA.md). O maior custo é o denominador da
  // barra: normalizar pelo total faria a linha maior ocupar 30% da largura e o
  // gráfico inteiro parecer vazio.
  const maior = dados.porTipo.reduce((maximo, linha) => Math.max(maximo, Number(linha.custo)), 0);

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <Indicador rotulo="Custo acumulado" valor={formatarMoeda(dados.custoTotal)} />
        <Indicador
          rotulo="Em aberto"
          valor={String(dados.emAberto)}
          cor={dados.emAberto > 0 ? 'var(--color-status-warning)' : undefined}
        />
        <Indicador
          rotulo="Custo coberto por garantia"
          valor={formatarMoeda(dados.custoNaGarantia)}
          cor="var(--color-chart-serie)"
          nota="quanto o contrato economizou"
        />
        <Indicador rotulo="Registros" valor={String(dados.total)} />
      </div>

      <section className="space-y-2">
        <h3 className="text-[10px] uppercase tracking-widest text-text-secondary">Custo por tipo</h3>

        {dados.porTipo.length === 0 ? (
          <p className="text-text-tertiary text-[11px] border border-border-sutil bg-surface-card px-3 py-3">
            Nenhuma manutenção registrada. O custo por tipo aparece a partir da primeira.
          </p>
        ) : (
          <div className="border border-border-sutil bg-surface-card p-4 space-y-3">
            {dados.porTipo.map((linha) => {
              const custo = Number(linha.custo);
              // Piso de 2% para a linha de custo zero ainda existir visualmente: uma
              // barra de largura nenhuma parece linha que não carregou.
              const largura = maior > 0 ? Math.max(2, (custo / maior) * 100) : 2;

              return (
                <div key={linha.type} className="space-y-1">
                  <div className="flex items-baseline justify-between gap-3 text-[11px]">
                    {/* O rótulo é TEXTO, não a cor da barra: identidade nunca depende
                        só de cor. */}
                    <span className="text-text-secondary">{rotuloDoTipo(linha.type)}</span>
                    <span className="text-text-tertiary">
                      {linha.quantidade} registro(s) ·{' '}
                      <span className="text-text-primary">{formatarMoeda(linha.custo)}</span>
                    </span>
                  </div>
                  <div className="h-2 bg-bg-base border border-border-sutil/50">
                    <div
                      className="h-full"
                      style={{ width: `${largura}%`, backgroundColor: 'var(--color-chart-serie)' }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
