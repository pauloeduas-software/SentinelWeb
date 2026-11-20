# Agente

> O que chega do SentinelAgente e o que o servidor faz com isso: o cadastro, a conexão, as três
> mensagens e os comandos. O porquê de cada regra do servidor está nas decisões citadas; as regras do
> agente moram no repositório dele. A tela que mostra a máquina é a de Agentes, no
> [`README.md`](../../README.md#-telas).

---

## O cadastro

`POST /agent-hub/enroll`, com `Authorization: Bearer <AGENT_ENROLL_SECRET>` e `{ "Hwid": "…" }`
([CR](../decisoes/acesso.md#cr--cada-máquina-tem-o-seu-token-e-o-segredo-único-só-cadastra)):

| Resposta | Quando |
|---|---|
| `201 { "Token": "…" }` | o token da máquina, com 64 caracteres hexadecimais. O banco guarda o SHA-256 dele em `agent_credentials`, uma linha por HWID, e o token anterior da máquina deixa de valer |
| `401` | o segredo de instalação não confere |
| `409` | a máquina está conectada |
| `413` | o corpo passa de 8 KiB, o mesmo teto do login |
| `422` | o corpo vem sem `Hwid` |

- O teto é de 20 por minuto por IP.
- Sem `AGENT_ENROLL_SECRET` configurado, o servidor não sobe em produção, e fora dela aceita qualquer cadastro.

## A conexão

- `GET /agent-hub`, WebSocket, com `Authorization: Bearer <token da máquina>`. Sem o token, ou com o
  segredo de instalação, é 401 antes do upgrade.
- **A conexão fica presa ao HWID do token.**
- **Uma conexão por HWID.** A nova substitui a velha, e o fechamento da velha não derruba a máquina.

| Código | Quando |
|---|---|
| **1008** | o `Hwid` de qualquer mensagem não é o do token ([CU](../decisoes/acesso.md#cu--a-conexão-com-o-hwid-de-outra-máquina-fecha-com-1008)), e quando a máquina foi excluída ([DD](../decisoes/reconciliacao.md#dd--agentes-ganha-sumidos-e-o-excluir-e-o-excluir-revoga-o-agente)) |
| **1009** | a mensagem acima de 1 MiB ([DB](../decisoes/reconciliacao.md#db--a-telemetria-é-cpu-memória-e-discos)) |
| **1001** | o servidor desliga ("Servidor encerrando") |

O **HWID** é o id da instalação do agente, não da máquina. O servidor o guarda em minúsculas e sem espaço
em volta (`hwid.helper.ts`).

## As mensagens

O envelope é `{ "Type": "…", "Payload": { "Hwid": "…", … } }`, em PascalCase. Tipo desconhecido, JSON
quebrado e mensagem sem `Hwid` são descartados com aviso no log; campo que o servidor não lê é ignorado
sem erro ([CY](../decisoes/reconciliacao.md#cy--o-servidor-lê-o-que-o-sentinelagente-manda-e-só-isso)).
Toda mensagem atualiza o último contato (`endpoints.lastSeen`). O tipo e a leitura estão em
`server/modules/shared/agent-protocol.types.ts` e `server/modules/agent/helpers/normalize-payload.helper.ts`.

### `Handshake`

Chega ao conectar, uma vez por dia com a conexão de pé e em resposta ao `REFRESH`. Grava a linha em
`endpoints` e roda o vínculo pela série
([DC](../decisoes/reconciliacao.md#dc--descobertas-vira-agentes-e-a-série-liga-a-máquina-sozinha)). É ele
que habilita os comandos para a conexão.

| Campo | Coluna | Quando não vem |
|---|---|---|
| `Hostname` | `hostname` | `desconhecido` |
| `OsVersion` | `osVersion` | `desconhecido` |
| `MacAddress`, `LocalIp`, `CpuModel` | `macAddress`, `localIp`, `cpuModel` | apaga o gravado |
| `BiosSerial`, `SystemUuid` | `biosSerial`, `systemUuid` | fica o gravado |
| `Manufacturer`, `HardwareModel` | `manufacturer`, `hardwareModel` | fica o gravado |
| `Gpus`: `[{ Name, MemoryBytes }]`, até 16 | `gpus` (Json) | fica o gravado |
| `AgentVersion` | `agentVersion` | apaga o gravado ([DE](../decisoes/reconciliacao.md#de--a-lista-de-agentes-mostra-a-versão-do-agente)) |

- **`BiosSerial`:** a série única liga a máquina ao computador sozinha.
- **`SystemUuid`:** não entra no vínculo. Junto com a série, reconhece a máquina reinstalada.
- **A máquina reinstalada:** o HWID nunca visto herda a linha de uma única máquina desligada com a mesma
  série. Quando os dois lados têm UUID, o UUID também tem de bater. Quando só a série veio, ou a linha
  antiga não tem UUID, a série basta
  ([CV](../decisoes/reconciliacao.md#cv--a-máquina-reinstalada-herda-a-própria-linha-como-no-glpi)).
- **O valor de fábrica:** o campo não vem, e o servidor o lê como ausente. O servidor ainda confere a série
  contra a lista de valores de fábrica (`normalize-identity.helper.ts`,
  [CT](../decisoes/reconciliacao.md#ct--o-lixo-de-fábrica-se-reconhece-sem-separadores-e-a-lista-cresce)).
- **`Gpus: []`** apaga a lista gravada. O `MemoryBytes` que não vem, ou que não é número maior que zero, vira
  nulo.
- O IP é IPv4.

### `Telemetry`

Chega 10 s depois da primeira conexão desde que o agente subiu (no boot e a cada reinício do serviço), de
hora em hora e em resposta ao `REFRESH`; a reconexão não manda amostra, e a próxima vem na hora seguinte. Grava uma linha em `telemetries`;
o expurgo diário guarda só a última de cada máquina
([DA](../decisoes/reconciliacao.md#da--o-que-o-agente-manda-vai-para-a-aba-máquina-e-o-que-ninguém-lê-sai)).

| Campo | Coluna |
|---|---|
| `CpuUsagePercentage` | `cpuUsage` |
| `RamTotalBytes`, `RamUsedBytes` | `ramTotal`, `ramUsed` |
| `Disks`: `[{ Name, TotalGb, UsedGb }]`, até 64 | `disks` (Json) |

- Campo ausente vira zero, e o `Disks` ausente vira lista vazia.
- O item de `Gpus` ou de `Disks` sem `Name` sai.
- A telemetria de HWID que nunca mandou handshake é descartada.

### `Ping`

Vai quando o agente passa um tempo sorteado entre 30 e 60 s sem mandar nada. A máquina sem
nenhuma mensagem há 2 minutos vira Desconectado (`OFFLINE`), e a que fecha a conexão vira na hora; a que
fala é Conectado (`ONLINE`)
([CS](../decisoes/reconciliacao.md#cs--a-máquina-calada-vira-offline-em-2-minutos)).

## Os comandos

O servidor manda `{ "Type": "Command", "Payload": { "Action": "…", "CommandId": "<uuid>" } }` só para a
máquina conectada: não há fila.

| `Action` | Rota | Cargo |
|---|---|---|
| `REBOOT`, `SHUTDOWN`, `SUSPEND` | `POST /api/endpoints/:id/command` | Supervisor |
| `REFRESH` | `POST /api/endpoints/:id/refresh` | Técnico |

**O comando de energia:**
- 409 para a máquina desconectada.
- 502 quando a conexão cai antes de o pacote sair.
- A API responde "Comando enviado.", e a tela mostra "Comando de … entregue ao agente de …".

**O `REFRESH`**
([DK](../decisoes/reconciliacao.md#dk--atualizar-agora-a-máquina-manda-o-inventário-e-a-telemetria-na-hora)):
- 409 para a máquina desconectada e para o agente anterior à 0.2.0 ou sem versão.
- 502 quando o envio falha.
- 504 depois de 15 s sem o `Handshake` e a `Telemetry` que ele provocou.
- A tela mostra "Máquina atualizada.".
