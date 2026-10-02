import { useMemo, useState } from 'react';
import { Building2, KeyRound, ShieldCheck, TriangleAlert } from 'lucide-react';
import {
  useAcessoDoUsuario, useDefinirGruposDoUsuario, useDefinirOrigemDaIdentidade, useOpcoesDeGrupo,
} from '../../../../domain/access/access.queries';
import { formatarData } from '../../../helpers/format.helper';
import type { OrigemDaIdentidade } from '../../../../domain/shared/access.types';

interface Props {
  userId: string;
  /** Desligado não opera mais: a tela explica em vez de oferecer o clique. */
  desligado: boolean;
  /** De onde vem a identidade desta pessoa (F11, Etapa I — D78). */
  authSource: OrigemDaIdentidade;
  /** ISO da última confirmação pelo diretório, ou `null`. */
  directorySyncedAt: string | null;
  /** ISO de quando ela deixou de aparecer no diretório. MARCA, não desligamento. */
  directoryMissingAt: string | null;
}

/** O que cada origem quer dizer, em uma frase — a tela não repete a sigla. */
const ORIGEM: Record<OrigemDaIdentidade, { rotulo: string; explicacao: string }> = {
  LOCAL: {
    rotulo: 'local',
    explicacao: 'Entra com usuário e senha deste sistema. O cadastro é mantido aqui.',
  },
  LDAP: {
    rotulo: 'diretório',
    explicacao: 'Os dados vêm da sincronização com o diretório. Ela NÃO entra por SSO: '
      + 'para isso, mude a origem para SSO.',
  },
  OIDC: {
    rotulo: 'SSO',
    explicacao: 'Entra pela conta da empresa. Quem autenticar este e-mail no provedor de '
      + 'identidade entra como esta pessoa, com os grupos dela.',
  },
};

/**
 * O ACESSO DESTA PESSOA — em quais grupos ela está, e o que isso concede.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * MOSTRA AS DUAS COISAS, e é o segundo bloco que torna o primeiro útil.
 *
 * A lista de grupos responde *"o que eu mexo para mudar o acesso dela"*. A
 * união das chaves responde *"por que ela consegue (ou não consegue) isto"* —
 * que é a pergunta que chega como chamado, geralmente na forma "a Laura não
 * está vendo o custo".
 *
 * Sem a segunda, atender esse chamado é abrir os três grupos dela um por um e
 * unir as permissões na cabeça. O D76 fez a união ser permissiva e sem `deny`
 * justamente para que essa conta seja simples; esta lista é a conta já feita.
 * ═══════════════════════════════════════════════════════════════════════════
 */
export default function AcessoCard({
  userId, desligado, authSource, directorySyncedAt, directoryMissingAt,
}: Props) {
  const acesso = useAcessoDoUsuario(userId);
  const opcoes = useOpcoesDeGrupo();
  const definir = useDefinirGruposDoUsuario();
  const definirOrigem = useDefinirOrigemDaIdentidade();

  /**
   * O RASCUNHO, e `null` significa "não mexi em nada".
   *
   * NÃO é um `useState` sincronizado por `useEffect` a partir da consulta, e a
   * diferença não é estilo. Os dados chegam DEPOIS do primeiro render, então
   * sincronizar por efeito dá um render com a lista errada e outro com a certa
   * — e, pior, qualquer refetch (foco de janela, invalidação de outra tela)
   * sobrescreveria o que a pessoa acabou de marcar e não salvou.
   *
   * Com `null` a resposta do servidor é a verdade enquanto ninguém tocou, e o
   * rascunho passa a valer no primeiro clique. É o mesmo desenho do
   * `colunas: string[] | null` do `asset.store.ts`, pelo mesmo motivo: `null` e
   * conjunto vazio são coisas diferentes — "não mexi" contra "desmarquei tudo".
   */
  const [rascunho, setRascunho] = useState<Set<string> | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const atual = useMemo(
    () => new Set(acesso.data?.grupos.map((g) => g.id) ?? []),
    [acesso.data],
  );
  const marcados = rascunho ?? atual;
  const sujo = rascunho !== null
    && (rascunho.size !== atual.size || [...rascunho].some((id) => !atual.has(id)));

  async function gravar() {
    setErro(null);
    try {
      await definir.mutateAsync({ id: userId, groupIds: [...marcados] });
      // Volta a NÃO ter rascunho: a resposta do servidor passa a ser a verdade
      // outra vez. Sem isto, o rascunho ficaria pendurado e um grupo apagado
      // por outra pessoa continuaria marcado aqui.
      setRascunho(null);
    } catch (falha) {
      // A frase do servidor importa aqui mais do que em qualquer outro
      // formulário: o 409 de "deixaria o sistema sem nenhum administrador" é a
      // única coisa que explica por que o clique não funcionou.
      setErro(falha instanceof Error ? falha.message : 'Não foi possível salvar o acesso.');
    }
  }

  function alternar(id: string) {
    setRascunho((anterior) => {
      // Primeiro clique: o rascunho nasce do que o servidor disse.
      const proximo = new Set(anterior ?? atual);
      if (proximo.has(id)) proximo.delete(id);
      else proximo.add(id);
      return proximo;
    });
  }

  return (
    <section className="border border-border-sutil bg-surface-card">
      <header className="flex items-center gap-2 border-b border-border-sutil px-4 py-3">
        <ShieldCheck size={14} className="text-text-tertiary" />
        <h3 className="font-mono text-xs uppercase tracking-widest text-text-primary">Acesso</h3>
        <span className="ml-auto font-mono text-[10px] text-text-tertiary">
          {acesso.data?.permissoes.length ?? 0} permissão(ões) efetiva(s)
        </span>
      </header>

      {/* ── A ORIGEM DA IDENTIDADE (F11, Etapa I — D78) ───────────────────
          ACIMA dos grupos de propósito: ela responde "por onde esta pessoa
          entra", e a resposta muda o que os grupos significam — um cadastro de
          diretório que sumiu de lá continua com os grupos dele, e é essa
          combinação que alguém precisa ver junta.

          E A TROCA É AQUI, no card de ACESSO, e não no formulário de cadastro:
          marcar uma conta como SSO concede um caminho de login. A rota por trás
          exige `access.manage`, que é a mesma chave que já desenha este card. */}
      <div className="space-y-2 border-b border-border-sutil p-4">
        <div className="flex flex-wrap items-center gap-2">
          <Building2 size={13} className="text-text-tertiary" />
          <span className="font-mono text-[10px] uppercase tracking-widest text-text-tertiary">
            Origem da identidade
          </span>
          <span className="font-mono text-xs uppercase tracking-widest text-text-primary">
            {ORIGEM[authSource].rotulo}
          </span>

          <select
            value={authSource}
            disabled={definirOrigem.isPending}
            onChange={(evento) => {
              const escolhida = evento.target.value as OrigemDaIdentidade;
              if (escolhida === authSource) return;
              definirOrigem.mutate({ id: userId, authSource: escolhida });
            }}
            className="ml-auto border border-border-sutil bg-bg-base px-2 py-1 font-mono text-[10px] uppercase tracking-widest text-text-secondary"
          >
            <option value="LOCAL">local</option>
            <option value="LDAP">diretório</option>
            <option value="OIDC">SSO</option>
          </select>
        </div>

        <p className="font-mono text-[10px] leading-relaxed text-text-tertiary">
          {ORIGEM[authSource].explicacao}
        </p>

        {directorySyncedAt && (
          <p className="font-mono text-[10px] text-text-tertiary">
            Confirmada pelo diretório em {formatarData(directorySyncedAt)}.
          </p>
        )}

        {/* A MARCA DE REVISÃO (D78). Ela NÃO é um desligamento, e a frase diz
            isso: a sincronização nunca desliga ninguém — um filtro LDAP mal
            escrito devolveria "zero pessoas" e o inventário inteiro voltaria ao
            estoque numa madrugada. Quem decide é gente, e é esta linha que
            convoca a decisão. */}
        {directoryMissingAt && (
          <p className="flex items-start gap-2 border border-status-warning/40 bg-status-warning/5 p-2 font-mono text-[10px] leading-relaxed text-status-warning">
            <TriangleAlert size={12} className="mt-0.5 shrink-0" />
            <span>
              Não aparece no diretório desde {formatarData(directoryMissingAt)}. A sincronização
              apenas MARCA — ninguém foi desligado. Confirme com quem cuida do diretório e, se a
              pessoa saiu mesmo, use Desligar (que devolve equipamento e encerra os postos).
            </span>
          </p>
        )}

        {definirOrigem.error && (
          <p className="border border-status-danger/40 bg-status-danger/10 p-2 font-mono text-[10px] text-status-danger">
            {(definirOrigem.error as Error).message}
          </p>
        )}
      </div>

      <div className="grid gap-6 p-4 md:grid-cols-2">
        <div>
          <span className="mb-2 block font-mono text-[10px] uppercase tracking-widest text-text-tertiary">
            Grupos
          </span>

          {opcoes.isPending && (
            <p className="font-mono text-xs text-text-tertiary">Carregando...</p>
          )}

          {opcoes.data?.length === 0 && (
            <p className="font-mono text-xs text-text-tertiary">
              Nenhum grupo cadastrado. Crie um em Configurações → Grupos.
            </p>
          )}

          <div className="space-y-1">
            {opcoes.data?.map((grupo) => (
              <label key={grupo.id} className="flex cursor-pointer items-center gap-2 py-0.5">
                <input
                  type="checkbox"
                  checked={marcados.has(grupo.id)}
                  onChange={() => alternar(grupo.id)}
                  disabled={desligado || definir.isPending}
                  className="accent-status-success"
                />
                <span className="font-mono text-xs text-text-primary">{grupo.name}</span>
              </label>
            ))}
          </div>

          {desligado && (
            <p className="mt-3 font-mono text-[10px] text-text-tertiary">
              Colaborador desligado não entra no sistema — o login é recusado antes de a
              permissão ser consultada.
            </p>
          )}

          {sujo && !desligado && (
            <div className="mt-3 flex items-center gap-2">
              <button
                type="button"
                onClick={() => { void gravar(); }}
                disabled={definir.isPending}
                className="bg-text-primary px-3 py-1.5 font-mono text-[10px] uppercase tracking-widest text-bg-base transition-colors hover:bg-text-secondary disabled:opacity-50"
              >
                {definir.isPending ? 'Salvando...' : 'Salvar acesso'}
              </button>
              <button
                type="button"
                onClick={() => setRascunho(null)}
                className="px-3 py-1.5 font-mono text-[10px] uppercase tracking-widest text-text-tertiary hover:text-text-primary"
              >
                Descartar
              </button>
            </div>
          )}

          {erro && (
            <p className="mt-3 border border-status-danger/40 bg-status-danger/10 p-2 font-mono text-[10px] text-status-danger">
              {erro}
            </p>
          )}
        </div>

        <div>
          <span className="mb-2 block font-mono text-[10px] uppercase tracking-widest text-text-tertiary">
            O que isso concede
          </span>

          {acesso.data?.permissoes.length === 0 ? (
            <p className="font-mono text-xs text-text-tertiary">
              Nada. Esta pessoa entra no sistema e não alcança nenhuma tela.
            </p>
          ) : (
            // A CHAVE CRUA, e não o rótulo: é ela que aparece na mensagem do 403
            // ("falta assets.viewCost"), e quem atende o chamado precisa casar as
            // duas sem traduzir.
            <ul className="grid grid-cols-1 gap-x-4 gap-y-0.5 font-mono text-[10px] text-text-secondary sm:grid-cols-2">
              {acesso.data?.permissoes.map((chave) => (
                <li key={chave} className="flex items-center gap-1.5">
                  <KeyRound size={10} className="shrink-0 text-text-tertiary" />
                  {chave}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}
