import { useState } from 'react';
import FormularioLateral from '../../../components/FormularioLateral';
import { Aviso } from '../../../components/ui/aviso';
import { Campo } from '../../../components/ui/campo';
import { Input } from '../../../components/ui/input';
import { OpcoesDescritas } from '../../../components/ui/opcoes-descritas';
import { useNotificacao } from '../../../hooks/useNotificacao';
import type {
  ConfiguracaoDaDescoberta as Configuracao, DiscoveryMode,
} from '../../../types/reconciliation.types';

// OS BOTÕES DA DESCOBERTA (D118), no painel lateral de todo formulário: o modo e
// os dois prazos que os números do topo da tela citam.
//
// Abre com o que o servidor respondeu e só existe aberto, então semear o estado no
// `useState` basta: cada abertura lê a configuração de agora (D119).

interface Props {
  configuracao: Configuracao;
  onSalvar: (dados: Configuracao) => Promise<void>;
  onClose: () => void;
}

/** Os três modos, com o que cada um faz escrito onde a pessoa decide (D51/D112). */
const MODOS: { value: DiscoveryMode; label: string; ajuda: string }[] = [
  {
    value: 'OFF',
    label: 'Desligado',
    ajuda: 'Nenhuma sugestão sobre máquina sem vínculo. Os números do topo continuam contando.',
  },
  {
    value: 'SUGGEST',
    label: 'Sugerir',
    ajuda: 'O padrão. O sistema sugere e uma pessoa decide. Nada entra no cadastro sozinho.',
  },
  {
    value: 'ON',
    label: 'Vincular sozinho',
    ajuda: 'Série ou UUID batendo com um único computador vira vínculo sem perguntar. Continua sem criar computador e sem mexer nos responsáveis.',
  },
];

export default function ConfigurarDescobertaForm({ configuracao, onSalvar, onClose }: Props) {
  const notificar = useNotificacao();
  const [modo, setModo] = useState(configuracao.discoveryMode);
  const [ghostDays, setGhostDays] = useState(() => String(configuracao.ghostDays));
  const [shadowHours, setShadowHours] = useState(() => String(configuracao.shadowHours));
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');

  const enviar = async (event: React.FormEvent) => {
    event.preventDefault();
    setSalvando(true);
    setErro('');
    try {
      await onSalvar({ discoveryMode: modo, ghostDays: Number(ghostDays), shadowHours: Number(shadowHours) });
      onClose();
      notificar.sucesso('Configuração salva.');
    } catch (falha) {
      setErro((falha as Error).message);
    } finally {
      setSalvando(false);
    }
  };

  return (
    <FormularioLateral
      titulo="Configurar descoberta"
      onClose={onClose}
      onSubmit={enviar}
      erro={erro}
      salvando={salvando}
    >
      <Campo rotulo="Modo">
        <OpcoesDescritas
          rotulo="Modo"
          opcoes={MODOS}
          value={modo}
          onChange={(valor) => setModo(valor as DiscoveryMode)}
        />
      </Campo>

      {modo === 'ON' && (
        // O AVISO É DA DECISÃO (D51): em `ON`, a primeira VM de teste que casar por
        // série vira vínculo sem ninguém olhar. É o único erro silencioso deste painel.
        <Aviso tom="aviso">
          Um vínculo errado entra no cadastro sem ninguém revisar. Desfazer é o Desvincular, na lista Vinculadas.
        </Aviso>
      )}

      <Campo rotulo="Dias para virar fantasma" obrigatorio ajuda="Computador cujo agente não dá sinal há mais que isso entra na conta de Fantasmas.">
        <Input type="number" required min={1} max={365} value={ghostDays} onChange={(evento) => setGhostDays(evento.target.value)} />
      </Campo>

      <Campo rotulo="Horas para virar Shadow IT" obrigatorio ajuda="Máquina sem vínculo vista há mais que isso e ainda sem triagem.">
        <Input type="number" required min={1} max={720} value={shadowHours} onChange={(evento) => setShadowHours(evento.target.value)} />
      </Campo>
    </FormularioLateral>
  );
}
