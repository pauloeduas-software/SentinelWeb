import { useState } from 'react';
import { X } from 'lucide-react';
import ReferenceSelect from '../ReferenceSelect';
import type { CampoSpec, CatalogUiSpec } from './catalog-ui.types';
import type { CatalogRow } from '../../types/catalog.types';

// Valor inicial de cada campo. Tudo vira string: é o que o `<input>`
// controlado espera, e o servidor já converte de volta (o `''` vira `null` no
// schema).
//
// `padroes` só vale para registro NOVO: é o recorte que estava na tela (o tipo
// filtrado nas categorias). Na edição quem manda é o que está gravado.
function valoresIniciais(
  spec: CatalogUiSpec,
  registro: CatalogRow | null,
  padroes?: Record<string, unknown>,
): Record<string, unknown> {
  const valores: Record<string, unknown> = {};

  for (const campo of spec.campos) {
    const atual = registro ? registro[campo.key] : padroes?.[campo.key];

    if (campo.tipo === 'select') valores[campo.key] = String(atual ?? campo.opcoes?.[0]?.value ?? '');
    else valores[campo.key] = atual == null ? '' : String(atual);
  }

  return valores;
}

/**
 * O vínculo com que um campo `reference` abriu, com nome — para o
 * `ReferenceSelect` nomear a opção que ficou fora da lista (o colaborador
 * desativado não volta no `/options`, e a lista tem teto).
 *
 * Pela convenção das specs: o campo `manufacturerId` tem a relação ao lado, em
 * `manufacturer`, que é a mesma que a coluna `relacao` da tabela lê. Sem a
 * relação no registro, `null` — e a opção aparece sem nome, como antes.
 */
function referenciaAtual(registro: CatalogRow | null, campo: CampoSpec): { id: string; name: string } | null {
  if (!registro || campo.tipo !== 'reference') return null;
  const relacao = registro[campo.key.replace(/Id$/, '')];
  if (!relacao || typeof relacao !== 'object') return null;
  const { id, name } = relacao as { id?: unknown; name?: unknown };
  return typeof id === 'string' && typeof name === 'string' ? { id, name } : null;
}

interface CatalogFormModalProps {
  spec: CatalogUiSpec;
  registro: CatalogRow | null;
  /** Valores de partida do registro NOVO — o tipo filtrado na aba. Ignorado na edição. */
  padroes?: Record<string, unknown>;
  onClose: () => void;
  onSubmit: (data: Record<string, unknown>) => Promise<void>;
}

export default function CatalogFormModal({ spec, registro, padroes, onClose, onSubmit }: CatalogFormModalProps) {
  const [valores, setValores] = useState(() => valoresIniciais(spec, registro, padroes));
  // A versão DESTA abertura (AF): o registro pode chegar mais novo enquanto o
  // formulário está aberto, e o que ele mostra continua sendo o desta leitura.
  const [versao] = useState(registro?.updatedAt);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');

  const definir = (key: string, valor: unknown) => setValores((atual) => ({ ...atual, [key]: valor }));

  const enviar = async (event: React.FormEvent) => {
    event.preventDefault();
    setSalvando(true);
    setErro('');

    try {
      await onSubmit(versao ? { ...valores, updatedAt: versao } : valores);
    } catch (falha) {
      // O apiClient já traduziu a resposta do servidor em Error.message.
      setErro((falha as Error).message);
    } finally {
      setSalvando(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-bg-base/80 backdrop-blur-sm">
      <div className="relative w-full max-w-2xl bg-surface-card border border-border-sutil shadow-2xl flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border-sutil bg-bg-base/50">
          <h2 className="text-sm font-mono text-text-primary tracking-widest uppercase">
            {registro ? `Editar ${spec.singular}` : `${spec.genero === 'f' ? 'Nova' : 'Novo'} ${spec.singular}`}
          </h2>
          <button onClick={onClose} className="p-2 text-text-tertiary hover:text-text-primary transition-colors">
            <X size={16} />
          </button>
        </div>

        <form onSubmit={enviar} className="p-6 font-mono text-xs overflow-y-auto max-h-[75vh]">
          {erro && (
            <div className="mb-4 p-3 bg-status-danger/10 text-status-danger border border-status-danger/20">
              {erro}
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            {spec.campos.map((campo) => (
              <div key={campo.key} className={`space-y-1 ${campo.largura === 'inteira' ? 'col-span-2' : ''}`}>
                <label className="text-text-secondary uppercase tracking-widest text-[10px]">
                  {campo.label}{campo.obrigatorio && '*'}
                </label>
                <Campo
                  campo={campo}
                  atual={referenciaAtual(registro, campo)}
                  valor={valores[campo.key]}
                  onChange={(valor) => definir(campo.key, valor)}
                />
                {campo.ajuda && (
                  <p className="text-text-tertiary text-[10px] leading-relaxed">{campo.ajuda}</p>
                )}
              </div>
            ))}
          </div>

          <div className="mt-6 pt-4 flex justify-end gap-3 border-t border-border-sutil">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border border-border-sutil text-text-secondary hover:text-text-primary hover:bg-bg-base transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={salvando}
              className="px-4 py-2 bg-text-primary text-bg-base hover:bg-text-secondary transition-colors disabled:opacity-50"
            >
              {salvando ? 'Salvando...' : 'Salvar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

const CLASSE_CAMPO =
  'w-full p-2 bg-bg-base border border-border-sutil text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-text-secondary transition-colors';

function Campo({
  campo, atual, valor, onChange,
}: {
  campo: CampoSpec;
  atual: { id: string; name: string } | null;
  valor: unknown;
  onChange: (valor: unknown) => void;
}) {
  if (campo.tipo === 'reference') {
    return (
      <ReferenceSelect
        rota={campo.rota ?? ''}
        filtroTipo={campo.filtroTipo}
        valor={String(valor ?? '')}
        obrigatorio={campo.obrigatorio}
        atual={atual}
        onChange={onChange}
      />
    );
  }

  if (campo.tipo === 'select') {
    // A explicação da opção escolhida fica logo abaixo do campo. É o que
    // responde, no momento da escolha, "qual a diferença entre estas duas?" —
    // pergunta que o rótulo de um `<option>` não tem espaço para responder.
    const selecionada = campo.opcoes?.find((opcao) => opcao.value === String(valor ?? ''));

    return (
      <>
        <select
          required={campo.obrigatorio}
          value={String(valor ?? '')}
          onChange={(event) => onChange(event.target.value)}
          className={CLASSE_CAMPO}
        >
          {campo.opcoes?.map((opcao) => (
            <option key={opcao.value} value={opcao.value}>{opcao.label}</option>
          ))}
        </select>
        {selecionada?.ajuda && (
          <p className="text-text-tertiary text-[10px] leading-relaxed pt-1">{selecionada.ajuda}</p>
        )}
      </>
    );
  }

  if (campo.tipo === 'textarea') {
    return (
      <textarea
        value={String(valor ?? '')}
        onChange={(event) => onChange(event.target.value)}
        className={`${CLASSE_CAMPO} h-20 resize-none`}
      />
    );
  }

  return (
    <input
      type="text"
      required={campo.obrigatorio}
      value={String(valor ?? '')}
      onChange={(event) => onChange(event.target.value)}
      className={CLASSE_CAMPO}
    />
  );
}
