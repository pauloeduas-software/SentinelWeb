import { useState } from 'react';
import FormularioLateral from '../../../../components/FormularioLateral';
import ReferenceSelect from '../../../../components/ReferenceSelect';
import { Campo } from '../../../../components/ui/campo';
import { Input, Textarea } from '../../../../components/ui/input';
import { diaDoInstante, hojeNoCampoDeData } from '../../../../helpers/format.helper';
import { nomeDoResponsavel } from '../../../../helpers/responsavel.helper';
import { TRACO, montarDevolucao } from '../../helpers/posse.helper';
import type { CheckinInput } from '../../../../queries/assignment.queries';
import type { Asset } from '../../../../types/asset.types';

// DEVOLVER — aberto pela linha da aba Responsáveis, o único lugar que devolve o
// computador (BN, BQ). A entrega é o `CheckoutModal`.
//
// Painel, e não a linha do Estoque: além do dia, o computador volta com um status
// (disponível, em conserto, inutilizável) e pode levar notas.
//
// Não fala HTTP: devolve o corpo por callback (o `ReferenceSelect` é a exceção
// documentada, que busca as opções pela query do domínio).

interface DevolucaoModalProps {
  asset: Asset;
  onClose: () => void;
  onDevolver: (data: CheckinInput) => Promise<void>;
}

export default function DevolucaoModal({ asset, onClose, onDevolver }: DevolucaoModalProps) {
  const [statusId, setStatusId] = useState('');
  const [observacoes, setObservacoes] = useState('');
  // O DIA da devolução (AM), como na licença e no estoque: vem com hoje, e pode
  // voltar para registrar a que já aconteceu.
  const hoje = hojeNoCampoDeData();
  const [dia, setDia] = useState(hoje);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');

  const enviar = async (event: React.FormEvent) => {
    event.preventDefault();
    setSalvando(true);
    setErro('');

    try {
      await onDevolver(montarDevolucao({ statusId, checkinNotes: observacoes, checkinAt: dia }));
    } catch (falha) {
      // Mutação propaga: o erro do servidor aparece aqui, já traduzido pelo apiClient.
      setErro((falha as Error).message);
    } finally {
      setSalvando(false);
    }
  };

  return (
    <FormularioLateral
      titulo="Devolver ativo"
      descricao={
        <>
          <span className="font-mono">{asset.assetTag}</span> · {asset.model.manufacturer.name} {asset.model.name}
          {asset.serial && <> · SN <span className="font-mono">{asset.serial}</span></>}
        </>
      }
      onClose={onClose}
      onSubmit={enviar}
      erro={erro}
      salvando={salvando}
      bloqueado={!dia}
      rotuloDoEnvio="Devolver"
      rotuloEnviando="Devolvendo…"
    >
      {/* Com quem ele está: sem isto, "devolver" seria um botão sem contexto. */}
      <div className="space-y-2 rounded-lg border border-border-sutil p-4">
        <div className="text-xs font-medium text-text-tertiary">Responsáveis</div>
        <div className="text-sm text-text-primary">{nomeDoResponsavel(asset.posse) || TRACO}</div>
      </div>

      <Campo rotulo="Status de volta" ajuda="Como o ativo volta: disponível, em conserto, inutilizável. Em branco, volta disponível.">
        <ReferenceSelect rota="status-labels" valor={statusId} onChange={setStatusId} />
      </Campo>

      <Campo rotulo="Data da devolução" obrigatorio>
        <Input
          type="date" required max={hoje} value={dia}
          min={asset.posse?.checkoutAt ? diaDoInstante(asset.posse.checkoutAt) : undefined}
          onChange={(event) => setDia(event.target.value)}
        />
      </Campo>

      <Campo rotulo="Notas">
        <Textarea value={observacoes} onChange={(event) => setObservacoes(event.target.value)} />
      </Campo>
    </FormularioLateral>
  );
}
