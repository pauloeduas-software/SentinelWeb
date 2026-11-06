import { useState } from 'react';
import { Monitor, Undo2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import { CartaoVazio } from '../../../../components/ListaVazia';
import TelemetriaDaMaquina from '../../../../components/TelemetriaDaMaquina';
import { Aviso } from '../../../../components/ui/aviso';
import { Badge, PontoDeStatus } from '../../../../components/ui/badge';
import { Button } from '../../../../components/ui/button';
import { Input } from '../../../../components/ui/input';
import { diaDoInstante, hojeNoCampoDeData } from '../../../../helpers/format.helper';
import { tomDoStatus } from '../../../../helpers/status.helper';
import type { AtivoDoPosto } from '../../../../types/workstation.types';
import { ativosComMaquina } from '../../helpers/postos.helper';

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

  // Cálculo fora do JSX (docs/referencia/arquitetura.md). A lista tem no
  // máximo um ativo — é a invariante 19 —, e com máquina vinculada é o que tem
  // telemetria para mostrar.
  const comMaquina = ativosComMaquina(ativos);

  return (
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
        <CartaoVazio icone={Monitor} carregando={false} erro={null} frase="Nenhum ativo entregue a este posto.">
          <span className="max-w-md text-xs leading-relaxed">
            A entrega é feita em{' '}
            <Link to="/computadores" className="text-primary hover:underline">Computadores</Link>
            , escolhendo este posto como destino.
          </span>
        </CartaoVazio>
      ) : (
        <>
          <ul className="divide-y divide-border-sutil rounded-lg border border-border-sutil bg-surface-card text-sm">
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
                    <PontoDeStatus tom={tomDoStatus(ativo.status.type)}>{ativo.status.name}</PontoDeStatus>
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
                        onKeyDown={(event) => {
                          if (event.key === 'Escape') setDevolvendoAtivo(null);
                        }}
                        className="h-9 w-36"
                      />
                    </label>
                    <Button variant="outline" size="sm" onClick={() => setDevolvendoAtivo(null)}>Cancelar</Button>
                    <Button
                      size="sm"
                      disabled={devolvendo || devolvendoAtivo.dia === ''}
                      onClick={() => void devolver(ativo, devolvendoAtivo.dia)}
                    >
                      Confirmar
                    </Button>
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
              <Link to="/descobertas" className="text-primary hover:underline">Descobertas</Link>.
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
