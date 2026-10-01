import { ArrowRight, Download, FileSpreadsheet } from 'lucide-react';
import type { CamposDoAlvo } from '../../../domain/shared/import.types';

// O MAPEAMENTO (F10, Etapa D) — casar o cabeçalho do arquivo com o campo do
// sistema, e declarar a CHAVE.
//
// A CHAVE TEM EXPLICAÇÃO NA TELA, e não é zelo: ela é a decisão mais
// consequente deste formulário. Com a chave errada, um arquivo de atualização
// cadastra tudo de novo — e com o nome como chave (que o sistema nem oferece)
// duas pessoas homônimas viram uma.

const ROTULO = 'text-[10px] uppercase tracking-widest text-text-tertiary';
const CAMPO = 'bg-bg-base border border-border-sutil px-2 py-1.5 text-xs font-mono text-text-primary w-full';

interface Props {
  arquivo: File;
  cabecalhos: readonly string[];
  delimitador: string;
  campos: CamposDoAlvo | undefined;
  colunas: Record<string, string>;
  chave: string | undefined;
  podeSimular: boolean;
  simulando: boolean;
  erro: string | null;
  urlDoModelo: string;
  onMapear: (cabecalho: string, token: string) => void;
  onChave: (chave: string) => void;
  onSimular: () => void;
}

export default function MapeamentoForm({
  arquivo, cabecalhos, delimitador, campos, colunas, chave,
  podeSimular, simulando, erro, urlDoModelo, onMapear, onChave, onSimular,
}: Props) {
  const usados = new Set(Object.values(colunas));
  const chavesMapeadas = (campos?.chaves ?? []).filter((aceita) => usados.has(aceita));
  const obrigatoriosFaltando = (campos?.campos ?? [])
    .filter((campo) => campo.obrigatorioNaCriacao && !usados.has(campo.token));

  return (
    <div className="border border-border-sutil p-4 md:p-6 space-y-6 font-mono">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="flex items-center gap-2 text-xs text-text-secondary">
          <FileSpreadsheet size={14} />
          {arquivo.name}
          <span className="text-text-tertiary">
            · {cabecalhos.length} colunas · separador{' '}
            {delimitador === '\t' ? 'tabulação' : `"${delimitador}"`}
          </span>
        </span>

        <a
          href={urlDoModelo}
          download
          className="flex items-center gap-2 px-3 py-1.5 border border-border-sutil text-text-tertiary hover:text-text-primary hover:border-text-secondary text-[10px] uppercase tracking-widest transition-colors"
        >
          <Download size={12} /> Baixar modelo
        </a>
      </div>

      <div className="space-y-2">
        <span className={ROTULO}>As colunas do arquivo</span>

        <div className="border border-border-sutil divide-y divide-border-sutil">
          {cabecalhos.map((cabecalho) => (
            <div key={cabecalho} className="flex flex-wrap items-center gap-3 px-3 py-2">
              <span className="text-xs text-text-primary min-w-[12rem] truncate" title={cabecalho}>
                {cabecalho}
              </span>
              <ArrowRight size={12} className="text-text-tertiary shrink-0" />

              <select
                value={colunas[cabecalho] ?? ''}
                onChange={(evento) => onMapear(cabecalho, evento.target.value)}
                className={`${CAMPO} max-w-xs`}
              >
                <option value="">— não importar —</option>
                {(campos?.campos ?? []).map((campo) => (
                  <option
                    key={campo.token}
                    value={campo.token}
                    // Campo já usado por OUTRA coluna fica desabilitado: o
                    // servidor recusa dois cabeçalhos no mesmo campo com 422, e
                    // é melhor a tela não deixar montar isso.
                    disabled={usados.has(campo.token) && colunas[cabecalho] !== campo.token}
                  >
                    {campo.rotulo}{campo.obrigatorioNaCriacao ? ' *' : ''}
                  </option>
                ))}
              </select>

              {colunas[cabecalho] && (
                <span className="text-[10px] text-text-tertiary flex-1 min-w-[12rem] leading-relaxed">
                  {campos?.campos.find((campo) => campo.token === colunas[cabecalho])?.ajuda}
                </span>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* A CHAVE. Ausente no alvo de ocupação, e a frase explica por quê. */}
      {(campos?.chaves.length ?? 0) > 0 ? (
        <label className="space-y-1 block max-w-md">
          <span className={ROTULO}>Reconhecer linha existente por</span>
          <select value={chave ?? ''} onChange={(evento) => onChave(evento.target.value)} className={CAMPO}>
            <option value="">Selecione…</option>
            {chavesMapeadas.map((aceita) => (
              <option key={aceita} value={aceita}>
                {campos?.campos.find((campo) => campo.token === aceita)?.rotulo ?? aceita}
              </option>
            ))}
          </select>
          <span className="text-[10px] text-text-tertiary block leading-relaxed">
            É por esta coluna que o sistema decide entre ATUALIZAR e CADASTRAR. Ela precisa estar
            mapeada acima. O nome nunca serve: duas pessoas se chamam "Ana Silva" e dois notebooks
            se chamam "Notebook da TI".
          </span>
        </label>
      ) : (
        <p className="text-[10px] text-text-tertiary leading-relaxed max-w-2xl">
          Este alvo não usa chave de atualização: a linha é identificada pelo par
          (local, colaborador), e a unicidade da ocupação aberta é garantida pelo banco —
          reimportar o mesmo arquivo é seguro por construção.
        </p>
      )}

      {obrigatoriosFaltando.length > 0 && (
        <p className="text-[10px] text-status-warning leading-relaxed">
          Sem {obrigatoriosFaltando.map((campo) => campo.rotulo).join(', ')}, as linhas que seriam
          CADASTRO novo vão falhar — as de atualização continuam valendo.
        </p>
      )}

      {erro && (
        <p className="border border-status-danger/40 bg-status-danger/10 px-3 py-2 text-xs text-status-danger">
          {erro}
        </p>
      )}

      <button
        type="button"
        disabled={!podeSimular || simulando}
        onClick={onSimular}
        className="flex items-center gap-2 px-4 py-2 bg-text-primary text-bg-base hover:bg-text-secondary text-[10px] uppercase tracking-widest transition-colors disabled:opacity-40"
      >
        {simulando ? 'Simulando…' : 'Simular importação'}
      </button>

      <p className="text-[10px] text-text-tertiary leading-relaxed max-w-2xl">
        A simulação NÃO grava nada: ela lê o arquivo, confere cada linha contra o cadastro e
        monta o relatório. Nada entra no inventário antes de você clicar em aplicar.
      </p>
    </div>
  );
}
