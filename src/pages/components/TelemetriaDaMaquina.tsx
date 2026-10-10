import { useState } from 'react';
import { Activity, Copy, Cpu, HardDrive, Lock, Power, RefreshCw, TriangleAlert } from 'lucide-react';
import { readSnapshot, usagePercent } from '../helpers/metrics.helper';
import { useMaquinaAoVivo, type ComandoDaMaquina } from '../hooks/useMaquinaAoVivo';

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
// ELE NÃO REPETE O NOME DA MÁQUINA. Nenhum hostname, nenhuma etiqueta: as duas
// telas que o usam já identificaram o equipamento acima dele, e repetir aqui
// faria o painel competir com o cabeçalho da ficha. A exceção é o HWID, que
// aparece no rodapé com um botão de copiar — ele não é nome, é o que se cola num
// chamado e o que se procura no log do agente, e não tem outra tela.
//
// ─────────────────────────────────────────────────────────────────────────────
// E ELE FALA HTTP, que é EXCEÇÃO DECLARADA à regra de componente.
//
// A regra é `docs/referencia/arquitetura.md`: componente recebe `onComando` e o
// hook da página faz a chamada. Aqui o hook é chamado DAQUI, e o motivo é o
// mesmo do `ReferenceSelect`, a outra exceção: este painel é um widget
// autocontido — ele tem ciclo de vida próprio (um `refetchInterval` que começa
// ao montar e para ao desmontar) e é usado por duas telas sem relação entre si.
// Passá-lo por prop obrigaria `useAssetDetail` e `usePostos` a escrever a MESMA
// ligação de seis props, cada um, e a conhecer telemetria sem ter nada a ver com
// ela. As duas exceções estão nomeadas na regra, lá; a terceira que aparecer sem
// motivo escrito é a regra virando sugestão.
// ─────────────────────────────────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════

interface TelemetriaDaMaquinaProps {
  endpointId: string;
}

const ROTULO = 'text-[10px] uppercase tracking-widest text-text-tertiary';

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
    icone: Power,
    cor: 'text-status-danger border-status-danger/30 hover:bg-status-danger/10',
  },
  {
    action: 'reboot',
    rotulo: 'Reiniciar',
    consequencia: 'Quem estiver usando perde o que não salvou.',
    icone: RefreshCw,
    cor: 'text-status-warning border-status-warning/30 hover:bg-status-warning/10',
  },
  {
    action: 'suspend',
    rotulo: 'Suspender',
    consequencia: 'A máquina dorme; a sessão e as janelas continuam abertas.',
    icone: Lock,
    cor: 'text-status-info border-status-info/30 hover:bg-status-info/10',
  },
];

/** A hora da amostra. Só a hora: o dia é hoje em toda máquina que responde. */
function hora(valor: string): string {
  return new Date(valor).toLocaleTimeString('pt-BR', { timeStyle: 'medium' });
}

function Barra({ rotulo, valor, detalhe }: { rotulo: string; valor: number; detalhe?: string }) {
  // A cor é do VALOR, não do rótulo: é o que faz "85% de disco" saltar sem
  // ninguém precisar ler o número.
  const cor = valor < 60 ? 'bg-status-success' : valor < 85 ? 'bg-status-warning' : 'bg-status-danger';

  return (
    <div className="space-y-1.5">
      <div className="flex justify-between items-baseline gap-2">
        <span className={ROTULO}>{rotulo}</span>
        <span className="text-text-primary tabular-nums">
          {Math.round(valor)}%
          {detalhe && <span className="text-text-tertiary"> · {detalhe}</span>}
        </span>
      </div>
      <div className="h-1.5 w-full bg-border-sutil overflow-hidden">
        <div className={`h-full transition-all duration-500 ease-out ${cor}`} style={{ width: `${Math.min(valor, 100)}%` }} />
      </div>
    </div>
  );
}

function Numero({ rotulo, valor, unidade }: { rotulo: string; valor: number; unidade: string }) {
  return (
    <div className="space-y-1">
      <span className={ROTULO}>{rotulo}</span>
      <p className="text-text-primary tabular-nums">
        {valor}
        <span className="text-text-tertiary text-[10px]"> {unidade}</span>
      </p>
    </div>
  );
}

export default function TelemetriaDaMaquina({ endpointId }: TelemetriaDaMaquinaProps) {
  const { maquina, carregando, erro, enviando, retorno, handleComando } = useMaquinaAoVivo(endpointId);
  // GUARDA QUAL hwid foi copiado, não um booleano: o roteador reaproveita a
  // tela de `/ativos/:id` de um ativo para outro (a busca do leitor navega
  // assim), e um `true` sobreviveria à troca — a máquina seguinte apareceria
  // com "copiado" sem ninguém ter copiado. É a mesma guarda que o retorno do
  // comando tem no `useMaquinaAoVivo`.
  const [hwidCopiado, setHwidCopiado] = useState<string | null>(null);

  if (carregando) return <p className="text-text-tertiary">Lendo a máquina…</p>;

  // BUSCA ENGOLE ERRO (docs/referencia/arquitetura.md): esta consulta revalida a
  // cada poucos segundos, e um 500 passageiro, um reinício do servidor ou um
  // tempo esgotado não podem limpar a tela. Trocar o painel por uma linha
  // vermelha tirava as barras, os processos E OS TRÊS BOTÕES DE COMANDO — num
  // momento em que a pessoa provavelmente está tentando desligar a máquina
  // justamente porque algo está errado. Com dado em mão, o erro é um aviso ao
  // lado; sem dado nenhum, aí sim ele é a tela toda.
  if (erro && !maquina) return <p className="text-status-danger">{erro}</p>;
  if (!maquina) return null;

  const amostra = maquina.telemetries[0];
  const online = maquina.status === 'ONLINE';
  const { cpuUsage, ramTotalGb, ramUsedGb, ramPercent, disks, network, processes } = readSnapshot(amostra);

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2">
        <div className={`h-2 w-2 rounded-full ${online ? 'bg-status-success animate-pulse' : 'bg-text-tertiary'}`} />
        <span className={`text-[10px] font-mono font-bold uppercase tracking-widest ${online ? 'text-status-success' : 'text-text-secondary'}`}>
          {maquina.status}
        </span>
        <span className="text-[10px] text-text-tertiary">
          {/* A FRASE MUDA COM O ESTADO, e isso importa mais que o número: uma
              máquina OFFLINE tem telemetria na tela, e ela é a última que chegou.
              Sem dizer isso, 12% de CPU de ontem se lê como 12% agora.
              A HORA DA AMOSTRA vai junto porque "online" e "a medida é de agora"
              são coisas diferentes: um agente vivo com a coleta travada mantém o
              selo verde sobre um número de dez minutos atrás, e só a hora denuncia. */}
          {amostra
            ? `· leitura de ${hora(amostra.timestamp)}${online ? ', atualiza sozinho' : ', de antes de ela cair'}`
            : '· nenhuma amostra ainda: o agente conectou e não mandou leitura'}
        </span>
      </div>

      {/* A FALHA DO CICLO, quando há dado em mão: a tela continua, com o aviso. */}
      {erro && (
        <p className="flex items-start gap-2 text-status-warning text-[10px] leading-relaxed" aria-live="polite">
          <TriangleAlert size={12} className="shrink-0 mt-0.5" />
          <span>Não foi possível reler a máquina agora ({erro}). Os números abaixo são do último ciclo.</span>
        </p>
      )}

      {!amostra ? (
        <p className="text-text-tertiary border border-border-sutil px-4 py-6 text-center">
          Sem leitura de telemetria. A máquina aparece aqui porque fez handshake; as medidas
          chegam na primeira amostra.
        </p>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 border border-border-sutil p-4">
            <Barra rotulo="Processador" valor={cpuUsage} />
            <Barra
              rotulo="Memória"
              valor={ramPercent}
              detalhe={`${ramUsedGb.toFixed(1)} de ${ramTotalGb.toFixed(1)} GB`}
            />
          </div>

          {disks.length > 0 && (
            <div className="space-y-3 border border-border-sutil p-4">
              <h4 className={`${ROTULO} flex items-center gap-2`}>
                <HardDrive size={11} /> Armazenamento
              </h4>
              {disks.map((disco, indice) => (
                <Barra
                  key={`${disco.name}-${indice}`}
                  rotulo={disco.name}
                  valor={usagePercent(disco.usedGb, disco.totalGb)}
                  detalhe={`${disco.usedGb.toFixed(0)} de ${disco.totalGb.toFixed(0)} GB`}
                />
              ))}
            </div>
          )}

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 border border-border-sutil p-4">
            {/* Sem `?? 0`: o `parseNetwork` já devolve número em todo caso — é
                ele que absorve a coluna Json ausente, o texto no lugar do objeto
                e o campo em PascalCase. O `??` era herança da tela antiga. */}
            <Numero rotulo="Recebendo" valor={network.rxSpeedKbps} unidade="Kbps" />
            <Numero rotulo="Enviando" valor={network.txSpeedKbps} unidade="Kbps" />
            <Numero rotulo="Total recebido" valor={network.totalRxGb} unidade="Gb" />
            <Numero rotulo="Total enviado" valor={network.totalTxGb} unidade="Gb" />
          </div>

          {processes.length > 0 && (
            <div className="border border-border-sutil">
              <h4 className={`${ROTULO} flex items-center gap-2 px-4 py-3 border-b border-border-sutil`}>
                <Activity size={11} /> O que está consumindo memória
              </h4>
              <table className="w-full text-left">
                <tbody className="divide-y divide-border-sutil/50">
                  {processes.map((processo, indice) => (
                    <tr key={`${processo.name}-${indice}`}>
                      <td className="px-4 py-2 text-text-secondary truncate max-w-[260px]">{processo.name}</td>
                      <td className="px-4 py-2 text-right text-text-primary tabular-nums whitespace-nowrap">
                        {processo.ramMb.toFixed(0)} <span className="text-text-tertiary text-[10px]">MB</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {/* O HWID, com o COPIAR que ele tinha na tela antiga.
          É a identidade de hardware que o agente derivou, e o único lugar do
          painel onde a máquina se identifica — de propósito: ela não é nome, é o
          que se cola num chamado e o que se procura no log do agente. Ela saiu da
          URL do comando nesta mesma etapa, e não tem outra tela. */}
      <div className="flex flex-wrap items-baseline gap-2 border-t border-border-sutil pt-4">
        <span className={ROTULO}>HWID</span>
        <button
          type="button"
          onClick={() => {
            void navigator.clipboard.writeText(maquina.hwid);
            setHwidCopiado(maquina.hwid);
          }}
          title="Copiar o HWID completo"
          className="inline-flex items-center gap-1.5 text-text-secondary hover:text-text-primary transition-colors break-all text-left"
        >
          {maquina.hwid} <Copy size={11} className="shrink-0" />
        </button>
        {hwidCopiado === maquina.hwid && (
          <span className="text-status-success text-[10px]">copiado</span>
        )}
      </div>

      <div className="space-y-3 border-t border-border-sutil pt-4">
        <h4 className={`${ROTULO} flex items-center gap-2`}>
          <Cpu size={11} /> Comandos
        </h4>

        <div className="flex flex-wrap gap-2">
          {COMANDOS.map((comando) => (
            <button
              key={comando.action}
              type="button"
              // O BOTÃO NÃO É DESABILITADO QUANDO A MÁQUINA ESTÁ OFFLINE, e isso
              // é decisão: o `status` da tela atrasa até cerca de CINCO minutos —
              // quatro de tolerância (`mark-stale-endpoints-offline`) mais a
              // rodada de um minuto do job de zumbis —, então um botão cinza
              // mentiria nos dois sentidos. Quem decide é o servidor, na hora, e
              // a resposta dele aparece logo abaixo dizendo qual máquina não
              // respondeu.
              disabled={enviando}
              onClick={() => void handleComando(comando)}
              className={`flex items-center gap-2 px-3 py-1.5 border text-[10px] font-mono uppercase tracking-widest transition-colors disabled:opacity-30 ${comando.cor}`}
            >
              <comando.icone size={12} /> {comando.rotulo}
            </button>
          ))}
        </div>

        {retorno && (
          <p
            // ANUNCIADO, e não só pintado. O fluxo antigo terminava num `alert`,
            // que o leitor de tela lê e que bloqueia até ser fechado. Trocá-lo por
            // um parágrafo no DOM deixava quem usa leitor de tela sem retorno
            // nenhum: o sucesso e o 409 ficavam igualmente silenciosos.
            aria-live={retorno.tipo === 'falhou' ? 'assertive' : 'polite'}
            role={retorno.tipo === 'falhou' ? 'alert' : undefined}
            className={`flex items-start gap-2 text-[10px] leading-relaxed ${
              retorno.tipo === 'enviado' ? 'text-status-success' : 'text-status-danger'
            }`}
          >
            {retorno.tipo === 'falhou' && <TriangleAlert size={12} className="shrink-0 mt-0.5" />}
            <span>{retorno.texto}</span>
          </p>
        )}

        <p className="text-[10px] text-text-tertiary leading-relaxed">
          O comando vai pelo WebSocket aberto do agente e não fica em fila: se a máquina estiver
          fora do ar, ele é recusado na hora — em vez de desligá-la quando ela voltar.
        </p>
      </div>
    </div>
  );
}
