import { MonitorSmartphone, Unlink } from 'lucide-react';
import TelemetriaDaMaquina from '../../../components/TelemetriaDaMaquina';
import type {
  EspecificacoesDaMaquina, MaquinaDoAtivo, MudancaDeHardware,
} from '../../../../domain/shared/reconciliation.types';

// A ABA MÁQUINA — o que o AGENTE vê deste ativo (F7).
//
// Nasceu com a convergência: até aqui, o ativo sabia o que a empresa comprou e a
// máquina sabia o que ela é, e os dois nunca se falavam.
//
// ─────────────────────────────────────────────────────────────────────────────
// AS SPECS MOSTRADAS AQUI NÃO SÃO COLUNAS DO ATIVO, e isso é deliberado (D16).
//
// RAM e disco vêm do `Endpoint`, o lado que DESCOBRE. Copiá-las para `assets`
// criaria duas respostas para a mesma pergunta, com um detalhe que as torna
// piores que o normal: elas podem divergir com razão — alguém trocou o pente —
// e ninguém saberia qual está certa. O que o ativo guarda é o que se comprou; o
// que esta aba mostra é o que está lá agora.
//
// E é por isso que a lista de MUDANÇAS DETECTADAS fica logo abaixo delas: ela é
// a resposta para "mas por que o disco não é o que eu comprei?". Sem ela, a
// divergência entre o cadastro e a coleta é uma pergunta sem lugar para ser
// respondida — e a resposta mais provável, que alguém trocou a peça em março,
// não estaria em tela nenhuma.
// ─────────────────────────────────────────────────────────────────────────────
// A TELEMETRIA E OS COMANDOS CHEGARAM AQUI, e vieram de uma tela que saiu.
//
// Eram `/`: a frota inteira em cards, com três barras cada. Aquela tela sabia a
// medida e não sabia de quem é a máquina; esta ficha sabe o patrimônio, a pessoa
// e o posto, e passou a saber a medida também. É a ordem certa das três seções
// abaixo: o que a empresa COMPROU (as specs), o que MUDOU desde então, e como a
// máquina está AGORA.
//
// O painel é `pages/components/TelemetriaDaMaquina` porque a ficha do POSTO
// mostra o mesmo — o computador da mesa é um ativo, visto do outro lado.
// ─────────────────────────────────────────────────────────────────────────────

interface MaquinaTabProps {
  maquina: MaquinaDoAtivo | undefined;
  carregando: boolean;
  desvinculando: boolean;
  onDesvincular: () => void;
}

const CABECALHO = 'px-3 py-2 text-left text-[10px] uppercase tracking-widest text-text-tertiary font-normal';
const ROTULO = 'text-[10px] uppercase tracking-widest text-text-tertiary';

/**
 * Bytes em unidade legível.
 *
 * Recebe **string** porque é isso que o servidor manda: os dois campos são
 * `BigInt` no banco e não sobrevivem ao `JSON.stringify` como número. O
 * `Number()` aqui é seguro — 1 PB ainda cabe com folga no `Number` do
 * JavaScript, e nenhuma dessas máquinas tem 1 PB de disco.
 */
function bytes(valor: string | null): string {
  if (!valor) return '—';
  const numero = Number(valor);
  if (!Number.isFinite(numero) || numero <= 0) return '—';

  const unidades = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
  let escala = 0;
  let restante = numero;
  while (restante >= 1024 && escala < unidades.length - 1) {
    restante /= 1024;
    escala += 1;
  }
  // Uma decimal só a partir de GB: "7,7 GB" ajuda, "982,4 MB" é ruído.
  return `${restante.toFixed(escala >= 3 ? 1 : 0).replace('.', ',')} ${unidades[escala]}`;
}

function dataHora(valor: string | null): string {
  if (!valor) return '—';
  return new Date(valor).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}

/** O nome do campo como uma pessoa o lê, e não como a coluna se chama. */
const NOME_DO_CAMPO: Record<string, string> = {
  manufacturer: 'Fabricante',
  hardwareModel: 'Modelo',
  chassisType: 'Chassi',
  biosSerial: 'Série da BIOS',
  systemUuid: 'UUID do sistema',
  cpuModel: 'Processador',
  osVersion: 'Sistema operacional',
  ramTotalBytes: 'Memória',
  diskTotalBytes: 'Disco',
};

function Campo({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1 min-w-0">
      <span className={ROTULO}>{rotulo}</span>
      <p className="text-text-secondary truncate" title={typeof children === 'string' ? children : undefined}>
        {children}
      </p>
    </div>
  );
}

function Especificacoes({ specs }: { specs: EspecificacoesDaMaquina }) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 border border-border-sutil p-4">
      <Campo rotulo="Fabricante">{specs.manufacturer ?? '—'}</Campo>
      <Campo rotulo="Modelo">{specs.hardwareModel ?? '—'}</Campo>
      <Campo rotulo="Chassi">{specs.chassisType ?? '—'}</Campo>
      <Campo rotulo="Processador">{specs.cpuModel ?? '—'}</Campo>
      <Campo rotulo="Memória">{bytes(specs.ramTotalBytes)}</Campo>
      <Campo rotulo="Disco">{bytes(specs.diskTotalBytes)}</Campo>
      <Campo rotulo="Sistema">{specs.osVersion ?? '—'}</Campo>
      <Campo rotulo="Série da BIOS">{specs.biosSerial ?? '—'}</Campo>
      <Campo rotulo="UUID">{specs.systemUuid ?? '—'}</Campo>
      <Campo rotulo="MAC">{specs.macAddress ?? '—'}</Campo>
      <Campo rotulo="IP local">{specs.localIp ?? '—'}</Campo>
    </div>
  );
}

function Mudancas({ mudancas }: { mudancas: MudancaDeHardware[] }) {
  return (
    <div>
      <h3 className={`${ROTULO} mb-2 block`}>Mudanças detectadas — {mudancas.length}</h3>
      <table className="w-full border border-border-sutil text-xs font-mono">
        <thead className="bg-bg-surface border-b border-border-sutil">
          <tr>
            <th className={CABECALHO}>Campo</th>
            <th className={CABECALHO}>Era</th>
            <th className={CABECALHO}>Passou a ser</th>
            <th className={CABECALHO}>Quando</th>
          </tr>
        </thead>
        <tbody>
          {mudancas.map((mudanca) => (
            <tr key={mudanca.id} className="border-b border-border-sutil last:border-0">
              <td className="px-3 py-2 text-text-primary">
                {NOME_DO_CAMPO[mudanca.field] ?? mudanca.field}
              </td>
              <td className="px-3 py-2 text-text-tertiary line-through">
                {mudanca.field.endsWith('Bytes') ? bytes(mudanca.oldValue) : mudanca.oldValue ?? '—'}
              </td>
              <td className="px-3 py-2 text-status-warning">
                {mudanca.field.endsWith('Bytes') ? bytes(mudanca.newValue) : mudanca.newValue}
              </td>
              <td className="px-3 py-2 text-text-tertiary">{dataHora(mudanca.detectedAt)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function MaquinaTab({ maquina, carregando, desvinculando, onDesvincular }: MaquinaTabProps) {
  if (carregando) return <p className="text-text-tertiary">Carregando a máquina…</p>;

  if (!maquina?.endpointId) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-text-tertiary gap-3">
        <MonitorSmartphone size={24} className="opacity-50" />
        <span>Nenhuma máquina vinculada a este ativo.</span>
        <span className="text-[10px] max-w-md text-center leading-relaxed">
          Nem todo ativo tem agente — monitor, cadeira e cabo nunca terão. Se este deveria ter,
          a máquina aparece em Descobertas assim que o agente mandar o primeiro sinal.
        </span>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between border border-border-sutil px-4 py-3 gap-4">
        <div className="min-w-0">
          <span className={ROTULO}>Máquina vinculada</span>
          <p className="font-mono text-sm text-text-primary mt-1 truncate">{maquina.hostname}</p>
          {/* O SELO ONLINE/OFFLINE SAIU DAQUI, e isso conserta um defeito.
              Ele vinha de `GET /api/assets/:id/machine`, que NÃO tem polling, e
              a seção "Como está agora" lá embaixo mostra o mesmo campo vindo de
              uma consulta que revalida a cada poucos segundos. Eram duas
              respostas para a mesma pergunta a quarenta pixels de distância:
              tirar o cabo da máquina pintava o painel de OFFLINE enquanto esta
              linha continuava verde, e religar fazia o contrário.
              É o erro que o comentário no alto deste arquivo descreve sobre as
              specs — duas respostas para a mesma pergunta, e ninguém sabe qual
              está certa. Quem responde "agora" é o painel, um dono só.
              A DATA fica: ela é histórico ("foi visto às 10:02"), não estado, e
              é metade da lição das duas datas logo abaixo. */}
          <p className="font-mono text-[10px] mt-1 text-text-tertiary">
            último contato {dataHora(maquina.ultimoContato)}
          </p>
          {/* AS DUAS DATAS, LADO A LADO — e o texto explica a diferença, que é de
              até uma hora. O carimbo do ativo é escrito pelo JOB e não pelo
              handshake (D95): sem a frase, quem vê a segunda data atrasada
              acharia que o batimento falhou. */}
          <p className="font-mono text-[10px] text-text-tertiary mt-0.5">
            carimbado no ativo em {dataHora(maquina.ultimoContatoNoAtivo)}
            <span className="opacity-60"> · a varredura atualiza de hora em hora</span>
          </p>
        </div>
        <button
          type="button"
          disabled={desvinculando}
          onClick={onDesvincular}
          className="flex items-center gap-2 px-3 py-1.5 border border-border-sutil text-[10px] font-mono uppercase tracking-widest text-text-tertiary hover:text-status-danger hover:border-status-danger/40 disabled:opacity-30 transition-colors shrink-0"
          title="Este ativo não é esta máquina"
        >
          <Unlink size={12} /> Desvincular
        </button>
      </div>

      <div className="font-mono text-xs">
        <h3 className={`${ROTULO} mb-2 block`}>Especificações coletadas pelo agente</h3>
        {maquina.especificacoes && <Especificacoes specs={maquina.especificacoes} />}
        <p className="text-[10px] text-text-tertiary mt-2 leading-relaxed">
          É o que está na máquina agora, não o que a empresa comprou. Os dois podem divergir com
          razão — e quando divergem, a lista abaixo diz quando mudou.
        </p>
      </div>

      <div className="font-mono text-xs">
        {maquina.mudancas.length === 0 ? (
          <>
            <h3 className={`${ROTULO} mb-2 block`}>Mudanças detectadas</h3>
            <p className="text-text-tertiary border border-border-sutil px-4 py-6 text-center">
              Nenhuma troca de peça desde que o agente começou a coletar.
            </p>
          </>
        ) : (
          <Mudancas mudancas={maquina.mudancas} />
        )}
      </div>

      <div className="font-mono text-xs">
        <h3 className={`${ROTULO} mb-3 block`}>Como está agora</h3>
        <TelemetriaDaMaquina endpointId={maquina.endpointId} />
      </div>
    </div>
  );
}
