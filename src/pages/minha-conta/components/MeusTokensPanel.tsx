import { KeyRound, Plus, ShieldOff, X } from 'lucide-react';
import { formatarData } from '../../helpers/format.helper';
import type { useMinhaConta } from '../hooks/useMinhaConta';

type Conta = ReturnType<typeof useMinhaConta>;

const CELULA = 'px-4 py-3';

/**
 * OS MEUS TOKENS DE API.
 *
 * Irmã da tela de tokens do AGENTE (`/tokens`) e separada dela de propósito: lá o
 * token é de uma MÁQUINA da frota e emitir exige `access.manage`; aqui ele é da
 * pessoa, age com as permissões dela e não exige chave nenhuma — ninguém precisa
 * de autorização para criar uma credencial própria mais fraca que a própria senha.
 */
export default function MeusTokensPanel({ conta }: { conta: Conta }) {
  return (
    <section className="space-y-4 border border-border-sutil bg-surface-card p-4">
      <header className="space-y-1 border-b border-border-sutil pb-3">
        <h3 className="flex items-center gap-2 uppercase tracking-widest text-text-primary">
          <KeyRound size={14} className="text-text-tertiary" />
          Meus tokens de API
        </h3>
        <p className="max-w-xl text-[10px] leading-relaxed text-text-tertiary">
          Para script e integração. O token age <strong className="text-text-secondary">como você</strong>:
          mesmas permissões, mesmo nome no histórico. O que ele não faz é mexer na sua credencial —
          não troca senha, não emite outro token e não altera a verificação em duas etapas.
        </p>
      </header>

      {conta.segredo && (
        <div className="space-y-3 border border-status-success/50 bg-status-success/5 p-3">
          <div className="flex items-start justify-between gap-3">
            <p className="text-text-primary">Copie agora — esta é a única vez que ele aparece.</p>
            <button
              type="button"
              onClick={conta.fecharSegredo}
              title="Já copiei"
              className="shrink-0 text-text-tertiary hover:text-text-primary"
            >
              <X size={14} />
            </button>
          </div>
          <code className="block select-all break-all border border-border-sutil bg-bg-base p-3 text-text-primary">
            {conta.segredo}
          </code>
          <p className="text-[10px] leading-relaxed text-text-tertiary">
            Use como <code>Authorization: Bearer &lt;token&gt;</code>. O servidor guarda só o hash:
            não há rota para relê-lo, e é isso que o torna seguro de deixar no banco.
          </p>
        </div>
      )}

      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          value={conta.nomeDoToken}
          onChange={(evento) => conta.setNomeDoToken(evento.target.value)}
          className="w-full bg-bg-base border border-border-sutil p-2 text-text-primary focus:outline-none focus:border-text-secondary transition-colors sm:max-w-sm"
          placeholder="Para que é este token? Ex: planilha de conferência"
        />
        <button
          type="button"
          onClick={() => void conta.handleEmitirToken()}
          disabled={conta.emitindo || conta.nomeDoToken.trim() === ''}
          className="flex items-center justify-center gap-2 border border-border-sutil px-3 py-2 uppercase tracking-widest text-text-secondary transition-colors hover:bg-bg-base hover:text-text-primary disabled:opacity-50"
        >
          <Plus size={13} />
          {conta.emitindo ? 'Emitindo...' : 'Emitir'}
        </button>
      </div>

      {conta.carregandoTokens ? (
        <p className="p-4 text-center text-[10px] uppercase tracking-widest text-text-tertiary">
          Carregando...
        </p>
      ) : conta.tokens.length === 0 ? (
        <p className="border border-border-sutil p-6 text-center text-[10px] leading-relaxed text-text-tertiary">
          Nenhum token. Você não precisa de um para usar o painel — ele serve para o que roda sem
          você: script, planilha, integração.
        </p>
      ) : (
        <div className="overflow-x-auto border border-border-sutil">
          <table className="w-full min-w-[640px] text-left">
            <thead className="border-b border-border-sutil text-[10px] uppercase tracking-widest text-text-tertiary">
              <tr>
                <th className={CELULA}>Nome</th>
                <th className={CELULA}>Prefixo</th>
                <th className={CELULA}>Último uso</th>
                <th className={CELULA}>Situação</th>
                <th className={`${CELULA} text-right`}>Ações</th>
              </tr>
            </thead>
            <tbody>
              {conta.tokens.map((token) => (
                <tr key={token.id} className="border-b border-border-sutil/50 last:border-0">
                  <td className={`${CELULA} text-text-primary`}>{token.name}</td>
                  <td className={`${CELULA} text-text-secondary`}>{token.prefix}</td>
                  {/* O ÚLTIMO USO É O QUE DENUNCIA TOKEN ESQUECIDO — e, depois de
                      um vazamento, o que diz se ele chegou a ser usado. É por isso
                      que revogar não apaga a linha. */}
                  <td className={`${CELULA} tabular-nums text-text-secondary`}>
                    {token.lastUsedAt ? formatarData(token.lastUsedAt) : 'nunca'}
                  </td>
                  <td className={CELULA}>
                    {token.revokedAt ? (
                      <span className="text-status-danger">revogado {formatarData(token.revokedAt)}</span>
                    ) : (
                      <span className="text-status-success">ativo</span>
                    )}
                  </td>
                  <td className={CELULA}>
                    <div className="flex justify-end">
                      {!token.revokedAt && (
                        <button
                          type="button"
                          onClick={() => conta.handleRevogarToken(token.id)}
                          disabled={conta.revogando}
                          title="Revogar"
                          className="flex items-center gap-1 text-text-tertiary transition-colors hover:text-status-danger disabled:opacity-50"
                        >
                          <ShieldOff size={13} /> Revogar
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
