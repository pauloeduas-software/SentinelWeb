# Decisões de plataforma

> Infraestrutura que não é de nenhum domínio: migração, arquivo, correio, job e cifra. É o `core/` em forma de decisão.
>
> **A regra desta pasta:** decisão escrita aqui **não se reescreve**. Se a realidade mudou, a
> decisão é **superada** por outra, com link entre as duas — é o log que diz por quanto tempo
> cada regra governou. O índice das 164 está em [`README.md`](./README.md).
>
> Decisões neste arquivo: D4, D6, D79, D81, D83–D84, D86.
> A execução que as aplicou está em [`../historico/`](../historico/).

---

## D4 — `Company` / Full Multiple Companies Support: descartado

Uma empresa só. FMCS obriga filtro por `companyId` em toda query do Prisma — caro e fácil de
furar. A hierarquia de `Location` resolve o que precisamos hoje.

---

## D6 — Baselinar as migrations antes de tocar em qualquer coluna — e NÃO com `migrate dev`

**✅ FEITO na F0.**
O schema tinha sido aplicado com `db push` e a tabela `_prisma_migrations` não existia, então
`prisma migrate dev` detectaria drift e **ofereceria resetar o banco**. O estado atual foi
adotado como migração inicial:

```bash
mkdir -p prisma/migrations/0_init
bunx prisma migrate diff --from-empty --to-schema-datamodel prisma/schema.prisma --script \
  > prisma/migrations/0_init/migration.sql
bunx prisma migrate resolve --applied 0_init
```

A receita ficou fixada para sempre: `migrate diff --from-url` + `migrate deploy`, **nunca**
`migrate dev` (é interativo e falha neste ambiente).

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

**Afeta:** [`../historico/fase-04-posse.md`](../historico/fase-04-posse.md) (Etapa D) e
[`../historico/fase-08-ciclo-de-vida.md`](../historico/fase-08-ciclo-de-vida.md) (D56). Quem nascer primeiro cria a tabela
e o helper; o segundo só acrescenta a linha com o próprio nome.

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

**Afeta:** [`../historico/fase-06-licencas.md`](../historico/fase-06-licencas.md) (D42 — o formato ali descrito,
`v1:iv:tag:ct`, é **substituído** por este) e
[`../historico/fase-09-campos-customizados.md`](../historico/fase-09-campos-customizados.md) (D62).

---

## D83 — O armazenamento é `core/storage/`; a linha é do domínio.

**Decidido:** gravar bytes, derivar nome seguro e apagar arquivo moram em
`server/core/storage/`. O model `Attachment` e as regras sobre ele moram em
`server/domain/attachment/`.
**Descartado:** `domain/attachment/helpers/storage.helper.ts`, como a Etapa G previa.
**Por quê:** quando a Etapa G foi escrita, anexo de ativo era o único cliente. O aceite da F4
acrescenta dois que **não são anexos de ativo** — a imagem da assinatura e o PDF do termo, que
pertencem a `Acceptance`. Com o helper dentro de `attachment/`, o domínio `acceptance`
importaria de outro domínio para gravar um arquivo; e `domain → domain` não é uma seta que o
[`../referencia/arquitetura.md`](../referencia/arquitetura.md) desenha. Guardar bytes é infraestrutura: não sabe o que é
um anexo, um termo nem um ativo.

---

## D84 — Anexo não é rota estática. Ele sai por `/api/`, com sessão.

**Decidido:** `GET /api/attachments/:id/download` lê a linha, confere a sessão e transmite o
arquivo. `UPLOAD_DIR` fica **fora** de qualquer raiz do `@fastify/static`.
**Descartado:** `@fastify/static` numa segunda raiz servindo `/uploads/*`, que é o que a Etapa
G mandava fazer.
**Por quê:** esta fase foi planejada **antes** da porta fechada da F3, e a regra dela é

```ts
if (estaticoPublico && request.method === 'GET' && !path.startsWith('/api')) return;
```

`estaticoPublico` é `isProduction`. Um `GET /uploads/<uuid>.pdf` **não** começa com `/api` —
então, em produção e só em produção, **toda nota fiscal, todo contrato, toda assinatura e todo
termo assinado seriam legíveis sem sessão**, por quem adivinhasse ou vazasse o caminho. Em
desenvolvimento nada disso aparece, porque lá quem serve o estático é o Vite: é um furo que só
existe onde dói.

**Descartado também: acrescentar `/uploads/*` à `ROTAS_PUBLICAS`** — seria escrever o furo à
mão. E **descartado: inverter o `estaticoPublico`** para uma allowlist de caminhos estáticos;
ele está certo para o que faz (o bundle do painel é código público), e o que está errado é
pendurar arquivo privado nele.

**O preço, e ele é real:** servir por rota custa uma consulta e um `stream` por download,
contra um `sendFile` direto. Para nota fiscal e termo assinado, num sistema interno, é barato —
e é o único desenho em que a resposta a *"quem pode ler este arquivo?"* não depende de
`NODE_ENV`.

---

## D86 — E-mail é *best-effort* com log. O que não pode se perder tem linha em tabela.

**Decidido:** o envio acontece depois do commit; a falha é registrada em `warn` com
destinatário e motivo, e **não** é retentada na hora.
**Descartado:** tabela de *outbox* com job de reenvio.
**Por quê:** dos quatro e-mails, dois já têm estado durável e um relatório que os persegue — o
aceite pendente aparece em `GET /api/acceptances?view=pendentes` e tem `remindedAt`; o atraso é
recalculado pelo job todo dia. Os outros dois (aviso de entrega e de devolução) são cortesia:
perder um numa queda de SMTP não deixa o inventário errado.

**O preço, dito com todas as letras:** um aviso de entrega perdido numa indisponibilidade de
SMTP está perdido, e ninguém é notificado disso além do log. Um *outbox* custaria uma tabela, um
job e uma política de retentativa para proteger a mensagem **menos** importante das quatro.
Quando houver um e-mail cuja perda quebre um processo, ele nasce com linha em tabela — como o
aceite nasceu.
