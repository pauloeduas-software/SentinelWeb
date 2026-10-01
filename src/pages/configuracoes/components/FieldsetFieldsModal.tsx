import { useState } from 'react';
import { ChevronDown, ChevronUp, GripVertical, Lock, Plus, TriangleAlert, X } from 'lucide-react';
import type { RascunhoDeVinculo } from '../hooks/useConjuntoDeCampos';
import type { CatalogOption } from '../../../domain/shared/catalog.types';

// A COMPOSIÇÃO DE UM CONJUNTO — quais campos, em que ordem, quais obrigatórios.
//
// ═════════════════════════════════════════════════════════════════════════════
// O NÚMERO AO LADO DA CAIXA "OBRIGATÓRIO" É A RAZÃO DESTA TELA EXISTIR (D61).
//
// Marcar um campo como obrigatório é a operação mais destrutiva desta tela, e a
// única cujo efeito não se vê aqui: ela pode travar a edição de mil ativos
// antigos que ninguém preencheu. Sem o contador, é uma aposta.
//
// O caminho que o D61 desenha é: o campo nasce OPCIONAL, a edição em massa da F2
// faz o backfill, e só então se promove — com "N ativos ficariam inválidos" à
// vista. A promoção continua permitida com o número alto: quem decide é quem
// opera, e o papel da tela é não deixá-lo decidir no escuro.
// ═════════════════════════════════════════════════════════════════════════════
//
// ARRASTAR-E-SOLTAR NATIVO, sem biblioteca — e com as setas ao lado. A ordem é o
// que esta tela edita, e um controle que só funciona com mouse deixaria de fora
// quem navega por teclado; as setas são o caminho acessível, não um consolo.

interface FieldsetFieldsModalProps {
  nome: string;
  modelosAlcancados: number;
  rascunho: readonly RascunhoDeVinculo[];
  disponiveis: readonly CatalogOption[];
  carregando: boolean;
  salvando: boolean;
  sujo: boolean;
  erro: string;
  onAcrescentar: (fieldId: string) => void;
  onRemover: (fieldId: string) => void;
  onAlternarObrigatorio: (fieldId: string) => void;
  onDefinirPadrao: (fieldId: string, valor: string) => void;
  onMover: (de: number, para: number) => void;
  onDescartar: () => void;
  onGravar: () => void;
  onClose: () => void;
}

export default function FieldsetFieldsModal(props: FieldsetFieldsModalProps) {
  const {
    nome, modelosAlcancados, rascunho, disponiveis, carregando, salvando, sujo, erro,
    onAcrescentar, onRemover, onAlternarObrigatorio, onDefinirPadrao, onMover,
    onDescartar, onGravar, onClose,
  } = props;

  /** A posição sendo arrastada. Estado de UMA interação — fica aqui. */
  const [arrastando, setArrastando] = useState<number | null>(null);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-bg-base/80 backdrop-blur-sm">
      <div className="relative w-full max-w-3xl bg-surface-card border border-border-sutil shadow-2xl flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border-sutil bg-bg-base/50">
          <div>
            <h2 className="text-sm font-mono text-text-primary tracking-widest uppercase">
              Campos de {nome}
            </h2>
            {/* O ESCOPO, ao lado do título: "12 ativos quebrariam" só se lê junto
                com "este conjunto alcança 3 modelos". Sem o segundo número, um
                zero pode significar "está tudo preenchido" ou "ninguém usa este
                conjunto" — situações opostas. */}
            <p className="text-[10px] font-mono text-text-tertiary mt-1">
              {modelosAlcancados === 0
                ? 'Nenhum modelo usa este conjunto ainda — nada do que for marcado aqui afeta ativo nenhum.'
                : `Alcança ${modelosAlcancados} ${modelosAlcancados === 1 ? 'modelo' : 'modelos'}, pela categoria ou direto.`}
            </p>
          </div>
          <button onClick={onClose} className="p-2 text-text-tertiary hover:text-text-primary transition-colors">
            <X size={16} />
          </button>
        </div>

        <div className="p-6 font-mono text-xs overflow-y-auto max-h-[70vh] space-y-4">
          {erro && (
            <div className="p-3 bg-status-danger/10 text-status-danger border border-status-danger/20">
              {erro}
            </div>
          )}

          {carregando && <p className="text-text-tertiary">Carregando…</p>}

          {!carregando && rascunho.length === 0 && (
            <p className="p-4 border border-border-sutil bg-bg-base/50 text-text-tertiary leading-relaxed">
              Conjunto vazio. Acrescente abaixo os campos que os ativos deste conjunto vão pedir —
              a ORDEM aqui é a ordem no formulário do ativo.
            </p>
          )}

          {rascunho.length > 0 && (
            <div className="border border-border-sutil divide-y divide-border-sutil/50">
              {rascunho.map((vinculo, indice) => (
                <div
                  key={vinculo.fieldId}
                  draggable
                  onDragStart={() => setArrastando(indice)}
                  onDragEnd={() => setArrastando(null)}
                  // `preventDefault` é obrigatório: sem ele o navegador não
                  // considera o alvo válido e o `onDrop` nunca dispara.
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={() => {
                    if (arrastando !== null) onMover(arrastando, indice);
                    setArrastando(null);
                  }}
                  className={`p-3 flex items-start gap-3 transition-colors ${
                    arrastando === indice ? 'bg-bg-base opacity-50' : 'hover:bg-bg-base/50'
                  }`}
                >
                  <GripVertical size={14} className="text-text-tertiary shrink-0 mt-1 cursor-grab" />

                  {/* As setas: o caminho de teclado para a mesma operação. */}
                  <div className="flex flex-col shrink-0">
                    <button
                      type="button"
                      disabled={indice === 0}
                      onClick={() => onMover(indice, indice - 1)}
                      title="Subir"
                      className="text-text-tertiary hover:text-text-primary disabled:opacity-20 transition-colors"
                    >
                      <ChevronUp size={12} />
                    </button>
                    <button
                      type="button"
                      disabled={indice === rascunho.length - 1}
                      onClick={() => onMover(indice, indice + 1)}
                      title="Descer"
                      className="text-text-tertiary hover:text-text-primary disabled:opacity-20 transition-colors"
                    >
                      <ChevronDown size={12} />
                    </button>
                  </div>

                  <div className="flex-1 min-w-0 space-y-2">
                    <div className="flex items-center gap-2 text-text-primary">
                      <span className="tabular-nums text-text-tertiary">{indice + 1}.</span>
                      <span className="truncate">{vinculo.name}</span>
                      {vinculo.slug && (
                        <span className="text-text-tertiary text-[10px] truncate">({vinculo.slug})</span>
                      )}
                      {vinculo.encrypted && (
                        <span
                          className="text-status-warning inline-flex shrink-0"
                          title="Cifrado em repouso: não aceita valor padrão, e o valor só aparece pela ação de revelar."
                        >
                          <Lock size={11} />
                        </span>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-4">
                      <label className="flex items-center gap-2 cursor-pointer text-text-secondary">
                        <input
                          type="checkbox"
                          checked={vinculo.required}
                          onChange={() => onAlternarObrigatorio(vinculo.fieldId)}
                          className="accent-status-success w-4 h-4"
                        />
                        <span className="uppercase tracking-widest text-[10px]">Obrigatório</span>
                      </label>

                      {/* Campo cifrado NÃO aceita valor padrão: o padrão fica em
                          claro no cadastro do conjunto, e um segredo
                          pré-preenchido igual em toda máquina não é segredo. O
                          servidor recusa com 422; aqui o input nem aparece. */}
                      {!vinculo.encrypted && (
                        <input
                          value={vinculo.defaultValue ?? ''}
                          onChange={(event) => onDefinirPadrao(vinculo.fieldId, event.target.value)}
                          placeholder="valor padrão (só no cadastro)"
                          className="flex-1 min-w-[12rem] p-1.5 bg-bg-base border border-border-sutil text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-text-secondary transition-colors"
                        />
                      )}
                    </div>

                    {/* O NÚMERO DO D61. Só aparece quando importa: no campo já
                        obrigatório ele é zero por construção — nenhum save
                        passaria com ativo inválido —, e um "0 ativos" repetido em
                        toda linha ensinaria a ignorar a linha que tem número. */}
                    {!vinculo.required && vinculo.quebrariam > 0 && (
                      <p className="text-status-warning text-[10px] leading-relaxed flex items-start gap-1">
                        <TriangleAlert size={11} className="shrink-0 mt-0.5" />
                        Marcar como obrigatório trava a edição de {vinculo.quebrariam}{' '}
                        {vinculo.quebrariam === 1 ? 'ativo que não tem' : 'ativos que não têm'} este
                        campo preenchido. O caminho é preencher em massa primeiro e promover depois.
                      </p>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={() => onRemover(vinculo.fieldId)}
                    title="Tirar do conjunto"
                    className="text-text-tertiary hover:text-status-danger transition-colors shrink-0 mt-1"
                  >
                    <X size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* ACRESCENTAR. `<select>` e não busca: o catálogo de campos de uma
              empresa é pequeno — dezenas, não milhares —, e a lista fechada
              mostra de uma vez o que ainda não está no conjunto. */}
          <div className="flex items-center gap-2">
            <select
              value=""
              // `value=""` fixo com `onChange` que age: o `<select>` é um
              // BOTÃO com lista, não um campo — ele não guarda escolha, dispara
              // uma ação e volta ao placeholder.
              onChange={(event) => event.target.value && onAcrescentar(event.target.value)}
              disabled={disponiveis.length === 0}
              className="flex-1 p-2 bg-bg-base border border-border-sutil text-text-primary focus:outline-none focus:border-text-secondary transition-colors disabled:opacity-50"
            >
              <option value="">
                {disponiveis.length === 0
                  ? 'Todos os campos cadastrados já estão neste conjunto'
                  : 'Acrescentar campo...'}
              </option>
              {disponiveis.map((campo) => (
                <option key={campo.id} value={campo.id}>{campo.name}</option>
              ))}
            </select>
            <Plus size={14} className="text-text-tertiary shrink-0" />
          </div>

          <p className="text-text-tertiary text-[10px] leading-relaxed border-t border-border-sutil pt-3">
            A <span className="text-text-secondary uppercase tracking-widest">ordem</span> aqui é a
            ordem no formulário do ativo. <span className="text-text-secondary uppercase tracking-widest">Obrigatório</span>{' '}
            vale em todo salvamento, na criação e na edição — e é do VÍNCULO: o mesmo campo pode ser
            obrigatório aqui e opcional em outro conjunto. Tirar um campo do conjunto{' '}
            <span className="text-text-secondary">não apaga</span> os valores já gravados nos ativos:
            eles ficam guardados e voltam se o campo voltar.
          </p>
        </div>

        <div className="px-6 py-4 flex justify-end gap-3 border-t border-border-sutil bg-bg-base/50">
          <button
            type="button"
            onClick={sujo ? onDescartar : onClose}
            className="px-4 py-2 border border-border-sutil text-text-secondary hover:text-text-primary hover:bg-bg-base transition-colors font-mono text-xs"
          >
            {sujo ? 'Descartar mudanças' : 'Fechar'}
          </button>
          <button
            type="button"
            // `!sujo` desabilita de propósito: a tela salva a lista INTEIRA, e um
            // clique sem mudança reescreveria os vínculos para gravar o mesmo —
            // barato, mas é o tipo de escrita que polui histórico sem motivo.
            disabled={salvando || !sujo}
            onClick={onGravar}
            className="px-4 py-2 bg-text-primary text-bg-base hover:bg-text-secondary transition-colors disabled:opacity-50 font-mono text-xs"
          >
            {salvando ? 'Salvando...' : 'Salvar composição'}
          </button>
        </div>
      </div>
    </div>
  );
}
