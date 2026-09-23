import { AlertTriangle, KeyRound, Plus, ShieldOff, X } from 'lucide-react';
import { useTokens } from './hooks/useTokens';
import { formatarData } from '../helpers/format.helper';

// TOKENS DO AGENTE — a credencial que abre o `/agent-hub` (D80).
//
// A tela existe para tirar do ar o `AGENT_TOKEN` compartilhado: enquanto houver
// UM segredo para a frota inteira, revogar o acesso de uma máquina significa
// trocar o de todas. Com um token por agente, revogar é uma linha.
//
// A TROCA É POR CONVIVÊNCIA, com prazo (D89): o agente é um binário C# fora
// deste repositório, e cortar o token compartilhado num deploy derrubaria a
// frota inteira — junto com o canal por onde se descobriria que ela caiu. O
// servidor loga cada uso do caminho antigo; quando o log parar, ele sai.

const CELULA = 'px-4 py-3';
const CABECALHO = 'px-4 py-3 font-normal';

export default function TokensPage() {
  const {
    tokens, carregando, erro, nome, setNome, handleEmitir, emitindo,
    segredo, fecharSegredo, handleRevogar, revogando,
  } = useTokens();

  return (
    <div className="animate-in fade-in duration-300 space-y-6 font-mono text-xs">
      <header className="space-y-2">
        <h2 className="text-xl uppercase tracking-widest text-text-primary">Tokens do agente</h2>
        <p className="text-text-tertiary max-w-2xl leading-relaxed">
          Um token por máquina. O segredo aparece <strong className="text-text-secondary">uma vez</strong>,
          na emissão — o servidor guarda só o hash, e não existe rota para relê-lo. Perdeu, emite outro.
        </p>
      </header>

      {segredo && (
        <section className="border border-status-success/50 bg-status-success/5 p-4 space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <KeyRound size={16} className="text-status-success shrink-0 mt-0.5" />
              <div className="space-y-1">
                <p className="text-text-primary">Copie agora — esta é a única vez que ele aparece.</p>
                <p className="text-text-tertiary text-[10px] leading-relaxed">
                  Configure no agente como <code>Authorization: Bearer &lt;token&gt;</code>.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={fecharSegredo}
              className="text-text-tertiary hover:text-text-primary shrink-0"
              title="Já copiei"
            >
              <X size={14} />
            </button>
          </div>
          <code className="block bg-bg-base border border-border-sutil p-3 break-all text-text-primary select-all">
            {segredo}
          </code>
        </section>
      )}

      <section className="flex flex-wrap items-end gap-3">
        <label className="space-y-1">
          <span className="block text-text-tertiary text-[10px] uppercase tracking-widest">
            Nome do token
          </span>
          <input
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            placeholder="Notebook da Laura"
            maxLength={200}
            className="bg-bg-base border border-border-sutil px-3 py-2 text-text-primary w-64"
          />
        </label>
        <button
          type="button"
          onClick={handleEmitir}
          disabled={emitindo || !nome.trim()}
          className="flex items-center gap-2 px-4 py-2 bg-text-primary text-bg-base hover:bg-text-secondary uppercase tracking-widest transition-colors disabled:opacity-40"
        >
          <Plus size={14} /> {emitindo ? 'Emitindo…' : 'Emitir token'}
        </button>
      </section>

      {erro && <p className="text-status-danger text-[10px]">{erro}</p>}

      <div className="bg-surface-card border border-border-sutil overflow-x-auto">
        <table className="w-full text-left whitespace-nowrap">
          <thead className="bg-bg-base/50 text-text-secondary border-b border-border-sutil uppercase tracking-widest">
            <tr>
              <th className={CABECALHO}>Nome</th>
              <th className={CABECALHO}>Prefixo</th>
              <th className={CABECALHO}>Máquina</th>
              <th className={CABECALHO}>Último uso</th>
              <th className={CABECALHO}>Situação</th>
              <th className={CABECALHO}></th>
            </tr>
          </thead>
          <tbody className="text-text-primary divide-y divide-border-sutil/50">
            {tokens.map((token) => (
              <tr key={token.id} className="hover:bg-bg-base transition-colors">
                <td className={CELULA}>{token.name}</td>
                <td className={`${CELULA} text-text-tertiary`}>{token.prefix}</td>
                <td className={`${CELULA} text-text-tertiary`}>
                  {/* Vazio até o PRIMEIRO handshake: o token é gerado quando o
                      agente é instalado, antes de a máquina existir aqui. */}
                  {token.endpointId ? 'vinculada' : 'aguardando 1º contato'}
                </td>
                <td className={`${CELULA} text-text-tertiary`}>
                  {token.lastUsedAt ? formatarData(token.lastUsedAt) : 'nunca'}
                </td>
                <td className={CELULA}>
                  {token.revokedAt ? (
                    <span className="text-status-danger">revogado</span>
                  ) : (
                    <span className="text-status-success">ativo</span>
                  )}
                </td>
                <td className={`${CELULA} text-right`}>
                  {!token.revokedAt && (
                    <button
                      type="button"
                      onClick={() => handleRevogar(token.id)}
                      disabled={revogando}
                      className="inline-flex items-center gap-1.5 text-text-tertiary hover:text-status-danger uppercase tracking-widest text-[10px] disabled:opacity-40"
                    >
                      <ShieldOff size={12} /> Revogar
                    </button>
                  )}
                </td>
              </tr>
            ))}

            {!carregando && tokens.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-12 text-center text-text-tertiary">
                  <div className="flex flex-col items-center gap-3">
                    <AlertTriangle size={20} className="opacity-50" />
                    <span>Nenhum token emitido.</span>
                    <span className="text-[10px] max-w-md leading-relaxed">
                      Enquanto não houver um token por máquina, os agentes continuam entrando com o
                      <code className="mx-1">AGENT_TOKEN</code> compartilhado do <code>.env</code> —
                      que funciona, mas não dá para revogar uma máquina sem derrubar a frota.
                    </span>
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
