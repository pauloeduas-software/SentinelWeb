import { useState } from 'react';
import {
  Check, Monitor, Undo2, X,
} from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import AcoesDaLinha from '../../../../components/AcoesDaLinha';
import ListaVazia from '../../../../components/ListaVazia';
import TelemetriaDaMaquina from '../../../../components/TelemetriaDaMaquina';
import { Aviso } from '../../../../components/ui/aviso';
import { PontoDeStatus } from '../../../../components/ui/badge';
import { Button } from '../../../../components/ui/button';
import { Card } from '../../../../components/ui/card';
import { Input } from '../../../../components/ui/input';
import {
  Table, TableBody, TableCell, TableHead, TableHeadAcoes, TableHeader, TableLinha, TableNome, TableRow, TableSublinha,
} from '../../../../components/ui/table';
import { diaDoInstante, formatarDiaDoInstante, hojeNoCampoDeData } from '../../../../helpers/format.helper';
import { tomDoStatus } from '../../../../helpers/status.helper';
import { useNotificacao } from '../../../../hooks/useNotificacao';
import type { AtivoDoPosto } from '../../../../types/workstation.types';
import { TRACO, ativosComMaquina } from '../../helpers/postos.helper';

// O COMPUTADOR DA MESA: o ativo entregue ao posto, com o Devolver, e a TELEMETRIA,
// que é o RMM entrando pelo ITAM. Ela morava numa tela de frota, que media as
// máquinas sem saber de quem são; aqui a medida chega com mesa, ocupante e turno
// em volta. A ponte da convergência, vista do lado do posto.

interface ComputadorTabProps {
  ativos: readonly AtivoDoPosto[];
  /** Tira o ativo desta mesa: a devolução, com o dia em que ele voltou (AM). */
  onDevolver: (ativo: AtivoDoPosto, dia: string) => Promise<void>;
  devolvendo: boolean;
}

export default function ComputadorTab({ ativos, onDevolver, devolvendo }: ComputadorTabProps) {
  // O ERRO DA DEVOLUÇÃO SOBE ATÉ AQUI, e é o mesmo desenho do `OccupantsPanel`: o
  // hook propaga a rejeição (mutação propaga, docs/referencia/arquitetura.md) e
  // quem a notifica é o componente. Sem este `catch`, o `onClick` engoliria o 409
  // de "este ativo não está entregue" numa rejeição não tratada — o clique não
  // faria nada e não diria nada.
  const notificar = useNotificacao();
  const navigate = useNavigate();
  // A devolução aberta numa linha: qual ativo e o dia escolhido.
  const [devolvendoAtivo, setDevolvendoAtivo] = useState<{ id: string; dia: string } | null>(null);

  const devolver = async (ativo: AtivoDoPosto, dia: string) => {
    try {
      await onDevolver(ativo, dia);
      setDevolvendoAtivo(null);
      notificar.sucesso('Ativo devolvido.');
    } catch (falha) {
      notificar.erro((falha as Error).message);
    }
  };

  // Cálculo fora do JSX (docs/referencia/arquitetura.md). A lista tem no
  // máximo um ativo — é a invariante 19 —, e com máquina vinculada é o que tem
  // telemetria para mostrar.
  const comMaquina = ativosComMaquina(ativos);

  return (
    <>
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

      <Card className="overflow-hidden">
        <Table className="min-w-[62rem]">
          <TableHeader>
            <TableRow>
              <TableHead className="w-44">Etiqueta</TableHead>
              <TableHead>Modelo</TableHead>
              <TableHead className="w-[12%]">Categoria</TableHead>
              <TableHead className="w-36">Status</TableHead>
              <TableHead className="w-72">Desde</TableHead>
              <TableHeadAcoes />
            </TableRow>
          </TableHeader>

          <TableBody>
            {ativos.map((ativo) => {
              const devolucao = devolvendoAtivo?.id === ativo.id ? devolvendoAtivo : null;

              return (
                // A LINHA ABRE A FICHA DO ATIVO. É o caminho de volta do par: a ficha
                // do ativo leva ao posto pelo nome da mesa, e a do posto leva ao
                // ativo por aqui. Com a devolução aberta ela não abre: o clique é no
                // campo do dia.
                <TableRow key={ativo.id} onClick={devolucao ? undefined : () => navigate(`/computadores/${ativo.id}`)}>
                  <TableCell>
                    <TableNome className="font-mono">{ativo.assetTag}</TableNome>
                    {ativo.serial && <TableSublinha className="font-mono">SN {ativo.serial}</TableSublinha>}
                  </TableCell>
                  <TableCell>
                    <TableLinha>{ativo.model.name}</TableLinha>
                    <TableSublinha>{ativo.model.manufacturer.name}</TableSublinha>
                  </TableCell>
                  <TableCell>{ativo.model.category.name}</TableCell>
                  <TableCell title={ativo.status.name}>
                    <PontoDeStatus tom={tomDoStatus(ativo.status.type)}>{ativo.status.name}</PontoDeStatus>
                  </TableCell>

                  <TableCell>
                    {devolucao ? (
                      <label className="flex items-center gap-2 text-xs text-text-tertiary">
                        Devolvido em
                        <Input
                          type="date"
                          value={devolucao.dia}
                          min={ativo.entregueEm ? diaDoInstante(ativo.entregueEm) : undefined}
                          max={hojeNoCampoDeData()}
                          onChange={(event) => setDevolvendoAtivo({ id: ativo.id, dia: event.target.value })}
                          onKeyDown={(event) => {
                            if (event.key === 'Escape') setDevolvendoAtivo(null);
                          }}
                          className="h-9 w-36"
                        />
                      </label>
                    ) : (
                      ativo.entregueEm ? formatarDiaDoInstante(ativo.entregueEm) : TRACO
                    )}
                  </TableCell>

                  <TableCell className="overflow-visible">
                    {devolucao ? (
                      <div className="flex justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          onClick={() => setDevolvendoAtivo(null)}
                          title="Cancelar"
                          aria-label="Cancelar a devolução"
                        >
                          <X />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          onClick={() => void devolver(ativo, devolucao.dia)}
                          disabled={devolvendo || devolucao.dia === ''}
                          title="Confirmar a devolução"
                          aria-label={`Confirmar a devolução de ${ativo.assetTag}`}
                        >
                          <Check />
                        </Button>
                      </div>
                    ) : (
                      <AcoesDaLinha
                        nome={ativo.assetTag}
                        acoes={[{
                          rotulo: 'Devolver',
                          icone: Undo2,
                          onClick: () => setDevolvendoAtivo({ id: ativo.id, dia: hojeNoCampoDeData() }),
                          disabled: devolvendo,
                        }]}
                      />
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
        {ativos.length === 0 && (
          <ListaVazia icone={Monitor} carregando={false} erro={null} frase="Nenhum ativo entregue a este posto.">
            <span className="max-w-md text-xs leading-relaxed">
              A entrega é feita em{' '}
              <Link to="/computadores" className="text-link hover:underline">Computadores</Link>
              , escolhendo este posto como destino.
            </span>
          </ListaVazia>
        )}
      </Card>

      {ativos.length > 0 && (
        <>
          {/* A ENTREGA continua sendo na tela Computadores, e a DEVOLUÇÃO não é
              mais: ela saiu de lá para cá porque o ativo entregue a um posto
              saiu da listagem de Computadores, e a operação ficou na tela que já não
              mostra o ativo. A entrega não tem esse problema — o ativo está na
              listagem justamente até ser entregue. */}
          <p className="text-sm text-text-secondary">A entrega é feita em Computadores; a devolução, aqui ou lá.</p>

          {/* ── O COMPUTADOR DA MESA, AO VIVO ────────────────────────────────
              Esta parte é a convergência vista do lado do POSTO. A telemetria
              morava numa tela de frota, que sabia a medida e não sabia de quem é
              a máquina; aqui a pergunta já vem com dono: "o computador da Mesa 1
              está bem?". E é no posto que ela se faz, porque é a mesa que tem
              ocupante e turno — na aba ao lado, nesta mesma ficha. */}
          {comMaquina.length === 0 ? (
            <p className="text-sm text-text-secondary">
              {ativos.length === 1
                ? `O computador deste posto é o ${ativos[0].assetTag}${ativos[0].name ? ` (${ativos[0].name})` : ''}, e ele ainda não tem máquina vinculada.`
                : `Nenhum dos ${ativos.length} ativos deste posto tem máquina vinculada.`}
              {' '}A telemetria aparece quando a máquina é vinculada ao ativo, em{' '}
              <Link to="/descobertas" className="text-link hover:underline">Descobertas</Link>.
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
}
