# Plano de implementação — Fase 6: licenças de software

> Plano **prospectivo** da Fase 6 do [`ITAM-TODO.md`](./ITAM-TODO.md), escrito contra o
> código real depois da F1 e contra [`MODELO-POSSE.md`](./MODELO-POSSE.md). Convenções de
> camada: [`ARQUITETURA.md`](./ARQUITETURA.md).
>
> Esforço: **P** = até meio dia · **M** = 1 a 3 dias · **G** = mais de 3 dias
>
> **Decisões `D39`–`D44`**, continuando a sequência global depois das da F5 (D33–D38).

---

## Objetivo

Um módulo inteiro do Snipe-IT que aqui não existe em nenhuma forma. O que a licença tem
e o ativo não tem é **assento**: a licença não é entregue, ela é *consumida N vezes*, e a
pergunta que o módulo existe para responder é **"quantos assentos sobraram e quem está
com eles"** — com a resposta valendo em auditoria de fornecedor.

Três coisas decidem o desenho:

1. **O assento é materializado** — uma linha por assento, não um contador. É o que permite
   travar *o assento* e não *a licença* na hora de entregar.
2. **O assento vai para uma pessoa OU para um ativo**, nunca para os dois, nunca para um
   posto (D39). É o XOR que o TODO pede, e ele é também uma afirmação sobre o que
   licença é.
3. **A chave é segredo em repouso** — cifrada, mascarada na resposta, e quem a revela
   deixa rastro.

---

## Pré-requisitos

| Precisa estar pronto | Por quê | Estado |
|---|---|---|
| **F1** — `Category` com `type = LICENSE`, `Manufacturer`, `Supplier` | a licença aponta para os três | ✅ |
| **F1** — `Asset` | metade do alvo do assento | ✅ |
| **F0** — `error-handler`, `parseListQuery`, `ActivityLog`, soft delete | herdados | ✅ |
| **F4** — `Assignment` | **não** é pré-requisito: assento não é posse de ativo e não passa pela `Assignment` (D39) | — |
| `APP_ENCRYPTION_KEY` no `.env` | sem ela o campo de chave é recusado, nunca gravado em claro | novo nesta fase |

**Nada de licença existe hoje.** O que a F1 deixou pronto foi o `CategoryType.LICENSE` e
nada mais — nem tabela, nem rota, nem `minAmt`. (A versão anterior do TODO marcava *"dados
de compra da licença + `minAmt` — feito na F1"*; estava errado e a reescrita já corrigiu.)

---

## Etapas

### Etapa A — Schema e migração · **M**

| Model | Campos | Regra de negócio em uma linha |
|---|---|---|
| `License` | `name`, `seatsTotal Int`, `reassignable Boolean @default(true)`, `maintained Boolean @default(false)`, `expirationDate?`, `terminationDate?`, `licensedToName?`, `licensedToEmail?`, `productKey String?` (cifrado), `minSeats Int?`, `categoryId`, `manufacturerId?`, `supplierId?`, compra (`orderNumber?`, `purchaseDate?`, `purchaseCost Decimal?`), `notes?`, `deletedAt?` | o contrato: quantos assentos foram comprados e sob que condições |
| `LicenseSeat` | `licenseId`, `seatNumber Int`, `burnedAt?`, `retiredAt?`, `notes?` | **uma linha por assento comprado** — a unidade contável e travável |
| `LicenseSeatCheckout` | `seatId`, `assignedUserId?`, `assignedAssetId?`, `checkoutAt`, `checkinAt?`, notas, `checkoutById?`/`checkinById?` | uma linha por atribuição; devolver preenche `checkinAt` e nunca apaga a linha |

**Escrito à mão na migration** (nenhum destes sai do `migrate diff`):

```sql
-- O XOR do alvo. Duas colunas, uma linha de CHECK: barato o suficiente para o
-- banco carregar a regra em vez de só o use-case.
ALTER TABLE "license_seat_checkouts" ADD CONSTRAINT "license_seat_alvo_xor"
  CHECK (num_nonnulls("assignedUserId", "assignedAssetId") = 1);

-- Um assento não pode estar em duas mãos ao mesmo tempo. Mesma forma do
-- `assignments_um_aberto_por_ativo` (D14), um nível abaixo.
CREATE UNIQUE INDEX "license_seat_uma_aberta_por_assento"
  ON "license_seat_checkouts"("seatId") WHERE "checkinAt" IS NULL;

CREATE UNIQUE INDEX "license_seats_numero" ON "license_seats"("licenseId","seatNumber");
CREATE UNIQUE INDEX "licenses_name_unico_ativo"
  ON "licenses"("name") WHERE "deletedAt" IS NULL;
```

`onDelete`: `Cascade` de `License` para `LicenseSeat` (assento não existe fora do
contrato); `Restrict` de `LicenseSeatCheckout` para `User` e `Asset` — não se apaga quem
ainda segura assento, e é a rede embaixo do 409.

### Etapa B — `core/crypto` · **P**

```
server/core/crypto/cipher.ts      # cifrar(texto, aad) / decifrar(pacote, aad) — AES-256-GCM (D81)
server/core/config/env.ts         # APP_ENCRYPTION_KEY: obrigatória em produção
```

Mora em `core/` e não em `domain/license/` porque **não tem conhecimento de negócio** e
porque a F9 (campo customizado cifrado em repouso) usa a mesma função. Zero dependência
nova: `node:crypto` já faz GCM.

**Regra em uma linha:** cifrar devolve `v1:<iv b64>:<tag b64>:<ct b64>` numa coluna só — o
prefixo de versão é o que torna rotação de chave possível depois sem migração, porque a
linha diz com o que foi cifrada.

### Etapa C — O domínio `license` · **G**

```
server/domain/license/
├── license.maestro.ts
├── controllers/license.controller.ts
├── schemas/license.schema.ts               # strictObject; productKey entra, nunca sai
├── helpers/license-status.helper.ts        # ATIVA | VENCENDO | EXPIRADA | ENCERRADA (puro)
├── helpers/mask-product-key.helper.ts      # ••••-••••-AB12 (puro)
└── use-cases/  list-licenses · create-license · update-license · delete-license
                sync-seats · checkout-seat · checkin-seat · reveal-product-key
                license-compliance (stub p/ F7) · list-license-alerts
```

```
GET    /api/licenses                      listagem + livres/ocupados/queimados
GET    /api/licenses/:id/seats            os assentos, com quem está em cada um
POST   /api/licenses/:id/checkout-seat    { assignedUserId } XOR { assignedAssetId }
POST   /api/licenses/seats/:seatId/checkin
GET    /api/licenses/:id/product-key      revela — e grava ActivityLog VIEW_KEY
GET    /api/licenses/alerts               vencendo em N dias, livres < minSeats
```

### Etapa D — Pegar um assento livre sem corrida · **M**

**Regra em uma linha:** o primeiro assento livre é escolhido e travado na mesma instrução,
dentro de uma transação, e quem chegou junto pega o *próximo* em vez de esperar.

```sql
SELECT s.id
  FROM license_seats s
 WHERE s."licenseId" = $1
   AND s."burnedAt" IS NULL AND s."retiredAt" IS NULL
   AND NOT EXISTS (SELECT 1 FROM license_seat_checkouts c
                    WHERE c."seatId" = s.id AND c."checkinAt" IS NULL)
 ORDER BY s."seatNumber"
 LIMIT 1
 FOR UPDATE OF s SKIP LOCKED;     -- `OF s`: ver Riscos
```

### Etapa E — Reconciliação de `seatsTotal` · **P**

**Regra em uma linha:** mudar `seatsTotal` **cria ou aposenta linhas na mesma transação** —
aumentar insere os assentos que faltam; diminuir marca `retiredAt` nos livres mais
recentes, e recusa com 409 se não houver livres suficientes.

### Etapa F — Chave, status, alertas e telas · **M**

A resposta carrega `productKeyMask` e `hasProductKey`, **nunca** a chave;
`GET /:id/product-key` decifra, responde e grava `ActivityLog` com `action: 'VIEW_KEY'`;
o status é função das datas e do dia de hoje (D44); o CSV sai **mascarado por padrão**.
`src/pages/licencas/` no padrão `font-mono text-xs`: listagem com `livres/total`, detalhe
com a grade de assentos (livre · pessoa · ativo · queimado), *revelar chave* com
confirmação, e o aviso de **queima** antes do checkin quando `reassignable = false`.

---

## Decisões da fase

### D39 — Assento de licença **não** vai para um posto

**Decidido:** o alvo do assento é `User` **XOR** `Asset`. `Location` não é alvo.
**Descartado:** acrescentar `assignedLocationId` para o caso real do posto com desktop fixo.

**Por quê — três argumentos, o terceiro é o que fecha:**

1. **Licença é consumida por uma instalação.** O fornecedor licencia *por dispositivo* ou
   *por usuário nomeado*; não existe EULA que licencie um móvel. Quando o auditor da
   Microsoft pergunta onde o assento está, "na Mesa 1" não é uma resposta que conte.
2. **A F7 quebraria.** A conformidade alimentada pelo software instalado é o join
   `LicenseSeat → Asset → Endpoint → SoftwareInstallation`. Um assento apontando para uma
   `Location` não tem caminho até uma instalação: seria um buraco exatamente no relatório
   que justifica o módulo.
3. **O caso do posto compartilhado já tem resposta, e a resposta é mais honesta.** O
   desktop fixo da Mesa 1 é um `Asset`: o assento vai **para o ativo**, a `Assignment`
   daquele ativo aponta para a `Location`, e os responsáveis saem da Camada 2. A cadeia
   inteira já existe — acrescentar `LOCATION` criaria um **segundo caminho** para o mesmo
   fato, que é o que este projeto recusa desde o D16.
   E se a licença for *por usuário nomeado*, então Laura e Ana precisam de **dois**
   assentos, não de um pendurado na mesa. Um assento no posto **esconderia** duas pessoas
   atrás de um móvel — que é precisamente a exposição de conformidade que o módulo deveria
   estar apontando. O modelo está certo em fazer esse custo aparecer.

**O que se perde, declarado:** contar "quantos assentos estão na Sala 3" exige o salto pelo
ativo (`seat → asset → assignment → location`). É um join a mais num relatório, contra uma
coluna que tornaria o dado ambíguo.

### D40 — Assento materializado, ocupação em tabela própria

**Decidido:** `LicenseSeat` é a linha do assento (existe mesmo vazio) e
`LicenseSeatCheckout` é a ocupação, aberta/fechada como toda posse do projeto.
**Descartado:** `assignedUserId`/`assignedAssetId` mutáveis **no próprio assento**, com um
log ao lado — que é o que o Snipe-IT faz.

**Por quê:** as colunas mutáveis guardam só o *agora*; o "quem pegou, quem devolveu" viraria
responsabilidade do log, e log e colunas divergem sem nada detectar — o mesmo par de
fontes de verdade que o D17 tirou do `assignedToId`. Com a ocupação em linhas, o histórico
é o próprio dado e `UPDATE` nunca apaga fato nenhum.

**Por que então materializar o assento, se a ocupação já é linha?** Porque é preciso ter
**o que travar**. Sem a linha do assento, "pegue um livre" é uma conta sobre um contador e
duas requisições simultâneas chegam ao mesmo número (D34, um andar acima). A linha existe
para ser bloqueada.

### D41 — `FOR UPDATE SKIP LOCKED`, e o preço dele

**Decidido:** a escolha do assento livre é `$queryRaw` com `FOR UPDATE OF s SKIP LOCKED`,
**dentro** de `$transaction`. **Descartado:** `isolationLevel: 'Serializable'` no Prisma.

**Por quê não o Serializable:** ele resolve, mas exige laço de repetição para o erro 40001
em toda operação de checkout, e serializa mais do que o necessário. `SKIP LOCKED` faz duas
requisições simultâneas pegarem assentos **diferentes** sem nenhuma esperar.

**O preço, declarado:** sob contenção alta, `SKIP LOCKED` pode devolver "sem assento livre"
mesmo havendo um assento cuja transação concorrente vai cair no rollback um instante
depois — um 409 falso e raro. A alternativa (`FOR UPDATE` sem skip) troca isso por fila:
todo mundo espera o primeiro. Para entrega de licença, falhar rápido e mandar tentar de
novo é melhor do que enfileirar requisições HTTP.

### D42 — Chave cifrada numa coluna versionada, sem plano B em claro

> ⚠️ **Reconciliado — ver [`DECISOES-RECONCILIACAO.md`](./DECISOES-RECONCILIACAO.md), D81.** O formato é `enc:v1:<kid>:<iv>:<tag>:<ct>`, com o identificador da chave e AAD amarrando o
> valor ao lugar onde ele mora — o mesmo da F9, num arquivo só (`core/crypto/cipher.ts`).

**Decidido:** AES-256-GCM, chave de 32 bytes em `APP_ENCRYPTION_KEY`, valor guardado como
`enc:v1:<kid>:<iv>:<tag>:<ct>` numa coluna só. **Descartado:** três colunas (`iv`, `tag`, `ct`) e
"se a chave não estiver configurada, grava em claro".

**Por quê uma coluna versionada:** três colunas precisariam de uma quarta no dia da rotação
de algoritmo — o prefixo já é essa quarta, e ele viaja junto com o dado.

**Por que sem plano B:** gravar em claro quando falta configuração é como o `/agent-hub`
aberto que a F0 fechou — o sistema funciona, ninguém percebe, e o segredo está no banco. Se
`APP_ENCRYPTION_KEY` não existir, **o campo de chave é recusado com 422** e a licença é
criada sem chave. Em produção o boot para, exatamente como já para sem `AGENT_TOKEN`.

**A chave nunca entra em `audited`.** O diff do `ActivityLog` grava valor antigo e novo em
`changes`; um `productKey` na lista de campos auditados publicaria o segredo em claro numa
tabela que ninguém pensa em proteger. O campo também entra no `core/logger/sanitize.ts`.

### D43 — `burnedAt` e `retiredAt` são fatos diferentes

**Decidido:** duas colunas nuláveis. `burnedAt` = devolvido numa licença
`reassignable = false`, e o assento **não volta** ao contrato; `retiredAt` = o contrato
encolheu e este assento não existe mais.

**Por quê não uma coluna só com motivo:** queima é **perda de dinheiro** ("compramos 50,
temos 43 utilizáveis") e aposentadoria é **mudança de contrato** — relatórios diferentes.
Empacotadas num enum, a primeira consulta que quiser só uma delas volta a separar por
string. `livres = seatsTotal − ocupados − queimados − aposentados`, sempre calculado.

### D44 — Status da licença é derivado, nunca coluna

**Decidido:** `ATIVA / VENCENDO / EXPIRADA / ENCERRADA` sai de um helper puro sobre
`terminationDate`, `expirationDate` e a data de hoje.

**Por quê:** o status muda **pela passagem do tempo**, sem ninguém escrever nada. Coluna
exigiria um job diário para continuar verdadeira, e no dia em que o job falhasse o
inventário mentiria sem sintoma. É o D16 aplicado ao tempo em vez de à posse.

---

## Riscos e armadilhas

**`$queryRaw` fora da transação é um lock de zero milissegundo.** Em autocommit o
`FOR UPDATE` é liberado no fim da própria instrução: o código parece certo, o teste com um
usuário passa, e a corrida continua aberta. O `SELECT` e o `INSERT` do checkout **têm** que
estar no mesmo `$transaction`.

**`FOR UPDATE` não se aplica ao lado nulável de um `LEFT JOIN` nem a agregação.** Montar a
busca do assento livre com `LEFT JOIN … GROUP BY` faz o Postgres recusar (*"FOR UPDATE
cannot be applied to the nullable side of an outer join"*). Daí o `NOT EXISTS` e o
`FOR UPDATE OF s` — travando explicitamente só a tabela dos assentos.

**Trocar `APP_ENCRYPTION_KEY` torna toda chave existente ilegível**, e a falha só aparece
na primeira tentativa de revelar. Defesa: um **canário** — um valor conhecido cifrado,
guardado no `AppSetting` e decifrado no boot. Chave trocada derruba o servidor com
mensagem clara, em vez de produzir um 500 semanas depois.

**O 409 genérico esconde o motivo.** O índice parcial de "uma ocupação aberta por assento"
levanta `P2002`, que o `error-handler` traduz para *"Registro já existe"* — inútil para
quem tentou entregar um assento. O use-case checa antes e lança `AppError` com a frase
certa; o índice continua sendo a rede, não a mensagem.

**Queimar assento é irreversível e acontece num clique de devolução.** Com
`reassignable = false`, o checkin destrói valor. A UI confirma com o número de assentos
que restarão, e o `ActivityLog` registra a queima como evento próprio.

**A chave vaza por três caminhos além da resposta:** o diff do `ActivityLog` (D42), o log
estruturado (`sanitize.ts`) e o export CSV da F10. Os três precisam ser fechados no mesmo
commit em que a coluna nasce — depois, ninguém lembra.

**`seatsTotal` e a contagem de linhas divergem se a reconciliação não for transacional.**
Atualizar a licença e inserir assentos em dois passos deixa a janela em que o relatório
mostra 50 comprados e 40 existentes.

**`Decimal` de `purchaseCost` continua saindo como string** — mesma armadilha nº 7 da F1.

---

## Verificação

```bash
API=http://localhost:3001
PSQL="docker exec -i sentinel-postgres psql -U sentinel -d sentineldb -t -A -c"
```

**1. O que o banco tem que garantir sozinho** — o XOR não passa nem pelo `psql`:

```bash
$PSQL "SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint
       WHERE conrelid='license_seat_checkouts'::regclass AND contype='c';"
# → license_seat_alvo_xor | CHECK ((num_nonnulls(...) = 1))
$PSQL "INSERT INTO license_seat_checkouts (id,\"seatId\",\"assignedUserId\",\"assignedAssetId\",\"checkoutAt\")
       VALUES (gen_random_uuid(),'$SEAT','$LAURA','$ATIVO',now());"
# → ERROR: violates check constraint "license_seat_alvo_xor"
```

**2. A corrida** — licença com 5 assentos, 8 checkouts simultâneos:

```bash
seq 8 | xargs -P8 -I{} curl -s -o /dev/null -w "%{http_code}\n" \
  -X POST $API/api/licenses/$LIC/checkout-seat -H 'Content-Type: application/json' \
  -d "{\"assignedAssetId\":\"$ATIVO\"}"
# → exatamente cinco 201 e três 409

$PSQL "SELECT COUNT(*) FROM license_seat_checkouts c JOIN license_seats s ON s.id=c.\"seatId\"
       WHERE s.\"licenseId\"='$LIC' AND c.\"checkinAt\" IS NULL;"                    # → 5
$PSQL "SELECT \"seatId\", COUNT(*) FROM license_seat_checkouts WHERE \"checkinAt\" IS NULL
       GROUP BY 1 HAVING COUNT(*) > 1;"                                              # → 0 linhas
```

**3. A chave está cifrada em repouso e mascarada na resposta:**

```bash
curl -s -X POST $API/api/licenses -H 'Content-Type: application/json' \
  -d '{"name":"Office 2024","seatsTotal":5,"categoryId":"'$CAT'","productKey":"AAAA-BBBB-CCCC-AB12"}'
curl -s "$API/api/licenses/$LIC" | jq '{productKey, productKeyMask, hasProductKey}'
# → {"productKey":null,"productKeyMask":"••••-••••-••••-AB12","hasProductKey":true}

$PSQL "SELECT left(\"productKey\",3) FROM licenses WHERE id='$LIC';"   # → v1:
$PSQL "SELECT \"productKey\" FROM licenses WHERE \"productKey\" LIKE '%AAAA%';"  # → 0 linhas

curl -s "$API/api/licenses/$LIC/product-key" | jq -r .productKey       # → AAAA-BBBB-CCCC-AB12
$PSQL "SELECT action FROM activity_logs WHERE \"entityId\"='$LIC' ORDER BY \"createdAt\" DESC LIMIT 1;"
# → VIEW_KEY
$PSQL "SELECT changes::text FROM activity_logs WHERE \"entityId\"='$LIC';" | grep -c AAAA   # → 0
```

**4. Sem `APP_ENCRYPTION_KEY` nada é gravado em claro:**

```bash
APP_ENCRYPTION_KEY= npm run dev:server   # produção: boot para. dev: sobe com aviso
curl -s -o /dev/null -w "%{http_code}\n" -X POST $API/api/licenses \
  -H 'Content-Type: application/json' -d '{"name":"X","seatsTotal":1,"categoryId":"'$CAT'","productKey":"K"}'
# → 422 (chave de criptografia não configurada) — nunca 201
```

**5. `reassignable = false` queima o assento na devolução:**

```bash
curl -s -X POST $API/api/licenses/seats/$SEAT/checkin
$PSQL "SELECT \"burnedAt\" IS NOT NULL FROM license_seats WHERE id='$SEAT';"   # → t
curl -s "$API/api/licenses/$LIC" | jq '{seatsTotal, livres, queimados}'        # → 5, 4, 1
```

**6. Reconciliação de `seatsTotal` e status derivado:** subir de 5 para 8 e conferir
`COUNT(*) = 8` em `license_seats`; baixar para 6 com 5 ocupados devolve 409; com 3
ocupados marca `retiredAt` em dois livres e mantém as linhas. Depois:
`expirationDate` daqui a 10 dias → `VENCENDO`; ontem → `EXPIRADA`; `terminationDate`
preenchida → `ENCERRADA` mesmo com vencimento futuro — e nenhuma coluna de status em
`\d licenses`.

---

## Commits, TODO e perguntas em aberto

Um commit por etapa (A→G); o lint passa em cada um. No `ITAM-TODO.md`: registrar
`D39`–`D44`; acrescentar ao item do checkout de assento que **posto não é alvo**, com
ponteiro para o D39; anotar que `core/crypto/` nasce aqui e é o mesmo que a F9 usa para
campo customizado cifrado; e mover **anexos de licença** para depender do upload que
nasce na F2 (hoje `@fastify/multipart` nem está instalado).

Fica em aberto, de propósito:

- **O `Assignment` não tem CHECK e o assento tem.** A coerência do alvo polimórfico da
  `Assignment` é validada só no use-case (comentário no `schema.prisma`), enquanto aqui o
  banco carrega a regra. A assimetria é defensável — lá são três FKs e um discriminante,
  aqui são duas colunas e uma linha de SQL — mas é assimetria. Decidir se o `Assignment`
  ganha o CHECK equivalente quando a F4 fechar.
- **`maintained` não tem efeito nesta fase.** Ele descreve contrato de manutenção/upgrade,
  e o efeito real ("tem direito à versão nova") é regra de compra, não de inventário. Fica
  como atributo informativo e filtro, até aparecer a pergunta que ele responde.
- **Licenciamento por núcleo/processador** (SQL Server, VMware) não cabe em "um assento =
  uma atribuição". Seria `seatUnits` por assento, ou outro tipo de licença. Fora da fase,
  mas é o primeiro caso real que quebraria o modelo — não construir nada que dificulte.
- **Chave por assento** (licenças OEM com key diferente por máquina) não existe aqui: a
  chave é da licença. Se aparecer, é `productKey` no `LicenseSeat` usando a mesma função
  de `core/crypto` — aditivo.
