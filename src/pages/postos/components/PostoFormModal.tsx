import { useState } from 'react';
import FormularioLateral from '../../../components/FormularioLateral';
import ReferenceSelect from '../../../components/ReferenceSelect';
import { Campo } from '../../../components/ui/campo';
import { Input, Textarea } from '../../../components/ui/input';
import { montarPosto } from '../helpers/postos.helper';
import type { PostoInput } from '../../../queries/workstation.queries';
import type { Posto } from '../../../types/workstation.types';

// Criar ou editar a Mesa 1 SEM sair da tela de postos.
//
// Três campos: nome, a LOCALIZAÇÃO onde a mesa fica e uma nota. Endereço, CEP e
// telefone são da localização, não da mesa — quem precisa deles edita a
// localização em Configurações, onde eles fazem sentido.
//
// Grava em `/workstations`, o cadastro do posto (decisão Y).

interface PostoFormModalProps {
  /** O posto em edição; `null` cria um novo. */
  posto: Posto | null;
  onClose: () => void;
  onSubmit: (data: PostoInput) => Promise<void>;
}

export default function PostoFormModal({ posto, onClose, onSubmit }: PostoFormModalProps) {
  const [name, setName] = useState(posto?.name ?? '');
  const [locationId, setLocationId] = useState(posto?.locationId ?? '');
  const [notes, setNotes] = useState(posto?.notes ?? '');
  // A versão DESTA abertura (AF): o registro pode chegar mais novo enquanto o
  // formulário está aberto, e o que ele mostra continua sendo o desta leitura.
  const [versao] = useState(posto?.updatedAt);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');

  const enviar = async (event: React.FormEvent) => {
    event.preventDefault();
    setSalvando(true);
    setErro('');

    try {
      await onSubmit({ ...montarPosto({ name, locationId, notes }, posto !== null), ...(versao ? { updatedAt: versao } : {}) });
    } catch (falha) {
      // O apiClient já traduziu a resposta do servidor em Error.message — é
      // aqui que aparece o 409 de nome repetido e o 404 da localização.
      setErro((falha as Error).message);
    } finally {
      setSalvando(false);
    }
  };

  return (
    <FormularioLateral
      titulo={posto ? 'Editar posto' : 'Novo posto'}
      descricao="Quem ocupa o posto se define na ficha dele, com o turno de cada um."
      onClose={onClose}
      onSubmit={enviar}
      erro={erro}
      salvando={salvando}
      bloqueado={!name.trim() || !locationId}
      rotuloDoEnvio={posto ? 'Salvar' : 'Criar posto'}
    >
      <Campo rotulo="Nome" obrigatorio>
        <Input
          required
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="MesaEscritório, MesaRecepção..."
        />
      </Campo>

      <Campo
        rotulo="Localização"
        obrigatorio
        ajuda="Onde a mesa fica: a Matriz, a Filial. Cadastrada em Configurações › Localizações."
      >
        <ReferenceSelect
          rota="locations"
          valor={locationId}
          obrigatorio
          atual={posto?.location}
          onChange={setLocationId}
        />
      </Campo>

      <Campo rotulo="Notas">
        <Textarea value={notes} onChange={(event) => setNotes(event.target.value)} />
      </Campo>
    </FormularioLateral>
  );
}
