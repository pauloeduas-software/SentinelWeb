# Roadmap do ITAM

> **O que falta, e o que cada fase entregou.** Nasceu como levantamento do que o Snipe-IT tem e o
> SentinelWeb não tinha — auditoria de 9 domínios contra o código real, 179 itens analisados, 175
> gaps confirmados — e hoje é o placar: **as onze fases estão fechadas**, e o único item em aberto
> é o anexo de licença (D94).
>
> Este arquivo é o **checklist**: uma linha por item, com o que de fato entrou. A narrativa de
> cada fase — o plano, a revisão e o fechamento — está em [`historico/`](./historico/); as regras
> que saíram de lá, em [`decisoes/`](./decisoes/).
>
> Legenda de esforço: **P** = até meio dia · **M** = 1 a 3 dias · **G** = mais de 3 dias
> Estado: `[ ]` a fazer · `🔄` **em implementação agora**, ainda não verificado ·
> `[x]` feito e verificado

---

## As decisões

As 142 decisões de arquitetura do projeto **não moram mais aqui** — elas estão em
[`decisoes/`](./decisoes/), uma pasta por assunto, com o índice completo em
[`decisoes/README.md`](./decisoes/README.md). Este arquivo voltou a ser o que o nome diz: o que
falta fazer.

A regra: decisão se arquiva **pelo assunto que governa**, não pela fase que a tomou nem pelo
documento que a descobriu. As D1–D17, que viviam nesta página por extenso, estão em
[`decisoes/catalogo-e-ativo.md`](./decisoes/catalogo-e-ativo.md),
[`decisoes/posse.md`](./decisoes/posse.md),
[`decisoes/plataforma.md`](./decisoes/plataforma.md) e
[`decisoes/campos-customizados.md`](./decisoes/campos-customizados.md).

**O Snipe-IT é referência, não autoridade.** Onde ele já resolveu, copiamos a solução (D1–D13).
Onde ele não modela o problema — e a posse compartilhada por posto de trabalho é o primeiro caso
— o caminho é nosso, e está em [`referencia/modelo-de-posse.md`](./referencia/modelo-de-posse.md)
(o contrato) e [`decisoes/posse.md`](./decisoes/posse.md) (o porquê, D14–D17).

## A janela — o que ela já pagou e o que ainda protege

Verificado em 22/09/2026, antes da F0: **as 5 tabelas estavam com zero linhas** e não existia
`_prisma_migrations`. Era o momento em que qualquer decisão estrutural custava um `migrate diff`.

**A F0, a F1 e o modelo de posse foram feitos dentro dessa janela**, e foi ela que pagou por:
matar o `Folder`, apagar `inventory_items` e criar `assets` na forma certa (D12), tornar
`categoryId` e `statusId` obrigatórios sem backfill, acrescentar `IN_USE` ao enum mexendo em
uma linha, e decidir a cardinalidade da posse **antes** de existir uma `Assignment` para migrar.

**A F5 entrou dentro dela também**, e foi a última: as seis tabelas de estoque nasceram vazias, na
forma certa, sem nenhum backfill — o que só foi possível porque `inventory_items` tinha sido
apagada na F1 em vez de migrada (D12).

**O que ela ainda protege:** a carga inicial de ativos. Com o D17, equipamento que já está com
alguém entra **pelo checkout**, não pelo formulário — fazer a carga antes da F4 significaria
recadastrar a posse depois. A F4 está pronta, então essa janela está aberta agora.

---

## Fase 0 — Base técnica ✅ CONCLUÍDA

Nada aqui é funcionalidade visível, mas todo o resto depende disso.
Execução detalhada em [`historico/fase-00-base-tecnica.md`](historico/fase-00-base-tecnica.md).

- [x] **P** ~~Migration baseline via `migrate diff` + `migrate resolve --applied`~~ — feito (`0_init`). **Nota:** `migrate dev` é interativo e falha neste ambiente; usar `migrate diff --from-url $DATABASE_URL --to-schema-datamodel` + `migrate deploy` para cada migração nova
- [x] **P** ~~Scripts de banco no `package.json`~~ — feito: `db:seed` + bloco `"prisma": { "seed": "tsx prisma/seed.ts" }` (Prisma 5.22 lê daí; `prisma.config.ts` só existe da 6.x)
- [x] **P** ~~`prisma/seed.ts`~~ — encanamento feito (idempotente, só `upsert`, reusa o cliente do servidor). O conteúdo entrou na F1
- [x] **M** ~~Validação de payload com `zod`~~ — feito: `zod@4`, schemas em `server/domain/<x>/schemas/`, `strictObject` em tudo. Os controllers só chamam `.parse()` e a rejeição cai no errorHandler
- [x] **P** ~~Envelope de erro/sucesso único~~ — feito: `server/core/errors/` com `AppError`, `setErrorHandler`, `ZodError`→422, `P2002`→409, `P2025`→404, `P2003`→409, 429 do rate limit
- [x] **P** ~~Base URL da API configurável~~ — feito: `src/core/api/apiClient.ts`
- [x] **P** ~~Portas por variável de ambiente~~ — feito: `FRONT_PORT=3000`, `PORT=3001`, `POSTGRES_PORT=3002`
- [x] **M** ~~Paginação server-side com envelope `{ total, rows }`~~ — feito nas três listagens, com `$transaction` para contagem e página saírem do mesmo instante
- [x] **P** ~~Ordenação por coluna com allowlist~~ — feito: `server/core/http/list-query.ts` **recebe** a allowlist por parâmetro (core não pode importar domain); cada domínio declara a sua em `helpers/*-filters.helper.ts`
- [x] **M** ~~Busca e filtros no servidor~~ — feito: `buildAssetWhere` / `buildUserWhere` / `buildEndpointWhere`, `contains` + `mode:'insensitive'`
- [x] **P** ~~Endpoint de contadores~~ — feito: hoje `GET /api/assets/stats` (nasceu como `/api/inventory/stats` e moveu no rename do D1), agregação fora do skip/take
- [x] **M** ~~Soft delete + lixeira + restaurar~~ — feito: escopo automático por Prisma Client Extension (`core/database/soft-delete.extension.ts`), que descobre os models pelo DMMF; `?view=trashed` é opt-in por domínio; aba Lixeira nas duas telas. **`User.email` virou índice único PARCIAL** (`WHERE deleted_at IS NULL`) — com `@unique` comum, um usuário na lixeira travaria o recadastro do mesmo e-mail. A extension exporta `INCLUINDO_LIXEIRA` para as contagens que precisam enxergar a lixeira (D8)
- [x] **M** ~~`ActivityLog`~~ — feito: CREATE/UPDATE/DELETE/RESTORE com diff em `changes Json`, gravado na mesma transação da operação. `actorId` nulável, esperando a F3. O `buildChanges` compara os valores **já normalizados**, senão `Decimal` marca mudança a cada edição
- [x] **P** ~~Response schema (`select` explícito) e fim do `BigInt.prototype.toJSON` global~~ — feito: allowlist única por domínio (`USER_PUBLIC_SELECT`, `ASSET_SELECT`) aplicada em listagem, criação e edição; BigInt resolvido em `present-endpoint.helper.ts`
- [x] **M** ~~Rate limiting + CORS fechado + token do agente~~ — feito: `@fastify/rate-limit` (300/min global, 40/min escrita, 10/min comando RMM), CORS recusa `*`, e o `/agent-hub` exige `Authorization: Bearer $AGENT_TOKEN` com comparação em tempo constante. **`ApiToken` por agente (prefixo, hash, revogação) continua na F3** — o segredo compartilhado é o que tira a porta aberta do ar até lá

## Fase 1 — Catálogo e o ativo do ITAM ✅ CONCLUÍDA

No Snipe-IT isso é o menu *Settings* mais a tabela de ativos. É o que transforma
texto livre em dado. Execução, provas e a **auditoria linha a linha das F0 e F1** (5 defeitos, todos
corrigidos) em [`historico/fase-01-catalogo-e-ativo.md`](historico/fase-01-catalogo-e-ativo.md).

> **A fronteira F1/F2 mudou durante a execução.** A base de ITAM anterior era
> descartável, então o `Asset` nasceu **inteiro** aqui em vez de magro na F1 e
> completo na F2 — coluna que nasce com a tabela custa zero, acrescentada depois
> custa migração e backfill. A F2 fica com o que é funcionalidade SOBRE o ativo.

- [x] **M** ~~`Category` com `type` (ASSET / ACCESSORY / CONSUMABLE / COMPONENT / LICENSE), cor, `requireAcceptance`, `eulaText`, `checkinEmail`~~ — feito
- [x] **M** ~~`StatusLabel` com `type`, cor, `showInNav`~~ — feito, com **cinco** tipos: `DEPLOYABLE / IN_USE / PENDING / ARCHIVED / UNDEPLOYABLE` (o `IN_USE` entrou na auditoria — ver D5). Seed com 8 rótulos: Pronto p/ Uso · Em Uso · Aguardando · Em Diagnóstico · Manutenção · Danificado · Perdido / Roubado · Arquivado
- [x] **G** ~~`Manufacturer` + `AssetModel` (catálogo de modelos com `modelNumber`, `eolMonths`)~~ — feito. **Imagem foi para a F2** (precisa do upload que nasce lá) e **fieldset para a F9** (`CustomFieldset` só existe lá)
- [x] **M** ~~`Supplier` (fornecedor com contato, endereço, site)~~ — feito. O `GET /api/suppliers/:id/assets` virou filtro da listagem de ativos
- [x] **M** ~~`Location` hierárquica (`parentId` self-relation, endereço, gestor, telefone) — nasce do zero, o `Folder` já foi removido (D2)~~ — feito, com guarda de ciclo em `beforeWrite` (o banco **não** impede ciclo — provado)
- [x] **P** ~~Apagar o model `Folder`, as rotas `/api/folders` e a sidebar de pastas~~ — feito
- [x] **M** ~~`Depreciation` (nome, meses, `floorValue`, `floorType` PERCENT|AMOUNT)~~ — feito, com `PERCENT ≤ 100` validado sobre o estado final
- [x] **M** ~~Telas de administração do catálogo — `src/pages/configuracoes/` com uma aba por tabela, no mesmo padrão `font-mono text-xs` do `ItamPage`~~ — feito

---

## Fase 2 — Ativos: o que se faz com eles ✅ CONCLUÍDA

O modelo do ativo nasceu na F1 (ver nota acima). O que resta aqui é
funcionalidade sobre ele: tela de detalhe, histórico, ações em massa, imagens,
anexos, arquivamento e descomissionamento.
Execução detalhada em [`historico/fase-02-ativos.md`](historico/fase-02-ativos.md).

- [x] **G** Renomear `InventoryItem` → `Asset` e `Asset` → `Endpoint` (D1); remover `quantity` (D3) — **feito na F1** (Etapa G)
- [x] **M** **Asset tag** única com prefixo, zerofill e auto-incremento — `nextAssetTag()` faz `update({ data: { assetTagNext: { increment: 1 } } })` **primeiro** e usa o valor retornado; ler-e-depois-incrementar colide em READ COMMITTED. `GET /api/settings/next-asset-tag` é *peek* puro e nunca incrementa, senão abrir e cancelar o modal fura a sequência — **feito na F1** (Etapa G)
- [x] **P** **Número de série** único + `GET /api/assets/by-serial/:serial` — **feito na F1** (Etapa G)
- [x] **P** Unicidade de `assetTag` e `serial` por **índice parcial** em SQL na migration (`WHERE deleted_at IS NULL`), não por `@unique` — senão um item na lixeira impede recadastrar a mesma etiqueta. É o `unique_undeleted` do Snipe-IT — **feito na F1** (Etapa G)
- [x] **P** Nome do ativo, notas, `byod`, `requestable` — **feito na F1** (Etapa G)
- [x] **M** Dados de compra: `supplierId`, `orderNumber`, `purchaseDate`, `purchaseCost Decimal @db.Decimal(12,2)` — **Decimal, nunca Float** — **feito na F1** (Etapa G)
- [x] **P** Garantia em meses + `warrantyExpiresAt` calculada no save — **feito na F1** (Etapa G)
- [x] **P** EOL: `eolMonths` no modelo, `eolDate` calculada, `eolExplicit` para override manual — **feito na F1** (Etapa G)
- [x] **M** `Asset.statusId` obrigatório apontando para `StatusLabel`; status vira consequência do checkout, não campo digitado — **feito na F1** (Etapa G)
- [x] **M** Soft delete com lixeira e restauração (herda F0) — **feito na F1** (Etapa G)
- [x] **M** ~~**Tela de detalhe do ativo** (`/ativos/:id`, `/itam/assets/:id` até a F6) com sete abas~~ — feito na F2 ([`historico/fase-02-ativos.md`](historico/fase-02-ativos.md)). As sete nascem juntas: Detalhes, Posse, Histórico e Arquivos com conteúdo; Componentes (F5), Licenças (F6) e Manutenções (F8) desabilitadas dizendo em que fase chegam — aba ausente e aba vazia são indistinguíveis de defeito.
- [x] **M** ~~**Aba Posse** — os responsáveis resolvidos no topo e o histórico de `Assignment` abaixo~~ — feito na F2. É a tela que prova o modelo: quem abre um mouse da Mesa 1 lê "Laura (Manhã), Ana (Tarde)" sem nenhum campo digitado.
- [x] **M** ~~Aba **Histórico** do ativo, lendo o `ActivityLog`~~ — feito na F2, sem tabela `AssetLog` (D18). `GET /api/assets/:id/history` une o log e a posse numa lista só.
- [x] **P** ~~Arquivar ativo (status `type = ARCHIVED` sai das listagens por padrão; `?view=archived`)~~ — feito na Leva 1D do fechamento da F2 ([`historico/fase-02-ativos.md`](historico/fase-02-ativos.md), D85). A vista padrão passou a excluir `ARCHIVED` junto com `retiredAt`, e `?statusId=` explícito vence a exclusão — senão clicar no contador de um status arquivado abriria lista vazia. **A invariante estado × posse continua valendo e já existia** (D16; [`referencia/invariantes.md`](referencia/invariantes.md)): ativo com responsável resolvido **não pode** ir para `ARCHIVED` — arquivar é declarar que saiu da operação, e o que está com alguém não saiu. O 409 diz com quem está, não só que falhou. A devolução (checkin) é o pré-requisito, e é a mesma regra que impede `DEPLOYABLE` com detentor. O que faltava era só a VISTA.
- [x] **P** ~~**Relatório "ativos em posto vago"**~~ — feito na F2: `?relatorio=posto-vago`, filtro do Prisma e nunca `.filter()` depois da consulta (senão o `total` do envelope mentiria).
- [x] **G** ~~Ações em massa: editar N, trocar status, mover de localização, excluir, checkout em massa~~ — feito. `POST /api/assets/bulk` é **tudo ou nada** (D21); `POST /api/assets/bulk-checkout` é **por linha com relatório** (D31) — e a diferença é a natureza da operação, não inconsistência. **A quarta operação chegou na F9**: `op: 'custom-field'` preenche (ou limpa) um campo customizado nos N selecionados — é o backfill que o D61 exige antes de promover um campo a obrigatório, e sem ele o contador da tela de conjuntos mandava por uma porta que não abria. Ele recusa o lote inteiro quando algum ativo não pede aquele campo, porque gravar chave desconhecida em 200 linhas é o mass assignment do JsonB.
- [x] **P** ~~Clonar ativo~~ — feito na F2, **sem rota**: é o formulário em modo criação com os valores de outro ativo, e só etiqueta e série nascem em branco. A etiqueta vem do `/settings/next-asset-tag`, que é *peek*.
- [x] **M** ~~Imagem do ativo, do modelo, do fabricante e da categoria~~ — feito na Leva 2 do fechamento da F2 ([`historico/fase-02-ativos.md`](historico/fase-02-ativos.md)). `imagePath` nas quatro tabelas, `PUT/GET/DELETE /api/images/:alvo/:id`.
- [x] **M** ~~Anexos por ativo (nota fiscal, contrato, foto) com tipo e tamanho permitidos~~ — feito na Leva 2. **NÃO é rota estática** (D84): sai por `GET /api/attachments/:id/download`, com sessão — em produção o guard libera todo GET fora de `/api`, e uma raiz `/uploads/` deixaria nota fiscal e contrato públicos.
- [x] **M** ~~Busca, filtros, ordenação e paginação na listagem de ativos~~ — feito na F2: `?q=`, `?statusId=`, `?locationId=`, ordenação por allowlist e as quatro vistas (`active|trashed|retired|archived`).
- [x] **P** ~~Descomissionamento: `retiredAt`, `retiredReason`~~ — feito na F2. São TRÊS colunas com três significados (D19), e `retire` recusa ativo entregue com 409 que diz com quem ele está.

---

## Fase 3 — Autenticação e ator ✅ CONCLUÍDA

Entra cedo porque `ActivityLog` sem ator é log pela metade. RBAC completo fica na Fase 11.

- [x] **M** ~~Login, senha e sessão~~ — feito na F3 ([`historico/fase-03-autenticacao-e-ator.md`](historico/fase-03-autenticacao-e-ator.md)): argon2id, JWT em cookie `httpOnly` (D22), `preHandler` global negando por padrão e `tokenVersion` — trocar a senha derruba quem já está dentro.
- [x] **P** ~~`failedLoginCount` / `lockedUntil` (bloqueio por tentativas)~~ — feito na F3. A janela é de minutos, não bloqueio permanente: ele trocaria um ataque barato por um chamado garantido.
- [x] **P** ~~`createdById` / `updatedById`~~ — feito na Leva 2, e **só no `Asset`** (D26): o `ActivityLog` já responde "quem criou isto"; a coluna existe para a tela de detalhe não consultar por linha.
- [x] **P** ~~`Assignment.checkoutById` / `checkinById` e `LocationOccupant` passam a ser preenchidos~~ — feito. As duas colunas do `Assignment` desde a F3; a ocupação **não ganha coluna** (D25) e a resposta é o `ActivityLog`, que passou a ter ator na Leva 1.
- [x] **M** ~~Autenticação do agente C# no `/agent-hub` com `ApiToken` por agente~~ — feito na Leva 5. UMA tabela com dono polimórfico (D80), sha256 e não argon2, e **convivência com prazo** com o `AGENT_TOKEN` compartilhado (D89): o agente é um binário fora deste repositório, e o corte seco derrubaria a frota.
- [x] **P** ~~Tela de login no padrão visual do projeto~~ — feito na F3 (`src/pages/login/`).

---

## Fase 4 — Posse: checkout, checkin e ocupação de posto ✅ CONCLUÍDA

O ciclo de empréstimo, **sob o modelo de posse** (D14–D17). A camada de dados já
existe: `Assignment`, `LocationOccupant`, `AssignmentTarget` e os dois índices
únicos parciais estão aplicados no banco desde a migration
`20260923011728_posse_e_ocupacao`. O que falta é a **operação** que escreve neles.

> As invariantes que cada operação tem que defender — e onde cada uma mora, se
> no banco ou na aplicação — estão em [`referencia/invariantes.md`](referencia/invariantes.md).
>
> **Por que o modelo entrou antes da fase.** Decidir cardinalidade depois de a
> `Assignment` existir e estar em uso custaria retrabalho em cinco arquivos e uma
> migração com backfill. Decidir antes custou uma migration. Ver *Ordem de
> execução*, no fim.

**Camada 1 — a posse**

- [x] **M** `Assignment` — alvo polimórfico (`targetType` USER|ASSET|LOCATION + 3 FKs nuláveis), `checkoutAt`, `expectedCheckinAt`, `checkinAt`, `checkoutNotes`, `checkinNotes`, `checkoutById`/`checkinById` — **aplicado** na migration `20260923011728_posse_e_ocupacao`, com o índice único parcial `assignments_um_aberto_por_ativo` (D14) e os quatro índices de consulta
- [x] **M** `POST /api/assets/:id/checkout` — um endpoint só, corpo discriminado por `targetType` (é o seletor de 3 abas do Snipe-IT: pessoa / localização / outro ativo). `assertAlvoCoerente` valida que a FK preenchida bate com o tipo — CHECK constraint não é expressável no schema do Prisma e ficaria invisível lá
- [x] **M** `POST /api/assets/:id/checkin` — preenche `checkinAt` (**nunca apaga a linha**), limpa `assignedToId` quando for o caso, aplica o status de devolução escolhido
- [x] **P** Regras da operação em `$transaction`: duplo checkout é **P2002** do índice parcial traduzido em 409 pelo error-handler da F0, não validação que alguém pode esquecer; checkin de ativo sem posse aberta é 409; alvo na lixeira é 422
- [x] **M** Histórico de posse por ativo (`GET /api/assets/:id/assignments`) — alimenta a aba Posse da F2
- [x] **P** `Asset.assignedToId` sai do `createAssetSchema`, do `updateAssetSchema` e do campo "Responsável" do modal (D17). Passa a ser escrito **só** por checkout e checkin, na mesma transação

**Camada 2 — o posto**

- [x] **M** `LocationOccupant` — `locationId`, `userId`, `shift` (texto livre), `startedAt`, `endedAt`, `notes` — **aplicado** na mesma migration, com o índice único parcial `location_occupants_um_aberto_por_pessoa_local`
- [x] **M** Gestão de ocupantes do posto: `GET/POST /api/locations/:id/occupants` e encerramento da ocupação (preenche `endedAt`, **não deleta** — "quem respondia pela Mesa 1 em março?" continua respondível)
- [x] **P** Turno editável (`shift`) na ocupação aberta. Texto livre de propósito (D15): `"Manhã"`, `"Tarde"`, `"12x36 A"`
- [x] **P** ~~Aba/painel de ocupantes na tela de `Location`~~ — feito: `OccupantsPanel` compartilhado entre `/postos` e a aba Localizações de `/configuracoes`.

**Camada 3 — o que se pergunta**

- [x] **M** `resolverResponsaveis(ativo)` — a resolução das três camadas (D16), com o limite de **um salto** no alvo `ASSET`. Sai na resposta do ativo; **não vira coluna**
- [x] **M** `GET /api/users/:id/holdings` com **dois baldes**: `diretos` (assignments `USER` dela) e `porPosto` (ativos das assignments `LOCATION` dos postos que ela ocupa, com o turno). Separados de propósito — devolver um notebook é ato da pessoa; sair da Mesa 1 é ato do posto, e misturar os dois na tela faz alguém devolver o monitor da sala
- [x] **M** ~~**Tela de perfil do colaborador** com os dois baldes e o histórico~~ — `src/pages/gestao-usuario/detalhe/`. O **histórico da pessoa** fechou na Leva 1C do fechamento da F4 ([`historico/fase-04-posse.md`](historico/fase-04-posse.md)): `GET /api/users/:id/history` une `ActivityLog`, posses diretas e ocupações de posto — a terceira fonte é o que o D25 mandou responder pelo log em vez de virar coluna
- [x] **P** Invariante **estado × posse** ([`referencia/invariantes.md`](referencia/invariantes.md)): ativo com responsável resolvido não pode ter status de tipo `DEPLOYABLE` (estoque) nem `ARCHIVED` (fora de operação). É a regra que impede a posse e o status divergirem agora que as duas coisas são graváveis em separado — a continuação direta da correção do `IN_USE` (D5)
- [x] **P** Só status de tipo **`DEPLOYABLE`** libera a entrega. Checkout move o ativo para um status `IN_USE`; o checkin aplica o status escolhido (`DEPLOYABLE` de volta ao estoque, ou `PENDING` se voltou quebrado)

**Operações que dependem das três**

- [x] **P** **Desligamento** (`POST /api/users/:id/offboard` — o nome mudou no D32; `checkin-all` não avisava que a operação mexe em POSTO) — agora tem **duas** listas para limpar: devolver os ativos `diretos` **e encerrar as OCUPAÇÕES de posto** da pessoa. Esquecer a segunda deixa a Laura como responsável eterna de tudo que está na Mesa 1, meses depois de ela ter saído — e sem erro em lugar nenhum, porque a responsabilidade é derivada. `DELETE /api/users/:id` responde **409** enquanto houver ativo direto em posse **ou** ocupação aberta, com a contagem das duas
- [x] **M** Checkout em massa (kit de onboarding) — e o caso que o posto torna trivial: entregar o kit inteiro **à Mesa 1**, uma assignment por ativo, todas com o mesmo alvo
- [x] **M** ~~E-mail automático no checkout e no checkin~~ — feito na Leva 3. Sem SMTP o transporte é no-op que **loga** o que teria mandado; o envio é depois do commit e a falha não desfaz a entrega (D86).
- [x] **M** ~~Itens vencidos (overdue) e lembrete automático de devolução~~ — feito na Leva 3: o índice parcial `assignments_vencidos` entrou à mão e o job diário roda pela janela em `job_runs` (D79), que sobrevive ao deploy.
- [x] **G** ~~Fluxo de aceite — `Acceptance` com token, snapshot do EULA, página pública `/aceite/:token`~~ — feito na Leva 4. Com alvo `LOCATION` assina o gestor (D27); com alvo `ASSET` **não se emite termo** (D87); e o aceite pendente **não bloqueia** a entrega (D88) — quem o persegue é o relatório.
- [x] **M** ~~Assinatura digital no aceite (`<canvas>` + `toDataURL`)~~ — feito na Leva 4, e **opcional**: o que prova o aceite é a linha com o token de uso único; o desenho é reforço documental.
- [x] **M** ~~PDF do termo de entrega assinado (`pdfkit`, sem Chromium)~~ — feito na Leva 4, gerado **no aceite** e nunca regenerado (D30).
- [x] **P** ~~Relatório de itens não aceitos + reenvio de lembrete~~ — feito na Leva 4. Reenviar remanda o **mesmo** token (`remindedAt`); o índice parcial `acceptances_um_pendente_por_posse` impede um segundo termo para a mesma entrega.

---

### Como a Camada 1–3 foi verificada

Não é "testado manualmente". O cenário da Mesa 1 rodou ponta a ponta contra a
API, num banco descartável (`sentinel_audit`), com o servidor subido à parte —
o banco de trabalho terminou com `assignments = 0` e `location_occupants = 0`.

| O que se provou | Resultado |
|---|---|
| Laura (Manhã) **e** Ana (Tarde) ocupam a Mesa 1 | as duas criadas |
| Laura de novo no mesmo posto | 409 `Esta pessoa já ocupa este posto.` |
| `assignedToId` no corpo de `PUT /api/assets/:id` | 422 `campo não reconhecido` (D17) |
| Mouse entregue à Mesa 1 | 201, `targetType: LOCATION` |
| Entregar o mesmo mouse de novo | 409 `Este ativo já está entregue.` |
| Voltar o status para `DEPLOYABLE` com posse aberta | 409 com a frase que ensina |
| **Quem responde pelo mouse** | `Laura (Manhã), Ana (Tarde)` — sem o ativo apontar para ninguém |
| `holdings` da Laura | `diretos: []`, `porPosto: [o mouse]` |
| Checkin de ativo sem posse aberta | 409 `Este ativo não está entregue.` |
| Encerrar ocupação | `endedAt` carimbado, **linha preservada** |
| Encerrar a mesma de novo | 409 `Esta ocupação já foi encerrada.` |
| Última ocupante sai, ativo segue entregue | `postoVago: true`, posse **continua aberta** |

As duas invariantes de banco têm prova própria, reexecutável:
`prisma/verificacoes/posse-invariantes.sql`.

---

## Fase 5 — Acessórios, Consumíveis e Componentes ✅ CONCLUÍDA

Os três tipos que **têm quantidade** — e que por isso não são `Asset` (D3). Execução
detalhada em [`historico/fase-05-estoque.md`](historico/fase-05-estoque.md), decisões **D33–D38**.

> A régua contra o ativo: **tem etiqueta própria → é `Asset`**. A dock tem patrimônio e
> série, então é `Asset` com `Assignment` de alvo `ASSET` (F4). O pente de RAM não tem,
> então é `Component`. O mouse avulso da gaveta não tem, então é `Accessory`.

- [x] **M** ~~`Accessory` — qty, `minQty`, checkout para **pessoa ou posto**, devolve~~ — feito. O alvo `LOCATION` é a novidade sobre o Snipe-IT, e o CHECK `accessory_checkout_alvo_xor` põe a coerência do alvo no BANCO (o `Assignment` só a tem na aplicação)
- [x] **M** ~~`Consumable` — qty, `minQty`, checkout **decrementa e não volta**~~ — feito, e a irreversibilidade é ESTRUTURAL: não há coluna de fechamento, não há rota, e `POST /api/consumables/checkouts/:id/checkin` responde **404 do roteador** (D37)
- [x] **M** ~~`Component` — qty, `minQty`, checkout **para um ativo** (RAM, HD)~~ — feito, com `serial` do LOTE (peça com patrimônio próprio é ativo, não componente)
- [x] **M** ~~`AccessoryCheckout` (uma linha por unidade entregue)~~ — feito: `checkedInAt` fecha, a linha nunca é apagada.
  - **A pergunta em aberto foi respondida no [D33](historico/fase-05-estoque.md):** acessório entregue a posto conta **uma** unidade, qualquer que seja o número de ocupantes — o saldo do almoxarifado não pode depender da escala do RH. "Quantos mouses a Laura tem?" ganha **duas respostas honestas** (diretos e por posto, compartilhados) que **nunca** são somadas: somar produz "Laura tem 6 mouses" a partir de 5 compartilhados, frase falsa sobre o patrimônio. É por isso que `holdings` devolve `via` **por item** e não devolve total nenhum
- [x] **M** ~~`ConsumableCheckout` com `userNameSnapshot`~~ — feito, copiado no ato pelo mesmo motivo do EULA (D29): o consumo de março precisa continuar legível depois que a pessoa sai
- [x] **G** ~~`ComponentAsset` com `assignedQty` — primeira ponte real entre estoque e ativo~~ — feito, e alimenta a aba Componentes do ativo, que saiu de desabilitada
- [x] **M** ~~Quantidade restante **calculada**, nunca coluna~~ — feito (D34), num helper só. E **contar não é travar**: toda saída faz `SELECT … FOR UPDATE` na linha-pai DENTRO da transação, senão duas requisições contam "4 de 5 ocupados" e as duas inserem
- [x] **M** ~~Devolução parcial ou total de componente~~ — feito, e a parcial **divide a linha** (D38): a de 4 fecha e nasce uma de 2. Decrementar apagaria a resposta de "quantos pentes estavam nessa máquina em março?"
- [x] **P** ~~`minQty` + alerta de estoque baixo~~ — feito em **`GET /api/stock/alerts`**, e não em `/api/accessories/alerts` como esta linha previa: o alerta vale para os TRÊS tipos e a tela é uma só, então o tipo é **filtro** (`?tipo=`). O *posto vago com unidade parada* entra como **segunda categoria** — ele não é estoque baixo com outro nome, é o oposto: a unidade existe, está entregue, e ninguém responde por ela
- [x] **P** ~~Ajuste de estoque como operação própria~~ — feito: `POST /api/<tipo>/:id/adjust-quantity` com `delta` (nunca o valor final, que é ler-e-depois-escrever com outro nome) e motivo de enum fechado. **A quantidade não é campo do formulário de edição — e não porque foi removida: porque a chave NÃO NASCE no `strictObject` do schema de edição.** O 422 é do zod, não de uma checagem que alguém possa esquecer de copiar para o próximo schema (mesmo princípio do D37)
- [x] **M** ~~`StockLog` — histórico de movimentação por item~~ — feito. Ele responde **por que a quantidade nominal mudou**, e só isso: para onde a unidade foi já está na tabela de saída, e duplicar seria uma segunda contagem do mesmo fato. A "movimentação completa" da tela é a **união das duas fontes na leitura**, nunca uma terceira tabela
- [x] **M** ~~Visões "o que este usuário tem", "o que este posto tem" e "o que está dentro deste ativo"~~ — feito, **estendendo** o que a F4 escreveu em vez de criar paralelos: `GET /api/users/:id/holdings` ganhou `acessorios`, `GET /api/workstations/:id` ganhou `acessorios`, e `GET /api/assets/:id/components` é a aba nova
- [x] **P** ~~Migração do `InventoryItem` achatado para os três tipos~~ — **item sem objeto, e por isso removido.** A tabela `inventory_items` foi APAGADA na F1 (D12): não há dado a migrar e as seis tabelas nasceram vazias. Registrado aqui para ninguém a ressuscitar ao ler um plano antigo — e provado por teste (`SELECT to_regclass('public.inventory_items')` → NULL)

**O desligamento é a integração que mais podia dar errado.** `POST /api/users/:id/offboard` fecha
**só** os checkouts de alvo `USER`. Ligado sem esse filtro, desligar a Laura devolveria ao estoque
os 5 mouses da Mesa 1 — que continuam fisicamente na mesa, agora com a Ana. O inventário passaria
a mentir **com o saldo batendo**, porque as linhas teriam sido fechadas corretamente, e ninguém
perceberia até ir buscar um mouse na gaveta. É a mesma armadilha do D32, uma camada abaixo.

**A fase passou por uma revisão completa depois de fechada**, e ela achou oito coisas — quatro
no dado e quatro na leitura. Nenhuma quebrava teste, que é o que as tornava caras: a categoria
mudava de tipo por baixo do acessório, o ativo na lixeira prendia as peças dentro dele, a nota
da retirada apagava a da instalação e o rótulo *"parcial: 2 de 4"* que o D38 prometeu não
existia. As oito, com o porquê e o teste que passou a cobrir cada uma, estão em
**[Correções depois do fechamento](historico/fase-05-estoque.md#correções-depois-do-fechamento)**.

**Como a fase foi verificada:** 46 asserções em `tests/estoque/`, contra Postgres real e pelo
mesmo Fastify de produção. As duas mais caras são as que falhariam **em silêncio**: o
desligamento que não pode esvaziar o posto e a retirada parcial que divide a linha. As corridas
disparam sem `await` entre elas e contam os status — três unidades com cinco entregas dão três
`201` e dois `409`, e o disponível fecha em `0`, nunca em `-2`.

---

## Fase 6 — Licenças de Software ✅

**Fechada** — ver [`historico/fase-06-licencas.md`](historico/fase-06-licencas.md), com as etapas
reescritas contra a árvore real na execução. Decisões novas: **D90–D94**, que corrigem
D42, D43 e a Etapa E do desenho original.

- [x] **G** ~~`License` — nome, `seatsTotal`, `reassignable`, `maintained`, `expirationDate`, `terminationDate`, licenciado para, fornecedor, fabricante, categoria~~ — feito
- [x] **G** ~~`LicenseSeat` materializado — uma linha por assento, com contagem de livres/ocupados~~ — feito (D40). `livres` sai das LINHAS, e `aposentados` **não** entra na subtração (D92, que corrige a fórmula do D43)
- [x] **M** ~~Checkout/checkin de assento para usuário OU ativo (XOR validado), com `SELECT … FOR UPDATE SKIP LOCKED`~~ — feito. **Posto NÃO é alvo** (D39): o computador da mesa é um `Asset`, e é a ele que o assento vai. O XOR é CHECK do banco (invariante 9) e a aplicação recusa antes, com a frase que ensina o modelo
- [x] **P** ~~`reassignable` queima o assento na devolução~~ — feito, e vale também na devolução automática do desligamento, com o placar da perda separado no log
- [x] **M** ~~Product key cifrada em repouso e mascarada na resposta~~ — feito em `server/core/crypto/` (D81), com **chaveiro** e `kid` derivado da própria chave (D91). A máscara **não é coluna**: é derivada na leitura de detalhe
- [x] **P** ~~Status derivado: ATIVA / VENCENDO / EXPIRADA / ENCERRADA~~ — feito (D44), helper puro
- [x] **M** ~~Dados de compra + estoque mínimo de assentos~~ — feito. O campo chama `minSeats` e não `minAmt`: `minQty` é o nome que a F5 já usa para a mesma ideia, e duas palavras para o mesmo conceito é o que o D5 recusa
- [x] **M** ~~Alertas de licença expirando e de assentos abaixo do mínimo~~ — feito em `/api/licenses/alerts`, com o tipo como FILTRO (mesma forma do `/api/stock/alerts`)
- [x] **M** ~~Histórico da licença (quem pegou, quem devolveu, quem viu a chave)~~ — feito. `VIEW_KEY` é a primeira ação do projeto que registra uma LEITURA, e é de propósito: a chave é o único dado cujo simples acesso é o fato auditável
- [ ] **M** Anexos de licença (nota fiscal, contrato, certificado) — **adiado, D94**: `Attachment.assetId` é `NOT NULL` com FK para `assets`, então isto exige dono polimórfico em `Attachment` (migração, discriminante, CHECK e uma decisão sobre o arquivo quando o dono some). É uma etapa sobre ANEXO, não sobre licença
- [x] **P** ~~Export CSV de licenças **com a chave mascarada por padrão**~~ — feito na F10, e **melhor do que "mascarada"**: a chave não sai de jeito nenhum. O export passa pelo mesmo `paraResposta()` da listagem, que a remove (D133) — mascarar seria uma segunda regra, e a coluna de `••••` em cinco mil linhas não informa nada. Provado em `tests/relatorios/export.test.ts`, que o chama de "a quarta porta da chave de produto"

**O que a fase costurou fora do próprio domínio (D93):** assento é posse, então
`count-user-posse`, o `holdings`, o `offboard`, o 409 do `DELETE` — de pessoa **e** de
ativo — e a tela de perfil passaram a contar assento, em vez de a licença ganhar versões
próprias. Sem isso o desligado ficaria com assento para sempre, e o sintoma não seria um
erro: seria um número de assentos ocupados que nunca desce.

**E o `holdings` é o que torna o desligamento honesto:** ninguém tropeça num assento de
licença como tropeça num notebook em cima da mesa. Se ele não aparecesse na tela de
perfil, o modal não teria como listá-lo — e a operação fecharia, às vezes QUEIMANDO
(D43), um assento que nunca foi mostrado. O conjunto da lista é o mesmo que o `offboard`
fecha, e `tests/licencas/posse.test.ts` prova a igualdade em vez de confiar nela.

---

## Fase 7 — Convergência RMM × ITAM ✅

**Isto o Snipe-IT não tem.** Ele é um CMDB manual, sem descoberta. Nós temos agente instalado.
É aqui que o produto deixa de ser um clone.

**Fechada** — ver [`historico/fase-07-convergencia-rmm-itam.md`](historico/fase-07-convergencia-rmm-itam.md), com as etapas reescritas
contra a árvore real e o que só apareceu na execução. Decisões em três levas: **D45–D51**
(escritas depois da F1), **D95–D103** (desenho da fase, contra a árvore com F2–F6) e
**D104–D108** (execução) e **D109–D112** (auditoria da fase fechada, quando quatro erros
de lógica apareceram sob teste).

- [x] **M** ~~Vínculo `Endpoint` ↔ `Asset` (FK opcional 1:1)~~ — feito (D45). A FK mora no `Endpoint`, com `@unique` e `SetNull`: a maioria dos ativos nunca terá agente, e no outro lado a coluna ficaria nula na esmagadora maioria das linhas
- [x] **M** ~~Agente C# passa a coletar série, UUID, fabricante, modelo e chassi~~ — o CONTRATO do lado do servidor está pronto (`HandshakeData`, oito campos, todos nuláveis). O binário C# vive fora deste repositório e o deploy é coordenado; o servidor atende aos dois formatos por todo o rollout. O campo do modelo chama `hardwareModel` e **nunca** `model` — é o D13 outra vez
- [x] **M** ~~Motor de matching em cascata~~ — feito, e são **duas** cascatas (D104): serial (100) → UUID (100) → hostname (60) contra o ATIVO; serial → UUID → **MAC (85)** contra outra MÁQUINA. O MAC saiu da primeira porque `Asset` não tem coluna de MAC — não existe lado cadastrado para comparar
- [x] **M** ~~`ReconciliationSuggestion` + fila na UI~~ — feito. **UMA** tabela para as cinco formas de sugestão (D96), com índice parcial de `PENDING` e memória da recusa com chave de **afirmação** (D97 + D109 — hashear a evidência inteira fazia um dia a mais de presença reoferecer o que já tinha sido recusado). A fila sai por **três** portas, e a terceira é o mundo mudar sozinho (D110). A tela é `/descobertas`
- [x] **M** ~~Auto-provisionamento configurável (OFF / SUGGEST / ON)~~ — feito, default `SUGGEST` (D51)
- [x] **M** ~~**Posse sugerida pelo usuário logado**~~ — feito, e são **dois itens distintos** (D47): com o ativo entregue a um POSTO, a sugestão é de `LocationOccupant`, não de checkout. A sugestão de checkout **nem é gerada** nesse caso — aceitá-la fecharia a posse do posto e transformaria um ativo compartilhado em pessoal
- [x] **M** ~~**Dois usuários = posto compartilhado**~~ — feito (D48). Era **P** no desenho original e é **M**: traz tabela (`EndpointUserDaily`), job, turno inferido em hora local e tela. O sistema propõe o posto e as duas ocupações em vez de escolher um vencedor
- [x] **P** ~~**Ativo fantasma**~~ — feito, e separado em dois números no painel: *nunca vistos* (`lastSeenByAgentAt IS NULL`) e *fantasmas* (sumiram há mais de `ghostDays`)
- [x] **P** ~~**Shadow IT** com `reviewState`~~ — feito. A triagem **não mexe** na máquina: ela tira da fila o que já foi olhado, e é isso que impede o alerta de repetir toda semana
- [x] **M** ~~Specs de hardware~~ — feito, e elas moram no **`Endpoint`**, não no `Asset`. O item pedia "atributo do ativo"; o que ele queria de verdade era que o dado parasse de sumir no expurgo da telemetria, e coluna no lado que DESCOBRE resolve isso sem criar a segunda fonte de verdade que o D16 proíbe
- [x] **M** ~~`AssetChange`~~ — feito, **com escritor** (D116). A tabela ficou vazia por uma auditoria inteira: FK, índice e nenhuma linha. Hoje o `registerHandshake` devolve a fotografia das specs que ia sobrescrever e o roteador do agente compara — é o único instante em que o antes e o depois existem juntos. Primeira coleta **não** conta como troca de peça, e campo ausente **não** conta como peça removida (D106). A aba Máquina mostra a lista
- [x] **M** ~~`SoftwarePackage` + `SoftwareInstallation`~~ — feito. A chave do pacote é **derivada** (`normalizedKey`), porque em Postgres dois `NULL` não são iguais num índice único e o pacote sem fabricante não deduplicaria (D100)
- [x] **G** ~~**Conformidade alimentada pelo software instalado**~~ — feito, e ela exigiu uma ponte que o desenho não previa: `LicenseSoftware`, **explícita** (D102). Casar "Office 365 E3" com "Microsoft 365 Apps for enterprise" por semelhança de nome erra nos dois sentidos, e os dois erros são caros. **Ela passou uma auditoria inteira sem porta de entrada** (D117): as rotas de escrita e de relatório existiam e não havia como LISTAR pacotes, então nenhuma tela chegava a um `packageId`, a ponte nunca recebia linha e o relatório respondia `semVinculoDeSoftware` para sempre. Hoje `GET /api/software-packages` existe e a tela da licença tem o formulário e as duas contas
- [x] **P** ~~Separar os dois eixos de status~~ — feito, e o `AgentStatus` tem **dois** valores, não três (D98): `NEVER_SEEN` seria um valor que nenhuma linha de `endpoints` pode ter, porque a linha nasce de um handshake. "Cadastrado e nunca visto" é pergunta do ATIVO. O campo de último contato chama `lastSeenByAgentAt` e quem o escreve é o **job** (D95)
- [x] **P** ~~Auditoria automática: cada handshake é uma auditoria física~~ — feito na F8 (D124), e **não no handshake**: ela nasce no job de reconciliação, ao lado do carimbo do último contato, no máximo uma por ativo por dia, e **só quando o `biosSerial` normalizado bate com o `Asset.serial`**. No handshake seria o D95 outra vez — `touchEndpoint` roda a cada mensagem de cada máquina. Hostname e MAC não contam: nenhum dos dois prova que alguém olhou o equipamento
- [x] **M** ~~Detecção e fusão de duplicados~~ — feito. A fusão **não apaga** o endpoint antigo (D103): ele ganha `mergedIntoId` e sai das listagens, porque o agente pode voltar e o `ApiToken` daquela instalação aponta para ele. E ela consolida as colisões de presença e de software em vez de mover cegamente (D108)
- [x] **M** ~~Ativo ocioso (`AssetUsageDaily`)~~ — feito, cruzado com *posto vago*: é o cruzamento que separa "ninguém USA" de "ninguém RESPONDE"
- [x] **P** ~~Painel de cobertura~~ — feito, com os dez números saindo da mesma `$transaction`: contados um a um, um handshake no meio faria a conta não fechar, e painel que não soma é painel em que ninguém confia

**O que a fase costurou fora do próprio domínio:** o `ActivityAction` ganhou `LINK`,
`UNLINK` e `MERGE` (união fechada, como o `VIEW_KEY` da F6); o `present-endpoint.helper.ts`
passou a converter os `BigInt` novos, sem o que `/api/endpoints` morreria com *"Do not know
how to serialize a BigInt"* na tela que o painel consulta a cada 5 segundos; o
`ASSET_SORTABLE` virou `ENDPOINT_SORTABLE` (nome herdado do D1); e a aba **Máquina** nasceu
já pronta no detalhe do ativo — a única que não passou por desabilitada, porque o que ela
mostra não existia em fase nenhuma.

**A fila só serve se ela for lida, e é por isso que três guardas não são opcionais:** o
índice parcial (não empilhar), a memória da recusa com hash da evidência (não reoferecer,
sem enterrar para sempre) e a allowlist de contas ignoradas (D101). Sem a terceira, o
técnico de TI que loga em 40 máquinas geraria 40 "postos compartilhados" no primeiro dia —
e fila cujo primeiro contato é ruído não é revisada uma segunda vez.

**E a terceira guarda ficou inalcançável até a segunda auditoria** (D118): ela estava
implementada no servidor, com rota e validação, e a tela nunca desenhou o campo — o hook do
front já devolvia `configuracao` e `handleSalvarModo`, e a página não desestruturava nenhum
dos dois. Guarda não opcional que não tem onde ser preenchida é guarda que não existe. Hoje os
cinco controles da descoberta ficam ao lado do painel de cobertura, porque é lá que os números
que eles explicam são lidos.

---

## Fase 8 — Ciclo de vida

- [x] **M** ~~`Maintenance` — tipo (MANUTENÇÃO / REPARO / UPGRADE / CALIBRAÇÃO / SUPORTE), fornecedor, início, fim, custo, `isWarranty`~~ — feito. **Várias abertas por ativo convivem** (simetria invertida do `assignments_um_aberto_por_ativo`), e abrir manutenção **não muda o status do ativo**
- [x] **P** ~~Tela global de manutenções com custo acumulado e em aberto~~ — `/manutencoes`. Os totais são `aggregate` sobre o RECORTE, fora do `skip`/`take`: somar a página daria o custo de quinze linhas e mudaria ao virar a página
- [x] **M** ~~`Audit` — auditoria física com resultado (OK / DIVERGENTE / NÃO LOCALIZADO) e `lastAuditAt`~~ — feito, com `@@index([lastAuditAt])`. **`nextAuditAt` não nasceu** (D53)
- [x] **P** ~~Intervalo de auditoria global (meses) e antecedência do aviso (dias)~~ — `AppSetting.auditIntervalMonths` e `auditWarningDays`. Nasceram na Etapa B, junto da auditoria de que falam, porque o relatório da Etapa D as lê
- [x] **P** ~~Relatório de auditorias vencidas / a vencer / nunca auditadas~~ — três baldes, e "nunca" é um deles: no banco cabem num `OR`, mas a AÇÃO é diferente (um vencido tem histórico; um nunca conferido pode não existir fisicamente)
- [x] **M** ~~**A conferência da auditoria passa a ter três campos, não um**~~ — feito, e o sistema escreve SÓ o primeiro (D52): `Asset.locationId`. Os outros dois são MARCADOS (`divergenciaDePosse`, `postoVago`) e a correção é checkout, com autor e data. A conferência é por POSTO (`/auditorias`) e o registro é por ATIVO (D54)
- [x] **P** ~~Cálculo do valor contábil atual (depreciação linear com piso)~~ — função pura em `asset/helpers/depreciacao.helper.ts`, calculada na leitura. `min(custo, max(piso, …))` — os DOIS lados, porque o piso `AMOUNT` não tem teto e um mouse com residual de R$ 5.000 valorizaria no papel
- [x] **P** ~~Relatório de depreciação com totais~~ — e `recharts` finalmente foi importado, pela própria página. A série vem pronta do servidor (D55); os `null` ficam em três baldes separados, porque somá-los como zero barateia a frota
- [x] **P** ~~Relatório de garantias e EOL vencendo em N dias~~ — duas listas e dois limiares: garantia vira chamado, EOL vira orçamento
- [x] **P** ~~`Setting` de alertas: liga/desliga, destinatários, threshold em dias~~ — dez campos no `AppSetting`, com tela na aba Alertas de `/relatorios` (ao lado dos números que eles explicam)
- [x] **M** ~~Envio de e-mail SMTP (`nodemailer`)~~ — **já existia desde a F4** (`core/mail/mailer.ts`, D86). A fase reusou; nenhuma variável de ambiente nova
- [x] **M** ~~Scheduler diário~~ — e **não** gravando `lastAlertRunAt`: a janela é uma LINHA em `job_runs` (D79), na HORA e no FUSO configurados (D123)
- [x] **P** ~~Integração com webhook (Slack / Teams)~~ — `core/webhook/`, com allowlist de destino (D126): só `https` e endereço público, validado a cada envio e contra o que o DNS devolve
- [x] **P** ~~Central de alertas dentro do app~~ — `AlertBell` no cabeçalho. Ela é o canal PRIMÁRIO: toda notificação vira linha antes de virar mensagem (D57)

**O que ficou de fora, com o motivo escrito:** licença vencendo (F6) e estoque baixo (F5) **não**
entraram na central (D128) — os dois sinais já são derivados sob demanda no painel da própria tela,
e materializá-los aqui pediria o inverso do que o D44 e o D34 protegem. O caminho para eles é um
alvo polimórfico em `Alert`, que é aditivo.

---

## Fase 9 — Campos Customizados

- [x] **M** ~~`CustomField` — nome, slug, elemento (TEXT / TEXTAREA / LISTBOX / CHECKBOX / RADIO / DATE), formato, help text, obrigatório, único~~ — feito. **`obrigatório` não é do campo, é do VÍNCULO** (D61): o mesmo "Centro de custo" é obrigatório em Notebooks e opcional em Periféricos. O `único` deste item ficou de fora: unicidade de valor entre ativos precisaria de um índice de expressão por campo, que é o DDL por campo que o D7 recusou
- [x] **M** ~~Motor de validação por formato: IP, IPv4, IPv6, MAC, e-mail, URL, numérico, alfanumérico, data, booleano, regex custom~~ — feito, função PURA (`field-validator.helper.ts`), com as três guardas de ReDoS do D63 rodando no CADASTRO do campo e no motor
- [x] **M** ~~`CustomFieldset` ancorado em **modelo E categoria, com precedência do modelo**~~ — feito — ver [`historico/fase-09-campos-customizados.md`](historico/fase-09-campos-customizados.md), D58. O Snipe-IT ancora só no modelo, e o `AssetModel` existe desde a F1; a categoria fica porque `Asset` **não tem `categoryId`** (ela vem do modelo) e porque "todo notebook pede patrimônio" é regra de categoria, não de modelo.
  ⚠️ **Correção:** uma versão anterior deste item dizia que o `AssetModel` "já tem a coluna reservada" para o fieldset. **Não tem** — verificado no schema: as colunas dele são `id, name, eolMonths, modelNumber, notes, manufacturerId, categoryId`. A F1 adiou o atributo, não o criou; a coluna nasceu na F9, junto com a de `Category`
- [x] **M** ~~Valores em `customFields Json? @db.JsonB` + índice GIN (D7)~~ — feito, e o índice **não é alcançado pelo filtro**: o Prisma tipado emite `#>` com comparação de expressão (Seq Scan), não `@>`. As contagens de tabela inteira desceram para `$queryRaw` e usam o índice; o filtro da listagem paga a varredura e o número está **medido** no fechamento da [`historico/fase-09-campos-customizados.md`](historico/fase-09-campos-customizados.md)
- [x] **M** ~~Renderização dinâmica no formulário e como coluna na tabela~~ — feito (`CustomFieldsSection.tsx` + as colunas de `showInListView` na listagem de ativos)
- [x] **G** ~~Tela de administração de campos e conjuntos~~ — feito: duas abas novas em Configurações (Campos e Conjuntos), dirigidas pelas specs de UI, mais o modal de composição — a **única tela de arrastar-e-soltar do projeto**, com o contador do D61 ao lado de cada caixa "obrigatório"
- [x] **P** ~~Flags de visibilidade (`showInListView`, `displayInUserView`, `showInEmail`)~~ — as três gravam; só `showInListView` TEM EFEITO hoje. As outras duas são o contrato das telas que não existem (a visão do colaborador, o corpo do e-mail de entrega) e estão declaradas como "guardado agora" na ajuda do formulário
- [x] **P** ~~Valor padrão por modelo~~ — feito, e é do **VÍNCULO**, não do modelo (D61): `CustomFieldsetField.defaultValue`, validado contra o formato do campo no CADASTRO do conjunto e aplicado só na CRIAÇÃO do ativo. Campo cifrado não aceita padrão — ele ficaria em claro no cadastro, e um segredo igual em toda máquina não é segredo
- [x] **M** ~~Campo customizado cifrado em repouso~~ — feito. **`server/core/crypto/cipher.ts` já existia** (nasceu na F6): `cifrar(claro, aad)` / `decifrar(pacote, aad)`, formato `enc:v1:<kid>:<iv>:<tag>:<ct>` (D81), com chaveiro e canário de boot (D91). Aqui o prefixo `enc:` é obrigatório de verdade — dentro do mesmo `JsonB` convivem valores cifrados e comuns, e sem marca não há como saber qual é qual
- [x] **M** ~~Preenchimento em massa de um campo customizado~~ — feito **depois** do fechamento da fase, numa segunda revisão: o D61 descreve a promoção como *"nasce opcional, a edição em massa faz o backfill, e só então promove-se"*, a tela imprimia essa frase ao lado do contador, e o lote da F2 só sabia status, localização e lixeira. `op: 'custom-field'` no `POST /api/assets/bulk`, com as quatro recusas que importam (ativo fora do conjunto barra o lote inteiro, valor fora do formato, campo cifrado, esvaziar obrigatório). Ver a seção 5 do fechamento da [`historico/fase-09-campos-customizados.md`](historico/fase-09-campos-customizados.md)
- [x] **P** ~~Campos customizados no import e no export CSV~~ — feito, e o item esperou de propósito: *"anotar a coluna sem o CSV existir seria escrever metade de uma feature"*. O token é `cf:<slug>` nos dois lados, e a allowlist é montada a partir dos campos que EXISTEM no banco — `cf:*` liberado por prefixo aceitaria `cf:qualquer_coisa` e devolveria coluna vazia em toda linha, que é o defeito silencioso que o D67 fecha.
  **O campo CIFRADO não sai e não entra**, e a assimetria é aparente: no export, mascarar daria uma coluna de `••••••` repetido e exportar o pacote seria o segredo saindo num arquivo que circula por e-mail; no import, uma planilha com a senha da BIOS de trezentas máquinas em texto é a pior forma possível de carregar segredo. Nos dois, 422 com o NOME do campo — não "coluna desconhecida".
  E a **validação de formato não foi reescrita**: o importador monta `customFields` e entrega ao `createAsset`/`updateAsset`, que chamam o mesmo `validarCamposCustomizados()` do formulário. O dry-run passou a chamá-lo também, senão um IP mal digitado na linha 300 só estouraria no `apply`

---

## Fase 10 — Etiquetas, Relatórios e Importação

> Plano, revisão e fechamento em [`historico/fase-10-etiquetas-relatorios-importacao.md`](historico/fase-10-etiquetas-relatorios-importacao.md). A
> revisão de 01/10 mudou a ordem de execução — a mudança no checkout (data retroativa e
> silêncio) virou leva própria antes do importador — e acrescentou as decisões D129–D134.

- [x] **M** ~~Código de barras 1D (Code128) e QR 2D por ativo~~ — feito (D70: QR leva URL, Code128 leva a etiqueta)
- [x] **G** ~~Impressão de etiquetas em PDF com layout configurável~~ — feito, e **a prévia É o PDF**, pela mesma função
- [x] **M** ~~Busca global otimizada para leitor de código de barras~~ — feito (`GET /api/search`), e o campo mora no cabeçalho
- [x] **P** ~~Export CSV de qualquer listagem~~ — feito em ativos e licenças, com BOM e escape de fórmula
- [x] **P** ~~⚠️ A chave de produto da licença NÃO pode entrar no CSV~~ — fechada por CONSTRUÇÃO: o export passa pelo mesmo `paraResposta()` da listagem, que a remove (D133).
- [x] **G** ~~Importador CSV com mapeamento de colunas~~ — feito, dois passos com dry-run obrigatório
- [x] **M** ~~Seção de Relatórios~~ — as abas novas são *Responsabilidade* e *Montar relatório*; posto vago e ativos por posto JÁ existiam em `/postos` (D130)
- [x] **M** ~~Custom report builder com seleção de colunas~~ — feito, token → fragmento SQL declarado (D67)
- [x] **M** ~~`Setting` singleton + tela de Configurações~~ — feito no `AppSetting` que já existia (D65)
- [x] **P** ~~`src/lib/format.ts`~~ — feito em `src/pages/helpers/format.helper.ts`, que já existia; o `formatarData` continua FATIANDO a string ISO
- [x] **M** ~~Backup do banco pela interface~~ — feito atrás de `BACKUP_ENABLED` (desligado por padrão)
- [x] **M** ~~Seletor de colunas visíveis com preferência salva~~ — feito, no zustand com `persist` (client state)
- [x] **M** ~~Combobox com busca acima de 200 opções~~ — feito; o `?q=` do servidor já existia desde a F1, faltava a tela

---

## Fase 11 — Acesso avançado ✅

> Plano, revisão e fechamento em [`historico/fase-11-acesso-avancado.md`](historico/fase-11-acesso-avancado.md). A
> revisão de 01/10 mudou a ordem de execução, com a
> infraestrutura de permissão virando a **primeira** etapa (declarar as 177 rotas antes de
> existir grupo que conceda), o contrato de `department` mudando junto com a entidade e não no
> `DROP COLUMN`, e as decisões D135–D142.

- [x] **G** ~~`Group` + permissões granulares por módulo (view / create / edit / delete / checkout por tipo de item)~~ — feito, com **35 chaves** e uma inversão que o plano não previa: a exigência **não** é escrita rota por rota. Ela mora num MAPA central (`access/helpers/route-permissions.ts`) conferido contra a tabela de rotas do Fastify **no boot** — rota registrada sem declaração **derruba o processo** (D137). Por rota, a rota nova nasceria liberada, que é o furo que a F3 já havia fechado para a sessão
- [x] **P** ~~Permissão sobre dado sensível: chave de licença, custo de compra, lista de processos, comandos RMM~~ — feito, e **em três mecanismos diferentes** porque o dado é de três naturezas (D77, D140): `assets.viewCost` **sai do `select`** (não é mascarado depois); `licenses.viewKey` e `assets.viewSecret` trancam a ROTA de revelar; e o relatório de depreciação exige a chave do custo **na rota inteira**, porque sem custo não sobra relatório (D138). O comando RMM é `endpoints.command`, chave só dele
- [x] **P** ~~Campos de identidade do colaborador: nome dividido, matrícula, cargo, telefone, endereço~~ — feito, **menos o nome dividido**: `name` já é o campo canônico, dividi-lo exige um backfill que adivinha onde termina o nome em "Maria da Silva Souza", e um campo que só existe para ser recomposto na exibição são duas fontes de verdade para o mesmo dado. `employeeNumber` é único por índice **parcial**, como `email` e `username` — matrícula é justamente o número que a empresa reaproveita ao recontratar
- [x] **P** ~~`Department` como entidade (hoje é texto livre em `User.department`)~~ — feito em **duas migrações**, e é a única migração não aditiva do projeto: criar + FK + backfill na mesma transação, `DROP COLUMN` na seguinte (D75). Entre as duas, um rollback ainda encontra o texto original. O `GROUP BY btrim(department)` não unifica grafia — `TI` e `T.I.` viraram dois departamentos de propósito, porque escolher qual sobrevive é trabalho de gente, e depois do `DROP` o original não existe mais para conferência
- [x] **P** ~~Gestor do colaborador (`managerId`) e visão de liderados~~ — feito, com `GET /api/users/:id/reports`. ⚠️ Ele **não** entra em `resolverResponsaveis()` (D72)
- [x] **M** ~~**A fronteira entre departamento, gestor e posto**~~ — documentada em [`referencia/modelo-de-posse.md`](referencia/modelo-de-posse.md) (seção *A fronteira*), que é o contrato — não num comentário de código. São **quatro** perguntas, não três, e cada uma tem UMA fonte:
  - **o posto responde pelo ativo** — `Assignment` → `LocationOccupant` (D16);
  - **o gestor da localidade responde pelo posto VAZIO** — `resolverEscalonamento()`, subindo a árvore com o mesmo teto de 32 do `location-cycle.helper.ts` (o banco aceita ciclo). Função **irmã** da Camada 3, nunca um `else` dentro dela: com o `else`, todo ativo passa a ter responsável e *"ativo em posto vago"* deixa de ser expressável — três leitores dependem desse vazio continuar vazio (D73);
  - **o gestor da pessoa a cobra** — `User.managerId`, rota de escalonamento e nada mais;
  - **o departamento agrupa pessoas** — relatório, rateio e filtro. Não há `targetType: 'DEPARTMENT'` e não vai haver: departamento não tem mesa, não tem chave e não assina termo.
  E a fase **corrigiu um defeito** que essa fronteira revelou: o termo de entrega de alvo `LOCATION` lia `Location.manager` da FOLHA e recusava com 409 — entregar um notebook para a "Mesa 1", sem gestor próprio, dentro de um "Andar 2" que tem, era recusado com o gestor cadastrado e visível na tela. Agora ele usa a MESMA subida (D139)
- [x] **P** ~~Ciclo de vida do colaborador: ativo/inativo, admissão, desligamento~~ — feito, e o desligamento ganhou os dois passos que faltavam: a **guarda do substituto** (409 se a pessoa gere gente ou localidade e o corpo não traz `substitutoId` — localidade sem gestor é o buraco do escalonamento) e a **revogação de acesso** (tokens pessoais `revokedAt` + `tokenVersion` incrementado, na mesma transação). **`isVip` e `isRemote` ficaram de fora**, e isso é o defeito 11 da auditoria: coluna que nasce sem leitor é coluna que ninguém mantém. Quando houver a tela que os lê, eles são uma migração aditiva de duas linhas
- [x] **M** ~~Listagem de pessoas com busca, paginação e filtros~~ — já existia desde a F2; a F11 trocou a coluna Departamento de texto para a relação e tirou `department` da allowlist de ordenação (ordenar por relação é `department: { name: 'asc' }`, não pelo nome da coluna)
- [x] **M** ~~`ApiToken` pessoal (geração, prefixo, hash, revogação, `lastUsedAt`)~~ — feito **pelo mesmo caminho de autenticação do agente** (D80), generalizado por `ownerType` (defeito 6). As rotas são `/api/me/tokens`: **sem `:id` na URL não existe o caso "mandei o id de outra pessoa"**, e o dono sai da sessão. O token age COMO a pessoa — mesmas chaves, mesmo `actorId` — e **não alcança rota de credencial**: um token que emite tokens é um token que não se revoga. A FK que `api_tokens.userId` nunca teve nasceu aqui (D142), e é `Cascade`, não `SetNull`: token sem dono é credencial que autentica como ninguém
- [x] **M** ~~2FA TOTP (`otplib` + `qrcode`)~~ — feito: segredo **cifrado** com AAD `users:totpSecret:<id>` (D81, o mesmo `core/crypto/cipher.ts` da F6), oito códigos de recuperação em sha256 e uso único, janela de ±1 passo. O cadastro é em **dois passos com estado no banco** (`totpEnabledAt` nulo = pendente), e o estado intermediário **não tranca ninguém**. Desligar exige um código; **não existe rota para desligar o 2FA de outra pessoa** — isso é `npm run totp:desativar`, porque uma rota de bypass é a porta que o 2FA veio fechar
- [x] **M** ~~Sincronização LDAP / Active Directory (`ldapts`)~~ — feito, e a regra que importa é a do D78: **sumir do diretório MARCA para revisão, nunca desliga**. Um filtro mal escrito devolve "zero pessoas", e um job que desligasse por isso devolveria o inventário da empresa ao estoque numa madrugada — por isso a rodada vazia **não marca ninguém**. E-mail que já existe como conta `LOCAL` vira **conflito**, não fusão. `paged: true` não é otimização: o AD corta em 1000 por padrão, e sem ele a empresa de 1200 pessoas marcaria 200 como ausentes
- [x] **M** ~~SSO — OIDC com Entra ID (não SAML), recusando login de quem não está cadastrado~~ — feito, com `state`, `nonce` e PKCE num cookie assinado de dez minutos (memória de processo não sobrevive a dois contêineres; tabela seria uma linha por tentativa de login). **Ninguém entra sem cadastro**, e conta `LOCAL` com o mesmo e-mail é **recusada**: fundir deixaria quem controla aquele endereço no provedor herdar os grupos de uma conta criada aqui. O vínculo é explícito, com `access.manage` e `ActivityLog` do DE→PARA. ⚠️ O SSO **não pede o segundo fator local** — a troca está escrita na [`referencia/acesso.md`](referencia/acesso.md)
- [x] **M** ~~Portal do colaborador: ver o que é meu, aceitar o termo, solicitar item — com os **dois baldes**~~ — feito como `/meus-equipamentos` (D141: a tela leva o nome do que lista). Os dois baldes, e o do posto **diz com quem é dividido** — sem essa lista, "Mesa 1 · monitor LG" se lê como *o monitor é meu*, e quem sai da empresa devolve o monitor que a colega do outro turno usa. A rota é `/api/me/holdings`, irmã da com `:id` e **não um `?me=true`**: a diferença não é de filtro, é de autorização. *Solicitar item* continua em **Descartado de propósito**, e o aceite já tem o caminho dele desde a F4 (link no e-mail, sem exigir conta)
- [x] **P** ~~Avatar do colaborador (começar por iniciais geradas, sem upload)~~ — feito, com a cor **derivada do nome** (`hsl` de matiz variável, saturação e luminosidade fixas): a mesma pessoa é sempre a mesma cor em toda tela, sem nada gravado. Foto pediria armazenamento, rota com permissão, miniatura e uma resposta de LGPD sobre guardar imagem de pessoa junto do patrimônio — e o que ela resolve (achar a linha certa numa lista) as iniciais com cor resolvem

**O que a fase entregou e o plano não pedia:** `Iniciais` é decoração que nunca é o
único portador de significado (o nome está sempre ao lado), e as **duas linhas de
escape em `*/cli/`** — `npm run acesso:administrador` e `npm run totp:desativar`. A
segunda está no plano; a primeira nasceu da pergunta que a auditoria da Etapa B
deixou em aberto: o 409 de *"nunca sem administrador"* cobre o caminho da TELA, e não
cobre o usuário apagado, o grupo esvaziado por `psql` nem a única conta com a chave
que perdeu a senha E o segundo fator. Nos três, o sistema fica de pé e **trancado**.

**O que ficou de fora, com o motivo escrito:** `isVip`/`isRemote` (coluna sem leitor
— defeito 11), nome dividido (duas fontes de verdade para `name`), SAML (OIDC cobre
o Entra ID, e a segunda biblioteca seria um segundo caminho de login para manter) e
segundo fator **obrigatório** por grupo — que é decisão nova: ela precisa de um lugar
para morar e de uma resposta para quem entra hoje sem ter cadastrado.

---

## Descartado de propósito

Registrado para não ser reaberto a cada revisão.

| Funcionalidade | Por quê |
|---|---|
| **Companies / Full Multiple Companies Support** | Uma empresa só. Exige scope por `companyId` em toda query — alto custo, fácil de furar. `Location` hierárquica cobre o que precisamos |
| **Folder / filiais** (nosso, não do Snipe-IT) | Não existe no Snipe-IT e duplica `Location`. Morreu na F1 |
| **`Asset ⟷ User` N:M** (nosso, não do Snipe-IT) | Perde o posto, que é a unidade real da operação, e cresce multiplicativamente. O detentor é singular; o alvo é que é polimórfico — D14 |
| **Entidade `Workstation`** (nosso, não do Snipe-IT) | Duplicaria a hierarquia de `Location` e daria ao ativo dois campos de "onde". Posto é uma `Location` folha — D15 |
| **Coluna de responsáveis no `Asset`** | Quarta fonte de verdade para o que as Camadas 1 e 2 já dizem, divergindo em silêncio. Responsabilidade é derivada — D16 |
| **Fila de requisição e aprovação de item** | Time interno pequeno pede no chat. Duas telas, valor zero. `requestable` fica no schema para quando fizer sentido |
| **Requisição de licença** | Mesmo motivo |
| **Renumeração em massa de asset tags** | Operação de migração, não de produto. Script pontual resolve |

---

## Ordem de execução

```
F0 (base) ✅ → F1 (catálogo + ativo inteiro) ✅ → [MODELO DE POSSE] ✅ schema
   → F2 (ativos) ✅ → F3 (auth) ✅ → F4 (posse: checkout/checkin/posto) ✅
      → F5 (estoque) ✅ → F6 (licenças) ✅ → F7 (convergência RMM) ✅
            → F8 (ciclo de vida) ✅
               → F9 (campos) ✅ → F10 (relatórios) ✅ → F11 (acesso) ✅
```

**As onze fases estão fechadas.** O único item em aberto deste arquivo é o anexo de
licença (D94), que espera um dono polimórfico em `Attachment` — e espera de propósito.

**A F0 até a F4 estão completas.** As três últimas fecharam **juntas**, em cinco **levas** e
não em três fases — porque o armazenamento de arquivo (Etapa G da F2) era pré-requisito da
assinatura e do PDF (Etapas A e B da F4), e o correio servia aos dois lados. Nenhuma revisão de
fase isolada teria visto essa dependência: ela só aparece olhando as três juntas. O grafo das
levas e a tabela das catorze pontas estão no
[Fechamento da F2](historico/fase-02-ativos.md#fechamento-da-f2--as-pontas-que-a-fase-deixou-abertas);
cada leva está no plano da fase a que pertencia ([F2](historico/fase-02-ativos.md),
[F3](historico/fase-03-autenticacao-e-ator.md), [F4](historico/fase-04-posse.md)).

**A F5 fechou**: as seis tabelas de estoque, o saldo derivado com trava na linha-pai e a
integração com a posse da F4 (holdings, desligamento, posto).

**A F6 fechou**: as três tabelas de licença, o assento **materializado** (D40) — porque uma
licença tem número de assentos conhecido e contrato por trás, enquanto no estoque a unidade é
intercambiável —, a escolha sem corrida por `SELECT … FOR UPDATE SKIP LOCKED` (D41) e a chave de
produto cifrada em `server/core/crypto/`, que é o mesmo arquivo que a **F9** vai usar para campo
customizado cifrado (D81).

**A F7 fechou**: o vínculo `Endpoint ↔ Asset` (D45), as duas cascatas de matching (D104), a
fila de sugestões com memória de recusa (D96, D97), o software normalizado e a conformidade
cruzada com o assento da F6 — pelo caminho que o D39 protegeu, e que a execução mostrou ser
`SoftwareInstallation → Endpoint → Asset → LicenseSeatCheckout → LicenseSeat`, porque quem
aponta para o ativo é a OCUPAÇÃO do assento, não o assento.

**E é nela que o produto deixa de ser um clone**, num ponto específico: duas pessoas na
mesma máquina. Num modelo `Asset ⟷ User` isso é contradição — o software escolhe um
vencedor, erra toda semana e acaba descartando a observação como ruído. Com as três camadas
do modelo de posse a mesma observação é consistente, e vira cadastro que uma pessoa
confirma. Não falta dado a quem copia: falta **onde guardar**.

**A F8 fechou**: `Maintenance`, `Audit` e `Alert`, o valor contábil calculado (D55), `/relatorios`
com as quatro abas e o job diário com janela por fuso e hora (D123). Ela também **executou o item
que a F7 declarou** — *"cada handshake é uma auditoria física"* — e o executou diferente do que
estava escrito: a linha de `Audit` com `method = AGENTE` nasce no job, uma por ativo por dia, e só
quando o número de série confere (D124). No handshake ela cresceria em máquinas × mensagens por dia,
que é o D95 pela segunda vez.

**E ela é a primeira fase que avisa sobre o que NÃO aconteceu.** Os outros três jobs reagem a um
fato — o agente bateu, a máquina sumiu, o prazo de devolução venceu. A garantia vencendo dispara
porque o calendário andou, e foi isso que transformou "quando o job roda" numa pergunta de produto:
a hora e o fuso passaram a ser configuração, e `inicioDoDia()` ganhou um irmão que sabe em que fuso
é "hoje" (o lembrete de atraso da F4 mudou junto, porque ele tinha o mesmo defeito).

**A F9 fechou**: `CustomField`, `CustomFieldset` e o vínculo, as **duas** âncoras de conjunto
(categoria como padrão, modelo sobrepondo — D58), o motor de validação por formato como função
pura, os valores em `JsonB` com índice GIN, o campo cifrado em repouso reusando o
`core/crypto/cipher.ts` da F6 (D81) e a tela de administração com o contador do D61. As duas
colunas que este arquivo dizia estarem "reservadas" nasceram nela.

**E ela é a primeira fase que mede em vez de prometer.** O D63 afirmava que o filtro por campo
customizado usaria o índice GIN; não usa — o Prisma tipado emite comparação de expressão, e a
diferença é de 20× em 50 mil linhas. A fase separou as perguntas que precisam **compor** (ficam no
Prisma e pagam a varredura) das que varrem a tabela inteira e não compõem (descem para `$queryRaw` e
usam o índice), e entregou o número à F10 em vez de uma afirmação. Ver o fechamento da
[`historico/fase-09-campos-customizados.md`](historico/fase-09-campos-customizados.md), que lista os **cinco defeitos** que a revisão
pegou — todos invisíveis pela tela, quatro alcançáveis só pela API — e, na seção 5, o que uma
**segunda** revisão achou depois de a fase já estar verde: o backfill em massa que o D61 exigia e
que não existia, mais seis acertos menores com a mesma assinatura — a tela prometendo uma regra
que o código não cumpria.

**A F10 fechou**: as etiquetas com QR e Code128 (a prévia É o PDF), o export CSV, o importador com
dry-run obrigatório, as duas abas novas de `/relatorios` e o report builder por token → fragmento
declarado (D67). Ela herdou da F9 o número medido do JsonB e o seletor de colunas; o item **P** do
CSV que esperava o importador existir foi fechado na F11, junto com o resto.

**A F11 fechou, e ela é a fase que mudou o `core` duas vezes.**

A primeira é a autorização. O plano mandava escrever o `preHandler` de permissão rota por rota,
dentro de cada maestro — e a auditoria recusou pelo mesmo motivo que a F3 já havia recusado para a
SESSÃO: por rota, a rota NOVA nasce liberada, e esquecer de protegê-la não gera erro nenhum. Nasceu
`core/http/permission-guard.ts`, irmão do `require-auth.ts`, com um degrau que o irmão não tem: ele
confere a tabela de rotas do Fastify **no boot**, e rota sem declaração **derruba o processo**
(D137). O esquecimento deixou de ser uma API aberta em silêncio e passou a ser um `npm test`
vermelho.

A segunda é a identidade. `auth/` ganhou segundo fator e token pessoal pelo caminho que o D80 já
tinha aberto; `access/` ganhou o diretório e o SSO. E as três entradas terminam no MESMO cookie, com
a mesma releitura de usuário e as mesmas permissões — porque duas formas de "sessão emitida"
significariam dois jeitos de montar o cookie, e um deles ficaria sem o `tv` no primeiro refactor.

**E ela é a primeira fase cuja migração não é aditiva.** O `DROP COLUMN users.department` foi em dois
tempos, com o contrato mudando na migração 1 (D135) e a coluna caindo na 2 — entre as duas, um
rollback ainda encontra o texto original. Foi também a primeira vez que a receita de reconstruir o
banco do zero (`referencia/arquitetura.md`) deixou de ser zelo e passou a ser pré-requisito de fechar a fase.

**O que a F11 descobriu e corrigiu fora do próprio escopo:** o termo de entrega de alvo `LOCATION`
(F4) lia `Location.manager` da FOLHA e recusava com 409 — entregar para a "Mesa 1" dentro de um
"Andar 2" que tem gestor era recusado, com o gestor cadastrado e visível na tela. A fronteira do D72
revelou isso ao escrever a função que sobe a árvore, e o aceite passou a usá-la (D139).

**F0 → F1 → F2 continua o caminho crítico.** Tudo depende do modelo de dados certo. Começar por
telas antes disso é retrabalho garantido — foi exatamente o que aconteceu com
`InventoryItem.assignedToId`, que nasceu no schema e nunca foi usado.

**Por que o modelo de posse entrou antes da F4 completa.** Ele não é uma fase; é
fundação, e aparece no diagrama entre a F1 e a F2 porque é quando as tabelas
entraram no banco. O gatilho foi a pergunta da Mesa 1, feita durante a auditoria
da F1 — e a resposta muda **cardinalidade**, que é a decisão mais cara de adiar.

Decidir depois de a `Assignment` existir e estar em uso significaria mexer em
cinco arquivos de uma vez — o schema e a migration (com backfill de linhas já
gravadas), o use-case de checkout, o de checkin, a resolução de responsáveis e o
formulário de ativo —, tudo isso com dado de produção no meio. Decidir antes
custou **uma migration num banco de 3 ativos**.

É a mesma conta da *janela*, aplicada uma camada acima: não é a tabela que fica
cara de mudar depois, é a **regra que ela materializa**.

**O que a ordem não mudou:** a F4 continua depois da F3, porque
`Assignment.checkoutById` sem ator é o mesmo log pela metade que motivou a F3 no
lugar onde ela está. O que a antecipação do modelo permitiu foi a F2 já nascer
sabendo o que é a aba Posse — em vez de ganhar uma aba depois.
