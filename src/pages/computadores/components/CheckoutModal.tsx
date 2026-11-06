import { useState } from 'react';
import { MapPin, TriangleAlert, User } from 'lucide-react';
import FormularioLateral from '../../../components/FormularioLateral';
import ReferenceSelect from '../../../components/ReferenceSelect';
import { Aviso } from '../../../components/ui/aviso';
import { Campo } from '../../../components/ui/campo';
import { Input, Textarea } from '../../../components/ui/input';
import { Segmentado } from '../../../components/ui/segmentado';
import { diaDoInstante, hojeNoCampoDeData } from '../../../helpers/format.helper';
import { useCatalogOptionsQuery } from '../../../queries/catalog.queries';
import { montarDevolucao, montarEntrega, resumoDaPosse, type ResumoPosse } from '../helpers/posse.helper';
import type { CheckinInput, CheckoutInput } from '../../../queries/assignment.queries';
import type { Asset } from '../../../types/asset.types';
import type { AlvoDaPosse } from '../../../types/posse.types';

// ENTREGAR e DEVOLVER — a única porta pela qual a posse de um ativo muda
// (docs/referencia/modelo-de-posse.md).
//
// O modal tem DOIS estados, decididos pelo dado e não por quem clicou: ativo com
// posse aberta só aceita devolução; sem posse aberta, entrega. É o mesmo botão
// na listagem porque é a mesma decisão vista dos dois lados — e porque oferecer
// "entregar" para um ativo já entregue convidaria ao duplo checkout, que o
// índice único parcial do banco recusaria com um erro sem explicação.
//
// Como todo componente desta pasta, não fala HTTP: recebe `onEntregar` e
// `onDevolver` por prop. As exceções buscam opções pela query do domínio, nunca
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
    ajuda: 'A posse fica no nome dele: um responsável, direto.',
  },
  {
    tipo: 'WORKSTATION',
    rotulo: 'Posto',
    icone: MapPin,
    rota: 'workstations',
    rotuloAlvo: 'Posto',
    ajuda: 'A posse fica no posto: quem responde são os ocupantes dele, um ou vários, por turno. Eles se gerenciam na ficha do posto.',
  },
];

interface CheckoutModalProps {
  asset: Asset;
  onClose: () => void;
  onEntregar: (data: CheckoutInput) => Promise<void>;
  onDevolver: (data: CheckinInput) => Promise<void>;
}

export default function CheckoutModal({ asset, onClose, onEntregar, onDevolver }: CheckoutModalProps) {
  const posse = resumoDaPosse(asset.posse);

  const [aba, setAba] = useState<AlvoDaPosse>('PERSON');
  const [alvoId, setAlvoId] = useState('');
  const [statusId, setStatusId] = useState('');
  const [expectedCheckinAt, setExpectedCheckinAt] = useState('');
  const [observacoes, setObservacoes] = useState('');
  // O DIA da entrega ou da devolução (AM), como na licença e no estoque: vem
  // com hoje, e pode voltar para registrar a que já aconteceu.
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
      if (posse.entregue) {
        await onDevolver(montarDevolucao({ statusId, checkinNotes: observacoes, checkinAt: dia }));
      } else {
        await onEntregar(montarEntrega({
          targetType: aba, alvoId, statusId, expectedCheckinAt, checkoutNotes: observacoes, checkoutAt: dia,
        }));
      }
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
      titulo={posse.entregue ? 'Devolver ativo' : 'Entregar ativo'}
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
      bloqueado={!dia || (!posse.entregue && !alvoId)}
      rotuloDoEnvio={posse.entregue ? 'Devolver' : 'Entregar'}
      rotuloEnviando={posse.entregue ? 'Devolvendo…' : 'Entregando…'}
    >
      {posse.entregue ? (
        <>
          <PosseAtual posse={posse} />

          <Campo rotulo="Status de volta" ajuda="Como o ativo volta: disponível, em conserto, inutilizável. Em branco, volta disponível.">
            <ReferenceSelect rota="status-labels" valor={statusId} onChange={setStatusId} />
          </Campo>
        </>
      ) : (
        <>
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
        </>
      )}

      <Campo rotulo={posse.entregue ? 'Data da devolução' : 'Data da entrega'} obrigatorio>
        <Input
          type="date" required max={hoje} value={dia}
          min={posse.entregue && asset.posse?.checkoutAt ? diaDoInstante(asset.posse.checkoutAt) : undefined}
          onChange={(event) => setDia(event.target.value)}
        />
      </Campo>

      <Campo rotulo="Notas">
        <Textarea value={observacoes} onChange={(event) => setObservacoes(event.target.value)} />
      </Campo>
    </FormularioLateral>
  );
}

/**
 * Com quem o ativo está hoje — o que a devolução precisa mostrar ANTES de
 * pedir qualquer campo. Sem isto, "devolver" seria um botão sem contexto.
 */
function PosseAtual({ posse }: { posse: ResumoPosse }) {
  // Sem responsável resolvido, mostrar para QUEM foi entregue ainda é melhor que
  // não mostrar nada: é o posto vazio, e é o que explica a devolução.
  const comQuem = posse.responsaveis || posse.alvo;

  return (
    <div className="space-y-2 rounded-lg border border-border-sutil p-4">
      <div className="text-xs font-medium text-text-tertiary">Hoje está com</div>

      <div className="text-sm text-text-primary">
        {comQuem || <span className="text-text-tertiary">ninguém responde por ele</span>}
      </div>

      {posse.detalheAlvo && (
        <div className="text-xs text-text-tertiary">{posse.detalheAlvo}</div>
      )}

      {posse.postoVago && (
        <Aviso tom="aviso" className="flex items-start gap-2 text-xs leading-relaxed">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" />
          <span>
            Posto sem ocupante aberto: o ativo está parado numa mesa vazia. Devolva o computador
            ou coloque alguém no posto, na ficha do posto em Postos.
          </span>
        </Aviso>
      )}
    </div>
  );
}
