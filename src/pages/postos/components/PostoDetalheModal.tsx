import { useState } from 'react';
import {
  Armchair, Boxes, MonitorSmartphone, TriangleAlert, Undo2, X,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import OccupantsPanel from './OccupantsPanel';
import TelemetriaDaMaquina from '../../components/TelemetriaDaMaquina';
import SeloDesativado from './SeloDesativado';
import {
  ativosComMaquina, estaDesativado, explicacaoDoVago, resumoDeAtivos,
} from '../helpers/postos.helper';
import { caminhoDoItem, textoDeUnidades } from '../../helpers/estoque.helper';
import { formatarDiaDoInstante } from '../../helpers/format.helper';
import type { OccupantInput } from '../../../domain/occupancy/occupancy.queries';
import type { WorkstationOccupant, OccupantView } from '../../../domain/shared/posse.types';
import type { AtivoDoPosto, Posto, PostoDetalhe } from '../../../domain/shared/workstation.types';

// UM POSTO ABERTO: quem está nele, o que foi entregue a ele e como está a
// máquina que vive nele.
//
// As duas metades do modelo numa janela só (docs/referencia/modelo-de-posse.md): os
// OCUPANTES (Camada 2, com turno) e os ATIVOS cuja posse aberta aponta para
// este posto (Camada 1 vista do lado do posto). É a junção das duas que
// responde "quem responde pelo mouse da Mesa 1" — e é por isso que as duas
// listas precisam aparecer juntas, não em telas separadas.
//
// E, abaixo delas, a TERCEIRA seção, que é o RMM entrando pelo ITAM: a telemetria
// do computador desta mesa. Ela morava numa tela de frota, que media as máquinas
// sem saber de quem são; aqui a medida chega com mesa, ocupante e turno em volta.
// A ponte da convergência, vista do lado do posto.
//
// JANELA SOBRE A ROTA `/postos/:id`, e as duas coisas ao mesmo tempo.
//
// Era só janela, por dois motivos: as operações daqui são feitas e a pessoa
// volta para a lista, e uma rota desmontaria a listagem perdendo a busca e a
// página em que ela estava; e um link que ninguém precisava compartilhar não
// pagava o estado de "id que não existe".
//
// O SEGUNDO MOTIVO CAIU: o ativo entregue a um posto saiu da listagem de
// ativos, e a busca por etiqueta passou a largar AQUI quem bipou o computador
// de uma mesa. Virou link que alguém precisa.
//
// O primeiro continua de pé, e é por isso que a ficha é rota SEM deixar de
// ser janela: `/postos/:id` renderiza a mesma tela de `/postos`, com a listagem
// atrás. Fechar é navegar para `/postos`, e a listagem está lá, como estava.
// O componente não mudou de forma — só passou a aceitar `posto` nulo, que é o
// caso de quem entra pela URL sem ter passado pela lista.

interface PostoDetalheModalProps {
  /**
   * A linha da listagem, quando ela está carregada: dá título à janela no
   * primeiro quadro, antes do detalhe. `null` quando se entra pela URL direto —
   * aí o cabeçalho espera o detalhe, que é um quadro.
   */
  posto: Posto | null;
  detalhe: PostoDetalhe | null;
  carregando: boolean;
  ocupantes: readonly WorkstationOccupant[];
  ocupantesCarregando: boolean;
  /** A lista de ocupantes falhou — o painel mostra o erro, não "posto vago". */
  ocupantesErro: string | null;
  view: OccupantView;
  onViewChange: (view: OccupantView) => void;
  onAdicionar: (data: OccupantInput) => Promise<void>;
  onEncerrar: (ocupante: WorkstationOccupant) => Promise<void>;
  onCorrigirTurno: (ocupante: WorkstationOccupant, turno: string) => Promise<void>;
  /** Tira o ativo desta mesa e devolve ao estoque. O `confirm` é do hook. */
  onDevolver: (ativo: AtivoDoPosto) => Promise<void>;
  devolvendo: boolean;
  onClose: () => void;
}

export default function PostoDetalheModal({
  posto, detalhe, carregando, ocupantes, ocupantesCarregando, ocupantesErro,
  view, onViewChange, onAdicionar, onEncerrar, onCorrigirTurno, onDevolver, devolvendo, onClose,
}: PostoDetalheModalProps) {
  // Enquanto o detalhe não chega, vale o que a linha já dizia: o cabeçalho e o
  // selo de vago aparecem no primeiro quadro em vez de piscar depois.
  // O ERRO DA DEVOLUÇÃO MORA AQUI, e é o mesmo desenho do `OccupantsPanel`: o
  // hook propaga a rejeição (mutação propaga, docs/referencia/arquitetura.md) e
  // quem a mostra é o componente. Sem este `catch`, o `onClick` engoliria o 409
  // de "este ativo não está entregue" numa rejeição não tratada — o clique não
  // faria nada e não diria nada.
  const [erroDaDevolucao, setErroDaDevolucao] = useState('');

  const devolver = async (ativo: AtivoDoPosto) => {
    setErroDaDevolucao('');
    try {
      await onDevolver(ativo);
    } catch (falha) {
      setErroDaDevolucao((falha as Error).message);
    }
  };

  const ativos = detalhe?.ativos ?? [];
  const itens = detalhe?.itens ?? [];
  const totalDeUnidades = itens.reduce((soma, entrega) => soma + entrega.unidades, 0);
  // Cálculo fora do JSX (docs/referencia/arquitetura.md). A lista tem no
  // máximo um ativo — é a invariante 19 —, e com máquina vinculada é o que tem
  // telemetria para mostrar.
  const comMaquina = ativosComMaquina(ativos);
  const vago = detalhe?.vago ?? posto?.vago ?? false;
  const totalAtivos = detalhe?.totalAtivos ?? posto?.totalAtivos ?? 0;
  // DESATIVADO: a ficha continua mostrando tudo — é o histórico do lugar —, mas
  // deixa de oferecer o que cria coisa nova nele (ocupante, entrega). Devolver
  // e encerrar continuam: desativar não esvazia a mesa, e quem ficou nela precisa
  // de uma saída.
  const desativado = estaDesativado(detalhe ?? posto);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-bg-base/80 backdrop-blur-sm">
      <div className="relative w-full max-w-4xl bg-surface-card border border-border-sutil shadow-2xl flex flex-col">

        <div className="flex items-start justify-between px-6 py-4 border-b border-border-sutil bg-bg-base/50">
          <div>
            <h2 className="flex items-center gap-3 text-sm font-mono text-text-primary tracking-widest uppercase">
              <Armchair size={16} /> {detalhe?.name ?? posto?.name ?? '…'}
              {desativado && <SeloDesativado />}
            </h2>
            {/* ONDE a mesa fica: o nome do posto não precisa carregar a filial. */}
            <p className="mt-1 font-mono text-[10px] text-text-tertiary uppercase tracking-widest">
              {detalhe?.location.name ?? posto?.location.name ?? ''}
            </p>
          </div>
          <button onClick={onClose} className="p-2 text-text-tertiary hover:text-text-primary transition-colors">
            <X size={16} />
          </button>
        </div>

        <div className="p-6 overflow-y-auto max-h-[78vh] space-y-6">
          {vago && (
            <div className="flex items-start gap-2 p-3 border border-status-warning/20 bg-status-warning/10 font-mono text-[10px] leading-relaxed text-status-warning">
              <TriangleAlert size={12} className="shrink-0 mt-0.5" />
              <span>
                POSTO VAGO — {explicacaoDoVago({ totalAtivos })}{' '}
                {/* Posto desativado não recebe ocupante: "alguém assume" seria
                    oferecer a saída que o formulário logo abaixo não tem. */}
                {desativado
                  ? 'O posto está desativado e não recebe ocupante: o equipamento volta para o estoque.'
                  : 'Ou alguém assume o posto abaixo, ou o equipamento volta para o estoque.'}
              </span>
            </div>
          )}

          <OccupantsPanel
            ocupantes={ocupantes}
            carregando={ocupantesCarregando}
            erro={ocupantesErro}
            view={view}
            onViewChange={onViewChange}
            onAdicionar={onAdicionar}
            onEncerrar={onEncerrar}
            onCorrigirTurno={onCorrigirTurno}
            desativado={desativado}
          />

          <section className="font-mono text-xs space-y-3 border-t border-border-sutil pt-5">
            <div className="flex items-baseline justify-between gap-4">
              <h3 className="text-text-secondary uppercase tracking-widest text-[10px]">
                Ativos entregues a este posto
              </h3>
              <span className="text-text-tertiary tabular-nums">{resumoDeAtivos(totalAtivos)}</span>
            </div>

            <p className="text-text-tertiary text-[10px] leading-relaxed">
              São os ativos cuja posse aberta aponta para este posto — não os que estão
              guardados na localização dele. Um ativo pode estar EM um lugar sem ser DO lugar.
              {/* A ENTREGA continua sendo na tela Computadores, e a DEVOLUÇÃO não é
                  mais: ela saiu de lá para cá porque o ativo entregue a um posto
                  saiu da listagem de Computadores, e a operação ficou na tela que já não
                  mostra o ativo. A entrega não tem esse problema — o ativo está na
                  listagem justamente até ser entregue. */}
              {desativado
                ? ' Posto desativado: não recebe entrega nova. A devolução continua, aqui ou em Computadores.'
                : ' A entrega é feita em Computadores; a devolução, aqui ou lá.'}
            </p>

            {erroDaDevolucao && (
              <div className="p-3 bg-status-danger/10 text-status-danger border border-status-danger/20" role="alert">
                {erroDaDevolucao}
              </div>
            )}

            <div className="border border-border-sutil overflow-x-auto">
              <table className="w-full text-left whitespace-nowrap">
                <thead className="bg-bg-base/50 text-text-secondary border-b border-border-sutil uppercase tracking-widest">
                  <tr>
                    <th className="px-4 py-3 font-normal">Etiqueta</th>
                    <th className="px-4 py-3 font-normal">Modelo</th>
                    <th className="px-4 py-3 font-normal">Categoria</th>
                    <th className="px-4 py-3 font-normal">Status</th>
                    <th className="px-4 py-3 font-normal text-right">Ação</th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-border-sutil/50">
                  {ativos.map((ativo) => (
                    <tr key={ativo.id} className="hover:bg-bg-base transition-colors">
                      <td className="px-4 py-3 text-text-primary">
                        {/* A ETIQUETA LEVA À FICHA DO ATIVO. É o caminho de volta
                            do par: a ficha do ativo leva ao posto pelo nome da
                            mesa, e a do posto leva ao ativo pela etiqueta. Sem
                            ele, um ativo que saiu da listagem de /computadores só se
                            alcançava por busca ou por URL decorada. */}
                        <Link to={`/computadores/${ativo.id}`} className="text-status-info hover:underline">
                          {ativo.assetTag}
                        </Link>
                        {/* Todo ativo é computador; o que a linha avisa é o
                            que falta a ele — a máquina, e com ela a telemetria. */}
                        {!ativo.endpointId && (
                          <span
                            className="ml-2 text-[10px] uppercase tracking-widest text-text-tertiary"
                            title="Sem máquina vinculada: a telemetria aparece quando o agente for vinculado ao ativo, em Descobertas"
                          >
                            sem agente
                          </span>
                        )}
                        {ativo.serial && (
                          <div className="text-[10px] text-text-tertiary mt-1">SN {ativo.serial}</div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-text-secondary">
                        <div>{ativo.model.name}</div>
                        <div className="text-[10px] text-text-tertiary mt-1">{ativo.model.manufacturer.name}</div>
                      </td>
                      <td className="px-4 py-3 text-text-tertiary">{ativo.model.category.name}</td>
                      <td className="px-4 py-3">
                        <span className="px-2 py-1 border border-border-sutil rounded-[2px] text-text-secondary text-[10px] uppercase tracking-widest">
                          {ativo.status.name}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          type="button"
                          disabled={devolvendo}
                          onClick={() => void devolver(ativo)}
                          title={`Devolver ${ativo.assetTag} ao estoque`}
                          className="inline-flex items-center gap-1.5 px-2 py-1 border border-border-sutil text-[10px] uppercase tracking-widest text-text-tertiary hover:text-text-primary hover:bg-bg-base disabled:opacity-30 transition-colors"
                        >
                          <Undo2 size={11} /> Devolver
                        </button>
                      </td>
                    </tr>
                  ))}

                  {ativos.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-4 py-10 text-center text-text-tertiary">
                        {carregando ? (
                          'Carregando...'
                        ) : desativado ? (
                          // Sem o convite à entrega: o servidor a recusa num
                          // posto desativado, e o link levaria a um 409.
                          'Nenhum ativo entregue a este posto. Desativado, ele não recebe entrega.'
                        ) : (
                          <>
                            Nenhum ativo entregue a este posto.
                            <span className="block mt-3 text-[10px] leading-relaxed">
                              A entrega é feita em{' '}
                              <Link to="/computadores" className="text-status-success hover:underline">Computadores</Link>
                              , escolhendo este posto como destino.
                            </span>
                          </>
                        )}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>

          {/* ── O COMPUTADOR DA MESA, AO VIVO ────────────────────────────────
              Esta seção é a convergência vista do lado do POSTO. A telemetria
              morava numa tela de frota, que sabia a medida e não sabia de quem é
              a máquina; aqui a pergunta já vem com dono: "o computador da Mesa 1
              está bem?". E é no posto que ela se faz, porque é a mesa que tem
              ocupante e turno — logo acima, nesta mesma ficha. */}
          <section className="font-mono text-xs space-y-3 border-t border-border-sutil pt-5">
            <h3 className="text-text-secondary uppercase tracking-widest text-[10px] flex items-center gap-2">
              <MonitorSmartphone size={12} /> O computador deste posto
            </h3>

            {ativos.length === 0 ? (
              <p className="text-text-tertiary text-[10px] leading-relaxed border border-border-sutil px-4 py-6 text-center">
                {/* CARREGANDO VEM PRIMEIRO. Sem ele, o primeiro quadro de toda
                    abertura de `/postos/:id` afirmava que a mesa está vazia e
                    depois se corrigia — a tabela quarenta pixels acima já fazia
                    isso certo, e o contador da linha da listagem (`totalAtivos`)
                    chega antes do detalhe para quem veio da lista. */}
                {carregando ? 'Lendo o posto…' : 'Nada entregue a este posto ainda.'}
              </p>
            ) : comMaquina.length === 0 ? (
              <p className="text-text-tertiary text-[10px] leading-relaxed border border-border-sutil px-4 py-6 text-center">
                {ativos.length === 1
                  ? `O computador deste posto é o ${ativos[0].assetTag}${ativos[0].name ? ` (${ativos[0].name})` : ''}, e ele ainda não tem máquina vinculada.`
                  : `Nenhum dos ${ativos.length} ativos deste posto tem máquina vinculada.`}
                <span className="block mt-2">
                  A telemetria aparece quando a máquina é vinculada ao ativo, em{' '}
                  <Link to="/descobertas" className="text-status-success hover:underline">Descobertas</Link>.
                </span>
              </p>
            ) : (
              <>
                {/* QUAL ativo é este painel: sem a etiqueta a telemetria
                    ficaria flutuando sem dono dentro da ficha. */}
                <p className="text-text-tertiary text-[10px]">
                  {comMaquina[0].assetTag}
                  {comMaquina[0].name && ` · ${comMaquina[0].name}`}
                </p>

                <TelemetriaDaMaquina endpointId={comMaquina[0].endpointId} />
              </>
            )}

            {ativos.length > 1 && (
              <p className="flex items-start gap-2 text-status-warning text-[10px] leading-relaxed">
                <TriangleAlert size={12} className="shrink-0 mt-0.5" />
                {/* Estado que a invariante 19 recusa nas duas portas, e que só
                    um dado de antes da regra traria. Se aparecer, precisa ser
                    visto — não escondido atrás do primeiro ativo. */}
                <span>
                  Este posto tem {ativos.length} ativos, e um posto de trabalho tem no máximo UM.
                  Devolva os que não ficam nesta mesa. O painel acima é do primeiro com máquina; a
                  telemetria de cada um está na ficha dele, na aba Máquina.
                </span>
              </p>
            )}
          </section>

          {/* ── O ESTOQUE DESTA MESA ──────────────────────────────────────
              Abaixo do computador, de propósito: o ativo é o que a invariante
              19 limita a um; o estoque é o resto da mesa — monitor, teclado,
              mouse, cabo —, entregue por quantidade e sem a mesma trava
              (docs/decisoes/estoque.md). */}
          <section className="font-mono text-xs space-y-3 border-t border-border-sutil pt-5">
            <div className="flex items-baseline justify-between gap-4">
              <h3 className="text-text-secondary uppercase tracking-widest text-[10px] flex items-center gap-2">
                <Boxes size={12} /> Estoque desta mesa
              </h3>
              <span className="text-text-tertiary tabular-nums">{textoDeUnidades(totalDeUnidades)}</span>
            </div>

            <p className="text-text-tertiary text-[10px] leading-relaxed">
              Unidades de estoque entregues a este posto — qualquer ocupante aberto dela responde
              por elas, independente de quem fez a entrega. A devolução é feita no detalhe do item.
            </p>

            <div className="border border-border-sutil overflow-x-auto">
              <table className="w-full text-left whitespace-nowrap">
                <thead className="bg-bg-base/50 text-text-secondary border-b border-border-sutil uppercase tracking-widest">
                  <tr>
                    <th className="px-4 py-3 font-normal">Item</th>
                    <th className="px-4 py-3 font-normal">Categoria</th>
                    <th className="px-4 py-3 font-normal">Quantidade</th>
                    <th className="px-4 py-3 font-normal">Desde</th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-border-sutil/50">
                  {itens.map((entrega) => (
                    <tr key={entrega.id} className="hover:bg-bg-base transition-colors">
                      <td className="px-4 py-3 text-text-primary">
                        <Link to={caminhoDoItem(entrega.item.id, detalhe?.name ?? posto?.name)} className="hover:underline underline-offset-2">
                          {entrega.item.name}
                        </Link>
                        {!entrega.item.isActive && (
                          <span className="ml-2 text-[10px] uppercase tracking-widest text-status-warning">desativado</span>
                        )}
                        {entrega.notes && (
                          <div className="text-[10px] text-text-tertiary mt-0.5">{entrega.notes}</div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-text-tertiary">{entrega.item.category.name}</td>
                      <td className="px-4 py-3 text-text-tertiary">{textoDeUnidades(entrega.unidades)}</td>
                      <td className="px-4 py-3 text-text-tertiary">{formatarDiaDoInstante(entrega.checkoutAt)}</td>
                    </tr>
                  ))}

                  {itens.length === 0 && (
                    <tr>
                      <td colSpan={4} className="px-4 py-10 text-center text-text-tertiary">
                        {carregando ? 'Carregando...' : 'Nenhum item de estoque entregue a este posto.'}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>

          <div className="flex justify-end">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border border-border-sutil font-mono text-xs text-text-secondary hover:text-text-primary hover:bg-bg-base transition-colors"
            >
              Fechar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
