import { useState } from 'react';
import { X } from 'lucide-react';
import ReferenceSelect from '../../components/ReferenceSelect';
import type { CampoSpec, CatalogUiSpec } from '../specs/catalog-ui.types';
import type { CatalogRow } from '../../../domain/shared/catalog.types';

const COR_PADRAO = '#888888';

// Valor inicial de cada campo. Tudo vira string, menos checkbox: é o que o
// `<input>` controlado espera, e o servidor já converte de volta (o `''` vira
// `null` no schema, e número vazio vira `null` no `preprocess`).
function valoresIniciais(spec: CatalogUiSpec, registro: CatalogRow | null): Record<string, unknown> {
  const valores: Record<string, unknown> = {};

  for (const campo of spec.campos) {
    const atual = registro?.[campo.key];

    if (campo.tipo === 'checkbox') valores[campo.key] = Boolean(atual);
    else if (campo.tipo === 'select') valores[campo.key] = String(atual ?? campo.opcoes?.[0]?.value ?? '');
    else valores[campo.key] = atual == null ? '' : String(atual);
  }

  return valores;
}

interface CatalogFormModalProps {
  spec: CatalogUiSpec;
  registro: CatalogRow | null;
  onClose: () => void;
  onSubmit: (data: Record<string, unknown>) => Promise<void>;
}

export default function CatalogFormModal({ spec, registro, onClose, onSubmit }: CatalogFormModalProps) {
  const [valores, setValores] = useState(() => valoresIniciais(spec, registro));
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');

  const definir = (key: string, valor: unknown) => setValores((atual) => ({ ...atual, [key]: valor }));

  const enviar = async (event: React.FormEvent) => {
    event.preventDefault();
    setSalvando(true);
    setErro('');

    try {
      await onSubmit(valores);
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
            {registro ? `Editar ${spec.singular}` : `Nova ${spec.singular}`}
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
              <div
                key={campo.key}
                className={`space-y-1 ${campo.largura === 'inteira' || campo.tipo === 'checkbox' ? 'col-span-2' : ''}`}
              >
                {campo.tipo !== 'checkbox' && (
                  <label className="text-text-secondary uppercase tracking-widest text-[10px]">
                    {campo.label}{campo.obrigatorio && '*'}
                  </label>
                )}
                <Campo
                  campo={campo}
                  valor={valores[campo.key]}
                  registroId={registro?.id}
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
  campo, valor, registroId, onChange,
}: {
  campo: CampoSpec;
  valor: unknown;
  registroId?: string;
  onChange: (valor: unknown) => void;
}) {
  if (campo.tipo === 'checkbox') {
    return (
      <label className="flex items-center gap-3 cursor-pointer text-text-secondary">
        <input
          type="checkbox"
          checked={Boolean(valor)}
          onChange={(event) => onChange(event.target.checked)}
          className="accent-status-success w-4 h-4"
        />
        <span className="uppercase tracking-widest text-[10px]">{campo.label}</span>
      </label>
    );
  }

  if (campo.tipo === 'reference') {
    return (
      <ReferenceSelect
        rota={campo.rota ?? ''}
        filtroTipo={campo.filtroTipo}
        valor={String(valor ?? '')}
        obrigatorio={campo.obrigatorio}
        // Uma localização não pode ser oferecida como pai de si mesma. O ciclo
        // mais longo (pai de uma filha) ainda é barrado pelo servidor com 409.
        excluirId={campo.rota === 'locations' ? registroId : undefined}
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

  if (campo.tipo === 'color') {
    const definida = typeof valor === 'string' && valor !== '';
    return (
      <div className="flex items-center gap-2">
        {/* `<input type="color">` nunca fica vazio — ele cai em #000000. Por
            isso o valor "sem cor" é guardado como '' e mostrado pelo botão ao
            lado, não pelo próprio seletor. */}
        <input
          type="color"
          value={definida ? String(valor) : COR_PADRAO}
          onChange={(event) => onChange(event.target.value)}
          className="h-9 w-12 bg-bg-base border border-border-sutil cursor-pointer"
        />
        <span className="text-text-tertiary tabular-nums flex-1">
          {definida ? String(valor) : 'sem cor'}
        </span>
        {definida && (
          <button
            type="button"
            onClick={() => onChange('')}
            className="px-2 py-1 border border-border-sutil text-text-tertiary hover:text-status-danger transition-colors"
          >
            limpar
          </button>
        )}
      </div>
    );
  }

  if (campo.tipo === 'textarea') {
    return (
      <textarea
        value={String(valor ?? '')}
        placeholder={campo.placeholder}
        onChange={(event) => onChange(event.target.value)}
        className={`${CLASSE_CAMPO} h-20 resize-none`}
      />
    );
  }

  return (
    <input
      // `money` é `text` de propósito: o valor viaja como string do formulário
      // ao Postgres, sem passar por float em ponto nenhum.
      type={campo.tipo === 'number' ? 'number' : 'text'}
      inputMode={campo.tipo === 'money' ? 'decimal' : undefined}
      required={campo.obrigatorio}
      min={campo.tipo === 'number' ? 0 : undefined}
      value={String(valor ?? '')}
      placeholder={campo.placeholder}
      onChange={(event) => onChange(event.target.value)}
      className={CLASSE_CAMPO}
    />
  );
}
