import { useState } from 'react';
import { Bell, Check, CheckCheck } from 'lucide-react';
import { Link } from 'react-router-dom';
import {
  useAlertsQuery, useMarkAlertRead, useMarkAllAlertsRead,
} from '../../domain/alert/alert.queries';
import type { Alerta } from '../../domain/shared/lifecycle.types';
import { formatarData } from '../helpers/format.helper';

// O SINO — a central de alertas no cabeçalho.
//
// ═════════════════════════════════════════════════════════════════════════════
// ELE É O CANAL PRIMÁRIO, NÃO UM ESPELHO DO E-MAIL (D57).
//
// Toda notificação vira LINHA em `alerts` antes de virar mensagem, e é por isso
// que o sino funciona num sistema sem SMTP configurado — que é o estado normal em
// desenvolvimento e em boa parte das instalações pequenas. O e-mail é a cópia; a
// linha é o registro.
//
// E ELE FICA NO CABEÇALHO, não no menu: três entradas novas de navegação nesta
// fase já levariam a barra para treze itens num `nav` que desaparece abaixo de
// `md`. Sino é sino — mora do lado de quem está logado.
// ═════════════════════════════════════════════════════════════════════════════
//
// "LIDO" NÃO É "RESOLVIDO": a garantia venceu de todo jeito. `readAt` apaga o
// número, não o problema — e é isso que a frase do rodapé diz.

/** A cor fala do PRAZO, não do tipo: o que urge é o que já venceu. */
function corDoPrazo(dias: number | undefined): string {
  if (dias === undefined) return 'var(--color-text-secondary)';
  if (dias < 0) return 'var(--color-status-danger)';
  if (dias <= 7) return 'var(--color-status-warning)';
  return 'var(--color-text-secondary)';
}

function textoDoPrazo(alerta: Alerta): string {
  const dias = alerta.payload?.dias;
  if (dias === undefined) return formatarData(alerta.dueAt);
  if (dias < 0) return `há ${Math.abs(dias)} dia(s)`;
  if (dias === 0) return 'hoje';
  return `em ${dias} dia(s)`;
}

export default function AlertBell() {
  const [aberto, setAberto] = useState(false);
  const { data } = useAlertsQuery();
  const marcar = useMarkAlertRead();
  const marcarTodos = useMarkAllAlertsRead();

  const naoLidos = data?.naoLidos ?? 0;
  // Só os NÃO lidos no sino: ele é uma caixa de entrada, não um histórico. O
  // histórico completo é a aba Alertas em /relatorios.
  const linhas = (data?.rows ?? []).filter((alerta) => alerta.readAt === null).slice(0, 12);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setAberto((estado) => !estado)}
        title={naoLidos > 0 ? `${naoLidos} alerta(s) não lido(s)` : 'Nenhum alerta não lido'}
        className={`relative p-2 transition-colors ${
          naoLidos > 0 ? 'text-status-warning hover:text-text-primary' : 'text-text-tertiary hover:text-text-primary'
        }`}
      >
        <Bell size={15} />
        {naoLidos > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[15px] h-[15px] px-1 flex items-center justify-center bg-status-warning text-bg-base text-[9px] font-mono rounded-full">
            {naoLidos > 99 ? '99+' : naoLidos}
          </span>
        )}
      </button>

      {aberto && (
        <>
          {/* A camada de fechar por clique fora. `fixed` e não `absolute`: o
              cabeçalho é `sticky` e um overlay absoluto não cobriria a página. */}
          <div className="fixed inset-0 z-40" onClick={() => setAberto(false)} aria-hidden />

          <div className="absolute right-0 top-full mt-2 w-[min(26rem,calc(100vw-2rem))] z-50 border border-border-sutil bg-surface-card font-mono text-xs shadow-2xl">
            <div className="flex items-center justify-between px-4 py-3 border-b border-border-sutil">
              <span className="uppercase tracking-widest text-[10px] text-text-tertiary">
                Alertas {naoLidos > 0 && `· ${naoLidos} não lido(s)`}
              </span>
              {naoLidos > 0 && (
                <button
                  type="button"
                  onClick={() => marcarTodos.mutate()}
                  disabled={marcarTodos.isPending}
                  className="flex items-center gap-1 text-[10px] uppercase tracking-widest text-text-tertiary hover:text-text-primary transition-colors disabled:opacity-40"
                >
                  <CheckCheck size={11} /> Marcar todos
                </button>
              )}
            </div>

            {linhas.length === 0 ? (
              <div className="px-4 py-8 text-center text-text-tertiary leading-relaxed">
                <Bell size={20} className="opacity-40 mx-auto mb-3" />
                <p>Nenhum alerta não lido.</p>
                <p className="text-[10px] mt-2 max-w-xs mx-auto">
                  A varredura roda uma vez por dia, na hora configurada. Garantia, fim de vida,
                  conferência vencida e manutenção em aberto viram linha aqui.
                </p>
              </div>
            ) : (
              <ul className="max-h-[60vh] overflow-y-auto divide-y divide-border-sutil/50">
                {linhas.map((alerta) => (
                  <li key={alerta.id} className="px-4 py-3 flex items-start gap-3 hover:bg-bg-base/40 transition-colors">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline gap-2">
                        <span className="text-[10px] uppercase tracking-widest text-text-tertiary">
                          {alerta.rotulo}
                        </span>
                        <span className="text-[10px]" style={{ color: corDoPrazo(alerta.payload?.dias) }}>
                          {textoDoPrazo(alerta)}
                        </span>
                      </div>
                      <div className="mt-1 truncate">
                        {alerta.asset ? (
                          <Link
                            to={`/ativos/${alerta.asset.id}`}
                            onClick={() => setAberto(false)}
                            className="text-text-primary hover:text-status-success transition-colors"
                          >
                            {alerta.asset.assetTag}
                          </Link>
                        ) : (
                          <span className="text-text-primary">Frota</span>
                        )}
                        {alerta.payload?.title && (
                          <span className="text-text-tertiary"> · {alerta.payload.title}</span>
                        )}
                        {!alerta.payload?.title && alerta.payload?.modelName && (
                          <span className="text-text-tertiary"> · {alerta.payload.modelName}</span>
                        )}
                      </div>
                    </div>

                    <button
                      type="button"
                      title="Marcar como lido"
                      onClick={() => marcar.mutate(alerta.id)}
                      className="p-1 text-text-tertiary hover:text-status-success transition-colors shrink-0"
                    >
                      <Check size={13} />
                    </button>
                  </li>
                ))}
              </ul>
            )}

            <div className="px-4 py-2 border-t border-border-sutil flex items-center justify-between">
              <span className="text-[10px] text-text-tertiary">Lido não é resolvido.</span>
              <Link
                to="/relatorios"
                onClick={() => setAberto(false)}
                className="text-[10px] uppercase tracking-widest text-text-tertiary hover:text-text-primary transition-colors"
              >
                Ver tudo
              </Link>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
