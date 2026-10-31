# Decisões de plataforma

> Infraestrutura que não é de nenhum domínio: migração, arquivo, correio, job e cifra. É o `core/` em forma de decisão.
>
> **A regra desta pasta:** decisão escrita aqui **não se reescreve**. Se a realidade mudou, a
> decisão é **superada** por outra, com link entre as duas — é o log que diz por quanto tempo
> cada regra governou. O índice das 164 está em [`README.md`](./README.md).
>
> Decisões neste arquivo: D4, D6, D79, D81, D83–D84, D86, e L/M da segunda rodada (ver
> [`README.md`](./README.md#a-segunda-rodada-ap)).
> A execução que as aplicou está em [`../historico/`](../historico/).

---

## D4 — `Company` / Full Multiple Companies Support: descartado

Uma empresa só. FMCS obriga filtro por `companyId` em toda query do Prisma — caro e fácil de
furar. A hierarquia de `Location` resolve o que precisamos hoje.

> **Superada em parte pela localização plana (commit `ff34364`):** a `Location` deixou de ter
> hierarquia — sem `parentId` nem gestor, o nome único diz onde o lugar fica. O descarte do FMCS
> não dependia dela: uma empresa só continua sendo o escopo.

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

> **Enquanto não há produção, a receita é outra:** as migrations foram fundidas numa `0_init`
> só (`798a3aa`, depois `904af4e`), e mudança de schema edita essa migration no lugar, com o
> banco de desenvolvimento alinhado à mão — ver
> [`../guias/criar-uma-migration.md`](../guias/criar-uma-migration.md). O `--from-url` +
> `migrate deploy` volta no dia em que houver um banco de verdade; o **nunca** `migrate dev`
> não mudou.

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

> **Superada por [G](./licencas.md#g--software-instalado-e-conformidade-de-licença-saem-licença-vira-cadastro-simples):** os dois usos saíram — os campos customizados com o D145, a chave
> de produto com G. Não há mais cifra no projeto.

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

> **Superada pelo [segundo de-escopo](./escopo.md#o--o-segundo-de-escopo-o-que-a-primeira-rodada-manteve-ou-não-enxergou-sai):**
> o correio saiu inteiro, inclusive o lembrete de atraso que esta decisão defendia como o único
> e-mail que não podia se perder. Não sobrou e-mail nenhum para aplicar a régua.

---

## L — O teto de requisições é desligado em `NODE_ENV=test`, com guarda contra produção

**Decidido:** `@fastify/rate-limit` não é registrado quando `NODE_ENV=test`. A decisão vira
função pura (`tetoDeRequisicaoLigado`), afirmada por teste — e um teste dedicado prova que
produção **não sobe** com o teto desligado.

**Por quê:** o teto conta por IP e em memória, e a suíte inteira roda do mesmo IP. Sem desligar,
qualquer arquivo de teste que disparasse mais de uma rajada de escritas tomava 429 da própria
suíte — não do sistema sob teste. A alternativa de subir o teto só para o ambiente de teste
resolveria o 429, mas pararia de testar o que o teto faz; desligar e testar a corrida à parte
(`tests/corridas/`) separa as duas perguntas.

**Por quê a guarda, e não só o `if`:** um `if (NODE_ENV !== 'test')` sem teste é o tipo de linha
que alguém lê e confia; a função pura dedicada é afirmada por teste a cada execução, e a
dedicada existe para que produção subir com o teto desligado seja uma regressão que a suíte pega
antes do deploy, não depois de um ataque.

**O que motivou a mudança física do arquivo:** `computador-por-posto-trocas.test.ts` voltou para
o arquivo da invariante de onde tinha sido separado — a divisão original era pelo teto
destrutivo de dez escritas por instância do harness, não pelo assunto; com o teto desligado em
teste, a divisão por teto deixou de fazer sentido.

---

## M — Um lockfile só, o do `bun`

**Decidido:** `package-lock.json` sai. `bun.lock` é a única fonte de verdade, regenerado do
`package.json` atual.

**Por quê:** o README já manda rodar `bun install`, e nenhum CI, Dockerfile ou doc citava
`npm ci` — o `package-lock.json` não tinha leitor, só existia. **E o que ficou não era
inofensivo:** o `bun.lock` que sobreviveria estava desatualizado desde agosto e descrevia OUTRO
projeto — tinha dependências de gráfico (`d3`, `clsx`, `es-toolkit`) que este projeto não usa e
não tinha `argon2` nem os plugins do Fastify que ele usa agora. Um lockfile que ninguém lê
diverge em silêncio; dois lockfiles divergentes é pior, porque cada um sugere ser a verdade para
quem olhar primeiro.

**Como foi provado, e não só regenerado:** `node_modules` foi reinstalado do zero a partir só do
`bun.lock` novo, para provar que ele basta sozinho — idempotente, sem o `nodemailer` que a
limpeza do segundo de-escopo tinha tirado do `package.json` voltar por reinstalação. `tsc` nos
três projetos, `eslint`, build e a suíte inteira verdes na árvore resultante.

## AQ — As pastas levam o nome do que guardam

**Decidido:** `server/core` vira `server/infra`; `server/domain` vira `server/modules`. No front,
`src/core/api` vira `src/api`; `src/domain/<nome>/<nome>.queries.ts` vira
`src/queries/<nome>.queries.ts`; os dois `*.store.ts` vão para `src/stores/`;
`src/domain/shared/*.types.ts` vira `src/types/`; e o que as páginas compartilhavam dentro de
`src/pages/` — `components/`, `helpers/`, `hooks/` — sobe para `src/components/`, `src/helpers/` e
`src/hooks/`. A arquitetura não muda: continua `modules → infra` no servidor e
`pages → queries → api` no front, e o lint continua a recusar o import que sobe a seta.

**Por quê:** `core` não dizia o que havia dentro (infraestrutura), e `domain` dizia a coisa errada
no front, onde a pasta guardava o acesso à API e não regra de negócio. `src/core/api` eram três
níveis para dois arquivos; `src/domain/<nome>/`, uma pasta por arquivo; e o que as páginas
compartilhavam morava dentro de `pages/`, indistinguível de uma página na listagem. A comparação
foi com o ModuloDefault, o template da organização, com a pergunta do que ficaria "realmente
melhor": o desenho aproveita de lá os nomes convencionais e descritivos num nível só (`api`,
`types`, `components`, `hooks`) e **não** a separação por camada do servidor (`routes/` +
`services/`), porque a fatia vertical por assunto é o que mantém cada módulo inteiro numa pasta.

**O que não se reescreve:** `docs/decisoes/` e `docs/historico/` citam os nomes antigos, como manda
a regra das pastas; a tradução está em
[`../referencia/arquitetura.md`](../referencia/arquitetura.md). Nos 292 arquivos movidos os
imports foram reescritos por resolução (cada import apontado ao arquivo de destino e recalculado
da posição nova), com `git mv` para o histórico seguir o arquivo.

---

## AS — O Swagger: a API inteira navegável, só fora de produção

**Decidido** (em 2026-10-30, "uma coisa boa é adicionar o Swagger, ele é muito bom"):

- **`/api/docs`** abre a interface do Swagger com todas as rotas, o corpo de cada uma e o cookie de
  sessão como esquema de segurança. Existe **só fora de produção**: o contrato é a planta da API e
  em produção não tem leitor. Debaixo de `/api` para o proxy do Vite alcançá-lo
  (`http://localhost:3000/api/docs` no `bun run dev`).
- **O corpo é o schema Zod que o controller já valida**, convertido (`z.toJSONSchema`), e não uma
  segunda descrição. O Fastify não lê o contrato para validar nada: o `transform` do `@fastify/swagger`
  só reescreve o que o Swagger *mostra*, e quem recusa o corpo inválido continua sendo o `parse` do
  controller, com o 422 de sempre. Nenhum maestro de rota mudou.
- **O contrato é uma tabela por rota** (`server/modules/api-docs/helpers/contrato-das-rotas.ts`), na
  mesma chave do mapa de permissões. `tests/invariantes/contrato-da-api.test.ts` reprova rota nova
  sem linha (e linha de rota que saiu), então a documentação não envelhece em silêncio.
- **As rotas do Swagger são públicas fora de produção** (`ROTAS_PUBLICAS` em `server/app.ts`,
  acrescentadas só quando `!isProduction`); em produção o plugin nem é registrado.

**O que o Swagger não faz, de propósito:** descrever o *corpo da resposta*. O que a API devolve é a
forma que o Prisma e os `select` produzem, sem schema Zod por trás; descrevê-la exigiria um schema de
resposta por rota, em mais de cem lugares, para a documentação divergir do código no primeiro `select` novo.
Lista, status de sucesso e os erros de cada rota (todos `{ error }`) estão lá.

**Por quê:** o ModuloDefault expõe o contrato OpenAPI com a interface do Swagger, e foi a peça que o
usuário quis trazer. Para quem escreve código (humano ou agente), é a API inteira num lugar só, em
vez de 14 maestros mais os controllers.

---

## AT — O que veio do ModuloDefault, e o que ficou de fora

**Decidido** (em 2026-10-30, depois de ler o ModuloDefault inteiro — servidor, front, ferramentas e
repositório — contra este, com o critério do usuário: *coisas simples que fazem diferença, boas
tecnologias e boas práticas, não mais funcionalidades*):

**Veio:**
- o `CLAUDE.md`, as skills `migration` e `dominio-novo`, a regra de lint contra cor fixa, o `bun run
  check` e o E2E com Playwright (a rodada anterior);
- a **trava do login que recomeça do zero ao vencer** — o contador seguia em 5 e o primeiro erro depois
  do desbloqueio travava de novo, a cada erro, até alguém acertar (bug);
- o **`tv` obrigatório** na sessão: a tolerância ao token sem o campo era do dia do deploy e já tinha
  vencido (8 horas), então virou ramo morto;
- o **`NODE_ENV` validado** contra `development | production | test` (ausente vale): um erro de
  digitação desligava em silêncio o cookie `Secure` e a recusa do segredo fraco;
- testes que faltavam: os atributos do cookie, o 401 idêntico para senha errada e e-mail inexistente,
  cookie adulterado e token vencido, e o 500 que não vaza a mensagem;
- a **CI** (`.github/workflows/ci.yml`, a cada push na `main`, com o Postgres na 3002), o
  `packageManager` do bun, o `forbidOnly` do Playwright, o `.editorconfig` e as linhas do `.gitignore`
  para a configuração pessoal do Claude Code;
- o `retry` do TanStack Query que **não repete 4xx** (a recusa chega na hora);
- a [senha temporária e Minha conta](./acesso.md#ar--a-senha-temporária-e-minha-conta-voltam) (AR) e o
  [Swagger](#as--o-swagger-a-api-inteira-navegável-só-fora-de-produção) (AS);
- numa segunda leitura (2026-10-31), o que nenhuma das duas listas tinha: o **erro de tela capturado**
  (`src/components/ErroDaTela.tsx`; sem ele, um erro de renderização deixava a tela branca, sem menu),
  o **endereço que não existe voltando para a raiz** (a moldura abria vazia) e o **`no-store` em toda a
  `/api`** (`server/infra/http/sem-cache.ts`), não só nas rotas de credencial;
- a pedido, da lista de funcionalidades: o **olho no campo de senha** (`src/components/CampoDeSenha.tsx`),
  o **título da aba por tela** (`useTituloDaAba`; o nome saiu do cabeçalho, onde repetia o da página) e,
  do log, os **endereços da API e do Swagger no bloco do back**, no formato do Vite, com os avisos do
  ambiente logo depois. Ficaram de fora: login só com o nome (não precisa), último acesso, aviso único
  de servidor fora do ar e o estado da lista na URL (agora não).

**Não veio, e não volta sem decisão nova:**
- **Problem Details (RFC 9457), caminhos em camelCase sem verbo, `/api/v1` e `{ data, meta }`:** trocariam
  o `{ error, refs }` em 27 arquivos de teste e 74 rotas sem nenhuma tela ler os campos novos. O
  vocabulário `checkout`/`checkin`/`retire` é o do Snipe-IT, a referência do sistema. O `/v1` serve a
  cliente externo que não atualiza junto: o painel vem no mesmo build e o agente fala pelo `/agent-hub`.
- **O erro por campo (`errors[]`)** contradiz a [Q](./escopo.md#q--a-varredura-do-código-morto-o-que-não-tem-leitor-sai):
  o `fields` saiu por não ter leitor. Só volta se os formulários passarem a marcar o campo errado.
- **O Prettier:** reformataria 291 arquivos e quebraria o `git blame`, num código que já é consistente
  (aspas simples em 414 de 414 arquivos com import).
- **release-please, templates de issue e de PR:** o commit é direto na `main`, com `feat:` e `chore:`, e a
  versão é `0.0.0` e privada.
- **O shadcn/ui inteiro:** seria reescrever 15 modais, as tabelas e as notificações (que já fazem mais:
  cartão com link para a recusa).
- **Spectral:** com o Swagger só de leitura, não há contrato de resposta para ele checar.
- **Estado da lista na URL, barra de progresso e tema claro:** funcionalidade, e o pedido foi por prática
  e não por função. (A troca obrigatória no primeiro login, a volta à página depois do login e o título
  da aba vieram depois, a pedido: [AU](./acesso.md#au--ninguém-escolhe-a-senha-de-outra-pessoa) e a lista abaixo.) O mesmo vale para o diálogo próprio no lugar do `confirm()`.
- **O bcrypt e o teto de 72 bytes, o cache longo de `/assets` e o banner do servidor:** aqui é argon2id; o
  `@fastify/static` já manda `max-age=0` com ETag e não há carregamento sob demanda; o banner é aparência.
- **O Dockerfile**, até haver destino de produção: não há onde rodar, e o do ModuloDefault faz o bundle de
  outro servidor.
- **Pendente de decisão, não recusado:** a acessibilidade dos modais (Esc, foco, `role="dialog"`: 15 modais
  montam o próprio fundo e só 2 têm o papel) e o `htmlFor` dos rótulos. Ficam para a refeita do visual.

