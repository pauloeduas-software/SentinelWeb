import { useState } from 'react';
import { Monitor, Undo2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import OccupantsPanel from './OccupantsPanel';
import JanelaDeDetalhe from '../../../components/JanelaDeDetalhe';
import TelemetriaDaMaquina from '../../../components/TelemetriaDaMaquina';
import { Aviso } from '../../../components/ui/aviso';
import { Badge } from '../../../components/ui/badge';
import { Button } from '../../../components/ui/button';
import { Card } from '../../../components/ui/card';
import { Input } from '../../../components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../../components/ui/table';
import { estaAberta } from '../helpers/ocupantes.helper';
import { ativosComMaquina, explicacaoDoVago } from '../helpers/postos.helper';
import { caminhoDoItem, textoDeUnidades } from '../../../helpers/estoque.helper';
import { diaDoInstante, formatarDiaDoInstante, hojeNoCampoDeData } from '../../../helpers/format.helper';
import type { OccupantInput } from '../../../queries/occupancy.queries';
import type { WorkstationOccupant, OccupantView } from '../../../types/posse.types';
import type { AtivoDoPosto, Posto, PostoDetalhe } from '../../../types/workstation.types';

// UM POSTO ABERTO: quem está nele, o que foi entregue a ele e como está a
// máquina que vive nele.
//
// As duas metades do modelo numa janela só (docs/referencia/modelo-de-posse.md): os
// OCUPANTES (Camada 2, com turno) e os ATIVOS cuja posse aberta aponta para
// este posto (Camada 1 vista do lado do posto). É a junção das duas que
// responde "quem responde pelo mouse da Mesa 1" — e é por isso que as duas
// listas moram em abas da mesma janela, não em telas separadas.
//
// E, junto do computador, a TELEMETRIA, que é o RMM entrando pelo ITAM. Ela
// morava numa tela de frota, que media as máquinas sem saber de quem são; aqui a
// medida chega com mesa, ocupante e turno em volta. A ponte da convergência,
// vista do lado do posto.
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

const CLASSE_DO_LINK = 'text-text-secondary underline underline-offset-2 hover:text-text-primary';

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
  onEncerrar: (ocupante: WorkstationOccupant, dia: string) => Promise<void>;
  onCorrigirTurno: (ocupante: WorkstationOccupant, turno: string) => Promise<void>;
  /** Tira o ativo desta mesa: a devolução, com o dia em que ele voltou (AM). */
  onDevolver: (ativo: AtivoDoPosto, dia: string) => Promise<void>;
  devolvendo: boolean;
  onClose: () => void;
}

export default function PostoDetalheModal({
  posto, detalhe, carregando, ocupantes, ocupantesCarregando, ocupantesErro,
  view, onViewChange, onAdicionar, onEncerrar, onCorrigirTurno, onDevolver, devolvendo, onClose,
}: PostoDetalheModalProps) {
  // O ERRO DA DEVOLUÇÃO MORA AQUI, e é o mesmo desenho do `OccupantsPanel`: o
  // hook propaga a rejeição (mutação propaga, docs/referencia/arquitetura.md) e
  // quem a mostra é o componente. Sem este `catch`, o `onClick` engoliria o 409
  // de "este ativo não está entregue" numa rejeição não tratada — o clique não
  // faria nada e não diria nada.
  const [erroDaDevolucao, setErroDaDevolucao] = useState('');
  // A devolução aberta numa linha: qual ativo e o dia escolhido.
  const [devolvendoAtivo, setDevolvendoAtivo] = useState<{ id: string; dia: string } | null>(null);

  const devolver = async (ativo: AtivoDoPosto, dia: string) => {
    setErroDaDevolucao('');
    try {
      await onDevolver(ativo, dia);
      setDevolvendoAtivo(null);
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
  // Enquanto o detalhe não chega, vale o que a linha já dizia: o cabeçalho e o
  // selo de vago aparecem no primeiro quadro em vez de piscar depois.
  const vago = detalhe?.vago ?? posto?.vago ?? false;
  const totalAtivos = detalhe?.totalAtivos ?? posto?.totalAtivos ?? 0;

  const abaDosOcupantes = (
    <>
      {vago && (
        <Aviso tom="aviso">
          Posto vago: {explicacaoDoVago({ totalAtivos })} Ou alguém assume o posto, ou o equipamento é devolvido.
        </Aviso>
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
      />
    </>
  );

  const abaDoComputador = (
    <>
      {erroDaDevolucao && <Aviso>{erroDaDevolucao}</Aviso>}

      {/* Estado que a invariante 19 recusa nas duas portas, e que só um dado de
          antes da regra traria. Se aparecer, precisa ser visto — não escondido
          atrás do primeiro ativo. */}
      {ativos.length > 1 && (
        <Aviso tom="aviso">
          Este posto tem {ativos.length} ativos, e um posto de trabalho tem no máximo um.
          Devolva os que não ficam nesta mesa. O painel abaixo é do primeiro com máquina; a
          telemetria de cada um está na ficha dele, na aba Máquina.
        </Aviso>
      )}

      {ativos.length === 0 ? (
        <p className="text-sm text-text-tertiary">
          {/* CARREGANDO VEM PRIMEIRO. Sem ele, o primeiro quadro de toda abertura
              de `/postos/:id` afirmava que a mesa está vazia e depois se corrigia. */}
          {carregando ? 'Carregando…' : (
            <>
              Nenhum ativo entregue a este posto. A entrega é feita em{' '}
              <Link to="/computadores" className={CLASSE_DO_LINK}>Computadores</Link>
              , escolhendo este posto como destino.
            </>
          )}
        </p>
      ) : (
        <>
          <ul className="divide-y divide-border-sutil rounded-lg border border-border-sutil text-sm">
            {ativos.map((ativo) => (
              <li key={ativo.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                <div className="min-w-0 space-y-0.5">
                  <div className="flex flex-wrap items-center gap-2 text-text-primary">
                    <Monitor className="size-4 shrink-0 text-text-tertiary" />
                    {/* A ETIQUETA LEVA À FICHA DO ATIVO. É o caminho de volta
                        do par: a ficha do ativo leva ao posto pelo nome da
                        mesa, e a do posto leva ao ativo pela etiqueta. Sem
                        ele, um ativo que saiu da listagem de /computadores só se
                        alcançava por busca ou por URL decorada. */}
                    <Link to={`/computadores/${ativo.id}`} className="font-mono font-medium underline-offset-2 hover:underline">
                      {ativo.assetTag}
                    </Link>
                    <Badge>{ativo.status.name}</Badge>
                    {/* Todo ativo é computador; o que a linha avisa é o
                        que falta a ele — a máquina, e com ela a telemetria. */}
                    {!ativo.endpointId && (
                      <Badge title="Sem máquina vinculada: a telemetria aparece quando o agente for vinculado ao ativo, em Descobertas">
                        sem agente
                      </Badge>
                    )}
                  </div>
                  <div className="text-xs text-text-tertiary">
                    {ativo.model.manufacturer.name} {ativo.model.name} · {ativo.model.category.name}
                    {ativo.serial && <> · SN <span className="font-mono">{ativo.serial}</span></>}
                  </div>
                </div>

                {devolvendoAtivo?.id === ativo.id ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <label className="flex items-center gap-2 whitespace-nowrap text-xs text-text-tertiary">
                      Devolvido em
                      <Input
                        type="date"
                        value={devolvendoAtivo.dia}
                        min={ativo.entregueEm ? diaDoInstante(ativo.entregueEm) : undefined}
                        max={hojeNoCampoDeData()}
                        onChange={(event) => setDevolvendoAtivo({ id: ativo.id, dia: event.target.value })}
                        className="h-9 w-36"
                      />
                    </label>
                    <Button
                      size="sm"
                      disabled={devolvendo || devolvendoAtivo.dia === ''}
                      onClick={() => void devolver(ativo, devolvendoAtivo.dia)}
                    >
                      Confirmar
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => setDevolvendoAtivo(null)}>Cancelar</Button>
                  </div>
                ) : (
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={devolvendo}
                    onClick={() => setDevolvendoAtivo({ id: ativo.id, dia: hojeNoCampoDeData() })}
                    title={`Devolver ${ativo.assetTag} deste posto`}
                  >
                    <Undo2 /> Devolver
                  </Button>
                )}
              </li>
            ))}
          </ul>

          {/* A ENTREGA continua sendo na tela Computadores, e a DEVOLUÇÃO não é
              mais: ela saiu de lá para cá porque o ativo entregue a um posto
              saiu da listagem de Computadores, e a operação ficou na tela que já não
              mostra o ativo. A entrega não tem esse problema — o ativo está na
              listagem justamente até ser entregue. */}
          <p className="text-xs text-text-tertiary">A entrega é feita em Computadores; a devolução, aqui ou lá.</p>

          {/* ── O COMPUTADOR DA MESA, AO VIVO ────────────────────────────────
              Esta parte é a convergência vista do lado do POSTO. A telemetria
              morava numa tela de frota, que sabia a medida e não sabia de quem é
              a máquina; aqui a pergunta já vem com dono: "o computador da Mesa 1
              está bem?". E é no posto que ela se faz, porque é a mesa que tem
              ocupante e turno — na aba ao lado, nesta mesma ficha. */}
          {comMaquina.length === 0 ? (
            <p className="text-sm text-text-tertiary">
              {ativos.length === 1
                ? `O computador deste posto é o ${ativos[0].assetTag}${ativos[0].name ? ` (${ativos[0].name})` : ''}, e ele ainda não tem máquina vinculada.`
                : `Nenhum dos ${ativos.length} ativos deste posto tem máquina vinculada.`}
              {' '}A telemetria aparece quando a máquina é vinculada ao ativo, em{' '}
              <Link to="/descobertas" className={CLASSE_DO_LINK}>Descobertas</Link>.
            </p>
          ) : (
            <>
              {/* QUAL ativo é este painel: sem a etiqueta a telemetria
                  ficaria flutuando sem dono dentro da ficha. */}
              <p className="text-xs text-text-tertiary">
                <span className="font-mono">{comMaquina[0].assetTag}</span>
                {comMaquina[0].name && ` · ${comMaquina[0].name}`}
              </p>

              <TelemetriaDaMaquina endpointId={comMaquina[0].endpointId} />
            </>
          )}
        </>
      )}
    </>
  );

  // ── O ESTOQUE DESTA MESA ──────────────────────────────────────
  // Depois do computador, de propósito: o ativo é o que a invariante 19 limita
  // a um; o estoque é o resto da mesa — monitor, teclado, mouse, cabo —, entregue
  // por quantidade e sem a mesma trava (docs/decisoes/estoque.md).
  const abaDoEstoque = itens.length === 0 ? (
    <p className="text-sm text-text-tertiary">
      {carregando ? 'Carregando…' : 'Nenhum item de estoque entregue a este posto.'}
    </p>
  ) : (
    <>
      <p className="text-xs text-text-tertiary">
        Qualquer ocupante atual responde por estas unidades. A devolução é feita no detalhe do item.
      </p>

      <Card className="overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Item</TableHead>
              <TableHead>Categoria</TableHead>
              <TableHead>Quantidade</TableHead>
              <TableHead>Desde</TableHead>
            </TableRow>
          </TableHeader>

          <TableBody>
            {itens.map((entrega) => (
              <TableRow key={entrega.id}>
                <TableCell>
                  <Link to={caminhoDoItem(entrega.item.id, detalhe?.name ?? posto?.name)} className="font-medium text-text-primary underline-offset-2 hover:underline">
                    {entrega.item.name}
                  </Link>
                  {entrega.notes && <div className="mt-0.5 text-xs text-text-tertiary">{entrega.notes}</div>}
                </TableCell>
                <TableCell>{entrega.item.category.name}</TableCell>
                <TableCell>{textoDeUnidades(entrega.unidades)}</TableCell>
                <TableCell>{formatarDiaDoInstante(entrega.checkoutAt)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </>
  );

  return (
    <JanelaDeDetalhe
      titulo={
        <span className="flex flex-wrap items-center gap-2">
          {detalhe?.name ?? posto?.name ?? '…'}
          {vago && <Badge tom="aviso">Posto vago</Badge>}
        </span>
      }
      // ONDE a mesa fica: o nome do posto não precisa carregar a filial.
      subtitulo={detalhe?.location.name ?? posto?.location.name}
      abas={[
        { id: 'ocupantes', rotulo: `Ocupantes (${ocupantes.filter(estaAberta).length})`, conteudo: abaDosOcupantes },
        { id: 'computador', rotulo: `Computador (${totalAtivos})`, conteudo: abaDoComputador },
        { id: 'estoque', rotulo: `Estoque (${totalDeUnidades})`, conteudo: abaDoEstoque },
      ]}
      onClose={onClose}
    />
  );
}
