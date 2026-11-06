import { useState } from 'react';
import FormularioLateral from '../../../components/FormularioLateral';
import ReferenceSelect from '../../../components/ReferenceSelect';
import { Campo } from '../../../components/ui/campo';
import { Dado, GradeDeDados } from '../../../components/ui/dado';
import type { Endpoint } from '../../../types/endpoint.types';

// VINCULAR UMA MÁQUINA A UM ATIVO, À MÃO — e, se quiser, entregar o ativo ao
// posto na mesma ida.
//
// O painel repete o sistema e a série, porque a pessoa decide olhando a máquina
// que vai vincular, e ele cobre a linha dela. Dois campos: o ativo (obrigatório)
// e o posto (opcional). Com posto, a operação é a de vincular-e-entregar, que o
// servidor encadeia; sem, é só o vínculo.
//
// O seletor de ativos pede `?maquina=sem`: ativo que já tem máquina é opção
// que o `endpoints.assetId @unique` recusaria no clique, então a lista nem
// oferece. O de posto é o `/workstations/options`, como na entrega da tela de
// Ativos: só posto recebe entrega.
//
// Não fala HTTP: recebe `onVincular` e mostra o que ele rejeitar. O erro mora
// AQUI porque é aqui que a pessoa decide — "este posto já tem um ativo"
// precisa aparecer ao lado do campo onde ela escolheu o posto.

interface Props {
  maquina: Endpoint;
  ocupado: boolean;
  onVincular: (endpointId: string, assetId: string, targetWorkstationId: string | null) => Promise<void>;
  onCancelar: () => void;
}

export default function VincularMaquinaForm({ maquina, ocupado, onVincular, onCancelar }: Props) {
  const [assetId, setAssetId] = useState('');
  const [workstationId, setWorkstationId] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');

  const enviar = async (event: React.FormEvent) => {
    event.preventDefault();
    setSalvando(true);
    setErro('');
    try {
      await onVincular(maquina.id, assetId, workstationId || null);
      // Fecha só no sucesso. Na entrega recusada o vínculo fica e a linha some da
      // lista "Sem vínculo", e o painel continua aberto com a frase que diz isso.
      onCancelar();
    } catch (falha) {
      setErro((falha as Error).message);
    } finally {
      setSalvando(false);
    }
  };

  return (
    <FormularioLateral
      titulo="Vincular máquina"
      descricao={`${maquina.hostname} passa a ser o patrimônio escolhido abaixo. Nada muda na máquina.`}
      onClose={onCancelar}
      onSubmit={enviar}
      erro={erro}
      salvando={salvando}
      bloqueado={ocupado || !assetId}
      rotuloDoEnvio={workstationId ? 'Vincular e entregar' : 'Vincular'}
      rotuloEnviando="Vinculando…"
    >
      <GradeDeDados className="md:grid-cols-2">
        <Dado rotulo="Sistema operacional">{maquina.osVersion}</Dado>
        <Dado rotulo="Série da BIOS">{maquina.biosSerial && <span className="font-mono">{maquina.biosSerial}</span>}</Dado>
      </GradeDeDados>

      <Campo
        rotulo="Ativo"
        obrigatorio
        ajuda="Só ativos ainda sem máquina. Cadastre o ativo em Computadores se ele não existe."
      >
        <ReferenceSelect
          rota="assets"
          parametros={{ maquina: 'sem' }}
          valor={assetId}
          obrigatorio
          onChange={setAssetId}
        />
      </Campo>

      <Campo
        rotulo="E entregar ao posto"
        ajuda="Opcional. Com posto, o ativo é entregue à mesa na mesma operação, e um posto que já tem ativo recusa."
      >
        <ReferenceSelect rota="workstations" valor={workstationId} onChange={setWorkstationId} />
      </Campo>
    </FormularioLateral>
  );
}
