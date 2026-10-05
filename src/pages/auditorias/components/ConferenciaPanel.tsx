import { AlertTriangle, ArrowRight, ScanSearch, UserX } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { ConferenciaDoPosto, ItemDaConferencia } from '../../../domain/shared/lifecycle.types';
import { formatarData } from '../../helpers/format.helper';

// AS DUAS LISTAS DO POSTO — e a diferença entre elas *É* a divergência.
//
// ═════════════════════════════════════════════════════════════════════════════
// FUNDIR AS DUAS ESCONDE O QUE A AUDITORIA VEIO PROCURAR.
//
//   em "é deste posto" e NÃO em "está neste posto" → sumiu da mesa
//   em "está neste posto" e NÃO em "é deste posto" → é o mouse reserva da gaveta,
//                                                    caso LEGÍTIMO que a
//                                                    auditoria não deve
//                                                    transformar em posse (D52)
//
// Uma lista única com um selo "divergente" contaria a mesma coisa de um jeito que
// ninguém lê: o segundo caso não é um problema, e apareceria marcado como se
// fosse.
// ═════════════════════════════════════════════════════════════════════════════

interface Props {
  conferencia: ConferenciaDoPosto;
  presentes: Set<string>;
  onAlternar: (assetId: string) => void;
  onMarcarTodos: () => void;
  onDesmarcarTodos: () => void;
}

export default function ConferenciaPanel({
  conferencia, presentes, onAlternar, onMarcarTodos, onDesmarcarTodos,
}: Props) {
  // Cálculo fora do JSX (docs/referencia/arquitetura.md).
  const idsAqui = new Set(conferencia.noPosto.map((item) => item.asset.id));
  const sumidos = conferencia.doPosto.filter((item) => !idsAqui.has(item.asset.id));
  const postoVago = conferencia.ocupantes === 0 && conferencia.doPosto.length > 0;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-[10px] uppercase tracking-widest text-text-tertiary">
          {conferencia.ocupantes} ocupante(s) · {conferencia.doPosto.length} deste posto ·{' '}
          {conferencia.noPosto.length} aqui
        </div>
        <div className="flex gap-2 text-[10px] uppercase tracking-widest">
          <button type="button" onClick={onMarcarTodos} className="px-3 py-1.5 border border-border-sutil text-text-tertiary hover:text-text-primary transition-colors">
            Marcar todos
          </button>
          <button type="button" onClick={onDesmarcarTodos} className="px-3 py-1.5 border border-border-sutil text-text-tertiary hover:text-text-primary transition-colors">
            Limpar
          </button>
        </div>
      </div>

      {postoVago && (
        // O POSTO VAGO aparece ANTES das listas: é o achado que muda o que fazer
        // com o que está na mesa. Equipamento entregue a um posto sem ninguém é
        // candidato a voltar para o estoque.
        <div className="flex items-start gap-2 border border-status-warning/40 bg-status-warning/10 px-3 py-2 text-status-warning text-[11px] leading-relaxed">
          <UserX size={13} className="mt-0.5 shrink-0" />
          <span>
            <strong>Posto vago:</strong> há equipamento entregue a este posto e nenhuma ocupação
            aberta. A conferência marca isso em cada linha de auditoria — cadastrar o ocupante ou
            devolver ao estoque são operações de posse, feitas em Postos.
          </span>
        </div>
      )}

      <Lista
        titulo="É deste posto"
        explicacao="A posse aberta aponta para cá. O que não estiver marcado abaixo vira NÃO LOCALIZADO."
        itens={conferencia.doPosto}
        presentes={presentes}
        onAlternar={onAlternar}
        vazio="Nenhum ativo está entregue a este posto."
      />

      {sumidos.length > 0 && (
        <div className="flex items-start gap-2 border border-border-sutil bg-bg-base/40 px-3 py-2 text-text-tertiary text-[11px] leading-relaxed">
          <AlertTriangle size={13} className="mt-0.5 shrink-0 text-status-warning" />
          <span>
            {sumidos.length} ativo(s) deste posto estão registrados em OUTRO lugar:{' '}
            {sumidos.map((item) => item.asset.assetTag).join(', ')}. Se você os encontrar aqui,
            marque-os — a conferência move a localização e registra de onde vieram.
          </span>
        </div>
      )}

      <Lista
        titulo="Está neste posto"
        explicacao="A localização gravada é cá, seja de quem for a posse. O mouse reserva da gaveta é caso legítimo — a auditoria não o transforma em posse."
        itens={conferencia.noPosto}
        presentes={presentes}
        onAlternar={onAlternar}
        vazio="Nenhum ativo tem este posto como localização."
      />
    </div>
  );
}

interface ListaProps {
  titulo: string;
  explicacao: string;
  itens: ItemDaConferencia[];
  presentes: Set<string>;
  onAlternar: (assetId: string) => void;
  vazio: string;
}

function Lista({ titulo, explicacao, itens, presentes, onAlternar, vazio }: ListaProps) {
  return (
    <section className="space-y-2">
      <header className="space-y-1">
        <div className="flex items-center gap-2 text-text-secondary uppercase tracking-widest text-[10px]">
          <ScanSearch size={12} /> {titulo}
        </div>
        <p className="text-[10px] text-text-tertiary leading-relaxed max-w-2xl">{explicacao}</p>
      </header>

      {itens.length === 0 ? (
        <p className="text-text-tertiary text-[11px] border border-border-sutil bg-surface-card px-3 py-3">{vazio}</p>
      ) : (
        <ul className="border border-border-sutil bg-surface-card divide-y divide-border-sutil/50">
          {itens.map((item) => {
            const marcado = presentes.has(item.asset.id);
            return (
              <li key={item.asset.id} className="flex items-center gap-3 px-3 py-2">
                <input
                  type="checkbox"
                  checked={marcado}
                  onChange={() => onAlternar(item.asset.id)}
                  className="accent-status-success shrink-0"
                  aria-label={`Marcar ${item.asset.assetTag} como presente`}
                />
                <div className="min-w-0 flex-1">
                  <Link
                    to={`/ativos/${item.asset.id}`}
                    className="text-text-primary hover:text-status-success transition-colors"
                  >
                    {item.asset.assetTag}
                  </Link>
                  <span className="text-text-tertiary">
                    {' '}· {item.asset.name ?? `${item.asset.model.manufacturer.name} ${item.asset.model.name}`}
                  </span>
                  <div className="text-[10px] text-text-tertiary mt-0.5 flex flex-wrap gap-x-3">
                    {item.asset.serial && <span>SN {item.asset.serial}</span>}
                    <span>
                      {item.asset.lastAuditAt
                        ? `conferido em ${formatarData(item.asset.lastAuditAt)}`
                        : 'nunca conferido'}
                    </span>
                    {/* O selo que explica a divergência SEM fundir as listas. */}
                    {item.daPosse && !item.aqui && (
                      <span className="text-status-warning flex items-center gap-1">
                        <ArrowRight size={9} /> registrado em outro local
                      </span>
                    )}
                    {!item.daPosse && item.aqui && (
                      <span className="text-text-tertiary">está aqui, não é deste posto</span>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
