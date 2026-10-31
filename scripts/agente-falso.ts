import WebSocket from 'ws';

// UM AGENTE DE MENTIRA — para ver a telemetria na tela sem ter o agente real.
//
// O Agente Sentinel é um binário que vive fora deste repositório. Sem ele não
// existe linha em `endpoints`, e sem linha em `endpoints` a aba Máquina do ativo
// e a ficha do posto não têm o que mostrar. Este script fala o mesmo protocolo
// (`server/modules/shared/agent-protocol.types.ts`): um Handshake, e depois uma
// amostra de telemetria a cada 3 segundos, com valores que andam para dar para
// ver a tela atualizando sozinha.
//
//   npm run agente:falso                       # uma máquina de demonstração
//   npm run agente:falso -- <hwid> <hostname>  # outra identidade, para ter duas
//
// Lê `PORT` e `AGENT_TOKEN` do `.env` da raiz, como o servidor. Deixe rodando
// enquanto confere a tela; Ctrl-C encerra, e a máquina passa a OFFLINE (o
// `close` derruba na hora; sem ele, o job de zumbis derruba em até 4 minutos).
//
// É ferramenta de DESENVOLVIMENTO: não entra no build, não roda em produção e
// não é a suíte — quem prova o protocolo é `tests/helpers/agente.ts`.

try {
  process.loadEnvFile();
} catch {
  // Sem .env: vale o que já estiver no ambiente.
}

const hwid = process.argv[2] ?? 'maquina-de-demonstracao';
const hostname = process.argv[3] ?? 'pc-demo-01';
const porta = process.env.PORT ?? '3001';
const token = process.env.AGENT_TOKEN ?? '';

const socket = new WebSocket(`ws://localhost:${porta}/agent-hub`, {
  // O hub exige o token no header (`agent.maestro.ts`): sem ele é 401 antes do
  // upgrade, e a conexão nem chega a existir.
  headers: token ? { Authorization: `Bearer ${token}` } : {},
});

// O agente serializa em PascalCase, e é o caminho que o normalizador do
// servidor precisa resolver — por isso o script não "ajuda" com camelCase.
const mandar = (Type: string, Payload: Record<string, unknown>) =>
  socket.send(JSON.stringify({ Type, Payload: { Hwid: hwid, ...Payload } }));

const gb = (n: number) => n * 1024 ** 3;

socket.on('open', () => {
  console.log(`[agente-falso] conectado como ${hostname} (${hwid}) na porta ${porta}`);

  mandar('Handshake', {
    Hostname: hostname,
    OsVersion: 'Ubuntu 24.04 LTS',
    MacAddress: '00:1A:2B:3C:4D:5E',
    LocalIp: '192.168.1.42',
    CpuModel: 'Intel Core i5-10400',
    Manufacturer: 'Dell Inc.',
    HardwareModel: 'OptiPlex 3080',
    ChassisType: 'Desktop',
    BiosSerial: `DEMO-${hwid.toUpperCase().slice(0, 12)}`,
    SystemUuid: '4c4c4544-0042-4d10-8043-b2c04f335a32',
    RamTotalBytes: gb(16),
    DiskTotalBytes: gb(512),
  });

  let passo = 0;
  setInterval(() => {
    passo += 1;
    const cpu = 15 + (passo * 7) % 70;
    const ramUsada = gb(5 + (passo * 1.3) % 8);

    // A rede nas unidades que o agente real usa: velocidade em kbit/s, totais
    // em bytes. A tela converte tudo para byte (`metrics.helper.ts`).
    mandar('Telemetry', {
      CpuUsagePercentage: Number(cpu.toFixed(1)),
      RamTotalBytes: gb(16),
      RamUsedBytes: Math.round(ramUsada),
      Disks: [{ Name: '/', TotalGb: 476.9, UsedGb: 180 + (passo % 20) }],
      Network: {
        BytesReceived: 1_200_000_000 + passo * 9_000_000,
        BytesSent: 300_000_000 + passo * 2_000_000,
        RxSpeedKbps: 4_000 + (passo * 370) % 9_000,
        TxSpeedKbps: 800 + (passo * 110) % 2_000,
      },
      TopProcesses: [
        { Pid: 4242, Name: 'chrome', RamMb: 820 + (passo % 50) },
        { Pid: 1337, Name: 'code', RamMb: 610 },
        { Pid: 900, Name: 'teams', RamMb: 450 },
      ],
    });
    console.log(`[agente-falso] amostra ${passo}: cpu ${cpu.toFixed(1)}%`);
  }, 3_000);
});

// O que o servidor manda de volta é um comando (desligar, reiniciar, suspender).
// Aqui ele só é mostrado — é o que se quer ver ao clicar no botão da ficha.
socket.on('message', (bruto) => console.log('[agente-falso] recebeu:', bruto.toString()));
socket.on('unexpected-response', (_req, res) => {
  console.error(`[agente-falso] o servidor recusou a conexão: HTTP ${res.statusCode} (AGENT_TOKEN confere com o .env?)`);
  process.exit(1);
});
socket.on('error', (erro) => console.error('[agente-falso] erro:', erro.message));
socket.on('close', () => {
  console.log('[agente-falso] conexão encerrada');
  process.exit(0);
});
