import { Download, Printer, Save, ScanLine } from 'lucide-react';
import { useEtiquetas } from './hooks/useEtiquetas';

// AS ETIQUETAS (docs/historico/fase-10-etiquetas-relatorios-importacao.md, Etapa G).
//
// A PRÉVIA É O PDF DE VERDADE, renderizada pela MESMA função da impressão — um
// desenho aproximado em HTML discordaria do arquivo, e o objetivo declarado da
// tela é NÃO GASTAR A FOLHA.
//
// E ELA AVISA SOBRE A IMPRESSORA: "ajustar à página" encolhe tudo alguns por
// cento e desalinha a folha inteira. É o erro mais comum e o mais caro aqui.

const ROTULO = 'text-[10px] uppercase tracking-widest text-text-tertiary';
const CAMPO = 'bg-bg-base border border-border-sutil px-2 py-1.5 text-xs font-mono text-text-primary w-full';

export default function EtiquetasPage() {
  const estado = useEtiquetas();

  return (
    <div className="animate-in fade-in duration-300 flex flex-col pb-6">
      <div className="mb-6">
        <h2 className="text-xl font-mono text-text-primary uppercase tracking-widest">Etiquetas</h2>
        <p className="text-xs text-text-tertiary mt-2 font-mono max-w-3xl leading-relaxed">
          Bipe ou cole as etiquetas, ajuste a grade e confira na prévia — que é o PDF de verdade,
          no tamanho exato da página.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 font-mono">
        <div className="space-y-4">
          <div className="border border-border-sutil p-4 space-y-3">
            <label className="space-y-1 block">
              <span className={ROTULO}>Etiquetas ou números de série</span>
              <textarea
                rows={4}
                value={estado.bipados}
                onChange={(evento) => estado.setBipados(evento.target.value)}
                placeholder={'ATV-00042\nATV-00043\nSN123456'}
                className={`${CAMPO} resize-y`}
              />
              <span className="text-[10px] text-text-tertiary block leading-relaxed">
                Uma por linha (vírgula e ponto e vírgula também servem). O QR bipado inteiro
                também é aceito.
              </span>
            </label>

            <button
              type="button"
              disabled={estado.resolvendo || estado.bipados.trim() === ''}
              onClick={estado.handleResolver}
              className="flex items-center gap-2 px-3 py-2 border border-border-sutil text-text-tertiary hover:text-text-primary hover:border-text-secondary text-[10px] uppercase tracking-widest transition-colors disabled:opacity-40"
            >
              <ScanLine size={12} /> {estado.resolvendo ? 'Buscando…' : 'Carregar ativos'}
            </button>

            {estado.ativos.length > 0 && (
              <p className="text-[11px] text-text-secondary">
                {estado.ativos.length} ativo(s): {estado.ativos.map((ativo) => ativo.assetTag).join(', ')}
              </p>
            )}

            {estado.naoEncontrados.length > 0 && (
              <p className="text-[11px] text-status-warning leading-relaxed">
                Não encontrados: {estado.naoEncontrados.join(', ')} — confira a digitação antes de
                imprimir, senão a folha sai com menos etiquetas do que você bipou.
              </p>
            )}
          </div>

          {estado.layout && (
            <div className="border border-border-sutil p-4 space-y-4">
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                <label className="space-y-1 block">
                  <span className={ROTULO}>Folha</span>
                  <select
                    value={estado.layout.pageSize}
                    onChange={(evento) => estado.alterar('pageSize', evento.target.value)}
                    className={CAMPO}
                  >
                    {estado.tamanhos.map((tamanho) => (
                      <option key={tamanho} value={tamanho}>{tamanho}</option>
                    ))}
                  </select>
                </label>

                <label className="space-y-1 block">
                  <span className={ROTULO}>Colunas</span>
                  <input
                    type="number" min={1} max={10} value={estado.layout.cols}
                    onChange={(evento) => estado.alterar('cols', Number(evento.target.value))}
                    className={CAMPO}
                  />
                </label>

                <label className="space-y-1 block">
                  <span className={ROTULO}>Linhas</span>
                  <input
                    type="number" min={1} max={30} value={estado.layout.rows}
                    onChange={(evento) => estado.alterar('rows', Number(evento.target.value))}
                    className={CAMPO}
                  />
                </label>

                <label className="space-y-1 block">
                  <span className={ROTULO}>Margem topo (mm)</span>
                  <input
                    type="number" min={0} max={100} step={0.5} value={estado.layout.marginTopMm}
                    onChange={(evento) => estado.alterar('marginTopMm', Number(evento.target.value))}
                    className={CAMPO}
                  />
                </label>

                <label className="space-y-1 block">
                  <span className={ROTULO}>Margem esquerda (mm)</span>
                  <input
                    type="number" min={0} max={100} step={0.5} value={estado.layout.marginLeftMm}
                    onChange={(evento) => estado.alterar('marginLeftMm', Number(evento.target.value))}
                    className={CAMPO}
                  />
                </label>

                <label className="space-y-1 block">
                  <span className={ROTULO}>Espaço entre colunas (mm)</span>
                  <input
                    type="number" min={0} max={50} step={0.5} value={estado.layout.gutterXMm}
                    onChange={(evento) => estado.alterar('gutterXMm', Number(evento.target.value))}
                    className={CAMPO}
                  />
                </label>
              </div>

              <div className="space-y-2">
                <span className={ROTULO}>O que vai impresso</span>
                <div className="flex flex-wrap gap-2">
                  {estado.campos.map((campo) => {
                    const marcado = estado.layout!.fields.includes(campo.token);
                    return (
                      <button
                        key={campo.token}
                        type="button"
                        onClick={() => estado.alternarCampo(campo.token)}
                        className={`px-3 py-1.5 border text-[10px] uppercase tracking-widest transition-colors ${
                          marcado
                            ? 'border-text-secondary text-text-primary bg-bg-base'
                            : 'border-border-sutil text-text-tertiary hover:text-text-primary'
                        }`}
                      >
                        {campo.rotulo}
                      </button>
                    );
                  })}
                </div>
                <span className="text-[10px] text-text-tertiary block leading-relaxed">
                  O primeiro escolhido sai em negrito e maior — é o que se lê de longe na
                  prateleira. Custo de compra não está na lista de propósito: colado no
                  equipamento, qualquer visitante lê.
                </span>
              </div>

              <div className="flex flex-wrap gap-4">
                <label className="flex items-center gap-2 text-[11px] text-text-secondary">
                  <input
                    type="checkbox" checked={estado.layout.qr}
                    onChange={(evento) => estado.alterar('qr', evento.target.checked)}
                    className="accent-status-info w-3.5 h-3.5"
                  />
                  QR (abre a tela do ativo)
                </label>

                <label className="flex items-center gap-2 text-[11px] text-text-secondary">
                  <input
                    type="checkbox" checked={estado.layout.barcode}
                    onChange={(evento) => estado.alterar('barcode', evento.target.checked)}
                    className="accent-status-info w-3.5 h-3.5"
                  />
                  Código de barras (digita a etiqueta)
                </label>
              </div>

              {estado.erroAoSalvar && (
                <p className="border border-status-danger/40 bg-status-danger/10 px-3 py-2 text-xs text-status-danger">
                  {estado.erroAoSalvar}
                </p>
              )}

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  disabled={estado.salvando}
                  onClick={estado.handleSalvar}
                  className="flex items-center gap-2 px-3 py-2 border border-border-sutil text-text-tertiary hover:text-text-primary hover:border-text-secondary text-[10px] uppercase tracking-widest transition-colors disabled:opacity-40"
                >
                  <Save size={12} /> {estado.salvando ? 'Salvando…' : 'Salvar como padrão'}
                </button>

                <button
                  type="button"
                  disabled={estado.baixando || estado.ativos.length === 0}
                  onClick={estado.handleBaixar}
                  className="flex items-center gap-2 px-4 py-2 bg-text-primary text-bg-base hover:bg-text-secondary text-[10px] uppercase tracking-widest transition-colors disabled:opacity-40"
                >
                  <Download size={12} /> {estado.baixando ? 'Gerando…' : 'Baixar folha'}
                </button>

                {estado.medida && (
                  <span className="text-[10px] text-text-tertiary">
                    etiqueta de {estado.medida.larguraMm}×{estado.medida.alturaMm} mm ·{' '}
                    {estado.medida.porPagina} por folha
                  </span>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="space-y-3">
          <p className="flex items-start gap-2 border border-status-warning/40 bg-status-warning/5 px-3 py-2 text-[11px] text-status-warning leading-relaxed">
            <Printer size={13} className="shrink-0 mt-0.5" />
            <span>
              Imprima em <strong>100%</strong>, sem "ajustar à página". A impressora que escala
              encolhe tudo alguns por cento e desalinha a folha inteira — o PDF já vem no tamanho
              exato do papel.
            </span>
          </p>

          {estado.erroDaPrevia && (
            <p className="border border-status-danger/40 bg-status-danger/10 px-3 py-2 text-xs text-status-danger">
              {estado.erroDaPrevia}
            </p>
          )}

          <div className="border border-border-sutil bg-surface-card h-[36rem]">
            {estado.urlDaPrevia ? (
              // O PDF DE VERDADE, num `<iframe>`: é o MESMO arquivo que a
              // impressão produz, pela mesma função.
              <iframe
                src={estado.urlDaPrevia}
                title="Prévia da folha de etiquetas"
                className="w-full h-full"
              />
            ) : (
              <p className="h-full flex items-center justify-center text-xs text-text-tertiary px-6 text-center">
                {estado.gerandoPrevia
                  ? 'Renderizando a prévia…'
                  : 'Carregue os ativos para ver a primeira página da folha.'}
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
