import {
  Activity, Copy, Cpu, HardDrive, Lock, MemoryStick, Monitor, Power, RefreshCw,
  type LucideIcon,
} from 'lucide-react';
import TabelaDaFicha from './TabelaDaFicha';
import { Aviso } from './ui/aviso';
import { PontoDeStatus } from './ui/badge';
import { Button } from './ui/button';
import { Card } from './ui/card';
import { Table, TableBody, TableCell, TableRow } from './ui/table';
import { cn } from '../helpers/cn.helper';
import { FUSO_DO_NEGOCIO, formatarDataHora } from '../helpers/format.helper';
import {
  formatarTaxa, formatarVolume, readSnapshot, usagePercent, volumeDeRede,
} from '../helpers/metrics.helper';
import { useCopiar } from '../hooks/useCopiar';
import { useMaquinaAoVivo, type ComandoDaMaquina } from '../hooks/useMaquinaAoVivo';
import { usePode } from '../stores/auth.store';

// COMO A MÁQUINA ESTÁ AGORA, e o que se pode mandar nela.
//
// ═══════════════════════════════════════════════════════════════════════════
// POR QUE ISTO É UM COMPONENTE COMPARTILHADO, E NÃO UMA TELA.
//
// Era uma tela: `/` mostrava a frota inteira em cards, cada card com três
// barras, e um clique abria uma janela com quatro abas internas. O problema não
// era o desenho — era a pergunta que ela respondia. "Como está a frota" não é
// uma pergunta que alguém faça; quem abre o sistema está atendendo UM chamado,
// sobre UM equipamento, e a frota em cards não dizia de quem é a máquina, qual
// é o patrimônio dela nem em que mesa ela está. Para descobrir isso era preciso
// sair da tela de telemetria e procurar o ativo em outra.
//
// Então o RMM entra pelo ITAM: a telemetria aparece onde a máquina tem nome, e
// esses lugares são dois — a ficha do ATIVO, que responde "este equipamento está
// bem?", e a ficha do POSTO, que responde "o computador desta mesa está bem?".
// É a ponte da convergência vista de perto.
//
// O NOME DA MÁQUINA É A LINHA QUE ABRE DESCOBERTAS (BZ): é lá que ela se vincula e
// se desvincula, e aqui ela só se olha e se comanda. Nenhuma etiqueta: as duas telas
// que o usam já identificaram o equipamento acima dele. O HWID aparece no rodapé
// com um botão de copiar — ele não é nome, é o que se cola num chamado e o que se
// procura no log do agente, e não tem outra tela.
//
// ─────────────────────────────────────────────────────────────────────────────
// E ELE FALA HTTP, que é EXCEÇÃO DECLARADA à regra de componente.
//
// A regra é `docs/referencia/arquitetura.md`: componente recebe `onComando` e o
// hook da página faz a chamada. Aqui o hook é chamado DAQUI, e o motivo é o
// mesmo do `ReferenceSelect`, a outra exceção: este painel é um widget
// autocontido — ele tem ciclo de vida próprio (um `refetchInterval` que começa
// ao montar e para ao desmontar) e é usado por duas telas sem relação entre si.
// Passá-lo por prop obrigaria `useFichaDoComputador` e `usePostos` a escrever a MESMA
// ligação de seis props, cada um, e a conhecer telemetria sem ter nada a ver com
// ela. As duas exceções estão nomeadas na regra, lá; a terceira que aparecer sem
// motivo escrito é a regra virando sugestão.
// ─────────────────────────────────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════

interface TelemetriaDaMaquinaProps {
  endpointId: string;
}

const ROTULO = 'text-xs text-text-tertiary';

/**
 * Os três comandos, com o verbo e a CONSEQUÊNCIA de cada um.
 *
 * A consequência é por comando e não uma frase só, porque elas não são a mesma:
 * desligar e reiniciar perdem o que não foi salvo, suspender não perde nada — a
 * máquina dorme com as janelas abertas. Uma frase que vale para o pior caso
 * aplicada aos três ensina a fechar a caixa sem ler.
 */
const COMANDOS: readonly (ComandoDaMaquina & { icone: typeof Power; cor: string })[] = [
  {
    action: 'shutdown',
    rotulo: 'Desligar',
    consequencia: 'Quem estiver usando perde o que não salvou.',
    perigo: true,
    icone: Power,
    cor: 'text-status-danger border-status-danger/30 hover:bg-status-danger/10 hover:text-status-danger',
  },
  {
    action: 'reboot',
    rotulo: 'Reiniciar',
    consequencia: 'Quem estiver usando perde o que não salvou.',
    perigo: true,
    icone: RefreshCw,
    cor: 'text-status-warning border-status-warning/30 hover:bg-status-warning/10 hover:text-status-warning',
  },
  {
    action: 'suspend',
    rotulo: 'Suspender',
    consequencia: 'A máquina dorme; a sessão e as janelas continuam abertas.',
    icone: Lock,
    cor: 'text-status-info border-status-info/30 hover:bg-status-info/10 hover:text-status-info',
  },
];

/** A vírgula do pt-BR, como o resto do painel: "12,9 GB", e não "12.9 GB". */
function comVirgula(numero: string): string {
  return numero.replace('.', ',');
}

/** A hora da amostra, em Brasília. Só a hora: o dia é hoje em toda máquina que responde. */
function hora(valor: string): string {
  return new Date(valor).toLocaleTimeString('pt-BR', { timeZone: FUSO_DO_NEGOCIO, timeStyle: 'medium' });
}

/**
 * A cor da medida, pelo LIMITE: os mesmos 70% e 90% da IntraNet, nos tokens de
 * status (AY). A cor é do VALOR, não do rótulo: é o que faz "95% de disco" saltar
 * sem ninguém precisar ler o número.
 *
 * Fora do ar a cor sai: a medida é a última que chegou, e vermelho num número de
 * ontem diria que o problema é de agora.
 */
function corDoUso(valor: number, online: boolean): { texto: string; barra: string } {
  if (!online) return { texto: 'text-text-tertiary', barra: 'bg-text-tertiary' };
  if (valor >= 90) return { texto: 'text-status-danger', barra: 'bg-status-danger' };
  if (valor >= 70) return { texto: 'text-status-warning', barra: 'bg-status-warning' };
  return { texto: 'text-status-success', barra: 'bg-status-success' };
}

function Trilho({ valor, cor }: { valor: number; cor: string }) {
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-surface-muted">
      <div
        className={cn('h-full rounded-full transition-all duration-500 ease-out', cor)}
        style={{ width: `${Math.min(valor, 100)}%` }}
      />
    </div>
  );
}

/** O número grande com a barra embaixo: o `TelemetriaTab` da IntraNet. */
function Medidor({ icone: Icone, rotulo, valor, detalhe, online }: {
  icone: LucideIcon;
  rotulo: string;
  valor: number;
  detalhe?: string;
  online: boolean;
}) {
  const cor = corDoUso(valor, online);

  return (
    <Card className="min-w-0 space-y-2 p-4">
      <div className="flex items-center gap-2">
        <Icone className={cn('size-4 shrink-0', cor.texto)} />
        <span className="text-sm font-medium text-text-primary">{rotulo}</span>
      </div>
      <div className={cn('text-3xl font-bold tabular-nums', cor.texto)}>{comVirgula(valor.toFixed(1))}%</div>
      <Trilho valor={valor} cor={cor.barra} />
      {detalhe && <p className="truncate text-xs text-text-tertiary" title={detalhe}>{detalhe}</p>}
    </Card>
  );
}

/** A linha de um disco, quando há mais de um para mostrar. */
function Barra({ rotulo, valor, detalhe, online }: { rotulo: string; valor: number; detalhe: string; online: boolean }) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-2 text-sm">
        <span className="text-text-secondary">{rotulo}</span>
        <span className="tabular-nums text-text-primary">
          {Math.round(valor)}%<span className="text-xs text-text-tertiary"> · {detalhe}</span>
        </span>
      </div>
      <Trilho valor={valor} cor={corDoUso(valor, online).barra} />
    </div>
  );
}

function Numero({ rotulo, valor, unidade }: { rotulo: string; valor: string; unidade: string }) {
  return (
    <div className="space-y-1">
      <span className={ROTULO}>{rotulo}</span>
      <p className="text-sm tabular-nums text-text-primary">
        {comVirgula(valor)}
        <span className="text-xs text-text-tertiary"> {unidade}</span>
      </p>
    </div>
  );
}

export default function TelemetriaDaMaquina({ endpointId }: TelemetriaDaMaquinaProps) {
  const { maquina, carregando, erro, enviando, handleComando } = useMaquinaAoVivo(endpointId);
  // O comando age na máquina de verdade, e é `SUPERVISOR` no servidor (AV). Para
  // quem não é, a seção some — o botão só levaria 403.
  const podeComandar = usePode('SUPERVISOR');
  const { copiado, copiar } = useCopiar(maquina?.hwid ?? '', 'Não foi possível copiar o HWID. Selecione e copie à mão.');

  if (carregando) return <p className="text-sm text-text-tertiary">Carregando…</p>;

  // BUSCA ENGOLE ERRO (docs/referencia/arquitetura.md): esta consulta revalida a
  // cada poucos segundos, e um 500 passageiro, um reinício do servidor ou um
  // tempo esgotado não podem limpar a tela. Trocar o painel por uma linha
  // vermelha tirava as barras, os processos E OS TRÊS BOTÕES DE COMANDO — num
  // momento em que a pessoa provavelmente está tentando desligar a máquina
  // justamente porque algo está errado. Com dado em mão, o erro é um aviso ao
  // lado; sem dado nenhum, aí sim ele é a tela toda.
  if (erro && !maquina) return <Aviso>{erro}</Aviso>;
  if (!maquina) return null;

  const amostra = maquina.telemetries[0];
  const online = maquina.status === 'ONLINE';
  const { cpuUsage, ramTotalGb, ramUsedGb, ramPercent, disks, network, processes } = readSnapshot(amostra);
  // A rede numa base só, em byte (metrics.helper.ts): o agente mede a
  // velocidade em kbit/s e o total em byte, e os dois saíam lado a lado com
  // "Kbps" e "Gb" — bit e byte na mesma linha, sem ninguém avisar.
  const recebendo = formatarTaxa(network.rxSpeedKbps);
  const taxaDeEnvio = formatarTaxa(network.txSpeedKbps);
  const totalRecebido = formatarVolume(volumeDeRede(network.bytesReceived, network.totalRxGb));
  const totalEnviado = formatarVolume(volumeDeRede(network.bytesSent, network.totalTxGb));
  // O disco do medidor é o MAIS CHEIO, que é o que pede atenção. Com mais de um,
  // a lista embaixo mostra todos.
  const discos = disks.map((disco) => ({ ...disco, uso: usagePercent(disco.usedGb, disco.totalGb) }));
  const maisCheio = discos.reduce<(typeof discos)[number] | null>(
    (maior, disco) => (maior && maior.uso >= disco.uso ? maior : disco),
    null,
  );

  return (
    <div className="space-y-4">
      {/* A linha da ficha (`TabelaDaFicha`), como a do computador no posto. Descobertas
          não tem ficha de máquina: abre a lista Vinculadas já buscada pelo nome. */}
      <TabelaDaFicha
        colunas={[{ rotulo: 'Máquina vinculada' }, { rotulo: 'Último contato', className: 'w-48' }]}
        icone={Monitor}
        vazio=""
        linhas={[{
          id: maquina.id,
          para: `/descobertas?aba=com&busca=${encodeURIComponent(maquina.hostname)}`,
          nome: maquina.hostname,
          celulas: [formatarDataHora(maquina.lastSeen)],
        }]}
      />

      <h3 className="text-sm font-medium text-text-primary">Como está agora</h3>

      <div className="flex flex-wrap items-center gap-2">
        <PontoDeStatus tom={online ? 'sucesso' : 'neutro'}>{online ? 'Online' : 'Offline'}</PontoDeStatus>
        <span className="text-xs text-text-tertiary">
          {/* A FRASE MUDA COM O ESTADO, e isso importa mais que o número: uma
              máquina OFFLINE tem telemetria na tela, e ela é a última que chegou.
              Sem dizer isso, 12% de CPU de ontem se lê como 12% agora.
              A HORA DA AMOSTRA vai junto porque "online" e "a medida é de agora"
              são coisas diferentes: um agente vivo com a coleta travada mantém o
              selo verde sobre um número de dez minutos atrás, e só a hora denuncia. */}
          {amostra
            ? `Leitura de ${hora(amostra.timestamp)}${online ? ', atualiza sozinho' : ', de antes de ela cair'}`
            : 'Nenhuma amostra ainda: o agente conectou e não mandou leitura'}
        </span>
      </div>

      {/* A FALHA DO CICLO, quando há dado em mão: a tela continua, com o aviso. */}
      {erro && (
        <Aviso tom="aviso" aria-live="polite">
          Não foi possível reler a máquina agora ({erro}). Os números abaixo são do último ciclo.
        </Aviso>
      )}

      {!amostra ? (
        <Card className="px-4 py-6 text-center text-sm text-text-tertiary">
          Sem leitura de telemetria. A máquina já se apresentou ao sistema; as medidas chegam
          na primeira leitura.
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Medidor icone={Cpu} rotulo="CPU" valor={cpuUsage} online={online} />
            <Medidor
              icone={MemoryStick}
              rotulo="Memória"
              valor={ramPercent}
              detalhe={`${comVirgula(ramUsedGb.toFixed(1))} de ${comVirgula(ramTotalGb.toFixed(1))} GB`}
              online={online}
            />
            {maisCheio && (
              <Medidor
                icone={HardDrive}
                rotulo="Disco"
                valor={maisCheio.uso}
                detalhe={`${maisCheio.name} · ${maisCheio.usedGb.toFixed(0)} de ${maisCheio.totalGb.toFixed(0)} GB`}
                online={online}
              />
            )}
          </div>

          {discos.length > 1 && (
            <Card className="space-y-3 p-4">
              <h4 className="flex items-center gap-2 text-sm font-medium text-text-primary">
                <HardDrive className="size-4 text-text-tertiary" /> Armazenamento
              </h4>
              {discos.map((disco, indice) => (
                <Barra
                  key={`${disco.name}-${indice}`}
                  rotulo={disco.name}
                  valor={disco.uso}
                  detalhe={`${disco.usedGb.toFixed(0)} de ${disco.totalGb.toFixed(0)} GB`}
                  online={online}
                />
              ))}
            </Card>
          )}

          <Card className="space-y-3 p-4">
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <Numero rotulo="Recebendo" valor={recebendo.valor} unidade={recebendo.unidade} />
              <Numero rotulo="Enviando" valor={taxaDeEnvio.valor} unidade={taxaDeEnvio.unidade} />
              <Numero rotulo="Total recebido" valor={totalRecebido.valor} unidade={totalRecebido.unidade} />
              <Numero rotulo="Total enviado" valor={totalEnviado.valor} unidade={totalEnviado.unidade} />
            </div>
            {/* A BASE, escrita: a unidade ao lado do número diz "kB/s" e "GB",
                e esta linha diz que as quatro são a mesma coisa. Sem ela, quem
                conhece o agente procura o "Kbps" que ele manda e desconfia do
                número menor. */}
            <p className="text-xs leading-relaxed text-text-tertiary">
              Rede em bytes: velocidade em kB/s ou MB/s, totais em MB ou GB desde que o agente ligou.
            </p>
          </Card>

          {processes.length > 0 && (
            <Card className="overflow-hidden">
              <h4 className="flex items-center gap-2 border-b border-border-sutil px-4 py-3 text-sm font-medium text-text-primary">
                <Activity className="size-4 text-text-tertiary" /> O que está consumindo memória
              </h4>
              <Table className="min-w-0">
                <TableBody>
                  {processes.map((processo, indice) => (
                    <TableRow key={`${processo.name}-${indice}`} className="h-auto">
                      <TableCell className="truncate py-2">{processo.name}</TableCell>
                      <TableCell className="w-28 whitespace-nowrap py-2 text-right tabular-nums text-text-primary">
                        {processo.ramMb.toFixed(0)} <span className="text-xs text-text-tertiary">MB</span>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
          )}
        </>
      )}

      {/* O HWID, com o COPIAR que ele tinha na tela antiga.
          É a identidade de hardware que o agente derivou: ela não é nome, é o que
          se cola num chamado e o que se procura no log do agente. Ela saiu da URL
          do comando, e não tem outra tela. */}
      <div className="flex flex-wrap items-center gap-2 border-t border-border-sutil pt-4">
        <span className={ROTULO}>HWID</span>
        <code className="break-all font-mono text-sm text-text-secondary">{maquina.hwid}</code>
        <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => void copiar()}>
          <Copy /> {copiado ? 'Copiado' : 'Copiar'}
        </Button>
      </div>

      {podeComandar && (
        <div className="space-y-3 border-t border-border-sutil pt-4">
          <h4 className="flex items-center gap-2 text-sm font-medium text-text-primary">
            <Cpu className="size-4 text-text-tertiary" /> Comandos
          </h4>

          <div className="flex flex-wrap gap-2">
            {COMANDOS.map((comando) => (
              <Button
                key={comando.action}
                variant="outline"
                size="sm"
                // O BOTÃO NÃO É DESABILITADO QUANDO A MÁQUINA ESTÁ OFFLINE, e isso
                // é decisão: o `status` da tela atrasa até cerca de CINCO minutos —
                // quatro de tolerância (`mark-stale-endpoints-offline`) mais a
                // rodada de um minuto do job de zumbis —, então um botão cinza
                // mentiria nos dois sentidos. Quem decide é o servidor, na hora, e
                // a resposta dele vem na notificação, dizendo qual máquina não
                // respondeu.
                disabled={enviando}
                onClick={() => void handleComando(comando)}
                className={comando.cor}
              >
                <comando.icone /> {comando.rotulo}
              </Button>
            ))}
          </div>

          <p className="text-xs leading-relaxed text-text-tertiary">
            O comando não fica em fila: com a máquina fora do ar, ele é recusado na hora.
          </p>
        </div>
      )}
    </div>
  );
}
