import { FolderSync, RefreshCw, TriangleAlert } from 'lucide-react';
import { useDiretorioLigado, useSincronizarDiretorio } from '../../../domain/access/access.queries';

/**
 * A SINCRONIZAÇÃO COM O DIRETÓRIO, à mão (F11, Etapa I).
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * O BOTÃO EXISTE PARA TRÊS MOMENTOS, e nenhum deles é o dia a dia — o caminho
 * normal é o job diário:
 *
 *   1. conferir a configuração no dia em que ela é escrita, sem esperar a janela;
 *   2. trazer uma contratação que o diretório acabou de receber;
 *   3. revisar depois de resolver um conflito (o vínculo explícito do D78).
 *
 * E O RESULTADO APARECE NA TELA, não só no log: quem administra o inventário não
 * tem acesso ao contêiner, e um botão que responde "ok" sem dizer o que fez é um
 * botão que ninguém clica duas vezes.
 *
 * ⚠️ `marcados` NÃO é desligamento. A sincronização marca para revisão e para aí
 * (D78); a frase na tela diz isso, porque "12 marcados" se lê como "12 desligados"
 * por quem não leu o schema.
 * ═══════════════════════════════════════════════════════════════════════════
 */
export default function DiretorioPanel() {
  const { data: diretorio } = useDiretorioLigado();
  const sincronizar = useSincronizarDiretorio();
  const resultado = sincronizar.data;

  // DESLIGADO NÃO MOSTRA BOTÃO, mostra o que fazer para ligar. A configuração é
  // de ambiente (segredo de serviço, não configuração de produto — ver
  // `directory-config.helper.ts`), então ela não tem campo nesta tela de propósito.
  if (!diretorio?.ldap) {
    return (
      <section className="space-y-2 border border-border-sutil bg-surface-card p-4 font-mono text-xs">
        <h3 className="flex items-center gap-2 uppercase tracking-widest text-text-primary">
          <FolderSync size={14} className="text-text-tertiary" />
          Diretório (LDAP / Active Directory)
        </h3>
        <p className="max-w-2xl leading-relaxed text-text-tertiary">
          Desligado neste servidor. Para ligar, defina <code>LDAP_URL</code>,{' '}
          <code>LDAP_BIND_DN</code>, <code>LDAP_BIND_PASSWORD</code> e <code>LDAP_BASE_DN</code> no
          ambiente e reinicie. São segredos de serviço: eles ficam fora do banco e fora desta tela
          de propósito — quem os troca é quem tem o servidor, não quem tem uma sessão.
        </p>
      </section>
    );
  }

  return (
    <section className="space-y-3 border border-border-sutil bg-surface-card p-4 font-mono text-xs">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h3 className="flex items-center gap-2 uppercase tracking-widest text-text-primary">
            <FolderSync size={14} className="text-text-tertiary" />
            Diretório (LDAP / Active Directory)
          </h3>
          <p className="max-w-2xl leading-relaxed text-text-tertiary">
            Roda sozinha uma vez por dia, na mesma hora dos alertas. Ela traz e atualiza pessoas —
            e <strong className="text-text-secondary">nunca desliga ninguém</strong>: quem sai do
            diretório é apenas marcado para revisão na ficha dele.
          </p>
        </div>

        <button
          type="button"
          onClick={() => sincronizar.mutate()}
          disabled={sincronizar.isPending}
          className="flex shrink-0 items-center gap-2 border border-border-sutil px-3 py-2 uppercase tracking-widest text-text-secondary transition-colors hover:bg-bg-base hover:text-text-primary disabled:opacity-50"
        >
          <RefreshCw size={13} className={sincronizar.isPending ? 'animate-spin' : ''} />
          {sincronizar.isPending ? 'Sincronizando...' : 'Sincronizar agora'}
        </button>
      </div>

      {sincronizar.error && (
        <p className="border border-status-danger/40 bg-status-danger/10 p-2 text-status-danger">
          {(sincronizar.error as Error).message}
        </p>
      )}

      {resultado && (
        <div className="space-y-3 border-t border-border-sutil pt-3">
          <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
            {[
              ['lidas', resultado.lidas],
              ['criados', resultado.criados],
              ['atualizados', resultado.atualizados],
              ['vinculados', resultado.vinculados],
              ['marcados', resultado.marcados],
              ['voltaram', resultado.desmarcados],
            ].map(([rotulo, valor]) => (
              <li key={rotulo} className="border border-border-sutil bg-bg-base p-2">
                <span className="block text-[10px] uppercase tracking-widest text-text-tertiary">
                  {rotulo}
                </span>
                <span className="text-base tabular-nums text-text-primary">{valor}</span>
              </li>
            ))}
          </ul>

          {resultado.marcados > 0 && (
            <p className="text-[10px] leading-relaxed text-text-tertiary">
              <strong className="text-status-warning">{resultado.marcados}</strong> pessoa(s)
              deixaram de aparecer no diretório e foram MARCADAS para revisão — nenhuma foi
              desligada. A marca aparece na ficha de cada uma, em Acesso.
            </p>
          )}

          {resultado.conflitos.length > 0 && (
            <div className="space-y-2">
              <p className="flex items-center gap-2 text-status-warning">
                <TriangleAlert size={13} />
                <span className="uppercase tracking-widest text-[10px]">
                  {resultado.conflitos.length} conflito(s) — exigem decisão de alguém
                </span>
              </p>
              <ul className="space-y-1">
                {resultado.conflitos.map((conflito) => (
                  <li key={conflito.identificacao} className="border border-border-sutil bg-bg-base p-2">
                    <span className="block text-text-primary">{conflito.identificacao}</span>
                    <span className="block text-[10px] leading-relaxed text-text-tertiary">
                      {conflito.motivo}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
