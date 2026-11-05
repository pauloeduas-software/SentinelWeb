import { useState } from 'react';
import FormularioLateral from '../FormularioLateral';
import ReferenceSelect from '../ReferenceSelect';
import { Campo as CampoDoFormulario } from '../ui/campo';
import { Input, Textarea } from '../ui/input';
import { Seletor } from '../ui/seletor';
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
    <FormularioLateral
      titulo={registro ? `Editar ${spec.singular}` : `${spec.genero === 'f' ? 'Nova' : 'Novo'} ${spec.singular}`}
      largura="lg"
      onClose={onClose}
      onSubmit={enviar}
      erro={erro}
      salvando={salvando}
    >
      <div className="grid grid-cols-2 gap-4">
        {spec.campos.map((campo) => (
          <CampoDoFormulario
            key={campo.key}
            rotulo={campo.label}
            obrigatorio={campo.obrigatorio}
            ajuda={ajudaDoCampo(campo, valores[campo.key])}
            className={campo.largura === 'inteira' ? 'col-span-2' : ''}
          >
            <Campo
              campo={campo}
              atual={referenciaAtual(registro, campo)}
              valor={valores[campo.key]}
              onChange={(valor) => definir(campo.key, valor)}
            />
          </CampoDoFormulario>
        ))}
      </div>
    </FormularioLateral>
  );
}

// A explicação da opção escolhida fica logo abaixo do campo. É o que responde, no
// momento da escolha, "qual a diferença entre estas duas?".
function ajudaDoCampo(campo: CampoSpec, valor: unknown): string | undefined {
  const selecionada = campo.tipo === 'select'
    ? campo.opcoes?.find((opcao) => opcao.value === String(valor ?? ''))
    : undefined;
  return selecionada?.ajuda ?? campo.ajuda;
}

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
    return (
      <Seletor
        obrigatorio={campo.obrigatorio}
        value={String(valor ?? '')}
        onChange={onChange}
        vazio="Selecione..."
        opcoes={campo.opcoes ?? []}
      />
    );
  }

  if (campo.tipo === 'textarea') {
    return <Textarea rows={4} value={String(valor ?? '')} onChange={(event) => onChange(event.target.value)} />;
  }

  return (
    <Input
      type="text"
      required={campo.obrigatorio}
      value={String(valor ?? '')}
      onChange={(event) => onChange(event.target.value)}
    />
  );
}
