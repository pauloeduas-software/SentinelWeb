import { Monitor, Unlink } from 'lucide-react';
import TelemetriaDaMaquina from '../../../../components/TelemetriaDaMaquina';
import { Button } from '../../../../components/ui/button';
import { Card } from '../../../../components/ui/card';
import { Dado, GradeDeDados } from '../../../../components/ui/dado';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../../../components/ui/table';
import type {
  EspecificacoesDaMaquina, MaquinaDoAtivo, MudancaDeHardware,
} from '../../../../types/reconciliation.types';

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
// e o posto, e passou a saber a medida também. As seções abaixo vão na ordem da
// IntraNet: como a máquina está AGORA, que é por que se abre esta aba, e depois o
// que há nela (as specs) e o que MUDOU.
//
// O painel é `components/TelemetriaDaMaquina` porque a ficha do POSTO
// mostra o mesmo — o computador da mesa é um ativo, visto do outro lado.
// ─────────────────────────────────────────────────────────────────────────────

interface MaquinaTabProps {
  maquina: MaquinaDoAtivo | undefined;
  carregando: boolean;
  desvinculando: boolean;
  onDesvincular: () => void;
}

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

function Titulo({ children }: { children: React.ReactNode }) {
  return <h3 className="text-sm font-medium text-text-primary">{children}</h3>;
}

function Especificacoes({ specs }: { specs: EspecificacoesDaMaquina }) {
  return (
    <GradeDeDados className="md:grid-cols-4">
      <Dado rotulo="Fabricante">{specs.manufacturer}</Dado>
      <Dado rotulo="Modelo">{specs.hardwareModel}</Dado>
      <Dado rotulo="Chassi">{specs.chassisType}</Dado>
      <Dado rotulo="Processador">{specs.cpuModel}</Dado>
      <Dado rotulo="Memória">{bytes(specs.ramTotalBytes)}</Dado>
      <Dado rotulo="Disco">{bytes(specs.diskTotalBytes)}</Dado>
      <Dado rotulo="Sistema">{specs.osVersion}</Dado>
      <Dado rotulo="Série da BIOS">{specs.biosSerial && <span className="font-mono">{specs.biosSerial}</span>}</Dado>
      <Dado rotulo="UUID">{specs.systemUuid && <span className="font-mono">{specs.systemUuid}</span>}</Dado>
      <Dado rotulo="MAC">{specs.macAddress && <span className="font-mono">{specs.macAddress}</span>}</Dado>
      <Dado rotulo="IP local">{specs.localIp && <span className="font-mono">{specs.localIp}</span>}</Dado>
    </GradeDeDados>
  );
}

function Mudancas({ mudancas }: { mudancas: MudancaDeHardware[] }) {
  return (
    <Card className="overflow-hidden">
      <h3 className="px-6 pt-6 pb-2 text-sm font-medium text-text-primary">Mudanças detectadas ({mudancas.length})</h3>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Campo</TableHead>
            <TableHead>Era</TableHead>
            <TableHead>Passou a ser</TableHead>
            <TableHead>Quando</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {mudancas.map((mudanca) => (
            <TableRow key={mudanca.id}>
              <TableCell className="font-medium text-text-primary">
                {NOME_DO_CAMPO[mudanca.field] ?? mudanca.field}
              </TableCell>
              <TableCell className="text-text-tertiary line-through">
                {mudanca.field.endsWith('Bytes') ? bytes(mudanca.oldValue) : mudanca.oldValue ?? '—'}
              </TableCell>
              <TableCell>
                {mudanca.field.endsWith('Bytes') ? bytes(mudanca.newValue) : mudanca.newValue}
              </TableCell>
              <TableCell className="whitespace-nowrap">{dataHora(mudanca.detectedAt)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Card>
  );
}

export default function MaquinaTab({ maquina, carregando, desvinculando, onDesvincular }: MaquinaTabProps) {
  if (carregando) return <p className="text-sm text-text-tertiary">Carregando a máquina…</p>;

  if (!maquina?.endpointId) {
    return (
      <Card className="flex flex-col items-center justify-center gap-3 py-16 text-sm text-text-tertiary">
        <Monitor className="size-6 opacity-50" />
        <span>Nenhuma máquina vinculada a este ativo.</span>
        <span className="max-w-md text-center text-xs leading-relaxed">
          Se este ativo deveria ter agente, a máquina aparece em Descobertas assim que ele mandar o
          primeiro sinal.
        </span>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card className="flex flex-wrap items-center justify-between gap-4 p-6">
        <div className="min-w-0 space-y-0.5">
          <p className="text-xs font-medium text-text-tertiary">Máquina vinculada</p>
          <p className="truncate text-sm font-medium text-text-primary">{maquina.hostname}</p>
          {/* O SELO ONLINE/OFFLINE SAIU DAQUI, e isso conserta um defeito.
              Ele vinha de `GET /api/assets/:id/machine`, que NÃO tem polling, e
              a seção "Como está agora" logo abaixo mostra o mesmo campo vindo de
              uma consulta que revalida a cada poucos segundos. Eram duas
              respostas para a mesma pergunta a quarenta pixels de distância:
              tirar o cabo da máquina pintava o painel de OFFLINE enquanto esta
              linha continuava verde, e religar fazia o contrário.
              É o erro que o comentário no alto deste arquivo descreve sobre as
              specs — duas respostas para a mesma pergunta, e ninguém sabe qual
              está certa. Quem responde "agora" é o painel, um dono só.
              A DATA fica: ela é histórico ("foi visto às 10:02"), não estado, e
              é metade da lição das duas datas logo abaixo. */}
          <p className="text-xs text-text-tertiary">último contato {dataHora(maquina.ultimoContato)}</p>
          {/* AS DUAS DATAS, LADO A LADO — e o texto explica a diferença, que é de
              até uma hora. O carimbo do ativo é escrito pelo JOB e não pelo
              handshake (D95): sem a frase, quem vê a segunda data atrasada
              acharia que o batimento falhou. */}
          <p className="text-xs text-text-tertiary">
            carimbado no ativo em {dataHora(maquina.ultimoContatoNoAtivo)} · a varredura atualiza de hora em hora
          </p>
        </div>
        <Button variant="outline" size="sm" disabled={desvinculando} onClick={onDesvincular} title="Este ativo não é esta máquina">
          <Unlink /> Desvincular
        </Button>
      </Card>

      <section className="space-y-3">
        <Titulo>Como está agora</Titulo>
        <TelemetriaDaMaquina endpointId={maquina.endpointId} />
      </section>

      <Card className="space-y-4 p-6">
        <div className="space-y-0.5">
          <Titulo>Especificações coletadas pelo agente</Titulo>
          <p className="text-xs text-text-tertiary">
            O que está na máquina agora, não o que a empresa comprou. Quando divergem, as mudanças abaixo dizem quando.
          </p>
        </div>
        {maquina.especificacoes && <Especificacoes specs={maquina.especificacoes} />}
      </Card>

      {maquina.mudancas.length === 0 ? (
        <Card className="space-y-2 p-6">
          <Titulo>Mudanças detectadas</Titulo>
          <p className="text-sm text-text-tertiary">Nenhuma troca de peça desde que o agente começou a coletar.</p>
        </Card>
      ) : (
        <Mudancas mudancas={maquina.mudancas} />
      )}
    </div>
  );
}
