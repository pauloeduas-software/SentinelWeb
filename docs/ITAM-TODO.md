# TODO ITAM — Paridade com Snipe-IT

> Levantamento completo do que o Snipe-IT tem e o SentinelWeb ainda não tem.
> Base: auditoria de 9 domínios do Snipe-IT contra o código real do repositório,
> com verificação adversarial de cada item. 179 itens analisados, 175 gaps confirmados.
>
> Legenda de esforço: **P** = até meio dia · **M** = 1 a 3 dias · **G** = mais de 3 dias

---

## Decisões de arquitetura

Tomadas antes de escrever código, porque mudam o nome de tabelas e o caminho das migrações.
Os agentes da auditoria divergiram em algumas delas — aqui está a decisão fechada.

- **D1 — `InventoryItem` vira `Asset`; o `Asset` atual (descoberto pelo agente) vira `Endpoint`.**
  No Snipe-IT, `Asset` é o ativo gerenciado — é esse vocabulário que queremos. A tabela que o
  agente C# popula passa a se chamar `Endpoint` (`@@map("endpoints")`).
  Impacta: `server/domain/agent/`, `server/domain/asset/` (vira `endpoint/`),
  `server/domain/inventory/` (vira `asset/`), `src/domain/asset/`, `src/pages/telemetria/*`.
  A estrutura já está preparada — é renomear pasta, não reescrever camada (ver `ARQUITETURA.md`).
  ⚠️ `touchAsset` (`server/domain/asset/use-cases/touch-asset.usecase.ts`) é chamada a cada
  mensagem do agente. Se o rename deixar um `prisma.asset` apontando para o model errado ali, o
  `lastSeen` para de atualizar e o zombie cleaner marca a frota inteira como OFFLINE. Testar
  esse caminho explicitamente.
  As rotas RMM passam para `/api/endpoints` — não por colisão de rota (testei: `POST
  /api/assets/:hwid/command` convive com `POST /api/assets/:id/checkout` no find-my-way 9.7;
  só colide método+caminho idênticos com nome de parâmetro diferente), mas por clareza.

- **D2 — `Folder` morre. ✅ FEITO.**
  Snipe-IT não tem "pastas/filiais". Ele tem `Location` (hierárquica, com endereço, gestor,
  pai/filho) e `Company` (multi-tenancy). O `Folder` era uma invenção nossa que fazia papel de
  location pobre. Removido por completo na migration `20260922180151_remove_folders`:
  model, coluna `folderId`, rotas `/api/folders`, sidebar de pastas e o select do formulário.
  A `Location` de verdade nasce na Fase 1, do zero — não há nada para migrar.

- **D3 — `quantity` sai do `Asset`.**
  No Snipe-IT 1 linha = 1 equipamento físico, com etiqueta e série próprias. Quantidade só
  existe em `Accessory`, `Consumable` e `Component`. O `InventoryItem.quantity` atual vira a
  linha de corte da migração (ver F1.9).

- **D4 — `Company` / Full Multiple Companies Support: descartado.**
  Uma empresa só. FMCS obriga filtro por `companyId` em toda query do Prisma — caro e fácil de
  furar. A hierarquia de `Location` resolve o que precisamos hoje.

- **D5 — Nada de texto livre onde o Snipe-IT tem tabela.** `category` e `status` viram
  `Category` (com `type`) e `StatusLabel` (com `type`).

- **D6 — Baselinar as migrations antes de tocar em qualquer coluna — e NÃO com `migrate dev`.**
  Hoje `prisma/` só tem `schema.prisma`, sem pasta `migrations/`, e a tabela `_prisma_migrations`
  **não existe no banco** (verificado: `SELECT to_regclass('public._prisma_migrations')` → NULL).
  O schema foi aplicado com `db push`. Rodar `prisma migrate dev` nesse estado detecta drift e
  **oferece resetar o banco**. O caminho correto é adotar o estado atual como migração inicial:

  ```bash
  mkdir -p prisma/migrations/0_init
  bunx prisma migrate diff --from-empty --to-schema-datamodel prisma/schema.prisma --script \
    > prisma/migrations/0_init/migration.sql
  bunx prisma migrate resolve --applied 0_init
  ```

- **D7 — Campos customizados em `JsonB`, não em DDL dinâmico.**
  O Snipe-IT cria uma coluna por campo customizado. Isso é inviável com `prisma migrate`.

---

## A janela é agora

Verificado no banco em 22/09/2026: **as 5 tabelas estão com zero linhas** e não existe
`_prisma_migrations`.

A refatoração estrutural das Fases 1 e 2 — renomear models, quebrar `InventoryItem` em quatro
tipos, matar o `Folder`, tornar o ativo unitário — hoje custa um `migrate diff`. Com o inventário
já preenchido, custa um fim de semana de script de backfill com risco de perder dado.

**Fazer a Fase 0 → 1 → 2 antes de cadastrar o primeiro ativo de verdade.**

---

## Fase 0 — Base técnica ✅ CONCLUÍDA

Nada aqui é funcionalidade visível, mas todo o resto depende disso.
Execução detalhada em [`FASE-0-PLANO.md`](./FASE-0-PLANO.md).

- [x] **P** ~~Migration baseline via `migrate diff` + `migrate resolve --applied`~~ — feito (`0_init`). **Nota:** `migrate dev` é interativo e falha neste ambiente; usar `migrate diff --from-url $DATABASE_URL --to-schema-datamodel` + `migrate deploy` para cada migração nova
- [x] **P** ~~Scripts de banco no `package.json`~~ — feito: `db:seed` + bloco `"prisma": { "seed": "tsx prisma/seed.ts" }` (Prisma 5.22 lê daí; `prisma.config.ts` só existe da 6.x)
- [x] **P** ~~`prisma/seed.ts`~~ — encanamento feito (idempotente, só `upsert`, reusa o cliente do servidor). **O conteúdo entra na F1**: `AppSetting`, `StatusLabel`, `Category` e `AssetModel` são tabelas que ainda não existem
- [x] **M** ~~Validação de payload com `zod`~~ — feito: `zod@4`, schemas em `server/domain/<x>/schemas/`, `strictObject` em tudo. Os controllers só chamam `.parse()` e a rejeição cai no errorHandler
- [x] **P** ~~Envelope de erro/sucesso único~~ — feito: `server/core/errors/` com `AppError`, `setErrorHandler`, `ZodError`→422, `P2002`→409, `P2025`→404, `P2003`→409, 429 do rate limit
- [x] **P** ~~Base URL da API configurável~~ — feito: `src/core/api/apiClient.ts`
- [x] **P** ~~Portas por variável de ambiente~~ — feito: `FRONT_PORT=3000`, `PORT=3001`, `POSTGRES_PORT=3002`
- [x] **M** ~~Paginação server-side com envelope `{ total, rows }`~~ — feito nas três listagens, com `$transaction` para contagem e página saírem do mesmo instante
- [x] **P** ~~Ordenação por coluna com allowlist~~ — feito: `server/core/http/list-query.ts` **recebe** a allowlist por parâmetro (core não pode importar domain); cada domínio declara a sua em `helpers/*-filters.helper.ts`
- [x] **M** ~~Busca e filtros no servidor~~ — feito: `buildInventoryWhere` / `buildUserWhere` / `buildAssetWhere`, `contains` + `mode:'insensitive'`
- [x] **P** ~~Endpoint de contadores~~ — feito: `GET /api/inventory/stats`, agregação fora do skip/take
- [x] **M** ~~Soft delete + lixeira + restaurar~~ — feito: escopo automático por Prisma Client Extension (`core/database/soft-delete.extension.ts`), que descobre os models pelo DMMF; `?view=trashed` é opt-in por domínio; aba Lixeira nas duas telas. **`User.email` virou índice único PARCIAL** (`WHERE deleted_at IS NULL`) — com `@unique` comum, um usuário na lixeira travaria o recadastro do mesmo e-mail
- [x] **M** ~~`ActivityLog`~~ — feito: CREATE/UPDATE/DELETE/RESTORE com diff em `changes Json`, gravado na mesma transação da operação. `actorId` nulável, esperando a F3
- [x] **P** ~~Response schema (`select` explícito) e fim do `BigInt.prototype.toJSON` global~~ — feito: allowlist única por domínio (`USER_PUBLIC_SELECT`, `INVENTORY_ITEM_SELECT`) aplicada em listagem, criação e edição; BigInt resolvido em `present-asset.helper.ts`
- [x] **M** ~~Rate limiting + CORS fechado + token do agente~~ — feito: `@fastify/rate-limit` (300/min global, 40/min escrita, 10/min comando RMM), CORS recusa `*`, e o `/agent-hub` exige `Authorization: Bearer $AGENT_TOKEN` com comparação em tempo constante. **`ApiToken` por agente (prefixo, hash, revogação) continua na F3** — o segredo compartilhado é o que tira a porta aberta do ar até lá

## Fase 1 — Tabelas de catálogo

No Snipe-IT isso é o menu *Settings*. É o que transforma texto livre em dado.

- [ ] **M** `Category` com `type` (ASSET / ACCESSORY / CONSUMABLE / COMPONENT / LICENSE), cor, `requireAcceptance`, `eulaText`, `checkinEmail`
- [ ] **M** `StatusLabel` com `type` (DEPLOYABLE / PENDING / ARCHIVED / UNDEPLOYABLE), cor, `showInNav`. Seed: Pronto p/ Uso, Em Uso, Aguardando, Manutenção, Arquivado
- [ ] **G** `Manufacturer` + `AssetModel` (catálogo de modelos com `modelNumber`, `eolMonths`, fieldset, imagem)
- [ ] **M** `Supplier` (fornecedor com contato, endereço, site) + `GET /api/suppliers/:id/assets`
- [ ] **M** `Location` hierárquica (`parentId` self-relation, endereço, gestor, telefone) — nasce do zero, o `Folder` já foi removido (D2)
- [x] **P** ~~Apagar o model `Folder`, as rotas `/api/folders` e a sidebar de pastas~~ — feito
- [ ] **M** `Depreciation` (nome, meses, `floorValue`, `floorType` PERCENT|AMOUNT)
- [ ] **M** Telas de administração do catálogo — `src/pages/configuracoes/` com uma aba por tabela, no mesmo padrão `font-mono text-xs` do `ItamPage`

---

## Fase 2 — Ativos

O coração do Snipe-IT. Hoje o que temos é um item de estoque com quantidade.

- [ ] **G** Renomear `InventoryItem` → `Asset` e `Asset` → `Endpoint` (D1); remover `quantity` (D3)
- [ ] **M** **Asset tag** única com prefixo, zerofill e auto-incremento — `nextAssetTag()` faz `update({ data: { assetTagNext: { increment: 1 } } })` **primeiro** e usa o valor retornado; ler-e-depois-incrementar colide em READ COMMITTED. `GET /api/settings/next-asset-tag` é *peek* puro e nunca incrementa, senão abrir e cancelar o modal fura a sequência
- [ ] **P** **Número de série** único + `GET /api/assets/by-serial/:serial`
- [ ] **P** Unicidade de `assetTag` e `serial` por **índice parcial** em SQL na migration (`WHERE deleted_at IS NULL`), não por `@unique` — senão um item na lixeira impede recadastrar a mesma etiqueta. É o `unique_undeleted` do Snipe-IT
- [ ] **P** Nome do ativo, notas, `byod`, `requestable`
- [ ] **M** Dados de compra: `supplierId`, `orderNumber`, `purchaseDate`, `purchaseCost Decimal @db.Decimal(12,2)` — **Decimal, nunca Float**
- [ ] **P** Garantia em meses + `warrantyExpiresAt` calculada no save
- [ ] **P** EOL: `eolMonths` no modelo, `eolDate` calculada, `eolExplicit` para override manual
- [ ] **M** `Asset.statusId` obrigatório apontando para `StatusLabel`; status vira consequência do checkout, não campo digitado
- [ ] **M** Soft delete com lixeira e restauração (herda F0)
- [ ] **P** Arquivar ativo (status `type = ARCHIVED` sai das listagens por padrão; `?view=archived`)
- [ ] **G** `AssetLog` — histórico por ativo (CREATE/UPDATE/DELETE/RESTORE/ARCHIVE/CHECKOUT/CHECKIN/NOTE/IMPORT) com campo, valor antigo, valor novo e ator. Aba "Histórico" na tela de detalhe
- [ ] **M** **Tela de detalhe do ativo** (`/itam/assets/:id`) — hoje só existe modal de edição. Abas: Detalhes, Histórico, Componentes, Licenças, Manutenções, Arquivos
- [ ] **G** Ações em massa: editar N, trocar status, mover de localização, excluir, checkout em massa
- [ ] **P** Clonar ativo (abre o form em modo create limpando `id`, `assetTag`, `serial`, `assignedTo`)
- [ ] **M** Imagem do ativo, do modelo, do fabricante e da categoria (`@fastify/multipart` + `@fastify/static` numa segunda raiz)
- [ ] **M** Anexos por ativo (nota fiscal, contrato, foto) com tipo e tamanho permitidos
- [ ] **M** Busca, filtros, ordenação e paginação na listagem de ativos
- [ ] **P** Descomissionamento: `retiredAt`, `retiredReason` (VENDIDO / DESCARTADO / EXTRAVIADO / ROUBADO / GARANTIA)

---

## Fase 3 — Autenticação e ator

Entra cedo porque `ActivityLog` sem ator é log pela metade. RBAC completo fica na Fase 11.

- [ ] **M** Login, senha e sessão — **não existe nada hoje**. `username @unique`, `passwordHash` (argon2), `@fastify/jwt` + `@fastify/cookie`, `POST /api/auth/login`, `preHandler` global
- [ ] **P** `failedLoginCount` / `lockedUntil` (bloqueio por tentativas)
- [ ] **P** `createdById` / `updatedById` em todas as tabelas, preenchidos a partir de `request.user`
- [ ] **M** Autenticação do agente C# no `/agent-hub` com `ApiToken` por agente (prefixo, hash, revogação, `lastUsedAt`) — a F0 já fechou a porta com `AGENT_TOKEN` compartilhado; falta o token por agente
- [ ] **P** Tela de login no padrão visual do projeto

---

## Fase 4 — Checkout / Checkin

O ciclo de empréstimo. **Falta 100%.** `assignedToId` existe no schema e na resposta do GET
(`prisma/schema.prisma`, `server/domain/inventory/helpers/inventory-select.helper.ts`) mas
nenhuma rota escreve nele.

- [ ] **M** `Assignment` — id, alvo polimórfico (`targetType` USER|ASSET|LOCATION + 3 FKs nuláveis), `checkoutAt`, `expectedCheckinAt`, `checkinAt`, `checkoutNotes`, `checkinNotes`
- [ ] **M** `POST /api/assets/:id/checkout` para **usuário**
- [ ] **M** Checkout para **outro ativo** e para **localização** (o seletor de 3 abas do Snipe-IT)
- [ ] **M** `POST /api/assets/:id/checkin` — fecha o `Assignment`, limpa o responsável, aplica o status de devolução
- [ ] **M** Histórico completo de posse (quem teve o quê e quando) — alimenta a aba Histórico da F2
- [ ] **P** Regras da operação: duplo checkout, item indisponível, atomicidade em `$transaction`
- [ ] **P** Status derivado do checkout (checkout força DEPLOYABLE→em uso; checkin aplica o status escolhido)
- [ ] **M** `GET /api/users/:id/holdings` + **tela de perfil do colaborador** com o que ele tem em posse e o histórico
- [ ] **P** Check-in em massa no desligamento (`POST /api/users/:id/checkin-all`) + `DELETE /api/users/:id` passa a responder 409 se houver item em posse
- [ ] **M** Checkout em massa (kit de onboarding)
- [ ] **M** E-mail automático no checkout e no checkin (`nodemailer`, com modo no-op quando SMTP não estiver configurado)
- [ ] **M** Itens vencidos (overdue) e lembrete automático de devolução
- [ ] **G** Fluxo de aceite — `Acceptance` com token, snapshot do EULA da categoria, página pública `/aceite/:token`
- [ ] **M** Assinatura digital no aceite (`<canvas>` + `toDataURL`)
- [ ] **M** PDF do termo de entrega assinado (`pdfkit`, sem Chromium)
- [ ] **P** Relatório de itens não aceitos + reenvio de lembrete

---

## Fase 5 — Acessórios, Consumíveis e Componentes

Hoje os três estão achatados num `InventoryItem` com `quantity`. São três semânticas diferentes.

- [ ] **M** `Accessory` — qty, `minQty`, checkout para **pessoa**, devolve
- [ ] **M** `Consumable` — qty, `minQty`, checkout **decrementa e não volta** (sem `checkedInAt`, de propósito)
- [ ] **M** `Component` — qty, `minQty`, checkout **para um ativo** (RAM, HD)
- [ ] **M** `AccessoryCheckout` (uma linha por unidade entregue) — soft-checkin via `checkedInAt`, nunca deletar a linha
- [ ] **M** `ConsumableCheckout` com `userNameSnapshot` (o consumo permanece no histórico mesmo se o usuário sair)
- [ ] **G** `ComponentAsset` com `assignedQty` — **primeira ponte real entre estoque e ativo**
- [ ] **M** Quantidade restante **calculada**, nunca coluna: `qty - COUNT(checkouts abertos)` / `qty - SUM(assignedQty)`
- [ ] **M** Devolução parcial ou total de componente
- [ ] **P** `minQty` + `GET /api/inventory/alerts` (estoque baixo)
- [ ] **P** Ajuste de estoque como operação própria (`POST /:id/adjust-quantity` com `delta` e nota) — **tirar o campo quantidade do formulário de edição**
- [ ] **M** `StockLog` — histórico de movimentação por item
- [ ] **M** Visões "o que este usuário tem" e "o que está dentro deste ativo"
- [ ] **M** **Migração do `InventoryItem` achatado para os três tipos, sem perder dados** — migração aditiva primeiro, backfill por categoria depois, `inventory_items` só cai no fim

---

## Fase 6 — Licenças de Software

Módulo inteiro do Snipe-IT que não existe aqui.

- [ ] **G** `License` — nome, `seatsTotal`, `reassignable`, `maintained`, `expirationDate`, `terminationDate`, licenciado para (nome/e-mail), fornecedor, fabricante, categoria
- [ ] **G** `LicenseSeat` materializado — uma linha por assento, com contagem de livres/ocupados
- [ ] **M** Checkout/checkin de assento para **usuário OU ativo** (XOR validado), com `SELECT ... FOR UPDATE SKIP LOCKED` para pegar o primeiro assento livre sem corrida
- [ ] **P** `reassignable` / `maintained` com efeito real: licença não reatribuível **queima o assento** na devolução
- [ ] **M** Product key cifrada em repouso (AES-256-GCM, chave em `APP_ENCRYPTION_KEY`) e mascarada na resposta
- [ ] **P** Status derivado: ATIVA / VENCENDO / EXPIRADA / ENCERRADA (calculado, não coluna)
- [ ] **M** Dados de compra da licença + `minAmt` (estoque mínimo de assentos)
- [ ] **M** Anexos de licença (nota fiscal, contrato, certificado)
- [ ] **M** Alertas de licença expirando e de assentos abaixo do mínimo
- [ ] **M** Histórico da licença (quem pegou, quem devolveu, quem viu a chave)
- [ ] **P** Export CSV de licenças **com a chave mascarada por padrão**

---

## Fase 7 — Convergência RMM × ITAM

**Isto o Snipe-IT não tem.** Ele é um CMDB manual, sem descoberta. Nós temos agente instalado.
É aqui que o produto deixa de ser um clone.

- [ ] **M** Vínculo `Endpoint` ↔ `Asset` (FK opcional 1:1). **Não fundir as tabelas**: quebraria os ativos sem agente (monitor, cadeira, cabo)
- [ ] **M** **Agente C# passa a coletar número de série, UUID de sistema, fabricante, modelo e chassi** (`Win32_BIOS.SerialNumber`, `Win32_ComputerSystemProduct.UUID`, `Win32_ComputerSystem.Manufacturer/Model`). Sem serial não existe reconciliação confiável — MAC muda com dock/VPN e hostname é renomeável
- [ ] **M** Motor de matching em cascata: serial (100) → UUID (100) → MAC normalizado (85) → hostname (60)
- [ ] **M** `ReconciliationSuggestion` + **fila de reconciliação** na UI (descobertos sem cadastro, sugestões de vínculo, aceitar/recusar)
- [ ] **M** Auto-provisionamento configurável (OFF / SUGGEST / ON) — default SUGGEST, senão máquina de teste polui o inventário
- [ ] **P** **Ativo fantasma**: cadastrado e nunca visto pelo agente (ou visto pela última vez há N dias)
- [ ] **P** **Shadow IT**: máquina vista pelo agente e não cadastrada há mais de 24h (`reviewState`: UNREVIEWED / ALLOWED / BLOCKED)
- [ ] **M** Specs de hardware como **atributo do ativo**, não métrica — hoje RAM total e tamanho de disco vivem na tabela de telemetria e somem no expurgo
- [ ] **M** `AssetChange` — histórico de mudança de hardware detectada automaticamente (trocou o HD, tiraram pente de RAM)
- [ ] **M** `SoftwarePackage` + `SoftwareInstallation` — normalizar o `installedSoftware`, que hoje é **JSON write-only**: é gravado no handshake e nunca lido por nada
- [ ] **G** **Conformidade de licença alimentada pelo software realmente instalado**: instalado sem licença, assento pago sem instalação
- [ ] **P** Separar os dois eixos de status: `AgentStatus` (ONLINE/OFFLINE/NEVER_SEEN) × `LifecycleStatus` (StatusLabel). Hoje os dois são `String` livre e se confundem
- [ ] **P** Auditoria automática: cada handshake é uma auditoria física (`lastAuditMethod = AGENT`)
- [ ] **M** Detecção e fusão de ativos duplicados (reimagem ou troca de placa muda o `hwid`) — sugerir MERGE em vez de criar registro novo em silêncio
- [ ] **M** Ativo ocioso detectado por telemetria (`AssetUsageDaily` agregado por dia — sem isso a query varre milhões de linhas)
- [ ] **P** Atribuição sugerida pelo usuário logado na máquina (`Win32_ComputerSystem.UserName` casando com `User.email`)
- [ ] **P** Painel de cobertura: total cadastrado, com agente, sem agente, órfãos, fantasmas, não autorizados

---

## Fase 8 — Ciclo de vida

- [ ] **M** `Maintenance` — tipo (MANUTENÇÃO / REPARO / UPGRADE / CALIBRAÇÃO / SUPORTE), fornecedor, início, fim, custo, `isWarranty`
- [ ] **P** Tela global de manutenções com custo acumulado e em aberto
- [ ] **M** `Audit` — auditoria física com resultado (OK / DIVERGENTE / NÃO LOCALIZADO), `lastAuditAt`, `nextAuditAt`
- [ ] **P** Intervalo de auditoria global (meses) e antecedência do aviso (dias)
- [ ] **P** Relatório de auditorias vencidas / a vencer / nunca auditadas
- [ ] **P** Conferência de localização durante a auditoria (divergência atualiza o ativo e registra a anterior)
- [ ] **P** Cálculo do valor contábil atual (depreciação linear com piso) — campo calculado, nunca coluna
- [ ] **P** Relatório de depreciação com totais (custo, acumulado, valor atual) — `recharts` já está no `package.json` e **nunca foi importado**; gráfico de curva sai sem instalar nada
- [ ] **P** Relatório de garantias e EOL vencendo em N dias
- [ ] **P** `Setting` de alertas: liga/desliga, destinatários, threshold em dias
- [ ] **M** Envio de e-mail SMTP (`nodemailer`) — hoje o `.env` só tem `DATABASE_URL`
- [ ] **M** Scheduler diário, gravando `lastAlertRunAt` para sobreviver a restart (o `setInterval` do `zombie-cleaner.job.ts` reinicia a cada deploy)
- [ ] **P** Integração com webhook (Slack / Teams)
- [ ] **P** Central de alertas dentro do app

---

## Fase 9 — Campos Customizados

- [ ] **M** `CustomField` — nome, slug, elemento (TEXT / TEXTAREA / LISTBOX / CHECKBOX / RADIO / DATE), formato, help text, obrigatório, único
- [ ] **M** Motor de validação por formato: IP, IPv4, IPv6, MAC, e-mail, URL, numérico, alfanumérico, data, booleano, regex custom
- [ ] **M** `CustomFieldset` aplicado por **Categoria** (o Snipe-IT aplica por modelo; ancorar na categoria enquanto o catálogo de modelos não estiver pronto)
- [ ] **M** Valores em `customFields Json? @db.JsonB` + índice GIN (D7)
- [ ] **M** Renderização dinâmica no formulário e como coluna na tabela
- [ ] **G** Tela de administração de campos e conjuntos
- [ ] **P** Flags de visibilidade (`showInListView`, `displayInUserView`, `showInEmail`)
- [ ] **P** Valor padrão por categoria
- [ ] **M** Campo customizado cifrado em repouso
- [ ] **P** Campos customizados no import e no export CSV

---

## Fase 10 — Etiquetas, Relatórios e Importação

- [ ] **M** Código de barras 1D (Code128) e QR 2D por ativo (`bwip-js` + `qrcode`)
- [ ] **G** Impressão de etiquetas em PDF com layout configurável (folha, tamanho, gutters, logo, campos) + **preview antes de gastar a folha**
- [ ] **M** Busca global otimizada para leitor de código de barras (match exato de asset tag/serial primeiro, depois `ILIKE`)
- [ ] **P** Export CSV de qualquer listagem — **com BOM UTF-8**, senão o Excel em PT-BR abre acentos quebrados
- [ ] **G** Importador CSV com mapeamento de colunas, update de existentes e relatório de erros por linha (`Import` + `ImportRow`)
- [ ] **M** Seção de Relatórios (`/relatorios`) com os relatórios prontos do Snipe-IT
- [ ] **M** Custom report builder com seleção de colunas — `columns` validado contra **allowlist**, nunca montar `select` do Prisma com string do cliente
- [ ] **M** `Setting` singleton + tela de Configurações (branding, logo, favicon, cor, locale, timezone, formato de data, moeda)
- [ ] **P** `src/lib/format.ts` com `Intl.DateTimeFormat` / `Intl.NumberFormat` lendo do `Setting`
- [ ] **M** Backup do banco e dos anexos pela interface (`pg_dump -Fc`) + retenção
- [ ] **M** Seletor de colunas visíveis com preferência salva — o catálogo de colunas paga por três gaps (sort allowlist, custom report, picker)

---

## Fase 11 — Acesso avançado

- [ ] **G** `Group` + permissões granulares por módulo (view / create / edit / delete / checkout por tipo de item)
- [ ] **P** Permissão sobre dado sensível: chave de licença, custo de compra, lista de processos, comandos RMM
- [ ] **P** Campos de identidade do colaborador: nome dividido, matrícula, cargo, telefone, endereço
- [ ] **P** `Department` como entidade (hoje é texto livre em `User.department`)
- [ ] **P** Gestor do colaborador (`managerId`) e visão de liderados
- [ ] **P** Ciclo de vida do colaborador: ativo/inativo, admissão, desligamento, VIP, remoto
- [ ] **M** Listagem de pessoas com busca, paginação e filtros
- [ ] **M** `ApiToken` pessoal (geração, prefixo, hash, revogação, `lastUsedAt`)
- [ ] **M** 2FA TOTP (`otplib` + `qrcode`)
- [ ] **M** Sincronização LDAP / Active Directory (`ldapts`)
- [ ] **M** SSO — OIDC com Entra ID (não SAML), recusando login de quem não está cadastrado
- [ ] **M** Portal do colaborador: ver o que é meu, aceitar o termo, solicitar item
- [ ] **P** Avatar do colaborador (começar por iniciais geradas, sem upload)

---

## Descartado de propósito

Registrado para não ser reaberto a cada revisão.

| Funcionalidade do Snipe-IT | Por quê |
|---|---|
| **Companies / Full Multiple Companies Support** | Uma empresa só. Exige scope por `companyId` em toda query — alto custo, fácil de furar. `Location` hierárquica cobre o que precisamos |
| **Folder / filiais (nosso, não do Snipe-IT)** | Não existe no Snipe-IT e duplica `Location`. Morre na F1 |
| **Fila de requisição e aprovação de item** | Time interno pequeno pede no chat. Duas telas, valor zero. `requestable` fica no schema para quando fizer sentido |
| **Requisição de licença** | Mesmo motivo |
| **Renumeração em massa de asset tags** | Operação de migração, não de produto. Script pontual resolve |

---

## Ordem de execução recomendada

```
F0 (base) → F1 (catálogo + matar Folder) → F2 (ativos) → F3 (auth)
   → F4 (checkout) → F5 (estoque) → F6 (licenças) → F7 (convergência RMM)
      → F8 (ciclo de vida) → F9 (campos) → F10 (relatórios) → F11 (acesso)
```

**F0 → F1 → F2 é o caminho crítico.** Tudo depende do modelo de dados certo. Começar por
telas antes disso é retrabalho garantido — foi exatamente o que aconteceu com
`InventoryItem.assignedToId`, que nasceu no schema e nunca foi usado.
