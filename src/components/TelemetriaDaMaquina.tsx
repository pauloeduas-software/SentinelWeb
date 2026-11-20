import type { ReactNode } from 'react';
import {
  Cpu, Gauge, HardDrive, Lock, MemoryStick, Monitor, Power, RefreshCw,
  type LucideIcon,
} from 'lucide-react';
import DadosDaMaquina from './DadosDaMaquina';
import TabelaDaFicha from './TabelaDaFicha';
import { Aviso } from './ui/aviso';
import { PontoDeStatus } from './ui/badge';
import { Button } from './ui/button';
import { Card } from './ui/card';
import { GradeDeDados } from './ui/dado';
import { cn } from '../helpers/cn.helper';
import { FUSO_DO_NEGOCIO, formatarDataHora } from '../helpers/format.helper';
import { caminhoDaMaquina } from '../helpers/maquina.helper';
import { readSnapshot, usagePercent } from '../helpers/metrics.helper';
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
// esses lugares são três — a ficha do COMPUTADOR, que responde "este equipamento está
// bem?", a ficha do POSTO, que responde "o computador deste posto está bem?", e a
// ficha da MÁQUINA, em Agentes (DF).
// É a ponte da convergência vista de perto.
//
// A LINHA DA MÁQUINA E DOIS BLOCOS EMBAIXO DELA: o que a máquina é e como está, e
// os comandos, que agem nela, por último.
//
// O NOME DA MÁQUINA É A LINHA QUE ABRE A FICHA DELA, em Agentes (BZ, DF): é lá que
// ela se vincula e se desvincula, e aqui ela só se olha e se comanda. Nenhuma
// etiqueta: as telas que o usam já identificaram o equipamento acima dele. Na própria
// ficha da máquina, a linha e o inventário saem (`naFichaDaMaquina`): o card de cima
// já os mostra.
//
// ─────────────────────────────────────────────────────────────────────────────
// E ELE FALA HTTP, que é EXCEÇÃO DECLARADA à regra de componente.
//
// A regra é `docs/referencia/arquitetura.md`: componente recebe a escrita por prop e o
// hook da página faz a chamada. Aqui o hook é chamado DAQUI: este painel é um widget
// autocontido — ele tem ciclo de vida próprio (um `refetchInterval` que começa
// ao montar e para ao desmontar) e é usado por três telas sem relação entre si.
// Passá-lo por prop obrigaria `useFichaDoComputador`, `useFichaDoPosto` e `useFichaDaMaquina` a
// escrever a MESMA ligação de seis props, cada um, e a conhecer telemetria sem ter nada a
// ver com ela. A exceção está nomeada na regra, lá; a próxima que aparecer sem
// motivo escrito é a regra virando sugestão.
// ─────────────────────────────────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════

interface TelemetriaDaMaquinaProps {
  endpointId: string;
  /**
   * Na ficha da máquina (DF), o card de cima já diz qual é e o que ela diz de si:
   * aqui ficam só a medida e os comandos.
   */
  naFichaDaMaquina?: boolean;
}

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

/** A hora da amostra, em Brasília, sem os segundos: a leitura é de hora em hora. */
function hora(valor: string): string {
  return new Date(valor).toLocaleTimeString('pt-BR', { timeZone: FUSO_DO_NEGOCIO, timeStyle: 'short' });
}

/**
 * A cor da medida, pelo LIMITE: 70% e 90%, nos tokens de
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

/** Um painel dentro do bloco: o título com o ícone e o conteúdo. */
function Painel({ icone: Icone, titulo, children }: { icone: LucideIcon; titulo: string; children: ReactNode }) {
  return (
    <section className="min-w-0 space-y-4 rounded-lg border border-border-sutil p-4">
      <h4 className="flex items-center gap-2 text-sm font-medium text-text-primary">
        <Icone className="size-4 text-text-tertiary" /> {titulo}
      </h4>
      {children}
    </section>
  );
}

/** O número grande com a barra embaixo, num quadro dentro do bloco. */
function Medidor({ icone: Icone, rotulo, valor, detalhe, online }: {
  icone: LucideIcon;
  rotulo: string;
  valor: number;
  detalhe?: string;
  online: boolean;
}) {
  const cor = corDoUso(valor, online);

  return (
    <div className="min-w-0 space-y-3 rounded-lg border border-border-sutil bg-surface-muted/30 p-4">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium text-text-secondary">{rotulo}</span>
        <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-surface-muted">
          <Icone className={cn('size-4', cor.texto)} />
        </span>
      </div>
      <div className={cn('text-3xl font-bold leading-none tabular-nums', cor.texto)}>{comVirgula(valor.toFixed(1))}%</div>
      <Trilho valor={valor} cor={cor.barra} />
      <p className="h-4 truncate text-xs text-text-tertiary" title={detalhe}>{detalhe}</p>
    </div>
  );
}

/** A linha de um disco, quando há mais de um para mostrar. */
function Barra({ rotulo, valor, detalhe, online }: { rotulo: string; valor: number; detalhe: string; online: boolean }) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-2 text-sm">
        <span className="truncate text-text-secondary" title={rotulo}>{rotulo}</span>
        <span className="shrink-0 tabular-nums text-text-primary">
          {Math.round(valor)}%<span className="text-xs text-text-tertiary"> · {detalhe}</span>
        </span>
      </div>
      <Trilho valor={valor} cor={corDoUso(valor, online).barra} />
    </div>
  );
}

export default function TelemetriaDaMaquina({ endpointId, naFichaDaMaquina = false }: TelemetriaDaMaquinaProps) {
  const { maquina, carregando, erro, enviando, handleComando } = useMaquinaAoVivo(endpointId);
  // O comando age na máquina de verdade, e é `SUPERVISOR` no servidor (AV). Para
  // quem não é, o bloco some — o botão só levaria 403.
  const podeComandar = usePode('SUPERVISOR');

  if (carregando) return <p className="text-sm text-text-tertiary">Carregando…</p>;

  // O ERRO APARECE, NUNCA VIRA VAZIO (docs/referencia/arquitetura.md): esta consulta revalida
  // sozinha, e um 500 passageiro, um reinício do servidor ou um
  // tempo esgotado não podem limpar a tela. Trocar o painel por uma linha
  // vermelha tirava as barras, os discos E OS TRÊS BOTÕES DE COMANDO — num
  // momento em que a pessoa provavelmente está tentando desligar a máquina
  // justamente porque algo está errado. Com dado em mão, o erro é um aviso ao
  // lado; sem dado nenhum, aí sim ele é a tela toda.
  if (erro && !maquina) return <Aviso>{erro}</Aviso>;
  if (!maquina) return null;

  const amostra = maquina.telemetries[0];
  const leituraAtrasada = !!amostra
    && new Date(maquina.lastSeen).getTime() - new Date(amostra.timestamp).getTime() >= 60_000;
  const online = maquina.status === 'ONLINE';
  const { cpuUsage, ramTotalGb, ramUsedGb, ramPercent, disks } = readSnapshot(amostra);
  // O disco do medidor é o MAIS CHEIO, que é o que pede atenção. Com mais de um,
  // a seção Armazenamento mostra todos.
  const discos = disks.map((disco) => ({ ...disco, uso: usagePercent(disco.usedGb, disco.totalGb) }));
  const maisCheio = discos.reduce<(typeof discos)[number] | null>(
    (maior, disco) => (maior && maior.uso >= disco.uso ? maior : disco),
    null,
  );

  return (
    <div className="space-y-4">
      {/* A linha da ficha (`TabelaDaFicha`), como a do computador no posto: abre a
          ficha da máquina (DF). */}
      {!naFichaDaMaquina && (
        <TabelaDaFicha
          colunas={[{ rotulo: 'Máquina vinculada' }, { rotulo: 'Último contato', coluna: 'dataHora' }]}
          icone={Monitor}
          vazio=""
          linhas={[{
            id: maquina.id,
            para: caminhoDaMaquina(maquina.id),
            nome: maquina.hostname,
            celulas: [formatarDataHora(maquina.lastSeen)],
          }]}
        />
      )}

      <Card className="overflow-hidden">
        {/* O CABEÇALHO DO BLOCO: o título, de quando é a leitura e o status. */}
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-border-sutil px-5 py-3.5">
          <h3 className="flex items-center gap-2 text-sm font-medium text-text-primary">
            <Gauge className="size-4 text-text-tertiary" /> Como está agora
          </h3>
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-xs text-text-tertiary">
              {/* A HORA DA AMOSTRA, só quando ela não é o último contato da linha de
                  cima: a máquina conectada pinga a cada 30 a 60 s, e a leitura vem de hora
                  em hora. Sem ela, os 66% de CPU, média da hora que terminou 50 minutos
                  atrás, se leem como 66% agora.
                  Quando a leitura foi a última coisa que a máquina mandou, as duas
                  horas são a mesma, e a frase repetiria a linha. */}
              {!amostra ? 'Nenhuma leitura ainda' : leituraAtrasada && `Leitura de ${hora(amostra.timestamp)}`}
            </span>
            <PontoDeStatus tom={online ? 'sucesso' : 'neutro'}>{online ? 'Conectado' : 'Desconectado'}</PontoDeStatus>
          </div>
        </div>

        <div className="space-y-4 p-5">
          {/* A FALHA DO CICLO, quando há dado em mão: a tela continua, com o aviso. */}
          {erro && (
            <Aviso tom="aviso" aria-live="polite">
              Não foi possível reler a máquina agora ({erro}). Os números abaixo são do último ciclo.
            </Aviso>
          )}

          {/* O que a máquina diz de si. Na ficha da máquina ele está no card de cima. */}
          {!naFichaDaMaquina && (
            <GradeDeDados className="rounded-lg border border-border-sutil bg-surface-muted/30 p-4 md:grid-cols-4">
              <DadosDaMaquina maquina={maquina} />
            </GradeDeDados>
          )}

          {!amostra ? (
            <p className="rounded-lg border border-dashed border-border-sutil px-4 py-6 text-center text-sm text-text-tertiary">
              Sem leitura de telemetria. A máquina já se apresentou ao sistema; as medidas chegam
              na primeira leitura.
            </p>
          ) : (
            <>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                {/* A CPU é a média desde a leitura anterior, e não o uso deste instante:
                    de hora em hora é a da hora, e a primeira depois do boot é de 10 s. */}
                <Medidor icone={Cpu} rotulo="CPU" valor={cpuUsage} detalhe="Média desde a leitura anterior" online={online} />
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
                <Painel icone={HardDrive} titulo="Armazenamento">
                  {discos.map((disco, indice) => (
                    <Barra
                      key={`${disco.name}-${indice}`}
                      rotulo={disco.name}
                      valor={disco.uso}
                      detalhe={`${disco.usedGb.toFixed(0)} de ${disco.totalGb.toFixed(0)} GB`}
                      online={online}
                    />
                  ))}
                </Painel>
              )}
            </>
          )}
        </div>
      </Card>

      {podeComandar && (
        <Card className="overflow-hidden">
          <div className="border-b border-border-sutil px-5 py-3.5">
            <h3 className="flex items-center gap-2 text-sm font-medium text-text-primary">
              <Power className="size-4 text-text-tertiary" /> Comandos
            </h3>
          </div>

          <ul className="grid gap-4 p-5 sm:grid-cols-3">
            {COMANDOS.map((comando) => (
              <li key={comando.action}>
                <Button
                  variant="outline"
                  // O BOTÃO NÃO É DESABILITADO QUANDO A MÁQUINA ESTÁ DESCONECTADA, e
                  // isso é decisão: a máquina que some sem fechar a conexão (a queda de
                  // energia, a suspensa) segue Conectado na tela por até uns três minutos —
                  // os dois de tolerância (`mark-stale-endpoints-offline`, CS) mais a
                  // rodada de um minuto do job de zumbis —, então um botão cinza
                  // mentiria nos dois sentidos. Quem decide é o servidor, na hora, e
                  // a resposta dele vem na notificação, dizendo qual máquina não
                  // respondeu.
                  disabled={enviando}
                  onClick={() => void handleComando(comando)}
                  className={cn('w-full', comando.cor)}
                >
                  <comando.icone /> {comando.rotulo}
                </Button>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
