# Decisões do ciclo de vida

> Manutenção, conferência física, valor contábil e a central de alertas com o job diário.
>
> **A regra desta pasta:** decisão escrita aqui **não se reescreve**. Se a realidade mudou, a
> decisão é **superada** por outra, com link entre as duas — é o log que diz por quanto tempo
> cada regra governou. O índice das 164 está em [`README.md`](./README.md).
>
> Decisões neste arquivo: D52–D57, D123–D128.
> A execução que as aplicou está em [`../historico/`](../historico/).

---

## D52 — A auditoria corrige *onde está*. Nunca *quem responde*.

**Decidido:** grava `Asset.locationId` e `Audit.locationIdBefore`. **Descartado:** mover a
`Assignment` aberta para o local onde o ativo foi achado.

O auditor observa um fato físico — *o mouse está na Mesa 2* —, não uma decisão — *o mouse passou a
ser da Mesa 2*. Empréstimo de uma tarde e mudança de posto são indistinguíveis pela observação, e o
`../referencia/modelo-de-posse.md` já declara que **um ativo pode estar em um lugar sem ser do lugar**. Mover a posse
transferiria responsabilidade — de Laura e Ana para quem ocupa a Mesa 2 — a partir de um palpite.
Corrigir posse é **checkout**: operação com autor, data e nota.

---

## D53 — `lastAuditAt` é coluna. `nextAuditAt` não nasce.

**Decidido:** `Asset.lastAuditAt`, escrita só pelo use-case de auditoria, com índice.
**Descartado:** `Asset.nextAuditAt`, que o item do TODO pede.

`lastAuditAt` é **cache de evento**, no molde de `Asset.assignedToId`: escritor único, fato que
aconteceu, e existe porque *"nunca auditados"* é pergunta sobre a frota inteira. `nextAuditAt` é
outra coisa — é `lastAuditAt + intervalo`, e o intervalo é **configuração global**: no dia em que
alguém mudar de 12 para 6 meses, toda linha gravada antes passa a mentir, e a correção é um `UPDATE`
em massa que ninguém vai lembrar de rodar.

---

## D54 — A auditoria é registrada por ATIVO. O posto é a unidade de trabalho.

**Decidido:** uma linha de `Audit` por ativo; auditar um posto cria N linhas numa transação.
**Descartado:** uma linha de auditoria por posto. *"Quais ativos nunca foram auditados"* é a pergunta
que paga esta fase, e ela não é respondível por linhas de posto; no caminho inverso, *"quando a Mesa
1 foi conferida?"* é `MAX(auditedAt)` sobre os ativos daquele posto — derivável, e derivável é o lado
certo de ficar.

---

## D55 — Valor contábil é calculado no servidor. Sempre.

**Decidido:** função pura em `server/domain/asset/helpers/`. **Descartado:** coluna `bookValue` — e
descartado também calcular na tela.

A coluna é a simetria exata do **D16**: segunda fonte de verdade para o que `purchaseCost`,
`purchaseDate` e a `Depreciation` já dizem — com um agravante que a responsabilidade derivada não
tem. **A responsabilidade muda quando um evento acontece; o valor contábil muda quando nada
acontece**, então a coluna já nasce errada no dia seguinte. Calcular no navegador é o mesmo erro
mudando de lugar: o lint impede `src/` importar de `server/`, a fórmula seria escrita duas vezes, e
duas implementações divergem na primeira regra de arredondamento.

---

## D56 — O job diário não é `setInterval` de 24 h. É tick curto com compare-and-set.

**Decidido:** tick de **uma hora** + `executarUmaVezPorJanela` (o helper do D79). **Descartado:**
`setInterval(24h)`, no molde do `zombie-cleaner.job.ts` — que é o modelo **errado** aqui, por três
diferenças.

**(1)** Ele é idempotente e sem efeito externo: rodar duas vezes remarca os mesmos endpoints como
OFFLINE — o job de alertas manda e-mail, e e-mail não tem rollback. **(2)** O período dele é 60 s:
perder uma rodada custa 60 segundos; perder a rodada diária custa o dia inteiro de aviso. **(3)** E o
que mata de vez: `setInterval` conta a partir do *boot*, então um processo que reinicia mais de uma
vez por dia — `tsx watch`, dois deploys num dia — **nunca chega aos 24 h e o job nunca dispara**. Não
é atraso; é ausência total, em silêncio.

> **Revisão:** a primeira versão pedia tick de 15 min. Não há ganho: os três jobs existentes acordam
> de hora em hora (60 s no de zumbis, que é outra granularidade), e quatro tentativas por hora de
> tomar a mesma janela são três `UPDATE` que devolvem `count: 0`. Uma hora é o período dos vizinhos,
> e período igual é uma coisa a menos para explicar.

---

## D57 — A central no app é o canal primário; SMTP mora no `.env`.

**Decidido:** toda notificação vira linha em `alerts` **antes** de virar mensagem, e o transporte
continua lendo `SMTP_URL`/`MAIL_FROM` do ambiente, em modo no-op quando falta.
**Descartado:** disparar e-mail direto do job; e guardar senha de SMTP no banco.

Persistir primeiro dá três coisas: *"o alerta disparou?"* vira um `SELECT`; o sistema funciona sem
SMTP; e o `dedupeKey` vira a defesa contra o mesmo alerta chegando todo dia até alguém resolver o
problema. Senha no banco pediria cifra em repouso — que hoje existe (F6), mas numa coluna que o
export CSV da F10 alcança.

> **Revisão:** a versão original prometia `SMTP_*` "validadas em `validateEnv()`". **Não são, e não
> passam a ser.** O contrato do correio é o D86 — *best-effort* com log, e no-op sem configuração —,
> e derrubar o boot por falta de SMTP contradiria isso: o sistema inteiro deixaria de subir por causa
> do canal secundário de um aviso. O que existe é o log do boot dizendo que o correio está em no-op.

---

## D123 — A janela do job é do FUSO e da HORA configurados. `inicioDoDia` ganha parâmetro.

**Decidido:** `AppSetting.timezone` (padrão `America/Sao_Paulo`) e `alertHour` decidem o que é "hoje"
e a partir de quando a rodada do dia pode ser tomada. `core/jobs/claim-window.ts` ganha
`inicioDoDia(fuso)`, e `reconciliation/helpers/shift.helper.ts` passa a **ler o fuso da
configuração** em vez do `FUSO_PADRAO` embutido. **Descartado:** `new Date()` cru, e um segundo
conceito de fuso só para os alertas.

O processo roda em UTC em produção e no fuso de quem desenvolve na máquina local. `inicioDoDia()`
hoje faz `setHours(0,0,0,0)` — fuso do **processo** — e o lembrete de atraso da F4 já depende disso:
uma rodada às 21h em São Paulo já é o dia seguinte em UTC, e a janela fecharia duas vezes no mesmo
dia local.

O que torna isto uma decisão e não um conserto: **`FUSO_PADRAO` já existe hardcoded** em
`shift.helper.ts`, e é ele que rotula turno de ocupação. Criar `AppSetting.timezone` ao lado dele
seria fabricar a segunda fonte de verdade sobre a mesma pergunta — o D16 outra vez, agora numa
constante. A constante **continua existindo** como padrão da função pura (ela não pode ler banco),
e quem chama passa o valor da configuração.

`alertHour` não é enfeite: sem ele a janela diária é tomada pelo primeiro tick depois da meia-noite,
e o campo na tela seria uma caixa que não muda nada.

---

## D124 — A auditoria pelo agente nasce no JOB, uma por ativo por dia, e só quando o SERIAL confere.

**Decidido:** o item *"cada handshake é uma auditoria física"* vira linha de `Audit` com
`method = AGENTE` escrita pelo **job de reconciliação**, ao lado do `carimbarUltimoContatoNosAtivos()`,
para os endpoints vinculados cujo `biosSerial` normalizado **é igual** ao `Asset.serial` — no máximo
uma por ativo por dia. **Descartado:** escrever no handshake; e contar hostname ou MAC como
confirmação.

A F7 fechou, então isto deixou de ser pergunta em aberto. Três razões, e as três são dela:

1. **`touchEndpoint` roda a cada Handshake, Telemetry e Ping de CADA máquina** — é o D95 na letra.
   Uma linha de `Audit` ali cresceria em (máquinas × mensagens por dia), e a tabela que responde
   *"quando este ativo foi conferido"* viraria a maior do banco em uma semana.
2. **Hostname é renomeável e MAC muda com dock.** Nenhum dos dois prova que alguém olhou o
   equipamento; o serial de BIOS é o número que está na etiqueta do fabricante.
3. **Serial que não bate não é auditoria nenhuma** — e em particular **não** é `NAO_LOCALIZADO`.
   Máquina que não manda serial é caso normal e aceito na F7 (`biosSerial` é nulável de propósito).

E o que o `AGENTE` **não** faz: escrever `locationId`. O agente não sabe onde a máquina está. Os três
campos conferidos da Etapa B são do caminho `MANUAL`; o automático grava `result: OK`, avança
`lastAuditAt` e mais nada. Sem esta linha escrita, a auditoria automática cairia na mesma transação
que corrige localização — e o D52 seria violado por um job, que é o pior lugar para descobrir isso.

---

## D125 — `dedupeKey` tem uma regra por tipo, e ela carrega o id da ORIGEM.

**Decidido:**

| Tipo | Chave | Por quê |
|---|---|---|
| `GARANTIA_VENCENDO` | `GARANTIA_VENCENDO:<assetId>:<warrantyExpiresAt>` | a data é estável: um alerta por vencimento, para sempre |
| `EOL_PROXIMO` | `EOL_PROXIMO:<assetId>:<eolDate>` | idem |
| `AUDITORIA_VENCIDA` | `AUDITORIA_VENCIDA:<assetId>:<lastAuditAt ou `nunca`>` | **não usa a data do corte** |
| `MANUTENCAO_EM_ABERTO` | `MANUTENCAO_EM_ABERTO:<maintenanceId>:<startDate>` | a origem é a MANUTENÇÃO, não o ativo |

**Descartado:** `${type}:${assetId}:${dueAt}` para os quatro, que era o que a primeira versão dizia.

Ela falha em dois dos quatro casos, e falha para o lado ruim — o de repetir:

- **Ativo nunca auditado não tem `dueAt`.** `lastAuditAt` é nulo; a única data à mão é a **do corte**,
  que anda todo dia. A chave mudaria todo dia e o alerta nasceria de novo todo dia, que é o oposto
  do que o dedupe existe para fazer. Com `nunca` no lugar, o alerta é um só — e quando alguém
  finalmente auditar, a chave muda porque o fato mudou, que é o comportamento certo.
- **Manutenção aberta não tem data-alvo.** `completionDate` é nulo *por ela estar aberta*. O prazo
  vem de `startDate + maintenanceOpenDays` (configurável), e a chave é **por manutenção**: um ativo
  com duas manutenções abertas — caso que a Etapa A permite de propósito — colapsaria em um alerta
  só se a chave fosse do ativo, e a segunda nunca apareceria.

`assetId` nulo é possível no schema (alerta da frota, não de um ativo); a chave então traz a
string `frota` na posição, nunca `null` interpolado.

---

## D126 — O webhook tem allowlist de destino; `notifiedAt` é do ALERTA, e a rodada seguinte reenvia o nulo.

**Decidido:** `server/core/webhook/webhook.ts`, irmão do `mailer.ts` — mesmo contrato (não lança,
loga, best-effort). A URL vem de `AppSetting.alertWebhookUrl` e **é validada antes de cada POST**:
só `https:`, e host que não seja loopback, link-local (`169.254.0.0/16`), privado (RFC 1918) nem
`.internal`. `notifiedAt` marca *"os canais configurados foram tentados e ao menos um entregou"*, e a
rodada do dia seguinte inclui as linhas que ficaram nulas.
**Descartado:** `fetch` na URL crua; e uma coluna `notifiedAt` por canal.

A validação não é zelo: **a URL vem do banco e o POST sai do servidor** — é SSRF pelo desenho. Um
`alertWebhookUrl` apontando para `http://169.254.169.254/latest/meta-data/` transforma a tela de
configuração num leitor de credencial de nuvem, e `http://localhost:3001/api/...` transforma o job
num cliente autenticado por engano. A allowlist é a mesma família do `CORS_ORIGIN` que recusa `*`.

Uma coluna por canal (`emailedAt`, `webhookedAt`) seria mais precisa e paga caro: dois estados para
reconciliar, duas perguntas para o próximo leitor, e nenhuma tela que mostre a diferença. Com uma
coluna, o log responde *qual* canal falhou — e é no log que se investiga entrega.

---

## D127 — Alerta não nasce para ativo fora do parque.

**Decidido:** as quatro consultas do job e os relatórios de prazo filtram `retiredAt: null` (e o
`deletedAt` da extension; a manutenção filtra `asset: { deletedAt: null }` à mão, porque a tabela
dela não tem lixeira). **Descartado:** alertar sobre tudo e deixar a tela filtrar.

`alerts` **não tem lixeira**: a linha gerada errada fica, e o `dedupeKey` garante que ela não seja
recriada — mas também garante que ela não seja *corrigida*. Um notebook vendido em março com garantia
vencendo em abril geraria um aviso que ninguém pode agir sobre, e a central perde autoridade na
primeira semana. As três colunas de saída são fatos diferentes (D19) e as três importam aqui:
`deletedAt` é erro de cadastro, `retiredAt` é saída do patrimônio, `ARCHIVED` é saída da operação —
e nenhum dos três merece cobrança de prazo.

---

## D128 — A central nasce só com os sinais do ATIVO.

**Decidido:** os quatro valores de `AlertType` são todos do ativo. Os alertas de **licença**
(`/api/licenses/alerts` — vencendo, assentos baixos, F6) e de **estoque** (`/api/stock/alerts`, F5)
continuam onde estão: painel na própria tela, derivado sob demanda.
**Descartado:** puxá-los para `alerts` nesta fase.

Escrito como decisão porque a ausência dele constrói um segundo sino. Os dois sinais já são
**derivados** — `status` de licença é função das datas (D44) e saldo de estoque é conta sobre as
linhas de saída (D34) —, e materializá-los em `alerts` pediria o inverso do que essas duas decisões
protegem. O que falta para eles entrarem é um **alvo polimórfico** em `Alert` (`licenseId`,
`stockItemId`, ou `targetType` + `targetId`), que é aditivo e cabe numa fase que precise de
notificação por e-mail de licença vencendo. Enquanto isso, o sino conta ativo, e a frase dele diz
isso.
