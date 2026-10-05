import { Armchair, ClipboardCheck, Search } from 'lucide-react';
import ConferenciaPanel from './components/ConferenciaPanel';
import { useAuditorias } from './hooks/useAuditorias';

// AS CONFERÊNCIAS (docs/historico/fase-08-ciclo-de-vida.md, Etapa B).
//
// ═════════════════════════════════════════════════════════════════════════════
// O POSTO É A UNIDADE DE TRABALHO; O REGISTRO É POR ATIVO (D54).
//
// Conferir a localização de um ativo, no modelo de posse, é conferir O POSTO:
// alguém anda até a Mesa 1 uma vez e olha o que está lá. Mas a linha de auditoria
// é uma por ATIVO — porque *"quais ativos nunca foram auditados"* é a pergunta que
// paga esta fase, e ela não é respondível por linha de posto. No caminho inverso,
// "quando a Mesa 1 foi conferida?" é o `MAX` das conferências dos ativos dela:
// derivável, e derivável é o lado certo de ficar.
// ═════════════════════════════════════════════════════════════════════════════
//
// A TELA NÃO ESCOLHE O RESULTADO de cada ativo: ela manda quem estava lá e quem
// não apareceu. `OK` × `DIVERGENTE` depende de onde o ativo ESTAVA, que é
// informação do servidor (ver o hook).
//
// Markup e mais nada: estado e chamadas ficam no `useAuditorias`.
export default function AuditoriasPage() {
  const {
    postos, totalDePostos, postosPendentes, page, perPage, setPage, busca, changeBusca,
    postoId, escolherPosto, conferencia, conferenciaPendente,
    presentes, alternar, marcarTodos, desmarcarTodos, idsVisiveis,
    notas, setNotas, conferindo, resultado, handleConferir,
  } = useAuditorias();

  const totalDePaginas = Math.max(1, Math.ceil(totalDePostos / perPage));

  return (
    <div className="animate-in fade-in duration-300 flex flex-col pb-6">

      <div className="mb-6">
        <h2 className="text-xl font-mono text-text-primary uppercase tracking-widest">Auditorias</h2>
        <p className="text-xs text-text-tertiary mt-2 font-mono max-w-3xl leading-relaxed">
          A conferência física, feita por posto. O sistema corrige <span className="text-text-secondary">onde
          o ativo está</span> e apenas MARCA quem responde por ele — mover a posse a partir de uma
          observação transferiria responsabilidade por palpite. Corrigir posse é entrega, em Postos.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-6 font-mono text-xs">

        <aside className="space-y-3">
          <div className="relative">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-tertiary" />
            <input
              value={busca}
              onChange={(evento) => changeBusca(evento.target.value)}
              placeholder="Buscar posto..."
              className="w-full pl-9 pr-3 py-2 bg-bg-base border border-border-sutil text-text-primary focus:outline-none focus:border-text-secondary transition-colors"
            />
          </div>

          {postosPendentes ? (
            <p className="text-text-tertiary">Carregando postos…</p>
          ) : postos.length === 0 ? (
            <p className="text-text-tertiary border border-border-sutil bg-surface-card px-3 py-3 leading-relaxed">
              Nenhum posto cadastrado. A conferência é por posto — cadastre a mesa, a bancada ou o
              guichê em Postos.
            </p>
          ) : (
            <ul className="border border-border-sutil bg-surface-card divide-y divide-border-sutil/50 max-h-[60vh] overflow-y-auto">
              {postos.map((posto) => (
                <li key={posto.id}>
                  <button
                    type="button"
                    onClick={() => escolherPosto(posto.id)}
                    className={`w-full text-left px-3 py-2 transition-colors ${
                      posto.id === postoId ? 'bg-text-primary text-bg-base' : 'hover:bg-bg-base'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <Armchair size={12} className="shrink-0" />
                      <span className="truncate">{posto.name}</span>
                    </div>
                    <div className={`text-[10px] mt-0.5 ${posto.id === postoId ? 'text-bg-base/70' : 'text-text-tertiary'}`}>
                      {posto.caminho.length > 0 && <>{posto.caminho.join(' › ')} · </>}
                      {posto.totalAtivos} ativo(s) · {posto.totalOcupantes} ocupante(s)
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}

          {totalDePaginas > 1 && (
            <div className="flex items-center justify-between text-[10px] uppercase tracking-widest text-text-tertiary">
              <button
                type="button"
                disabled={page === 1}
                onClick={() => setPage(page - 1)}
                className="px-2 py-1 border border-border-sutil disabled:opacity-30 hover:text-text-primary transition-colors"
              >
                Anterior
              </button>
              <span>{page} / {totalDePaginas}</span>
              <button
                type="button"
                disabled={page >= totalDePaginas}
                onClick={() => setPage(page + 1)}
                className="px-2 py-1 border border-border-sutil disabled:opacity-30 hover:text-text-primary transition-colors"
              >
                Próxima
              </button>
            </div>
          )}
        </aside>

        <section className="space-y-4">
          {!postoId ? (
            <div className="flex flex-col items-center justify-center py-20 border border-border-sutil bg-surface-card text-text-tertiary gap-3">
              <ClipboardCheck size={24} className="opacity-50" />
              <span>Escolha um posto para conferir.</span>
              <span className="text-[10px] max-w-md text-center leading-relaxed">
                A tela mostra duas listas: o que É deste posto e o que ESTÁ neste posto. A diferença
                entre elas é a divergência que a auditoria veio procurar.
              </span>
            </div>
          ) : conferenciaPendente || !conferencia ? (
            <p className="text-text-tertiary">Carregando a conferência do posto…</p>
          ) : (
            <>
              <header className="border border-border-sutil bg-surface-card px-4 py-3">
                <div className="text-sm text-text-primary uppercase tracking-widest">
                  {conferencia.location.name}
                </div>
                {!conferencia.location.isWorkstation && (
                  <div className="text-[10px] text-status-warning mt-1">
                    Esta localização não está marcada como posto de trabalho — conferir funciona
                    igual, mas ela não aparece em Postos.
                  </div>
                )}
              </header>

              <ConferenciaPanel
                conferencia={conferencia}
                presentes={presentes}
                onAlternar={alternar}
                onMarcarTodos={marcarTodos}
                onDesmarcarTodos={desmarcarTodos}
              />

              {idsVisiveis.length > 0 && (
                <div className="border border-border-sutil bg-surface-card p-4 space-y-3">
                  <label className="block">
                    <span className="text-[10px] uppercase tracking-widest text-text-tertiary">
                      Observações da conferência
                    </span>
                    <textarea
                      rows={2}
                      value={notas}
                      onChange={(evento) => setNotas(evento.target.value)}
                      placeholder="Vale para todas as linhas desta conferência."
                      className="mt-1 w-full p-2 bg-bg-base border border-border-sutil text-text-primary focus:outline-none focus:border-text-secondary transition-colors resize-y"
                    />
                  </label>

                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <p className="text-[10px] text-text-tertiary leading-relaxed max-w-md">
                      {presentes.size} marcado(s) como presente(s) ·{' '}
                      <span className="text-status-warning">
                        {idsVisiveis.length - presentes.size} irão como NÃO LOCALIZADO
                      </span>
                      . Tudo grava numa transação: meia conferência não existe.
                    </p>
                    <button
                      type="button"
                      disabled={conferindo}
                      onClick={() => void handleConferir()}
                      className="flex items-center gap-2 px-4 py-2 bg-text-primary text-bg-base hover:bg-text-secondary uppercase tracking-widest text-[10px] transition-colors disabled:opacity-40"
                    >
                      <ClipboardCheck size={12} /> {conferindo ? 'Registrando…' : 'Registrar conferência'}
                    </button>
                  </div>

                  {resultado && (
                    <div className="border border-status-success/40 bg-status-success/10 text-status-success px-3 py-2">
                      {resultado}
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </section>
      </div>
    </div>
  );
}
