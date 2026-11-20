import { useState } from 'react';
import FormularioLateral from '../../../components/FormularioLateral';
import ReferenceSelect from '../../../components/ReferenceSelect';
import { Campo } from '../../../components/ui/campo';
import { Dado, GradeDeDados } from '../../../components/ui/dado';
import { useNotificacao } from '../../../hooks/useNotificacao';
import type { Endpoint } from '../../../types/endpoint.types';

// VINCULAR UMA MÁQUINA A UM COMPUTADOR, À MÃO — e, se quiser, entregar o computador ao
// posto na mesma ida.
//
// O painel repete o sistema e a série, porque a pessoa decide olhando a máquina
// que vai vincular, e ele cobre a linha dela. O computador já vem escolhido
// quando a máquina tem dica, a mesma série ou o mesmo nome (DC); quem confirma
// é a pessoa. Dois campos: o computador (obrigatório)
// e o posto (opcional). Com posto, a operação é a de vincular-e-entregar, que o
// servidor encadeia; sem, é só o vínculo.
//
// O seletor de ativos pede `?maquina=sem`: ativo que já tem máquina é opção
// que o `endpoints.assetId @unique` recusaria no clique, então a lista nem
// oferece. O de posto pede `?computador=sem` pelo mesmo motivo, como o Entregar
// de Computadores: o posto que já tem computador recusa a entrega.
//
// Não fala HTTP: recebe `onVincular` e mostra o que ele rejeitar. O erro mora
// AQUI porque é aqui que a pessoa decide — "este posto já tem um computador"
// precisa aparecer ao lado do campo onde ela escolheu o posto.

interface Props {
  /** A linha da lista, ou a ficha da máquina (DF). */
  maquina: Pick<Endpoint, 'id' | 'hostname' | 'osVersion' | 'biosSerial' | 'dica'>;
  ocupado: boolean;
  onVincular: (endpointId: string, assetId: string, targetWorkstationId: string | null) => Promise<void>;
  onCancelar: () => void;
}

export default function VincularMaquinaForm({ maquina, ocupado, onVincular, onCancelar }: Props) {
  const notificar = useNotificacao();
  const [assetId, setAssetId] = useState(maquina.dica?.id ?? '');
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
      // vista Sem computador, e o painel continua aberto com a frase que diz isso.
      onCancelar();
      notificar.sucesso(workstationId ? 'Máquina vinculada e computador entregue.' : 'Máquina vinculada.');
    } catch (falha) {
      setErro((falha as Error).message);
    } finally {
      setSalvando(false);
    }
  };

  return (
    <FormularioLateral
      titulo="Vincular máquina"
      descricao={`${maquina.hostname} passa a ser o computador escolhido abaixo. Nada muda na máquina.`}
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
        <Dado rotulo="Série">{maquina.biosSerial && <span className="font-mono">{maquina.biosSerial}</span>}</Dado>
      </GradeDeDados>

      <Campo
        rotulo="Computador"
        obrigatorio
        ajuda="Só computadores ainda sem máquina. Cadastre o computador em Computadores se ele não existe."
      >
        <ReferenceSelect
          rota="assets"
          parametros={{ maquina: 'sem' }}
          valor={assetId}
          // A dica com a etiqueta: além das 200 primeiras opções, o campo não
          // diria qual computador já vem escolhido.
          atual={maquina.dica && { id: maquina.dica.id, name: maquina.dica.assetTag }}
          obrigatorio
          onChange={setAssetId}
        />
      </Campo>

      <Campo
        rotulo="E entregar ao posto"
        ajuda="Opcional. Só postos ainda sem computador. Com posto, o computador é entregue a ele na mesma operação."
      >
        <ReferenceSelect rota="workstations" parametros={{ computador: 'sem' }} valor={workstationId} onChange={setWorkstationId} />
      </Campo>
    </FormularioLateral>
  );
}
