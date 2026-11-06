import { useState } from 'react';
import FormularioLateral from '../../../components/FormularioLateral';
import ReferenceSelect from '../../../components/ReferenceSelect';
import { Campo } from '../../../components/ui/campo';
import { Input, Textarea } from '../../../components/ui/input';
import { hojeNoCampoDeData } from '../../../helpers/format.helper';
import { useNotificacao } from '../../../hooks/useNotificacao';
import { montarOcupante } from '../helpers/ocupantes.helper';
import type { OccupantInput } from '../../../queries/occupancy.queries';

// COLOCAR ALGUÉM NO POSTO, por cima da ficha: fechar o painel volta para a lista
// de ocupantes, já com a pessoa nela.
//
// Não fala HTTP: devolve o corpo por callback (o `ReferenceSelect` é a exceção
// documentada, que busca as opções pela query do domínio).

interface OcupanteFormModalProps {
  nomeDoPosto: string;
  onClose: () => void;
  onSubmit: (data: OccupantInput) => Promise<void>;
}

export default function OcupanteFormModal({ nomeDoPosto, onClose, onSubmit }: OcupanteFormModalProps) {
  const [personId, setPersonId] = useState('');
  const [shift, setShift] = useState('');
  const [startedAt, setStartedAt] = useState('');
  const [notes, setNotes] = useState('');
  const notificar = useNotificacao();
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');

  const enviar = async (event: React.FormEvent) => {
    event.preventDefault();
    setSalvando(true);
    setErro('');

    try {
      await onSubmit(montarOcupante({ personId, shift, startedAt, notes }));
      // Fechar só depois do sucesso: com erro, o que foi digitado continua na
      // tela para ser corrigido em vez de redigitado.
      onClose();
      notificar.sucesso('Ocupante adicionado.');
    } catch (falha) {
      setErro((falha as Error).message);
    } finally {
      setSalvando(false);
    }
  };

  return (
    <FormularioLateral
      titulo="Adicionar ao posto"
      descricao={`${nomeDoPosto}: quem ocupa o posto responde por tudo que foi entregue a ele.`}
      onClose={onClose}
      onSubmit={enviar}
      erro={erro}
      salvando={salvando}
      bloqueado={!personId}
      rotuloDoEnvio="Adicionar"
      rotuloEnviando="Adicionando…"
    >
      <Campo rotulo="Colaborador" obrigatorio>
        {/* `people` é o slug real de `/options` (GET /api/people/options). */}
        <ReferenceSelect rota="people" valor={personId} obrigatorio comDetalhe onChange={setPersonId} />
      </Campo>

      <Campo rotulo="Turno" ajuda="Texto livre: é rótulo de escala, não horário.">
        <Input value={shift} onChange={(event) => setShift(event.target.value)} />
      </Campo>

      <Campo rotulo="Desde" ajuda="Em branco, vale a partir de agora.">
        <Input
          type="date"
          max={hojeNoCampoDeData()}
          value={startedAt}
          onChange={(event) => setStartedAt(event.target.value)}
        />
      </Campo>

      <Campo rotulo="Notas">
        <Textarea value={notes} onChange={(event) => setNotes(event.target.value)} />
      </Campo>
    </FormularioLateral>
  );
}
