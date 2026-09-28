import { Link } from 'react-router-dom';
import { BatteryWarning } from 'lucide-react';
import type { AtivoOcioso } from '../../../domain/shared/reconciliation.types';

// "NINGUÉM USA" × "NINGUÉM RESPONDE" — duas conversas diferentes, com duas
// pessoas diferentes.
//
// A coluna `postoVago` é a que nenhum ITAM de prateleira tem como preencher:
// ela só existe porque há uma camada entre o ativo e a pessoa
// (docs/MODELO-POSSE.md). Um notebook ocioso COM responsável é uma conversa
// ("você ainda precisa disto?"); um desktop ocioso numa mesa VAZIA é outra
// ("isto volta para o estoque").

interface Props {
  ociosos: AtivoOcioso[];
}

const CABECALHO = 'px-3 py-2 text-left text-[10px] uppercase tracking-widest text-text-tertiary font-normal';

export default function OciososTable({ ociosos }: Props) {
  if (ociosos.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-text-tertiary gap-3 border border-border-sutil">
        <BatteryWarning size={24} className="opacity-50" />
        <span>Nenhum ativo ocioso nos últimos 30 dias.</span>
        <span className="text-[10px] max-w-md text-center leading-relaxed">
          Só entram aqui ativos COM agente: um monitor não tem telemetria e nunca terá.
        </span>
      </div>
    );
  }

  return (
    <table className="w-full border border-border-sutil text-xs font-mono">
      <thead className="bg-bg-surface border-b border-border-sutil">
        <tr>
          <th className={CABECALHO}>Ativo</th>
          <th className={CABECALHO}>Máquina</th>
          <th className={CABECALHO}>Último uso</th>
          <th className={CABECALHO}>Quem responde</th>
        </tr>
      </thead>
      <tbody>
        {ociosos.map((ativo) => (
          <tr key={ativo.assetId} className="border-b border-border-sutil last:border-0">
            <td className="px-3 py-2">
              <Link to={`/ativos/${ativo.assetId}`} className="text-status-info hover:underline">
                {ativo.assetTag}
              </Link>
              {ativo.name && <span className="text-text-tertiary"> — {ativo.name}</span>}
            </td>
            <td className="px-3 py-2 text-text-secondary">{ativo.hostname ?? '—'}</td>
            <td className="px-3 py-2 text-text-tertiary">
              {ativo.ultimoUso ? `${ativo.ultimoUso} (${ativo.diasSemUso} dias)` : 'nunca registrado'}
            </td>
            <td className="px-3 py-2">
              {ativo.postoVago ? (
                <span className="text-status-warning">posto vago — ninguém responde</span>
              ) : ativo.responsaveis.length > 0 ? (
                <span className="text-text-secondary">
                  {ativo.responsaveis.map((pessoa) => pessoa.name).join(', ')}
                </span>
              ) : (
                <span className="text-text-tertiary">no estoque</span>
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
