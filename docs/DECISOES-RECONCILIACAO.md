# Decisões de reconciliação — D79 a D82

> Quatro conflitos **entre planos**, e as decisões que os fecham.
>
> Os onze planos de fase foram escritos em momentos diferentes, contra um código
> que ainda não existia. Quatro deles chegaram a decisões incompatíveis sobre a
> mesma coisa — e como cada um estava certo dentro do próprio arquivo, nenhuma
> revisão de fase isolada os pegaria.
>
> Eles moram aqui, e não no plano de uma fase, porque **nenhum dos quatro
> pertence a uma fase só**: cada um vale para as duas que o disputam. Os planos
> afetados ganham um ponteiro para cá, nunca uma cópia — é a regra do
> [`ITAM-TODO.md`](./ITAM-TODO.md): o texto de uma decisão mora em **um** lugar.

---

## D79 — Cada job tem a própria linha de execução. `lastAlertRunAt` não é coluna de `AppSetting`.

**O conflito.** A F4 (Etapa D, lembrete de atraso) e a F8 (D56, alertas diários)
fazem *compare-and-set* na **mesma** coluna `AppSetting.lastAlertRunAt`.

**O que aconteceria.** O job que acordasse primeiro no dia venceria o CAS e
gravaria a data. O segundo faria o mesmo `updateMany`, receberia `count: 0` — o
sinal de *"outra instância já rodou hoje"* — e **não executaria**. Todo dia. Sem
erro, sem log de falha: o segundo alerta simplesmente nunca sairia, e a
explicação estaria numa coluna com nome que não menciona nenhum dos dois jobs.

**Decidido:** uma tabela `JobRun`, uma **linha por job**, identificada pelo nome.

```prisma
model JobRun {
  name       String   @id          // 'lembrete-de-atraso', 'alertas-diarios', 'sync-ldap'
  lastRunAt  DateTime?
  updatedAt  DateTime @updatedAt
  @@map("job_runs")
}
```

O CAS passa a ser por linha, então um job nunca bloqueia o outro:

```ts
// server/core/jobs/claim-window.ts — infraestrutura, não conhece negócio.
const { count } = await prisma.jobRun.updateMany({
  where: { name, OR: [{ lastRunAt: null }, { lastRunAt: { lt: inicioDaJanela } }] },
  data: { lastRunAt: agora },
});
return count === 1;   // ganhou a janela
```

**Descartado:** uma coluna por job em `AppSetting`. Resolve o conflito de hoje e
reabre o mesmo no terceiro job, porque nada no nome da coluna impede a próxima
fase de reusar uma existente — que foi exatamente como este conflito nasceu.

**Onde mora:** o helper em `server/core/jobs/`, recebendo o nome do job por
parâmetro. É infraestrutura: não sabe o que é um alerta nem um atraso.

**Afeta:** [`FASE-4-PLANO-ITAM.md`](./FASE-4-PLANO-ITAM.md) (Etapa D) e
[`FASE-8-PLANO-ITAM.md`](./FASE-8-PLANO-ITAM.md) (D56). Quem nascer primeiro cria a tabela
e o helper; o segundo só acrescenta a linha com o próprio nome.

---

## D80 — Um `ApiToken` só, com dono polimórfico.

**O conflito.** A F3 (Etapa G) cria `ApiToken` com `endpointId` — o token **por
agente**. A F11 (Etapa F) cria `ApiToken` com `userId` — o token **pessoal**. Os
dois planos acham que criam *"o"* `ApiToken`.

**Decidido:** **uma** tabela, com uma coluna dizendo quem é o dono.

```prisma
enum ApiTokenOwner { AGENT  USER }

model ApiToken {
  id          String   @id @default(uuid()) @db.Uuid
  name        String
  ownerType   ApiTokenOwner
  userId      String?  @db.Uuid      // só quando ownerType = USER
  endpointId  String?  @db.Uuid      // só quando ownerType = AGENT — e NULO ATÉ O PRIMEIRO HANDSHAKE
  prefix      String   @unique
  tokenHash   String
  lastUsedAt  DateTime?
  revokedAt   DateTime?
  createdById String?  @db.Uuid
  @@map("api_tokens")
}
```

**Por que uma tabela:** o caminho de autenticação é **idêntico** nos dois casos —
procurar pelo prefixo, comparar o hash em tempo constante, conferir `revokedAt`,
carimbar `lastUsedAt`. Duas tabelas seriam duas cópias da parte mais sensível do
sistema, e a segunda esqueceria uma das quatro no primeiro ajuste.

**O detalhe que muda o desenho:** o token do agente é gerado **antes de a máquina
existir no sistema** — no momento em que o agente é instalado. Então
`endpointId` nasce **nulo** e é preenchido no primeiro handshake. A partir daí,
o mesmo token chegando de **outra** máquina é sinal de token copiado, e vira
alerta — não um `UPDATE` silencioso do vínculo.

**O CHECK que garante a coerência** (o Prisma não o expressa; vai à mão na
migration, como os índices parciais):

```sql
ALTER TABLE "api_tokens" ADD CONSTRAINT "api_tokens_dono_coerente" CHECK (
     ("ownerType" = 'USER'  AND "userId" IS NOT NULL AND "endpointId" IS NULL)
  OR ("ownerType" = 'AGENT' AND "userId" IS NULL)
);
```

Note que `AGENT` **não** exige `endpointId`: é justamente o estado de antes do
primeiro handshake.

**Afeta:** [`FASE-3-PLANO-ITAM.md`](./FASE-3-PLANO-ITAM.md) (Etapa G) e
[`FASE-11-PLANO-ITAM.md`](./FASE-11-PLANO-ITAM.md) (Etapa F). A F3 cria a tabela inteira,
com o enum e o CHECK; a F11 só acrescenta a tela e o caminho `USER`.

---

## D81 — Um arquivo e um formato de cifra, para os dois usos.

**O conflito.** A F6 usa `server/core/crypto/aes-gcm.ts` com `v1:iv:tag:ct`. A F9
usa `server/core/crypto/cipher.ts` com `enc:v1:iv:tag:ct`. Os dois planos dizem
"quem chegar primeiro cria" — e o que chegasse segundo encontraria um arquivo com
o nome errado e um formato incompatível, e provavelmente criaria o seu.

**Decidido:** `server/core/crypto/cipher.ts`, e o formato

```
enc:v1:<kid>:<iv>:<tag>:<ct>
```

Três escolhas, cada uma com um motivo:

**1. O prefixo `enc:` está SEMPRE presente**, inclusive onde não seria preciso. Na
F9 ele é obrigatório: dentro do mesmo `JsonB` convivem valores cifrados e valores
comuns, e sem marca não há como saber qual é qual. Na F6, numa coluna dedicada,
ele é redundante — e entra assim mesmo, porque **um formato só** significa uma
função de leitura só. Duas formas de ler o mesmo tipo de dado é a origem do
conflito que esta decisão fecha.

**2. O identificador da chave (`kid`) viaja dentro do valor**, ao lado da versão
do algoritmo. É o que permite **duas chaves ao mesmo tempo**: a nova cifra, as
antigas ainda decifram, e a rotação acontece aos poucos sem deixar nada ilegível
no meio. Sem o `kid`, rotacionar é reescrever todas as linhas numa janela — e o
que falhar no meio fica sem volta.

**3. O valor é amarrado ao LUGAR onde mora**, por AAD (*additional authenticated
data*): `"<tabela>:<coluna>:<id da linha>"`. Sem isso, quem tem acesso ao banco
copia a chave cifrada de uma licença para outra e o sistema a **revela como
legítima** — a cifra continua válida, porque nada nela diz de onde veio.

> **O preço do item 3, e ele é real:** o `id` da linha entra na cifra, então
> precisa ser gerado **pela aplicação antes do INSERT**, não pelo
> `@default(uuid())` do banco. É uma linha a mais no use-case de criação, e é
> barato perto de um segredo que se deixa mover entre registros.

**O canário é um só**, decifrado no boot com **cada** chave configurada. Chave
errada no ambiente derruba o boot — em vez de o sistema subir e só descobrir na
primeira leitura, com um erro de decifragem no meio de uma tela.

**Afeta:** [`FASE-6-PLANO-ITAM.md`](./FASE-6-PLANO-ITAM.md) (D42 — o formato ali descrito,
`v1:iv:tag:ct`, é **substituído** por este) e
[`FASE-9-PLANO-ITAM.md`](./FASE-9-PLANO-ITAM.md) (D62).

---

## D82 — `terminate` não existe. A F11 **estende** o `offboard`.

**O conflito.** O `offboard` da F4 (D32) e o `terminate` da F11 (Etapa D) são a
mesma operação, escrita duas vezes: as duas fecham posses e ocupações.

**O que aconteceria.** Duas rotas fazendo a mesma coisa divergem, e a que divergir
vai esquecer **o mesmo passo**: encerrar as ocupações de posto. É o passo que não
dá erro quando falta — a responsabilidade do posto é **derivada**
([`MODELO-POSSE.md`](./MODELO-POSSE.md), Camada 3), então um desligado continua
aparecendo como responsável por tudo que está na Mesa 1, meses depois, e nenhuma
consulta acusa. É o bug mais perigoso do modelo, e duas rotas é a forma mais fácil
de criá-lo.

**Decidido:** **uma** rota e **um** use-case — `POST /api/users/:id/offboard`,
`server/domain/user/use-cases/offboard-user.usecase.ts` — que **cresce** a cada
fase em vez de ganhar um irmão.

| Fase | O que o `offboard` passa a fazer |
|---|---|
| **F4** *(feito)* | devolve as posses diretas, encerra as ocupações de posto, marca `terminatedAt` + `isActive = false`, registra tudo no `ActivityLog` |
| **F11** | acrescenta a **guarda do substituto** para quem é gestor, e a **revogação de sessões e `ApiToken`s** (D80) |

A Etapa D da F11 deixa de ser *"criar o desligamento"* e passa a ser
**"estender o desligamento"**.

> **Nota de estado.** O `offboard` da F4 **já grava** `terminatedAt` e
> `isActive` — a F11 não precisa acrescentá-los, só o que está na linha dela
> acima. O plano da F11 descreve o passo 4 como se a coluna ainda não existisse.

**Afeta:** [`FASE-11-PLANO-ITAM.md`](./FASE-11-PLANO-ITAM.md) (Etapa D e o passo 4 do
D74). A F4 não muda.
