import { useState } from 'react';
import FormularioLateral from '../FormularioLateral';
import ReferenceSelect from '../ReferenceSelect';
import { Campo as CampoDoFormulario } from '../ui/campo';
import { Input, Textarea } from '../ui/input';
import { OpcoesDescritas } from '../ui/opcoes-descritas';
import { tituloDoNovo, type CampoSpec, type CatalogUiSpec } from './catalog-ui.types';
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

  // Evita o 409 depois do Salvar; a guarda do servidor continua, porque a contagem
  // é a da lista, e pode ter mudado.
  const usos = registro?.usos ?? 0;
  const travado = (campo: CampoSpec) => campo.travaEmUso === true && usos > 0;

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
      titulo={registro ? `Editar ${spec.singular.toLowerCase()}` : tituloDoNovo(spec)}
      descricao={registro ? String(registro.name ?? '') : undefined}
      onClose={onClose}
      onSubmit={enviar}
      erro={erro}
      salvando={salvando}
    >
      <div className="grid sm:grid-cols-2 gap-4">
        {spec.campos.map((campo) => (
          <CampoDoFormulario
            key={campo.key}
            rotulo={campo.label}
            obrigatorio={campo.obrigatorio}
            ajuda={travado(campo) ? `Em uso por ${usos} ${usos === 1 ? 'registro' : 'registros'}: o tipo não muda.` : campo.ajuda}
            className={campo.largura === 'inteira' ? 'col-span-2' : ''}
          >
            <Campo
              campo={campo}
              atual={referenciaAtual(registro, campo)}
              valor={valores[campo.key]}
              travado={travado(campo)}
              onChange={(valor) => definir(campo.key, valor)}
            />
          </CampoDoFormulario>
        ))}
      </div>
    </FormularioLateral>
  );
}

function Campo({
  campo, atual, valor, travado, onChange,
}: {
  campo: CampoSpec;
  atual: { id: string; name: string } | null;
  valor: unknown;
  travado: boolean;
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
      <OpcoesDescritas
        rotulo={campo.label}
        value={String(valor ?? '')}
        onChange={onChange}
        opcoes={campo.opcoes ?? []}
        disabled={travado}
      />
    );
  }

  if (campo.tipo === 'textarea') {
    return <Textarea value={String(valor ?? '')} onChange={(event) => onChange(event.target.value)} />;
  }

  return (
    <Input
      type={campo.tipo}
      required={campo.obrigatorio}
      placeholder={campo.placeholder}
      value={String(valor ?? '')}
      onChange={(event) => onChange(event.target.value)}
    />
  );
}
