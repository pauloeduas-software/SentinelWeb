# Decisões de plataforma

> Infraestrutura que não é de nenhum domínio: migração, arquivo, correio, job e cifra. É o `server/infra/` em forma de decisão.
>
> **A regra desta pasta:** decisão escrita aqui **não se reescreve**. Se a realidade mudou, a
> decisão é **superada** por outra, com link entre as duas — é o log que diz por quanto tempo
> cada regra governou. As supersessões estão em [`README.md`](./README.md).
>
> Decisões neste arquivo: D4, D6, D79, D81, D83–D84, D86, e L/M da segunda rodada (ver
> [`README.md`](./README.md#a-segunda-rodada-ap)).

---

## D4 — `Company` / Full Multiple Companies Support: descartado

Uma empresa só. FMCS obriga filtro por `companyId` em toda query do Prisma — caro e fácil de
furar. A hierarquia de `Location` resolve o que precisamos hoje.

> **Superada em parte pela localização plana (commit `ff34364`):** a `Location` deixou de ter
> hierarquia — sem `parentId` nem gestor, o nome único diz onde o lugar fica. O descarte do FMCS
> não dependia dela: uma empresa só continua sendo o escopo.

---

## D6 — Baselinar as migrations antes de tocar em qualquer coluna — e NÃO com `migrate dev`

**✅ FEITO.**
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

**O conflito.** O lembrete de atraso e os alertas diários (D56)
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
reabre o mesmo no terceiro job, porque nada no nome da coluna impede o próximo
job de reusar uma existente — que foi exatamente como este conflito nasceu.

**Onde mora:** o helper em `server/core/jobs/`, recebendo o nome do job por
parâmetro. É infraestrutura: não sabe o que é um alerta nem um atraso.

**Afeta:** o D56. Quem nascer primeiro cria a tabela
e o helper; o segundo só acrescenta a linha com o próprio nome.

---

## D81 — Um arquivo e um formato de cifra, para os dois usos.

> **Superada por [G](./licencas.md#g--software-instalado-e-conformidade-de-licença-saem-licença-vira-cadastro-simples):** os dois usos saíram — os campos customizados com o D145, a chave
> de produto com G. Não há mais cifra no projeto.

**O conflito.** O D42 usa `server/core/crypto/aes-gcm.ts` com `v1:iv:tag:ct`. O D62
usa `server/core/crypto/cipher.ts` com `enc:v1:iv:tag:ct`. Os dois dizem
"quem chegar primeiro cria" — e o que chegasse segundo encontraria um arquivo com
o nome errado e um formato incompatível, e provavelmente criaria o seu.

**Decidido:** `server/core/crypto/cipher.ts`, e o formato

```
enc:v1:<kid>:<iv>:<tag>:<ct>
```

Três escolhas, cada uma com um motivo:

**1. O prefixo `enc:` está SEMPRE presente**, inclusive onde não seria preciso. No
D62 ele é obrigatório: dentro do mesmo `JsonB` convivem valores cifrados e valores
comuns, e sem marca não há como saber qual é qual. No D42, numa coluna dedicada,
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

**Afeta:** o D42 (o formato ali descrito,
`v1:iv:tag:ct`, é **substituído** por este) e
o D62.

---

## D83 — O armazenamento é `core/storage/`; a linha é do domínio.

**Decidido:** gravar bytes, derivar nome seguro e apagar arquivo moram em
`server/core/storage/`. O model `Attachment` e as regras sobre ele moram em
`server/domain/attachment/`.
**Descartado:** `domain/attachment/helpers/storage.helper.ts`.
**Por quê:** anexo de ativo era o único cliente, e o aceite
acrescenta dois que **não são anexos de ativo** — a imagem da assinatura e o PDF do termo, que
pertencem a `Acceptance`. Com o helper dentro de `attachment/`, o domínio `acceptance`
importaria de outro domínio para gravar um arquivo; e `domain → domain` não é uma seta que o
[`../referencia/arquitetura.md`](../referencia/arquitetura.md) desenha. Guardar bytes é infraestrutura: não sabe o que é
um anexo, um termo nem um ativo.

---

## D84 — Anexo não é rota estática. Ele sai por `/api/`, com sessão.

**Decidido:** `GET /api/attachments/:id/download` lê a linha, confere a sessão e transmite o
arquivo. `UPLOAD_DIR` fica **fora** de qualquer raiz do `@fastify/static`.
**Descartado:** `@fastify/static` numa segunda raiz servindo `/uploads/*`.
**Por quê:** a regra da porta fechada é

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

> **Superada por [O](./escopo.md#o--o-segundo-de-escopo-o-que-a-primeira-rodada-manteve-ou-não-enxergou-sai):** o segundo de-escopo: a régua do D143, aplicada sem a folga da primeira rodada.

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

**O que não se reescreve:** `docs/decisoes/` cita os nomes antigos, como manda
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

> **Superada em parte por [AY](#ay--o-visual-vem-da-intranet-em-tema-claro-e-escuro-e-a-linha-inteira-abre-o-registro):** a linha inteira abre o registro e as ações vão para o `⋯`; a situação pode ter cor; primitivos do shadcn só no que se usa, e tema claro e escuro; `GET /api/search` sai.

> **Superada em parte por [BA](#ba--o-título-volta-ao-cabeçalho-a-lista-não-se-mexe-e-o-posto-tem-ficha-em-página):** o título da página volta ao cabeçalho, e a lista de Postos guarda o estado na URL.
>
> **Superada em parte por [AZ](#az--configurações-explica-no-formulário-e-a-página-fica-sem-subtítulo):** a aba de Configurações mora no endereço; busca, filtro e página continuam fora da URL.

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

## AY — O visual vem da IntraNet, em tema claro e escuro, e a linha inteira abre o registro

> **Superada em parte por [BK](#bk--estoque-e-licenças-têm-ficha-em-página):** item e licença também têm ficha em página, e a janela de detalhe sai.
>
> **Superada em parte por [BH](#bh--o-texto-tem-piso-de-12px-e-cor-de-texto-e-cor-de-fundo-são-tokens-separados):** a densidade compacta fica no espaçamento, e o texto tem escala própria.
>
> **Superada em parte por [BA](#ba--o-título-volta-ao-cabeçalho-a-lista-não-se-mexe-e-o-posto-tem-ficha-em-página):** o título da página volta ao cabeçalho, e o posto tem ficha em página.
>
> **Superada em parte por [AZ](#az--configurações-explica-no-formulário-e-a-página-fica-sem-subtítulo):** a página fica sem subtítulo.

**Decisão.** O visual do painel foi refeito a partir da IntraNet (`/home/penta/IntraNet`): paleta azulada,
Inter sem caixa alta, cantos arredondados, densidade compacta no desktop, menu lateral com seções que
recolhem, menu do usuário no cabeçalho, e tema claro ou escuro: na primeira entrada vale o do sistema, e
depois o que ficou gravado. As regras de negócio não mudaram.

- **Clique na linha.** A linha inteira abre o registro: o detalhe, a ficha ou, no cadastro sem detalhe, o
  Editar. As ações moram no `⋯` (`AcoesDaLinha`), na ordem de sempre: Editar, Desativar/Ativar e Excluir. Isto
  corrige o "ao passar o mouse" de AF, AN e AO. Excluir continua sempre clicando, e quem recusa é o 409.
- **Um lugar para cada coisa.** Formulário é painel lateral (`FormularioLateral`), detalhe é janela com abas
  (`JanelaDeDetalhe`), e o que não tem volta pergunta pelo `confirmar()` (`hooks/useConfirmacao`) no lugar do
  `confirm()` do navegador. Os três ganham foco preso, Esc e `role` de graça do Radix, e o `Campo` liga o
  rótulo ao controle: é a pendência de acessibilidade que a AT deixou para esta refeita.
- **shadcn só no que se usa.** Em `src/components/ui/` estão os primitivos que as telas pedem, não os 54 da
  IntraNet. A AT recusou o shadcn **inteiro** por custar a reescrita dos modais; com ela feita, sobrou o
  ganho. O `<select>` do navegador saiu pelo `Seletor`, que busca na lista.
- **Cor em situação.** Corrige "sem cor por dado": ativo, desativado, vencida, online e offline podem ter
  cor, sempre pelos tokens `status-*`, com `Badge`, `PontoDeStatus` ou `Aviso`. Nome, categoria e tipo de
  evento continuam sem cor.
- **Texto na tela.** Subtítulo de uma linha. A regra mora na ajuda do campo em que a dúvida aparece.
- **Sem busca no cabeçalho.** Não há leitor de código de barras em uso: o campo "Bipe" saiu, e com ele
  `GET /api/search`. Consequência: o computador num posto não está na lista de Computadores, e agora se acha
  pelo posto.
- **A marca é a torre sem fundo, com uma arte para cada tema** (`torre-sem-fundo-light` e `-dark`). Sai o escudo.
  A arte original some na barra escura, e clarear ou contornar por CSS estoura a paleta: a versão de cada tema é
  um arquivo próprio, não um efeito. O favicon é o alto da torre (`torre-topo-light` e `-dark`): inteira ela é fina e
  detalhada demais para 16px, e fundo claro não entra. Ele acompanha o tema do painel, como a marca.
- **Campo vazio some do detalhe** (`Dado`): uma coluna de "—" parecia ficha quebrada, e o Editar mostra o
  que falta.

**O que ficou de fora.** Cards de números no topo das listas (função nova, e a contagem já está na barra),
seleção em lote e exportar (O), foto de perfil, a marca da IntraNet e o esconder de todas as barras de
rolagem, que deixaria a tabela larga sem sinal de que rola.

**Tokens.** Os nomes continuam os de antes (`bg-bg-base`, `text-text-primary`), agora com um valor por tema
em `src/index.css`, mais `primary`, `accent`, `surface-muted` e `sidebar`. O lint segue recusando cor fixa.

## AZ — Configurações explica no formulário, e a página fica sem subtítulo

> **Superada em parte por [BB](#bb--toda-lista-ficha-e-formulário-seguem-o-mesmo-molde):** busca, filtro e página moram na URL em toda lista.

**Decisão.** A revisão visual de Configurações tirou o texto do topo das páginas e levou a explicação para onde a
dúvida aparece. As regras de negócio não mudaram.

- **Página sem subtítulo.** Supera o "subtítulo de uma linha" da AY: ele repetia o que o formulário já dizia, e
  Computadores e Postos sempre viveram sem. Saiu de todas as páginas, e o `PaginaCabecalho` nem tem mais o campo. O
  dado que estava ali mora na própria tela: o modelo na aba Detalhes, o e-mail no menu do usuário. A linha da
  `JanelaDeDetalhe` fica, porque diz a situação do registro.
- **Os tipos à vista.** Categoria e Status escolhem o tipo numa lista com a explicação de cada opção
  (`OpcoesDescritas`). Comparar pedia selecionar um por um, e a regra de quem pode ser entregue ficava escondida.
- **Coluna "Em uso".** As cinco abas mostram o número da recusa do `DELETE`, pelo mesmo `countUsages`, com a lixeira
  incluída. Com uso, o formulário trava o Tipo e diz por quê; a guarda do servidor continua, e o Excluir segue
  clicando. O Snipe-IT mostra a contagem nas cinco listas; no GLPI isso não foi conferido. Colaboradores fica de
  fora: a contagem dele carrega a posse inteira, e a ficha já diz o que está com a pessoa.
- **A aba no endereço** (`?aba=modelos`). Revê, só nesse ponto, o "estado da lista na URL (agora não)" da AT: sem
  ela, o F5 voltava para Categorias e o link de Computadores não tinha como cair em Modelos. Busca, filtro e página
  ficam fora da URL: Postos os põe lá porque a ficha é outra página, e aqui nada sai da tela.
- **A barra da lista não anda.** Com uma página só, as setas e o `1 / 1` somem, mas guardam o lugar: o `ListToolbar`
  usa `invisible`, porque tirar da árvore faria a busca e o botão andarem ao filtrar. Por isso a contagem não encosta
  na direita: trocá-la de lugar com as setas faria elas andarem a cada página.
- **A ordem das abas** é a de cadastro: Categorias, Fabricantes, Modelos, Localizações e Status, que já nasce semeado.
- **Tela estreita.** Abaixo de `lg` as abas viram `Seletor`, e abaixo de `xl` o filtro de tipo também: cortadas, as
  opções sumiam sem aviso, e o filtro em duas linhas deixava a tabela mais baixa que nas outras abas. `soNoDesktop`
  esconde as colunas que não cabem, e o resto continua a um toque na linha.

**O que ficou de fora.** A recusa dizendo o quê em vez de quantos (`motivoParaNaoExcluir` já existe, e a coluna
resolve boa parte), trocar coluna ou campo de lugar e mover o botão de Estoque, Licenças e Usuários (pedido do
usuário: não mover nada).

## BA — O título volta ao cabeçalho, a lista não se mexe e o posto tem ficha em página

> **Superada em parte por [BK](#bk--estoque-e-licenças-têm-ficha-em-página):** item e licença deixam a janela, e o que a BA deixou de fora está feito.
>
> **Superada em parte por [BB](#bb--toda-lista-ficha-e-formulário-seguem-o-mesmo-molde):** na página não sobra ação nenhuma no topo, e os filtros de toda lista moram na URL.

**Decisão.** Os ajustes feitos olhando as telas depois da AY. As regras de negócio não mudaram.

- **O título da página fica no cabeçalho.** Corrige a AT, que o tirou de lá, e a AY, que deixou só o menu do usuário.
  A `PaginaCabecalho` o desenha por portal (`useVagaDoTitulo`), com a seta de voltar na ficha. Na página sobra a ação.
- **Cartões de contagem.** Computadores e Postos abrem com um cartão por situação, e o número filtra
  (`CartoesDeContagem`). Cada um usa o mesmo `where` da lista que ele abre.
- **Sem seletor de colunas.** A lista de Computadores tem colunas fixas: o menu Colunas saiu, com a preferência
  guardada no navegador.
- **As colunas não se mexem.** A tabela é `table-fixed` no primitivo (`ui/table`): filtrar, paginar ou esvaziar a lista
  não desloca nada. A largura vem do cabeçalho, em `%` para acompanhar a tela, e em `rem` só no que tem tamanho certo
  (valor, data, o `⋯`). O aviso de lista vazia fica debaixo do cabeçalho (`TableVazia`), e Restaurar mora no `⋯`,
  porque a coluna é a mesma na lixeira.
- **O posto tem ficha em página.** Corrige o "detalhe é janela com abas" da AY: item e licença continuam em janela, e
  computador, colaborador e posto têm ficha em página. A janela existia para não perder a lista, então o recorte, a
  página e a busca de Postos moram na URL, e a seta da ficha volta com eles. Revê, só nesse ponto, o "estado da lista
  na URL (agora não)" da AT.

**O que ficou de fora.** Guardar na URL os filtros de Computadores, que ainda se perdem ao voltar da ficha, e levar
Estoque e Licenças para ficha em página.

## BB — Toda lista, ficha e formulário seguem o mesmo molde

**Decisão.** A revisão página por página achou a mesma coisa feita de jeitos diferentes: linha entre 45 e 57px, 10, 15
ou 25 itens por página, quatro formas de filtrar, dois desenhos de aba e três larguras de formulário. Agora é um molde
só. As regras de negócio não mudaram, e a única rota nova é a contagem de licenças.

- **O cabeçalho só tem o título e o voltar.** Corrige o "na página sobra a ação" da BA, que deixava o botão sozinho numa
  linha, com a tabela mais baixa em cada tela. O botão da lista fica no fim do `ListToolbar`, depois da paginação; o da
  ficha, dentro do card de cima (`CartaoDaFicha`).
- **A ordem da lista:** cartões, vistas (`VistasDaLista`), barra (`ListToolbar`) e tabela. Cartão só onde há situação
  para contar: Computadores, Postos e Licenças.
- **A linha tem 48px no desktop** (`TableRow`), com no máximo duas linhas de texto (`TableLinha`, `TableSublinha`). O que
  não cabe termina em `…`, com o texto inteiro no `title`.
- **A coluna da situação** existe em toda lista que tem situação, com a mesma largura e o `PontoDeStatus`. Desativado e
  encerrado ficam esmaecidos (`apagada`). Estoque e Colaboradores ganharam a coluna, Situação como em Postos e Usuários.
  Computadores e Licenças continuam dizendo Status, como o formulário e a aba de Configurações, que está fechada.
- **Filtro:** situação é cartão, categoria e tipo são `FiltroDaLista`, vista é `VistasDaLista`. Em Licenças, os cartões
  substituem o filtro de status e os links do alerta, com a contagem em `GET /api/licenses/stats`.
- **Tudo na URL** (`useListaNaUrl`): página, busca, situação, categoria, vista, tipo e aba. Supera o "busca, filtro e
  página ficam fora da URL" da AZ e o que a BA deixou de fora: a seta da ficha (`useVoltaComFiltros`) e o F5 trazem a
  lista como estava. O menu lateral recomeça a lista limpa.
- **15 por página** (`POR_PAGINA`) em toda lista e janela. Descobertas ganhou busca e paginação nas quatro abas, no
  navegador (`usePaginaLocal`), porque as rotas dela devolvem tudo.
- **Um desenho de aba:** sublinhada, com ícone e a contagem em `ContagemDaAba`. Nas fichas e em Descobertas, a aba mora
  em `?aba=` (`useAbaNaUrl`).
- **A ficha:** `CartaoDaFicha` em cima, com as ações, e as abas embaixo, com `TabelaDaFicha`. `FichaIndisponivel` cobre
  carregando e erro sem tirar o título. O colaborador deixou o card lateral e leva o nome no título.
- **O formulário** tem uma largura só. O título é ação e tipo ("Entregar ativo"), e a descrição diz qual registro. O envio
  é Salvar no cadastro e o verbo na operação (Entregar, Devolver, Dar baixa, Adicionar, Vincular). O campo livre é sempre
  Notas, e quem recebe é sempre Colaborador ou Ativo.
- **A edição na linha** põe Cancelar antes de Confirmar, e Esc desfaz só ela: a janela continua aberta.
- **Um histórico só** (`LinhaDoTempo`) em ficha e janela, e um vazio só fora de tabela (`CartaoVazio`).
- **Ficha e janela falam como a lista.** A licença entregue tem Vencimento e Situação, as abas do computador têm contagem
  e terminam no Histórico, e a primeira aba é sempre Detalhes.
- **15 por página também na ficha.** A aba que chega inteira mostra 15 de cada vez (`BarraDaFicha`), e o histórico do
  computador e do colaborador vem por página do servidor, sem o corte nos 100 mais recentes.
- **Toda ação da ficha do computador fica no card:** Entregar ou Devolver, Editar e, no `⋯`, Clonar, Dar baixa ou Reverter
  baixa, e Excluir. Nenhuma aba repete botão.
- **A confirmação tem três níveis.** Sem volta: pergunta e botão vermelho (Excluir, Reverter baixa). Com volta: pergunta sem
  vermelho (Desativar, Encerrar, Desvincular). Rotina: sem pergunta (Editar, Entregar).
- **Descobertas guarda a busca e a página na URL**, e a seta da ficha aberta de lá volta para lá.
- **A consulta que falha não diz "nenhum".** Aba e histórico mostram o erro, e cartão e contagem de aba mostram `—` ou
  nada, nunca 0: "este ativo nunca foi entregue" é uma afirmação, e só a resposta do servidor a sustenta. É a regra que o
  `EstadoDaLista` já dava às listas, levada ao que tinha ficado de fora.

**O que ficou de fora.** Cartões em Estoque, Usuários e Colaboradores, que não têm situação para contar além de ativo e
desativado, e Editar, Desativar e Excluir na ficha do colaborador, que continuam na lista: a tela está fechada, e a ação
na ficha é função nova.

## BC — O que foi feito e quando fica no `git log`, não em `docs/`

`docs/` também guardava o plano e o fechamento de cada rodada de trabalho: 7.681 das 18.315 linhas, e boa parte falava do
que o corte tirou (campo customizado, importação, LDAP, OIDC e segundo fator). Quem procurava um termo recebia, junto com
o que vale, a receita de um sistema que já mudou. O que importava já estava em `decisoes/`.

- **Sobram três zonas:** `referencia/`, `guias/` e `decisoes/`. O texto removido continua no git, no commit `7ad4590`.
- **Texto e comentário citam a decisão ou a referência,** nunca um plano ou uma etapa dele. Quando o destino da citação
  deixou de existir, ela saiu junto, inclusive em `decisoes/`: é a exceção à regra de não reescrever.
- **A decisão superada diz isso logo abaixo do título,** para quem cair nela pela busca. A tabela de supersessões do
  `decisoes/README.md` continua sendo a lista inteira.
- **Sai a lista de títulos do `decisoes/README.md`:** ela repetia os arquivos, e cada decisão nova pedia mais uma linha. Um
  `grep` acha qualquer decisão pelo título. Ficam os assuntos e as supersessões.
- **`tests/invariantes/links-da-documentacao.test.ts` reprova** o link quebrado, a âncora sem título e o `docs/*.md`
  inexistente citado em comentário de código.

## BF — A resposta a um clique vai para o cartão do canto inferior direito

> **Superada em parte por [BK](#bk--estoque-e-licenças-têm-ficha-em-página):** o link que não abre deixa de ir para o cartão: sem janela, é falha ao carregar, no lugar da ficha.

**Decisão.** A mesma recusa aparecia em três lugares: no cartão do alto, numa faixa no topo da tela e num texto ao lado do
botão. Quem clicava no fim de uma lista comprida às vezes nem via a faixa, e nada dizia que a ação tinha dado certo. Agora a
resposta a um clique tem um lugar só: o cartão de `useNotificacao`, no canto inferior direito, como no IntraChat.

- **Vão para o cartão:** a recusa de Descobertas, de Ocupantes e do Devolver na ficha do posto, o retorno do comando da
  máquina, o link que não abre e o placar do Reconciliar agora, este em azul (`info`), porque não é sucesso nem falha.
- **Toda ação que grava confirma no cartão,** com o que aconteceu: `Licença entregue.`, `Fabricante excluído.`. Ficam de fora
  o cadastro de conta e a senha temporária, que mostram a senha no painel aberto, e a troca obrigatória de senha, que já leva
  ao sistema.
- **A resposta nova tira a anterior.** Fica um cartão por vez, para o erro de uma tentativa não ficar ao lado do sucesso da
  seguinte. Só o cartão com link se acumula, porque espera alguém fechar.
- **O cartão sai da frente do painel.** Quem já estava na tela quando o formulário abre vai para o lado dele no desktop, e para
  o alto onde ao lado não cabe (`com-painel`). Ali ele cobre o título e o X do painel, nunca Cancelar e Salvar.
- **O cartão espera quem está lendo.** O prazo para com o mouse em cima, com o foco dentro dele e com a página fora de vista,
  e recomeça inteiro ao soltar. O tempo maior do erro longo continua: é o que vale no celular, onde nada pausa.
- **A região fica sempre na página,** vazia quando não há cartão. O leitor de tela só anuncia o que muda numa região que já
  existia, e o `aria-live` é o que a mantém ao alcance dele com um painel aberto.
- **Copiar confirma no próprio botão,** por dois segundos, e a falha vai para o cartão (`useCopiar`).
- **Ficam onde estavam:** a recusa de formulário, a falha ao carregar (BB), a situação que continua valendo (posto vago,
  prazo, fora do patrimônio), o balão do campo e a pergunta do `confirmar()`.
- **A regra:** o que responde a um clique e pode sumir é cartão; o que precisa continuar à vista fica na tela.

**Por quê a direita embaixo:** é o padrão escrito do IntraChat e o padrão do GLPI. O IntraNet tem dois sistemas, um em cima e
outro embaixo.

**Por quê pausar:** todo sistema comparado com cartão que some pausa: GLPI e NetBox pelo Bootstrap, iTop pelo `stopOnFocus`,
Shelf.nu pelo Radix e o IntraChat pelo Sonner. O Snipe-IT nem tem o problema: a faixa fica até alguém fechar. A página fora de
vista vem do Sonner: quem troca de aba não perde a resposta.

**Por quê copiar no botão:** é o que fazem GLPI, Snipe-IT, iTop e Carbon, e copiar não muda nada no sistema: é o retorno de
um gesto, e cabe em quem foi clicado.

**Descartado: a recusa de formulário no cartão.** O Salvar do `FormularioLateral` mora no mesmo canto, e o cartão o cobriria
justo quando a recusa pede para corrigir e salvar de novo. Dentro do painel ela fica à vista.

## BG — Clicar fora fecha o formulário, e pergunta antes se a pessoa mexeu em algo

**Decisão.** O `FormularioLateral` não fechava com o clique fora, para não perder o que foi digitado. Quem só abriu para olhar
ficava preso a Cancelar ou Salvar, e a proteção tinha um furo: Esc e o X descartavam tudo sem perguntar. Agora clicar fora, Esc
e o X seguem o mesmo caminho.

- **Sem alteração, fecha na hora.** Com alteração, pergunta `Descartar as alterações?`, com Continuar editando e Descartar. O
  botão sai no vermelho porque não tem volta, como pede a regra da pergunta em [`telas.md`](../referencia/telas.md).
- **Cancelar fecha direto.** Ele já é a decisão de descartar, e perguntar pediria a mesma resposta duas vezes.
- **Conta a pessoa ter mexido, não o valor diferente do inicial.** Comparar pediria a cada formulário que entregasse os seus
  valores ao painel. O custo é pequeno: quem digita e apaga de volta vê a pergunta.
- **A senha temporária pergunta sempre** (`perguntaAoSair`), mesmo sem alteração, porque aparece uma vez só.
- **Não contam como clique fora:** o que fecha o seletor aberto, o cartão de notificação (BF) e o clique enquanto salva.

**Por quê perguntar só com alteração:** é o padrão de diálogo do hyperscript, que passa Esc, X e clique fora pela mesma checagem.
A Cloudscape, da AWS, também confirma sempre que há alteração não salva, e usuários do Enonic XP reclamaram de perder
configurações ao clicar no fundo escuro. GLPI e Snipe-IT não foram conferidos.

**Descartado: perguntar também no Cancelar,** como faz a Cloudscape.

## BH — O texto tem piso de 12px, e cor de texto e cor de fundo são tokens separados

**Decisão.** Os 80% da densidade da IntraNet encolhem tudo que é em `rem`, e o texto ia junto: a tabela saía com 11,2px e a
segunda linha com 9,6px. No desktop o texto agora tem escala própria em `src/index.css`: `text-xs` 12px, `text-sm` 13px,
`text-base` 14px, `text-lg` 16px e `text-xl` 18px. O espaçamento continua nos 80%, e a linha da tabela nos 48px (BB).

- **Cor de texto e cor de fundo não dividem token.** O azul e o vermelho que aguentam texto branco por cima somem como
  texto no card escuro. `link` e `status-danger` são lidos sobre o card; `primary` e `destructive` levam texto branco. Link é
  `text-link`, e o botão de perigo é `bg-destructive`.
- **Todo texto passa de 4,5:1 nos dois temas**, o piso AA da WCAG. A marca fica de fora, como a WCAG deixa logotipo de fora.
- **O véu é token** (`bg-veu`), e o lint passou a recusar `black` e `white`, que a lista da paleta não pegava.

**Por quê 12px:** é o menor tamanho do Carbon (IBM), do Primer (GitHub) e do Horizon (ServiceNow), e o corpo de texto fica em
14px neles, no Ant Design e no Tabler, que é a base do GLPI. O 80% não é uma escolha de tipografia: é a IntraNet encolhendo a
tela inteira, e ela tem os mesmos 9,6px. Por isso o piso entra aqui, e o resto da densidade fica como veio de lá.

**Por quê tokens separados:** é como o Primer faz, com `fgColor.danger` para texto e `bgColor.danger.emphasis` para fundo.

**Descartado: voltar a raiz para 100%.** Devolveria o texto, mas levaria junto a densidade que a AY escolheu.

## BK — Estoque e Licenças têm ficha em página

**Decisão.** O item de estoque e a licença saem da janela e ganham ficha em página, em `/estoque/:id` e `/licencas/:id`,
no molde do posto. Todo registro abre do mesmo jeito: detalhe é página, formulário é painel lateral e a pergunta é
`confirmar()`. As regras de negócio não mudaram, e nenhuma rota de API é nova. A lista continua como estava.

- **Os campos sobem para o card, e a aba Detalhes sai.** O card mostra a situação, a conta e o cadastro; o `Dado` esconde
  o vazio. Sem a aba, o item com dois campos não vira uma página em branco.
- **Com quem está é a primeira aba.** É onde mora a devolução, e é para lá que vão todos os links. Com a aba inicial sempre
  a mesma, o link só precisa do `?quem=`, que é a própria busca da aba e fica no endereço, como a da lista (BB). O consumível
  fica só com Histórico, porque não fica com ninguém (AJ).
- **Chaves é aba, só com chave.** A lista pode ser longa, e no card empurraria as abas para baixo.
- **O link antigo redireciona.** `/estoque?item=<id>&quem=…` e `/licencas?licenca=<id>` levam à ficha, com a busca.
- **A seta volta para quem abriu.** A `TabelaDaFicha` passa `useVoltaParaEstaFicha` em toda linha, como a BJ pede, e o nome
  na seta vem de `rotuloDaVolta`. Vale também para o computador e o posto abertos da ficha do colaborador.
- **O registro que não abre diz no lugar da ficha.** Corrige o "link que não abre" da BF, que ia para o cartão: sem janela, é
  a falha ao carregar da BB, e o id fica no endereço para o F5 tentar de novo. `useRecusaDoLink` sai.
- **A atualização que falha não tira a ficha da tela.** Só o 404 tira (`erroDaFicha`). Valia só para o posto; agora vale para
  as cinco fichas, e o formulário aberto não se perde quando a volta para a aba falha.
- **Lista e ficha dividem as ações.** Editar, Entregar, Desativar ou Encerrar e Excluir moram em `useAcoesDoItem` e
  `useAcoesDaLicenca`, com as mesmas frases nos dois lugares.

**Por quê:** a janela existia para não perder a lista (BA), e a BB pôs o estado de toda lista na URL. Sobrou só o custo: quem
vinha de uma ficha para devolver caía na lista ao fechar, o F5 fechava a janela, não havia link para colar no chamado, e o
código reabria a janela depois de Entregar e Editar. No Snipe-IT, acessório, consumível, componente e licença têm página
própria, e o modal fica para a ação pequena. No GLPI, licença e consumível são formulário com abas. A Nielsen Norman Group
recomenda evitar modal quando a pessoa precisa consultar outra informação: ele interrompe e cobre o que está atrás.

**O que ficou de fora.** "Com quem está" continua lista com a devolução na linha, e não `Card > Table`.
