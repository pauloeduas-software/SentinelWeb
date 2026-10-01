import { Link } from 'react-router-dom';
import { AlertTriangle, PackageOpen } from 'lucide-react';
import Indicador from './Indicador';
import { formatarMoeda } from '../../helpers/format.helper';
import type { RelatorioDeResponsabilidade } from '../../../domain/shared/lifecycle.types';

// O QUE CADA PESSOA RESPONDE (F10, Etapa F).
//
// AS TRÊS COLUNAS SÃO FATOS DIFERENTES, e é por isso que elas não são somadas
// numa só:
//
//   DIRETO  sai com a pessoa. É o que se cobra de volta num desligamento.
//   POSTO   fica na mesa. A pessoa responde solidariamente com os outros
//           ocupantes, e sai da conta dela com uma troca de escala — não com
//           uma devolução.
//   ATIVO   está preso a outro equipamento que é dela (a dock que segura o
//           notebook).
//
// Quem olha "a Laura responde por 14 equipamentos" e vai cobrar os 14 na saída
// dela está errado em 9 deles. A separação é a informação.

interface Props {
  relatorio: RelatorioDeResponsabilidade | undefined;
}

export default function AbaResponsabilidade({ relatorio }: Props) {
  if (!relatorio) return null;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <Indicador rotulo="Pessoas com responsabilidade" valor={String(relatorio.linhas.length)} />
        {/* `cor` só quando o número CARREGA um estado — é a regra que o
            `Indicador` documenta: cor num número é significado. */}
        <Indicador
          rotulo="Ativos sem ninguém"
          valor={String(relatorio.semResponsavel)}
          cor={relatorio.semResponsavel > 0 ? 'var(--color-status-warning)' : undefined}
          nota="No estoque ou em posto vago"
        />
        <Indicador
          rotulo="Desligados com posse"
          valor={String(relatorio.desligadosComPosse)}
          cor={relatorio.desligadosComPosse > 0 ? 'var(--color-status-danger)' : undefined}
          nota="Pendência de devolução"
        />
      </div>

      {relatorio.semResponsavel > 0 && (
        <p className="flex items-start gap-2 text-[11px] text-text-tertiary leading-relaxed border border-border-sutil px-3 py-2">
          <PackageOpen size={13} className="shrink-0 mt-0.5" />
          <span>
            {relatorio.semResponsavel} ativo(s) do parque não têm ninguém respondendo por eles: estão
            no estoque ou parados em posto vago.{' '}
            <Link to="/postos?view=vagos" className="text-status-info hover:underline">
              Ver os postos vagos
            </Link>{' '}
            — equipamento em mesa vazia é candidato a voltar para o estoque.
          </span>
        </p>
      )}

      <div className="border border-border-sutil overflow-x-auto">
        <table className="w-full text-left font-mono text-xs whitespace-nowrap">
          <thead className="bg-bg-base/50 text-text-secondary border-b border-border-sutil uppercase tracking-widest">
            <tr>
              <th className="px-4 py-3 font-normal">Pessoa</th>
              <th className="px-4 py-3 font-normal text-right">Direto</th>
              <th className="px-4 py-3 font-normal text-right">Por posto</th>
              <th className="px-4 py-3 font-normal text-right">Por ativo</th>
              <th className="px-4 py-3 font-normal text-right">Total</th>
              <th className="px-4 py-3 font-normal text-right">Custo</th>
            </tr>
          </thead>

          <tbody className="divide-y divide-border-sutil/50">
            {relatorio.linhas.map((linha) => (
              <tr key={linha.userId} className="hover:bg-bg-base transition-colors">
                <td className="px-4 py-3">
                  <Link to={`/users/${linha.userId}`} className="text-text-primary hover:underline">
                    {linha.name}
                  </Link>
                  <div className="text-[10px] text-text-tertiary mt-0.5">{linha.email}</div>
                  {/* O DESLIGADO QUE AINDA RESPONDE é pendência de devolução, e
                      aparecer aqui é de propósito: filtrado, o notebook na mão
                      de quem saiu da empresa desapareceria do relatório. */}
                  {linha.desligado && (
                    <div className="flex items-center gap-1.5 text-[10px] text-status-danger mt-1 uppercase tracking-widest">
                      <AlertTriangle size={11} /> fora de operação — cobrar devolução
                    </div>
                  )}
                </td>
                <td className="px-4 py-3 text-right tabular-nums text-text-secondary">{linha.diretos}</td>
                <td className="px-4 py-3 text-right tabular-nums text-text-secondary">{linha.porPosto}</td>
                <td className="px-4 py-3 text-right tabular-nums text-text-tertiary">{linha.porAtivo}</td>
                <td className="px-4 py-3 text-right tabular-nums text-text-primary">{linha.total}</td>
                <td className="px-4 py-3 text-right tabular-nums text-text-secondary">
                  {formatarMoeda(linha.custoTotal)}
                </td>
              </tr>
            ))}

            {relatorio.linhas.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-12 text-center text-text-tertiary">
                  Ninguém responde por equipamento nenhum ainda.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
