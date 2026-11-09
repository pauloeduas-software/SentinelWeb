import { useState } from 'react';
import { MapPin, User } from 'lucide-react';
import FormularioLateral from '../../../components/FormularioLateral';
import ReferenceSelect from '../../../components/ReferenceSelect';
import { Campo } from '../../../components/ui/campo';
import { Input, Textarea } from '../../../components/ui/input';
import { Segmentado } from '../../../components/ui/segmentado';
import { hojeNoCampoDeData } from '../../../helpers/format.helper';
import { useCatalogOptionsQuery } from '../../../queries/catalog.queries';
import { montarEntrega } from '../helpers/posse.helper';
import type { CheckoutInput } from '../../../queries/assignment.queries';
import type { Asset } from '../../../types/asset.types';
import type { AlvoDaPosse } from '../../../types/posse.types';

// ENTREGAR — a porta pela qual o ativo ganha um responsável
// (docs/referencia/modelo-de-posse.md). A devolução é o `DevolucaoModal`, na ficha
// (BQ). O ativo já entregue não chega aqui: o `bloqueioDaEntrega` trava o botão,
// e o duplo checkout seria um erro sem explicação do índice único parcial do banco.
//
// Como todo componente desta pasta, não fala HTTP: recebe `onEntregar` por prop.
// As exceções buscam opções pela query do domínio, nunca
// por `apiClient`: o `ReferenceSelect` e a lista de status disponíveis que o
// destino da entrega precisa ESCONDER (ver `idsDisponiveis`).

/**
 * As DUAS abas do seletor de alvo. Cada uma é um `targetType` do contrato, e a
 * `ajuda` explica a diferença no momento da escolha — que é quando a dúvida
 * aparece, e é o mesmo padrão dos seletores de Configurações.
 *
 * Não há aba "Ativo": ativo é computador, e um computador não é entregue a
 * outro. O que acompanha a máquina (dock, monitor, cabo) é estoque.
 *
 * `rota` é o slug de `/options`. Para pessoas é `people` (GET /api/people/options,
 * a página Colaboradores) — não `users`, que é quem opera o sistema.
 */
const ABAS: readonly {
  tipo: AlvoDaPosse;
  rotulo: string;
  icone: typeof User;
  rota: string;
  rotuloAlvo: string;
  ajuda: string;
}[] = [
  {
    tipo: 'PERSON',
    rotulo: 'Colaborador',
    icone: User,
    rota: 'people',
    rotuloAlvo: 'Colaborador',
    ajuda: 'O colaborador passa a ser o responsável direto.',
  },
  {
    tipo: 'WORKSTATION',
    rotulo: 'Posto',
    icone: MapPin,
    rota: 'workstations',
    rotuloAlvo: 'Posto',
    ajuda: 'O computador fica no posto, e o posto é o responsável. Os responsáveis pelo posto, um ou vários, por turno, se definem na ficha dele.',
  },
];

interface CheckoutModalProps {
  asset: Asset;
  onClose: () => void;
  onEntregar: (data: CheckoutInput) => Promise<void>;
}

export default function CheckoutModal({ asset, onClose, onEntregar }: CheckoutModalProps) {
  const [aba, setAba] = useState<AlvoDaPosse>('PERSON');
  const [alvoId, setAlvoId] = useState('');
  const [statusId, setStatusId] = useState('');
  const [expectedCheckinAt, setExpectedCheckinAt] = useState('');
  const [observacoes, setObservacoes] = useState('');
  // O DIA da entrega (AM), como na licença e no estoque: vem com hoje, e pode
  // voltar para registrar a que já aconteceu.
  const hoje = hojeNoCampoDeData();
  const [dia, setDia] = useState(hoje);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');

  const abaAtual = ABAS.find((item) => item.tipo === aba) ?? ABAS[0];

  // OS STATUS "DISPONÍVEL" SAEM DO DESTINO DA ENTREGA. Entregar com status
  // `DEPLOYABLE` deixaria o ativo com posse aberta e marcado como pronto para
  // entregar de novo — o servidor recusa com 422, e a opção que só existe para
  // levar 422 sai da lista. O `/options` filtra por UM tipo e não por "todos
  // menos um"; pedir a lista dos disponíveis e tirá-los é o recorte que a rota
  // permite. É a mesma consulta (e a mesma chave de cache) que a listagem usa
  // para o status padrão do cadastro — na tela Computadores ela já está pronta.
  const { data: disponiveis } = useCatalogOptionsQuery('status-labels', 'DEPLOYABLE');
  const idsDisponiveis = (disponiveis ?? []).map((opcao) => opcao.id);

  // Trocar de aba ZERA o alvo: o corpo leva UMA FK, e um id que sobrou da aba
  // anterior seria um alvo que o usuário não escolheu mais.
  const trocarAba = (proxima: AlvoDaPosse) => {
    setAba(proxima);
    setAlvoId('');
  };

  const enviar = async (event: React.FormEvent) => {
    event.preventDefault();
    setSalvando(true);
    setErro('');

    try {
      await onEntregar(montarEntrega({
        targetType: aba, alvoId, statusId, expectedCheckinAt, checkoutNotes: observacoes, checkoutAt: dia,
      }));
    } catch (falha) {
      // Mutação propaga: o erro do servidor aparece aqui, já traduzido pelo
      // apiClient (duplo checkout, ativo indisponível, alvo inexistente).
      setErro((falha as Error).message);
    } finally {
      setSalvando(false);
    }
  };

  return (
    <FormularioLateral
      titulo="Entregar computador"
      descricao={
        <>
          <span className="font-mono">{asset.assetTag}</span> · {asset.model.manufacturer.name} {asset.model.name}
          {asset.serial && <> · <span className="font-mono">{asset.serial}</span></>}
        </>
      }
      onClose={onClose}
      onSubmit={enviar}
      erro={erro}
      salvando={salvando}
      bloqueado={!dia || !alvoId}
      rotuloDoEnvio="Entregar"
      rotuloEnviando="Entregando…"
    >
      <Segmentado
        opcoes={ABAS.map((item) => ({ valor: item.tipo, rotulo: <><item.icone /> {item.rotulo}</> }))}
        valor={aba}
        onChange={trocarAba}
      />

      <Campo rotulo={abaAtual.rotuloAlvo} obrigatorio ajuda={abaAtual.ajuda}>
        <ReferenceSelect
          // Remontar a cada aba é de propósito: cada alvo é uma lista
          // diferente, e a `key` evita que a lista da aba anterior
          // apareça por um quadro com as opções velhas.
          key={abaAtual.tipo}
          rota={abaAtual.rota}
          valor={alvoId}
          obrigatorio
          comDetalhe
          onChange={setAlvoId}
        />
      </Campo>

      <div className="grid sm:grid-cols-2 gap-4">
        <Campo rotulo="Status após a entrega" ajuda="Em branco, fica em uso.">
          <ReferenceSelect
            rota="status-labels"
            valor={statusId}
            excluirIds={idsDisponiveis}
            onChange={setStatusId}
          />
        </Campo>
        <Campo rotulo="Devolução prevista" ajuda="Só para empréstimo com prazo.">
          <Input
            type="date"
            value={expectedCheckinAt}
            onChange={(event) => setExpectedCheckinAt(event.target.value)}
          />
        </Campo>
      </div>

      <Campo rotulo="Data da entrega" obrigatorio>
        <Input
          type="date" required max={hoje} value={dia}
          onChange={(event) => setDia(event.target.value)}
        />
      </Campo>

      <Campo rotulo="Notas">
        <Textarea value={observacoes} onChange={(event) => setObservacoes(event.target.value)} />
      </Campo>
    </FormularioLateral>
  );
}
