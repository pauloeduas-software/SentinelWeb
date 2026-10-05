import { useMemo, useState } from 'react';
import { AlertTriangle, Link2, Search, Save, ShieldCheck } from 'lucide-react';
import {
  useConformidadeQuery, useDefinirSoftwareDaLicenca, usePacotesDeSoftwareQuery,
  useSoftwareDaLicencaQuery,
} from '../../../domain/reconciliation/reconciliation.queries';
import type {
  MaquinaEmDesconformidade, PacoteDoCatalogo,
} from '../../../domain/shared/reconciliation.types';

// ═════════════════════════════════════════════════════════════════════════════
// CONFORMIDADE ALIMENTADA PELO SOFTWARE REALMENTE INSTALADO (F7, Etapa G).
//
// O motor existia desde a Etapa G e esta tela não. Sem ela, `LicenseSoftware`
// não recebia linha por nenhum caminho de produto, e o relatório respondia
// `semVinculoDeSoftware: true` para sempre — motor completo, resposta vazia.
// É o "defeito 1" do docs/referencia/testes.md na forma mais pura: verificado pela API,
// inalcançável pelo formulário.
//
// ─────────────────────────────────────────────────────────────────────────────
// A PONTE É EXPLÍCITA, E ESTA TELA É ONDE ISSO SE PAGA (D102).
//
// Casar "Office 365 E3" (o nome do contrato) com "Microsoft 365 Apps for
// enterprise" (o nome que aparece em Programas e Recursos) por semelhança de
// texto erra nos dois sentidos, e os dois erros são caros: para menos, o
// relatório diz que ninguém usa o que a empresa paga; para mais, ele acusa
// desconformidade em máquina que tem outra coisa instalada. Então quem liga é
// gente, uma vez, e o sistema nunca adivinha.
//
// O preço é este formulário. Ele é o preço certo.
// ─────────────────────────────────────────────────────────────────────────────

interface Props {
  licenseId: string;
}

const ROTULO = 'text-text-tertiary uppercase tracking-widest text-[10px]';

function ListaDeMaquinas({ maquinas }: { maquinas: MaquinaEmDesconformidade[] }) {
  return (
    <ul className="space-y-1">
      {maquinas.map((maquina) => (
        <li key={maquina.assetId} className="flex flex-wrap items-baseline gap-2 min-w-0">
          <span className="text-text-primary">{maquina.assetTag}</span>
          <span className="text-text-secondary truncate">{maquina.assetName ?? '—'}</span>
          {maquina.hostname && <span className="text-text-tertiary text-[10px]">{maquina.hostname}</span>}
        </li>
      ))}
    </ul>
  );
}

interface SeletorProps {
  /** Os pacotes JÁ ligados. É deles que o conjunto marcado nasce. */
  ligados: PacoteDoCatalogo[];
  salvando: boolean;
  onSalvar: (packageIds: string[]) => Promise<void>;
}

/**
 * O SELETOR DE PACOTES — componente próprio por causa do estado inicial.
 *
 * O conjunto marcado abre com o que JÁ está ligado, e semear estado a partir de
 * uma consulta assíncrona não se faz com `setState` dentro de `useEffect` (o
 * lint desta casa reprova, e com razão: encadeia renders). O padrão do projeto é
 * estado inicial PREGUIÇOSO — então quem monta este componente passa uma `key`
 * derivada dos pacotes ligados, e ele remonta quando o servidor muda.
 *
 * E o cuidado que isso protege é grande: a rota recebe o CONJUNTO INTEIRO e
 * desliga o que não está nele. Um conjunto que abrisse vazio por um instante e
 * fosse salvo naquele instante apagaria a ponte toda, em silêncio.
 */
function SeletorDePacotes({ ligados, salvando, onSalvar }: SeletorProps) {
  const [busca, setBusca] = useState('');
  const { data: catalogo, isFetching } = usePacotesDeSoftwareQuery(busca);
  const [marcados, setMarcados] = useState<Set<string>>(() => new Set(ligados.map((pacote) => pacote.id)));
  const [erro, setErro] = useState('');

  /**
   * A lista mostrada é o catálogo MAIS o que já está ligado.
   *
   * Um pacote ligado que a busca não alcança (ou que caiu fora do teto de 100 do
   * servidor) precisa continuar visível e marcado: se ele desaparecesse da
   * lista, salvar o desligaria sem ninguém ter clicado nele.
   */
  const opcoes = useMemo(() => {
    const porId = new Map(ligados.map((pacote) => [pacote.id, pacote]));
    for (const pacote of catalogo?.rows ?? []) porId.set(pacote.id, pacote);
    return [...porId.values()]
      .sort((a, b) => b.instalacoes - a.instalacoes || a.name.localeCompare(b.name, 'pt-BR'));
  }, [catalogo, ligados]);

  const alternar = (packageId: string) => {
    setMarcados((antes) => {
      const proximo = new Set(antes);
      if (proximo.has(packageId)) proximo.delete(packageId);
      else proximo.add(packageId);
      return proximo;
    });
  };

  const handleSalvar = async () => {
    setErro('');
    try {
      await onSalvar([...marcados]);
    } catch (falha) {
      const resposta = (falha as { response?: { data?: { error?: string } } }).response;
      setErro(resposta?.data?.error ?? 'Não foi possível salvar o software desta licença.');
    }
  };

  return (
    <div className="space-y-3 border-t border-border-sutil pt-3">
      <div className="flex items-center gap-2 border border-border-sutil px-2">
        <Search size={12} className="text-text-tertiary shrink-0" />
        <input
          value={busca}
          onChange={(evento) => setBusca(evento.target.value)}
          placeholder="Procurar por nome, fabricante ou versão…"
          className="bg-transparent py-1.5 text-xs font-mono text-text-primary w-full outline-none"
        />
        {isFetching && <span className="text-[10px] text-text-tertiary shrink-0">…</span>}
      </div>

      {opcoes.length === 0 ? (
        <p className="text-text-tertiary leading-relaxed">
          {busca
            ? 'Nenhum programa descoberto casa com essa busca.'
            : 'O catálogo está vazio: nenhum agente mandou lista de software ainda. '
              + 'A normalização roda na varredura de hora em hora, depois do primeiro handshake.'}
        </p>
      ) : (
        <ul className="max-h-56 overflow-y-auto divide-y divide-border-sutil border border-border-sutil">
          {opcoes.map((pacote) => (
            <li key={pacote.id}>
              <label className="flex items-start gap-3 px-3 py-2 hover:bg-bg-surface/50 cursor-pointer">
                <input
                  type="checkbox"
                  checked={marcados.has(pacote.id)}
                  onChange={() => alternar(pacote.id)}
                  className="mt-0.5 shrink-0"
                />
                <span className="min-w-0">
                  <span className="text-text-primary">{pacote.name}</span>
                  <span className="text-text-secondary"> {pacote.version}</span>
                  <span className="text-text-tertiary text-[10px] block">
                    {pacote.publisher ?? 'sem fabricante'} · em {pacote.instalacoes} máquina(s)
                  </span>
                </span>
              </label>
            </li>
          ))}
        </ul>
      )}

      {erro && <p className="text-status-danger text-[10px]">{erro}</p>}

      <div className="flex items-center gap-3 flex-wrap">
        <button
          type="button"
          disabled={salvando}
          onClick={() => void handleSalvar()}
          className="flex items-center gap-2 px-4 py-2 bg-text-primary text-bg-base hover:bg-text-secondary text-[10px] uppercase tracking-widest transition-colors disabled:opacity-40"
        >
          <Save size={12} /> {salvando ? 'Salvando…' : `Salvar ${marcados.size} programa(s)`}
        </button>
        <span className="text-[10px] text-text-tertiary">
          O que ficar desmarcado é desligado desta licença.
        </span>
      </div>
    </div>
  );
}

export default function ConformidadeLicenca({ licenseId }: Props) {
  const { data: conformidade, isPending } = useConformidadeQuery(licenseId);
  const { data: ligados } = useSoftwareDaLicencaQuery(licenseId);
  const definir = useDefinirSoftwareDaLicenca(licenseId);

  const [editando, setEditando] = useState(false);

  if (isPending) return <p className="text-text-tertiary">Cruzando instalações…</p>;
  if (!conformidade) return null;

  const { instaladoSemAssento, assentoSemInstalacao, assentosDePessoa, semVinculoDeSoftware } = conformidade;
  const emOrdem = instaladoSemAssento.length === 0 && assentoSemInstalacao.length === 0;

  return (
    <div className="space-y-4">

      {/* ── A PONTE ───────────────────────────────────────────────────────── */}
      <div className="border border-border-sutil p-4 space-y-3">
        <div className="flex items-center justify-between gap-3">
          <span className={ROTULO}>Software que esta licença cobre</span>
          <button
            type="button"
            onClick={() => setEditando((estava) => !estava)}
            className="flex items-center gap-2 px-3 py-1.5 border border-border-sutil text-[10px] uppercase tracking-widest text-text-tertiary hover:border-text-primary hover:text-text-primary transition-colors"
          >
            <Link2 size={12} /> {editando ? 'Fechar' : 'Ligar programas'}
          </button>
        </div>

        {(ligados?.rows.length ?? 0) === 0 ? (
          <p className="text-text-tertiary leading-relaxed">
            Nenhum programa ligado a esta licença — então não há como saber quem a está usando.
            O sistema não casa contrato com programa pelo nome de propósito: “Office 365 E3” e
            “Microsoft 365 Apps for enterprise” são a mesma coisa, e “Acrobat Reader” e
            “Acrobat Pro” não são.
          </p>
        ) : (
          <ul className="space-y-1">
            {ligados?.rows.map((pacote) => (
              <li key={pacote.id} className="flex flex-wrap items-baseline gap-2">
                <span className="text-text-primary">{pacote.name}</span>
                <span className="text-text-secondary">{pacote.version}</span>
                <span className="text-text-tertiary text-[10px]">
                  {pacote.publisher ?? 'sem fabricante'} · {pacote.instalacoes} instalação(ões)
                </span>
              </li>
            ))}
          </ul>
        )}

        {editando && (
          <SeletorDePacotes
            key={(ligados?.rows ?? []).map((pacote) => pacote.id).sort().join('|')}
            ligados={ligados?.rows ?? []}
            salvando={definir.isPending}
            onSalvar={async (packageIds) => {
              await definir.mutateAsync(packageIds);
              setEditando(false);
            }}
          />
        )}
      </div>

      {/* ── O RELATÓRIO ───────────────────────────────────────────────────── */}
      {semVinculoDeSoftware ? (
        <p className="text-[10px] text-text-tertiary leading-relaxed border border-border-sutil px-4 py-3">
          Sem programa ligado, as duas contas abaixo não têm como significar nada — é por isso
          que elas não aparecem em vez de aparecerem zeradas.
        </p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* INSTALADO SEM ASSENTO: risco de auditoria de fornecedor. */}
          <div className="border border-border-sutil p-4 space-y-2">
            <span className={`${ROTULO} flex items-center gap-2`}>
              <AlertTriangle size={11} className={instaladoSemAssento.length > 0 ? 'text-status-danger' : 'text-text-tertiary'} />
              Instalado sem assento — {instaladoSemAssento.length}
            </span>
            {instaladoSemAssento.length === 0 ? (
              <p className="text-text-tertiary">Ninguém usando sem estar pago.</p>
            ) : (
              <>
                <ListaDeMaquinas maquinas={instaladoSemAssento} />
                <p className="text-[10px] text-status-danger leading-relaxed">
                  O programa está nestas máquinas e o ativo delas não tem assento aberto desta
                  licença. É o número que uma auditoria de fornecedor cobra.
                </p>
              </>
            )}
          </div>

          {/* ASSENTO SEM INSTALAÇÃO: dinheiro parado. */}
          <div className="border border-border-sutil p-4 space-y-2">
            <span className={`${ROTULO} flex items-center gap-2`}>
              <ShieldCheck size={11} className={assentoSemInstalacao.length > 0 ? 'text-status-warning' : 'text-text-tertiary'} />
              Assento pago sem instalação — {assentoSemInstalacao.length}
            </span>
            {assentoSemInstalacao.length === 0 ? (
              <p className="text-text-tertiary">Nada pago à toa.</p>
            ) : (
              <>
                <ListaDeMaquinas maquinas={assentoSemInstalacao} />
                <p className="text-[10px] text-status-warning leading-relaxed">
                  O assento está entregue a estes ativos e o programa não está instalado neles.
                  São candidatos a devolução no próximo ciclo.
                </p>
              </>
            )}
          </div>
        </div>
      )}

      {!semVinculoDeSoftware && emOrdem && (
        <p className="text-[10px] text-status-success">
          Nenhuma divergência: tudo o que está instalado está pago, e tudo o que está pago está
          em uso.
        </p>
      )}

      {assentosDePessoa > 0 && (
        // FORA DAS DUAS CONTAS, e a tela diz por quê: licença de PESSOA segue a
        // pessoa entre máquinas, e cobrá-la de uma máquina específica daria
        // alarme falso a cada troca de equipamento.
        <p className="text-[10px] text-text-tertiary leading-relaxed">
          {assentosDePessoa} assento(s) entregue(s) a pessoas ficam fora das duas contas: licença
          de pessoa acompanha quem a usa entre máquinas, e cobrá-la de um equipamento específico
          acusaria desconformidade a cada troca de notebook.
        </p>
      )}
    </div>
  );
}
