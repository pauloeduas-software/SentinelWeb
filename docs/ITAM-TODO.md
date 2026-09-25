# TODO ITAM — inspirado no Snipe-IT

> Levantamento do que o Snipe-IT tem e o SentinelWeb ainda não tem.
> Base: auditoria de 9 domínios do Snipe-IT contra o código real do repositório,
> com verificação adversarial de cada item. 179 itens analisados, 175 gaps
> confirmados.
>
> **O Snipe-IT é referência, não autoridade.** Onde ele já resolveu, copiamos a
> solução (D1–D13). Onde ele não modela o problema — e a posse compartilhada por
> posto de trabalho é o primeiro caso — o caminho é nosso e está escrito em
> [`MODELO-POSSE.md`](./MODELO-POSSE.md) e [`DECISOES-POSSE.md`](./DECISOES-POSSE.md)
> (D14–D17).
>
> Legenda de esforço: **P** = até meio dia · **M** = 1 a 3 dias · **G** = mais de 3 dias
> Estado: `[ ]` a fazer · `🔄` **em implementação agora**, ainda não verificado ·
> `[x]` feito e verificado

---

## Decisões de arquitetura

Tomadas antes de escrever código, porque mudam o nome de tabelas e o caminho das migrações.
Os agentes da auditoria divergiram em algumas delas — aqui está a decisão fechada.

- **D1 — `InventoryItem` vira `Asset`; o `Asset` atual (descoberto pelo agente) vira `Endpoint`. ✅ FEITO na F1.**
  Executado como `drop`+`create` do lado ITAM (D12) e rename de verdade do lado RMM.
  No Snipe-IT, `Asset` é o ativo gerenciado — é esse vocabulário que queremos. A tabela que o
  agente C# popula passa a se chamar `Endpoint` (`@@map("endpoints")`).
  Impactou: `server/domain/agent/`, `server/domain/asset/` (virou `endpoint/`),
  `server/domain/inventory/` (virou `asset/`), `src/domain/asset/`, `src/pages/telemetria/*`.
  ⚠️ O ponto de risco era `touchAsset`, chamada a cada mensagem do agente: um `prisma.asset`
  apontando para o model errado ali congelaria o `lastSeen` e o zombie cleaner marcaria a frota
  inteira como OFFLINE. **Verificado na auditoria:** o arquivo hoje é
  `server/domain/endpoint/use-cases/touch-endpoint.usecase.ts` e aponta para o model certo —
  e os 6 pontos do RMM falharam na compilação durante o rename, nenhum silencioso (ver D13).
  As rotas RMM passaram para `/api/endpoints` — não por colisão de rota (testado: `POST
  /api/assets/:hwid/command` convive com `POST /api/assets/:id/checkout` no find-my-way 9.7;
  só colide método+caminho idênticos com nome de parâmetro diferente), mas por clareza.

- **D2 — `Folder` morre. ✅ FEITO.**
  Snipe-IT não tem "pastas/filiais". Ele tem `Location` (hierárquica, com endereço, gestor,
  pai/filho) e `Company` (multi-tenancy). O `Folder` era uma invenção nossa que fazia papel de
  location pobre. Removido por completo na migration `20260922180151_remove_folders`:
  model, coluna `folderId`, rotas `/api/folders`, sidebar de pastas e o select do formulário.
  A `Location` de verdade nasceu na F1, do zero — não havia nada para migrar.

- **D3 — `quantity` sai do `Asset`. ✅ APLICADO na F1.**
  No Snipe-IT 1 linha = 1 equipamento físico, com etiqueta e série próprias. Quantidade só
  existe em `Accessory`, `Consumable` e `Component` (F5). Resolveu-se sozinho pelo D12: a
  tabela nova nasceu sem a coluna.

- **D4 — `Company` / Full Multiple Companies Support: descartado.**
  Uma empresa só. FMCS obriga filtro por `companyId` em toda query do Prisma — caro e fácil de
  furar. A hierarquia de `Location` resolve o que precisamos hoje.

- **D5 — Nada de texto livre onde o Snipe-IT tem tabela. ✅ APLICADO na F1.** `category` e
  `status` viraram `Category` (com `type`) e `StatusLabel` (com `type`).
  **Correção vinda da auditoria da F1:** o seed classificava "Em Uso" como `DEPLOYABLE`, e
  `DEPLOYABLE` significa *pode ser entregue* — um ativo que está com alguém não pode. As duas
  saídas óbvias foram descartadas (derivar de `assignedToId` deixa sem resposta o monitor
  parafusado na sala, que está em uso **sem** responsável; tipar `PENDING` empacota "está com
  um colaborador" junto com "está na assistência", que é a distinção mais cara do inventário).
  `IN_USE` virou o **quinto** tipo do enum, entre `DEPLOYABLE` e `PENDING`:

  ```prisma
  enum StatusLabelType {
    DEPLOYABLE    // no estoque, pode ser entregue — o único que libera o checkout
    IN_USE        // com alguém ou instalado em algum lugar
    PENDING       // fora do estoque por impedimento, e volta (reparo, trânsito)
    ARCHIVED      // saiu da operação
    UNDEPLOYABLE  // ainda é seu, não serve, não volta
  }
  ```

  **São cinco tipos, não quatro.** Qualquer texto, tela ou allowlist que liste quatro está
  desatualizado. A posição importa: o Postgres ordena pela ordem de declaração e a listagem de
  status é ordenável por `type` — a migration precisou de `ADD VALUE 'IN_USE' AFTER 'DEPLOYABLE'`
  à mão, porque o `migrate diff` acrescenta no fim.

- **D6 — Baselinar as migrations antes de tocar em qualquer coluna — e NÃO com `migrate dev`. ✅ FEITO na F0.**
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

- **D7 — Campos customizados em `JsonB`, não em DDL dinâmico.**
  O Snipe-IT cria uma coluna por campo customizado. Isso é inviável com `prisma migrate`.

- **D8 — O catálogo não tem soft delete. ✅ APLICADO.** Delete real, bloqueado por
  uso (409 com a contagem) — que é a proteção que o Snipe-IT de fato aplica ao
  recusar apagar categoria com item associado. A lixeira sairia cara aqui porque a
  extension do Prisma **não alcança leitura de relação aninhada** (verificado): uma
  categoria apagada continuaria aparecendo em todo ativo que a referencia.
  A auditoria da F1 achou o outro lado disso: `countUsages` rodava **com** escopo de lixeira e
  não enxergava ativo apagado, então apagar fornecedor zerava o vínculo de ativos na lixeira em
  silêncio. Corrigido com `INCLUINDO_LIXEIRA` nas cinco specs que contam ativos.

- **D9 — Um domínio `catalog` com sete specs. ✅ APLICADO.** `server/domain/catalog/`.
  Sete fatias verticais seriam ~77 arquivos quase idênticos.

- **D10 — `type` é `enum` do Prisma. ✅ APLICADO.** `CategoryType`, `StatusLabelType`,
  `DepreciationFloorType` viram tipos do Postgres. Preço conhecido: acrescentar valor
  depois é `ALTER TYPE … ADD VALUE` à mão — foi exatamente o que o `IN_USE` custou.

- **D11 — `/options` separado da listagem. ✅ APLICADO.** `perPage` tem teto de 100,
  certo para tabela e errado para `<select>`.

- **D12 — O `Asset` nasceu inteiro na F1. ✅ APLICADO.** `inventory_items` foi
  **apagada**, não migrada: a base anterior era descartável e as tabelas estavam
  zeradas, então foi `drop` + `create` na forma do Snipe-IT.

- **D13 — `Asset` nunca tem `status`, `lastSeen` nem `hwid`. ✅ REGRA PERMANENTE.** São colunas
  do `Endpoint`. É essa ausência que faz o compilador barrar uma query do RMM apontando para a
  tabela errada — testado: os 6 pontos do RMM falharam na compilação com 11 erros, nenhum
  silencioso. O status do ciclo de vida é `statusId` (D5).
  **Quando a F7 registrar o último contato do agente no ativo, o campo chama
  `lastSeenByAgentAt` ou `lastAuditAt`, nunca `lastSeen`.** É o mesmo par de eixos que a F7 já
  separa (`AgentStatus` × `LifecycleStatus`), aplicado ao nome da coluna.

### Modelo de posse — D14 a D17

Detalhe, descartados e o que quebra na reversão em [`DECISOES-POSSE.md`](./DECISOES-POSSE.md).
O contrato do modelo está em [`MODELO-POSSE.md`](./MODELO-POSSE.md).

- **D14 — O detentor é singular; o ALVO é que é polimórfico. ✅ APLICADO no schema.**
  Um ativo tem **no máximo uma** posse aberta, garantida pelo índice único parcial
  `assignments_um_aberto_por_ativo` (`WHERE "checkinAt" IS NULL`) — regra do banco, não da
  aplicação. O alvo pode ser pessoa, localização ou outro ativo (`AssignmentTarget`).
  Descartado `Asset ⟷ User` N:M: perde o posto, que é a unidade real da operação, e cresce
  multiplicativamente (20 mesas × 5 ativos × 2 turnos = 200 linhas contra 40).
  **Derrubar aquele índice é a alavanca** para N detentores simultâneos no futuro — a mudança é
  de uma linha de DDL, não de camada.

- **D15 — O posto de trabalho é uma `Location`, não uma entidade nova. ✅ APLICADO no schema.**
  A árvore já existe (`Sede → Andar 2 → Sala 3 → Mesa 1`) e o ativo já aponta para ela por
  `locationId`. Uma `Workstation` paralela duplicaria a hierarquia e daria ao ativo **dois
  campos de "onde"**. Quem ocupa o posto vive em `LocationOccupant`, com `shift` **texto livre**
  — enum engessaria escalas reais (12x36, revezamento A/B) e faixa de horário seria agenda, não
  inventário.

- **D16 — Responsabilidade é DERIVADA, nunca coluna.**
  `resolverResponsaveis(ativo)` lê a assignment aberta e, quando o alvo é `LOCATION`, os
  ocupantes abertos daquele local. Coluna seria uma quarta fonte de verdade para o que as
  Camadas 1 e 2 já dizem, e a divergência seria **silenciosa**. O salto de `ASSET` é limitado a
  **um nível** (dock → notebook → pessoa), o que também torna ciclo impossível por construção.

- **D17 — `Asset.assignedToId` deixa de ser editável pelo formulário.**
  Vira **cache do caso `USER`** e sai do `createAssetSchema`, do `updateAssetSchema` e do modal.
  Escrevem nele só o checkout e o checkin. Campo editável à mão ao lado de uma tabela de posse
  são duas fontes de verdade para o mesmo fato. **É o mesmo erro que a auditoria da F1 encontrou
  um nível acima** — "Em Uso" tipado `DEPLOYABLE`, um rótulo declarado competindo com um fato
  derivável —, agora uma camada abaixo: se a operação existe, ela é a dona do campo.

---

## Índice das decisões

Gerado a partir dos próprios arquivos. **D1–D13** estão acima nesta página (as D8–D13 detalhadas em [`FASE-1-PLANO-ITAM.md`](./FASE-1-PLANO-ITAM.md)); **D14–D17** em [`DECISOES-POSSE.md`](./DECISOES-POSSE.md); **D18+** no plano da fase que as tomou; **D83–D89** em [`FECHAMENTO-F2-F4-PLANO-ITAM.md`](./FECHAMENTO-F2-F4-PLANO-ITAM.md), que fecha as pontas abertas das F2, F3 e F4.

> ⚠️ O [`FASE-0-PLANO-ITAM.md`](./FASE-0-PLANO-ITAM.md) usa uma numeração LOCAL (`D1. Migração`, `D2. O escopo automático`…) que antecede este esquema e **não** corresponde às D1–D4 desta página. É registro histórico e ficou como está.

| # | Decisão | Onde |
|---|---|---|
| **D14** | O detentor é singular; o ALVO é que é polimórfico | [`DECISOES-POSSE.md`](./DECISOES-POSSE.md) |
| **D15** | O posto de trabalho é uma Location, não uma entidade nova | [`DECISOES-POSSE.md`](./DECISOES-POSSE.md) |
| **D16** | Responsabilidade é DERIVADA, nunca coluna | [`DECISOES-POSSE.md`](./DECISOES-POSSE.md) |
| **D17** | Asset.assignedToId deixa de ser editável pelo formulário | [`DECISOES-POSSE.md`](./DECISOES-POSSE.md) |
| **D18** | AssetLog não nasce. A aba Histórico lê o ActivityLog | [`FASE-2-PLANO-ITAM.md`](./FASE-2-PLANO-ITAM.md) |
| **D19** | Arquivar, descomissionar e apagar são três coisas, com três colunas | [`FASE-2-PLANO-ITAM.md`](./FASE-2-PLANO-ITAM.md) |
| **D20** | "Arquivados" e "posto vago" são filtros do domínio, não view do core | [`FASE-2-PLANO-ITAM.md`](./FASE-2-PLANO-ITAM.md) |
| **D21** | Ação em massa é tudo ou nada; entrega em massa não será (F4) | [`FASE-2-PLANO-ITAM.md`](./FASE-2-PLANO-ITAM.md) |
| **D22** | Sessão em cookie httpOnly, não em localStorage | [`FASE-3-PLANO-ITAM.md`](./FASE-3-PLANO-ITAM.md) |
| **D23** | actorId é parâmetro obrigatório, não AsyncLocalStorage | [`FASE-3-PLANO-ITAM.md`](./FASE-3-PLANO-ITAM.md) |
| **D24** | O histórico anterior fica sem ator. Não há backfill | [`FASE-3-PLANO-ITAM.md`](./FASE-3-PLANO-ITAM.md) |
| **D25** | Ocupação de posto não ganha coluna de ator | [`FASE-3-PLANO-ITAM.md`](./FASE-3-PLANO-ITAM.md) |
| **D26** | createdById/updatedById só onde a tela mostra | [`FASE-3-PLANO-ITAM.md`](./FASE-3-PLANO-ITAM.md) |
| **D27** | Num posto com duas pessoas, quem assina o termo é o gestor da localidade | [`FASE-4-PLANO-ITAM.md`](./FASE-4-PLANO-ITAM.md) |
| **D28** | Quando o último ocupante sai, a posse continua aberta | [`FASE-4-PLANO-ITAM.md`](./FASE-4-PLANO-ITAM.md) |
| **D29** | O EULA é copiado para o Acceptance, não referenciado | [`FASE-4-PLANO-ITAM.md`](./FASE-4-PLANO-ITAM.md) |
| **D30** | O PDF é gerado no aceite e guardado. Nunca regenerado | [`FASE-4-PLANO-ITAM.md`](./FASE-4-PLANO-ITAM.md) |
| **D31** | Entrega em massa é por linha, com relatório. (O oposto da F2.) | [`FASE-4-PLANO-ITAM.md`](./FASE-4-PLANO-ITAM.md) |
| **D32** | Desligamento é uma operação com nome próprio, e fecha as duas camadas | [`FASE-4-PLANO-ITAM.md`](./FASE-4-PLANO-ITAM.md) |
| **D33** | O acessório entregue a um posto é do posto; os ocupantes respondem solidariamente | [`FASE-5-PLANO-ITAM.md`](./FASE-5-PLANO-ITAM.md) |
| **D34** | Saldo é sempre calculado, nunca coluna | [`FASE-5-PLANO-ITAM.md`](./FASE-5-PLANO-ITAM.md) |
| **D35** | Um domínio stock, não três fatias verticais | [`FASE-5-PLANO-ITAM.md`](./FASE-5-PLANO-ITAM.md) |
| **D36** | Os três têm lixeira; aqui o D8 não se aplica | [`FASE-5-PLANO-ITAM.md`](./FASE-5-PLANO-ITAM.md) |
| **D37** | Consumable não tem devolução; não é validação, é ausência | [`FASE-5-PLANO-ITAM.md`](./FASE-5-PLANO-ITAM.md) |
| **D38** | Devolução parcial de componente divide a linha | [`FASE-5-PLANO-ITAM.md`](./FASE-5-PLANO-ITAM.md) |
| **D39** | Assento de licença não vai para um posto | [`FASE-6-PLANO-ITAM.md`](./FASE-6-PLANO-ITAM.md) |
| **D40** | Assento materializado, ocupação em tabela própria | [`FASE-6-PLANO-ITAM.md`](./FASE-6-PLANO-ITAM.md) |
| **D41** | FOR UPDATE SKIP LOCKED, e o preço dele | [`FASE-6-PLANO-ITAM.md`](./FASE-6-PLANO-ITAM.md) |
| **D42** | Chave cifrada numa coluna versionada, sem plano B em claro | [`FASE-6-PLANO-ITAM.md`](./FASE-6-PLANO-ITAM.md) |
| **D43** | burnedAt e retiredAt são fatos diferentes | [`FASE-6-PLANO-ITAM.md`](./FASE-6-PLANO-ITAM.md) |
| **D44** | Status da licença é derivado, nunca coluna | [`FASE-6-PLANO-ITAM.md`](./FASE-6-PLANO-ITAM.md) |
| **D45** | A FK mora no Endpoint, e as tabelas não se fundem | [`FASE-7-PLANO-ITAM.md`](./FASE-7-PLANO-ITAM.md) |
| **D46** | Evidência ambígua é evidência zero | [`FASE-7-PLANO-ITAM.md`](./FASE-7-PLANO-ITAM.md) |
| **D47** | O usuário logado sugere ocupação quando a posse é do posto | [`FASE-7-PLANO-ITAM.md`](./FASE-7-PLANO-ITAM.md) |
| **D48** | Dois usuários na mesma máquina é evidência de posto compartilhado | [`FASE-7-PLANO-ITAM.md`](./FASE-7-PLANO-ITAM.md) |
| **D49** | Observação de usuário é agregada por dia, com retenção | [`FASE-7-PLANO-ITAM.md`](./FASE-7-PLANO-ITAM.md) |
| **D50** | lastSeenByAgentAt existe, é escrito uma vez por dia, e nunca se chama lastSeen | [`FASE-7-PLANO-ITAM.md`](./FASE-7-PLANO-ITAM.md) |
| **D51** | Auto-provisionamento nasce em SUGGEST | [`FASE-7-PLANO-ITAM.md`](./FASE-7-PLANO-ITAM.md) |
| **D52** | A auditoria corrige *onde está*. Nunca *quem responde* | [`FASE-8-PLANO-ITAM.md`](./FASE-8-PLANO-ITAM.md) |
| **D53** | lastAuditAt é coluna. nextAuditAt não nasce | [`FASE-8-PLANO-ITAM.md`](./FASE-8-PLANO-ITAM.md) |
| **D54** | A auditoria é registrada por ATIVO. O posto é a unidade de trabalho | [`FASE-8-PLANO-ITAM.md`](./FASE-8-PLANO-ITAM.md) |
| **D55** | Valor contábil é calculado no servidor. Sempre | [`FASE-8-PLANO-ITAM.md`](./FASE-8-PLANO-ITAM.md) |
| **D56** | O job diário não é setInterval. É tick curto com compare-and-set | [`FASE-8-PLANO-ITAM.md`](./FASE-8-PLANO-ITAM.md) |
| **D57** | A central no app é o canal primário; SMTP mora no .env | [`FASE-8-PLANO-ITAM.md`](./FASE-8-PLANO-ITAM.md) |
| **D58** | O conjunto ancora na categoria e no modelo, com precedência do modelo | [`FASE-9-PLANO-ITAM.md`](./FASE-9-PLANO-ITAM.md) |
| **D59** | Valores em JsonB na linha do ativo. Não DDL dinâmico, não EAV | [`FASE-9-PLANO-ITAM.md`](./FASE-9-PLANO-ITAM.md) |
| **D60** | O slug é imutável. O valor órfão não é apagado | [`FASE-9-PLANO-ITAM.md`](./FASE-9-PLANO-ITAM.md) |
| **D61** | Obrigatoriedade é do vínculo, não do campo | [`FASE-9-PLANO-ITAM.md`](./FASE-9-PLANO-ITAM.md) |
| **D62** | Cifra é enc:v1: dentro do JsonB, com rota própria para revelar | [`FASE-9-PLANO-ITAM.md`](./FASE-9-PLANO-ITAM.md) |
| **D63** | Filtrar por campo customizado: sim. Ordenar: não, nesta fase | [`FASE-9-PLANO-ITAM.md`](./FASE-9-PLANO-ITAM.md) |
| **D64** | A parte plana é spec de catálogo; a composição é domínio próprio | [`FASE-9-PLANO-ITAM.md`](./FASE-9-PLANO-ITAM.md) |
| **D65** | Não nasce tabela Setting. O AppSetting cresce | [`FASE-10-PLANO-ITAM.md`](./FASE-10-PLANO-ITAM.md) |
| **D66** | Responsável resolvido é uma view, não coluna nem cache | [`FASE-10-PLANO-ITAM.md`](./FASE-10-PLANO-ITAM.md) |
| **D67** | O builder recebe token. Nunca campo, nunca SQL | [`FASE-10-PLANO-ITAM.md`](./FASE-10-PLANO-ITAM.md) |
| **D68** | Importação é de dois passos, e o dry-run é obrigatório | [`FASE-10-PLANO-ITAM.md`](./FASE-10-PLANO-ITAM.md) |
| **D69** | O export manda número cru e data ISO — e trata fórmula | [`FASE-10-PLANO-ITAM.md`](./FASE-10-PLANO-ITAM.md) |
| **D70** | QR leva URL. Código de barras leva a etiqueta | [`FASE-10-PLANO-ITAM.md`](./FASE-10-PLANO-ITAM.md) |
| **D71** | O catálogo de colunas é declarado duas vezes, de propósito | [`FASE-10-PLANO-ITAM.md`](./FASE-10-PLANO-ITAM.md) |
| **D72** | Posto responde pelo ativo; departamento agrupa pessoas; gestor escalona | [`FASE-11-PLANO-ITAM.md`](./FASE-11-PLANO-ITAM.md) |
| **D73** | resolverEscalonamento() é função separada de resolverResponsaveis() | [`FASE-11-PLANO-ITAM.md`](./FASE-11-PLANO-ITAM.md) |
| **D74** | Desligar não é apagar. E encerrar ocupações é passo do fluxo | [`FASE-11-PLANO-ITAM.md`](./FASE-11-PLANO-ITAM.md) |
| **D75** | Department é a oitava spec do catálogo, e a troca de coluna é em duas migrações | [`FASE-11-PLANO-ITAM.md`](./FASE-11-PLANO-ITAM.md) |
| **D76** | Permissão é união permissiva. Não existe deny | [`FASE-11-PLANO-ITAM.md`](./FASE-11-PLANO-ITAM.md) |
| **D77** | Dado sensível é filtrado no select, não mascarado na resposta | [`FASE-11-PLANO-ITAM.md`](./FASE-11-PLANO-ITAM.md) |
| **D78** | LDAP sincroniza; OIDC autentica; ninguém entra sem cadastro | [`FASE-11-PLANO-ITAM.md`](./FASE-11-PLANO-ITAM.md) |
| **D79** | Cada job tem a própria linha em JobRun. lastAlertRunAt não é coluna de AppSetting | [`DECISOES-RECONCILIACAO.md`](./DECISOES-RECONCILIACAO.md) |
| **D80** | Um ApiToken só, com dono polimórfico (agente ou pessoa) | [`DECISOES-RECONCILIACAO.md`](./DECISOES-RECONCILIACAO.md) |
| **D81** | Uma cifra: core/crypto/cipher.ts, enc:v1:kid:iv:tag:ct, com AAD | [`DECISOES-RECONCILIACAO.md`](./DECISOES-RECONCILIACAO.md) |
| **D82** | terminate não existe. A F11 estende o offboard da F4 | [`DECISOES-RECONCILIACAO.md`](./DECISOES-RECONCILIACAO.md) |
| **D83** | O armazenamento é core/storage/; a linha do anexo é do domínio | [`FECHAMENTO-F2-F4-PLANO-ITAM.md`](./FECHAMENTO-F2-F4-PLANO-ITAM.md) |
| **D84** | Anexo não é rota estática. Sai por /api/, com sessão | [`FECHAMENTO-F2-F4-PLANO-ITAM.md`](./FECHAMENTO-F2-F4-PLANO-ITAM.md) |
| **D85** | ?view=archived é a quarta vista, e a listagem padrão exclui ARCHIVED | [`FECHAMENTO-F2-F4-PLANO-ITAM.md`](./FECHAMENTO-F2-F4-PLANO-ITAM.md) |
| **D86** | E-mail é best-effort com log. O que não pode se perder tem linha em tabela | [`FECHAMENTO-F2-F4-PLANO-ITAM.md`](./FECHAMENTO-F2-F4-PLANO-ITAM.md) |
| **D87** | Entrega com alvo ASSET não emite termo | [`FECHAMENTO-F2-F4-PLANO-ITAM.md`](./FECHAMENTO-F2-F4-PLANO-ITAM.md) |
| **D88** | Aceite pendente não bloqueia a entrega | [`FECHAMENTO-F2-F4-PLANO-ITAM.md`](./FECHAMENTO-F2-F4-PLANO-ITAM.md) |
| **D89** | A troca do AGENT_TOKEN pelo ApiToken é por convivência, com prazo | [`FECHAMENTO-F2-F4-PLANO-ITAM.md`](./FECHAMENTO-F2-F4-PLANO-ITAM.md) |
| **D90** | Quem reconcilia trava todos os assentos; quem entrega trava um | [`FASE-6-PLANO-ITAM.md`](./FASE-6-PLANO-ITAM.md) |
| **D91** | Chaveiro, não chave: o kid vem da própria chave, e o canário derruba o boot | [`FASE-6-PLANO-ITAM.md`](./FASE-6-PLANO-ITAM.md) |
| **D92** | livres sai das linhas; aposentados não entra na subtração (corrige o D43) | [`FASE-6-PLANO-ITAM.md`](./FASE-6-PLANO-ITAM.md) |
| **D93** | Assento é posse: entra no holdings, no 409 do DELETE e no offboard | [`FASE-6-PLANO-ITAM.md`](./FASE-6-PLANO-ITAM.md) |
| **D94** | Anexo de licença sai da fase: exige dono polimórfico em Attachment | [`FASE-6-PLANO-ITAM.md`](./FASE-6-PLANO-ITAM.md) |

---

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
Execução detalhada em [`FASE-0-PLANO-ITAM.md`](./FASE-0-PLANO-ITAM.md).

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
texto livre em dado. Execução e provas em [`FASE-1-PLANO-ITAM.md`](./FASE-1-PLANO-ITAM.md);
revisão linha a linha em [`AUDITORIA-F0-F1.md`](./AUDITORIA-F0-F1.md).

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
Execução detalhada em [`FASE-2-PLANO-ITAM.md`](./FASE-2-PLANO-ITAM.md).

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
- [x] **M** ~~**Tela de detalhe do ativo** (`/ativos/:id`, `/itam/assets/:id` até a F6) com sete abas~~ — feito na F2 ([`FASE-2-PLANO-ITAM.md`](./FASE-2-PLANO-ITAM.md)). As sete nascem juntas: Detalhes, Posse, Histórico e Arquivos com conteúdo; Componentes (F5), Licenças (F6) e Manutenções (F8) desabilitadas dizendo em que fase chegam — aba ausente e aba vazia são indistinguíveis de defeito.
- [x] **M** ~~**Aba Posse** — os responsáveis resolvidos no topo e o histórico de `Assignment` abaixo~~ — feito na F2. É a tela que prova o modelo: quem abre um mouse da Mesa 1 lê "Laura (Manhã), Ana (Tarde)" sem nenhum campo digitado.
- [x] **M** ~~Aba **Histórico** do ativo, lendo o `ActivityLog`~~ — feito na F2, sem tabela `AssetLog` (D18). `GET /api/assets/:id/history` une o log e a posse numa lista só.
- [x] **P** ~~Arquivar ativo (status `type = ARCHIVED` sai das listagens por padrão; `?view=archived`)~~ — feito na Leva 1 do [`FECHAMENTO-F2-F4-PLANO-ITAM.md`](./FECHAMENTO-F2-F4-PLANO-ITAM.md) (D85). A vista padrão passou a excluir `ARCHIVED` junto com `retiredAt`, e `?statusId=` explícito vence a exclusão — senão clicar no contador de um status arquivado abriria lista vazia. **A invariante estado × posse continua valendo e já existia** (D16; [`INVARIANTES.md`](./INVARIANTES.md)): ativo com responsável resolvido **não pode** ir para `ARCHIVED` — arquivar é declarar que saiu da operação, e o que está com alguém não saiu. O 409 diz com quem está, não só que falhou. A devolução (checkin) é o pré-requisito, e é a mesma regra que impede `DEPLOYABLE` com detentor. O que faltava era só a VISTA.
- [x] **P** ~~**Relatório "ativos em posto vago"**~~ — feito na F2: `?relatorio=posto-vago`, filtro do Prisma e nunca `.filter()` depois da consulta (senão o `total` do envelope mentiria).
- [x] **G** ~~Ações em massa: editar N, trocar status, mover de localização, excluir, checkout em massa~~ — feito. `POST /api/assets/bulk` é **tudo ou nada** (D21); `POST /api/assets/bulk-checkout` é **por linha com relatório** (D31) — e a diferença é a natureza da operação, não inconsistência.
- [x] **P** ~~Clonar ativo~~ — feito na F2, **sem rota**: é o formulário em modo criação com os valores de outro ativo, e só etiqueta e série nascem em branco. A etiqueta vem do `/settings/next-asset-tag`, que é *peek*.
- [x] **M** ~~Imagem do ativo, do modelo, do fabricante e da categoria~~ — feito na Leva 2 do [`FECHAMENTO-F2-F4-PLANO-ITAM.md`](./FECHAMENTO-F2-F4-PLANO-ITAM.md). `imagePath` nas quatro tabelas, `PUT/GET/DELETE /api/images/:alvo/:id`.
- [x] **M** ~~Anexos por ativo (nota fiscal, contrato, foto) com tipo e tamanho permitidos~~ — feito na Leva 2. **NÃO é rota estática** (D84): sai por `GET /api/attachments/:id/download`, com sessão — em produção o guard libera todo GET fora de `/api`, e uma raiz `/uploads/` deixaria nota fiscal e contrato públicos.
- [x] **M** ~~Busca, filtros, ordenação e paginação na listagem de ativos~~ — feito na F2: `?q=`, `?statusId=`, `?locationId=`, ordenação por allowlist e as quatro vistas (`active|trashed|retired|archived`).
- [x] **P** ~~Descomissionamento: `retiredAt`, `retiredReason`~~ — feito na F2. São TRÊS colunas com três significados (D19), e `retire` recusa ativo entregue com 409 que diz com quem ele está.

---

## Fase 3 — Autenticação e ator ✅ CONCLUÍDA

Entra cedo porque `ActivityLog` sem ator é log pela metade. RBAC completo fica na Fase 11.

- [x] **M** ~~Login, senha e sessão~~ — feito na F3 ([`FASE-3-PLANO-ITAM.md`](./FASE-3-PLANO-ITAM.md)): argon2id, JWT em cookie `httpOnly` (D22), `preHandler` global negando por padrão e `tokenVersion` — trocar a senha derruba quem já está dentro.
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
> no banco ou na aplicação — estão em [`INVARIANTES.md`](./INVARIANTES.md).
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
- [x] **M** ~~**Tela de perfil do colaborador** com os dois baldes e o histórico~~ — `src/pages/gestao-usuario/detalhe/`. O **histórico da pessoa** fechou na Leva 1 do [`FECHAMENTO-F2-F4-PLANO-ITAM.md`](./FECHAMENTO-F2-F4-PLANO-ITAM.md): `GET /api/users/:id/history` une `ActivityLog`, posses diretas e ocupações de posto — a terceira fonte é o que o D25 mandou responder pelo log em vez de virar coluna
- [x] **P** Invariante **estado × posse** ([`INVARIANTES.md`](./INVARIANTES.md)): ativo com responsável resolvido não pode ter status de tipo `DEPLOYABLE` (estoque) nem `ARCHIVED` (fora de operação). É a regra que impede a posse e o status divergirem agora que as duas coisas são graváveis em separado — a continuação direta da correção do `IN_USE` (D5)
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
detalhada em [`FASE-5-PLANO-ITAM.md`](./FASE-5-PLANO-ITAM.md), decisões **D33–D38**.

> A régua contra o ativo: **tem etiqueta própria → é `Asset`**. A dock tem patrimônio e
> série, então é `Asset` com `Assignment` de alvo `ASSET` (F4). O pente de RAM não tem,
> então é `Component`. O mouse avulso da gaveta não tem, então é `Accessory`.

- [x] **M** ~~`Accessory` — qty, `minQty`, checkout para **pessoa ou posto**, devolve~~ — feito. O alvo `LOCATION` é a novidade sobre o Snipe-IT, e o CHECK `accessory_checkout_alvo_xor` põe a coerência do alvo no BANCO (o `Assignment` só a tem na aplicação)
- [x] **M** ~~`Consumable` — qty, `minQty`, checkout **decrementa e não volta**~~ — feito, e a irreversibilidade é ESTRUTURAL: não há coluna de fechamento, não há rota, e `POST /api/consumables/checkouts/:id/checkin` responde **404 do roteador** (D37)
- [x] **M** ~~`Component` — qty, `minQty`, checkout **para um ativo** (RAM, HD)~~ — feito, com `serial` do LOTE (peça com patrimônio próprio é ativo, não componente)
- [x] **M** ~~`AccessoryCheckout` (uma linha por unidade entregue)~~ — feito: `checkedInAt` fecha, a linha nunca é apagada.
  - **A pergunta em aberto foi respondida no [D33](./FASE-5-PLANO-ITAM.md):** acessório entregue a posto conta **uma** unidade, qualquer que seja o número de ocupantes — o saldo do almoxarifado não pode depender da escala do RH. "Quantos mouses a Laura tem?" ganha **duas respostas honestas** (diretos e por posto, compartilhados) que **nunca** são somadas: somar produz "Laura tem 6 mouses" a partir de 5 compartilhados, frase falsa sobre o patrimônio. É por isso que `holdings` devolve `via` **por item** e não devolve total nenhum
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
**[Correções depois do fechamento](./FASE-5-PLANO-ITAM.md#correções-depois-do-fechamento)**.

**Como a fase foi verificada:** 46 asserções em `tests/estoque/`, contra Postgres real e pelo
mesmo Fastify de produção. As duas mais caras são as que falhariam **em silêncio**: o
desligamento que não pode esvaziar o posto e a retirada parcial que divide a linha. As corridas
disparam sem `await` entre elas e contam os status — três unidades com cinco entregas dão três
`201` e dois `409`, e o disponível fecha em `0`, nunca em `-2`.

---

## Fase 6 — Licenças de Software ✅

**Fechada** — ver [`FASE-6-PLANO-ITAM.md`](./FASE-6-PLANO-ITAM.md), com as etapas
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
- [ ] **P** Export CSV de licenças **com a chave mascarada por padrão** — **não existe export no projeto**; o item é da F10. Anotado lá

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

## Fase 7 — Convergência RMM × ITAM

**Isto o Snipe-IT não tem.** Ele é um CMDB manual, sem descoberta. Nós temos agente instalado.
É aqui que o produto deixa de ser um clone.

- [ ] **M** Vínculo `Endpoint` ↔ `Asset` (FK opcional 1:1). **Não fundir as tabelas**: quebraria os ativos sem agente (monitor, cadeira, cabo)
- [ ] **M** **Agente C# passa a coletar número de série, UUID de sistema, fabricante, modelo e chassi** (`Win32_BIOS.SerialNumber`, `Win32_ComputerSystemProduct.UUID`, `Win32_ComputerSystem.Manufacturer/Model`). Sem serial não existe reconciliação confiável — MAC muda com dock/VPN e hostname é renomeável
- [ ] **M** Motor de matching em cascata: serial (100) → UUID (100) → MAC normalizado (85) → hostname (60)
- [ ] **M** `ReconciliationSuggestion` + **fila de reconciliação** na UI (descobertos sem cadastro, sugestões de vínculo, aceitar/recusar)
- [ ] **M** Auto-provisionamento configurável (OFF / SUGGEST / ON) — default SUGGEST, senão máquina de teste polui o inventário
- [ ] **M** **Posse sugerida pelo usuário logado na máquina** (`Win32_ComputerSystem.UserName` casando com `User.email`). Com o modelo de posse isso fica mais forte do que "sugerir responsável": o usuário logado sugere **duas coisas diferentes** — a posse do ativo (assignment `USER`) **ou** a ocupação do posto (`LocationOccupant`), quando o ativo já está entregue a uma `Location`. Sugerir ocupação é o que o Snipe-IT não teria como fazer, porque não tem onde guardar
- [ ] **P** **Dois usuários logados na mesma máquina em turnos diferentes deixa de ser ruído e vira evidência de posto compartilhado.** Hoje seria tratado como conflito ("afinal de quem é?"); com a Camada 2 é exatamente o padrão da Mesa 1 — manhã e tarde — e o sistema pode propor criar o posto e as duas ocupações em vez de escolher um vencedor
- [ ] **P** **Ativo fantasma**: cadastrado e nunca visto pelo agente (ou visto pela última vez há N dias)
- [ ] **P** **Shadow IT**: máquina vista pelo agente e não cadastrada há mais de 24h (`reviewState`: UNREVIEWED / ALLOWED / BLOCKED)
- [ ] **M** Specs de hardware como **atributo do ativo**, não métrica — hoje RAM total e tamanho de disco vivem na tabela de telemetria e somem no expurgo
- [ ] **M** `AssetChange` — histórico de mudança de hardware detectada automaticamente (trocou o HD, tiraram pente de RAM)
- [ ] **M** `SoftwarePackage` + `SoftwareInstallation` — normalizar o `installedSoftware`, que hoje é **JSON write-only**: é gravado no handshake e nunca lido por nada
- [ ] **G** **Conformidade de licença alimentada pelo software realmente instalado**: instalado sem licença, assento pago sem instalação
- [ ] **P** Separar os dois eixos de status: `AgentStatus` (ONLINE/OFFLINE/NEVER_SEEN) × `LifecycleStatus` (`StatusLabel`). Hoje os dois são `String` livre no `Endpoint` e se confundem. O campo de último contato chama `lastSeenByAgentAt`, **nunca** `lastSeen` (D13)
- [ ] **P** Auditoria automática: cada handshake é uma auditoria física (`lastAuditMethod = AGENT`)
- [ ] **M** Detecção e fusão de ativos duplicados (reimagem ou troca de placa muda o `hwid`) — sugerir MERGE em vez de criar registro novo em silêncio
- [ ] **M** Ativo ocioso detectado por telemetria (`AssetUsageDaily` agregado por dia — sem isso a query varre milhões de linhas). Cruzado com *posto vago* (F2), separa "ninguém usa" de "ninguém responde"
- [ ] **P** Painel de cobertura: total cadastrado, com agente, sem agente, órfãos, fantasmas, não autorizados

---

## Fase 8 — Ciclo de vida

- [ ] **M** `Maintenance` — tipo (MANUTENÇÃO / REPARO / UPGRADE / CALIBRAÇÃO / SUPORTE), fornecedor, início, fim, custo, `isWarranty`
- [ ] **P** Tela global de manutenções com custo acumulado e em aberto
- [ ] **M** `Audit` — auditoria física com resultado (OK / DIVERGENTE / NÃO LOCALIZADO) e `lastAuditAt`. **`nextAuditAt` não nasce** (D53, [`FASE-8-PLANO-ITAM.md`](./FASE-8-PLANO-ITAM.md))
- [ ] **P** Intervalo de auditoria global (meses) e antecedência do aviso (dias)
- [ ] **P** Relatório de auditorias vencidas / a vencer / nunca auditadas
- [ ] **M** **A conferência da auditoria passa a ter três campos, não um.** Antes era só localização; agora é *onde está* (`locationId`), *de quem é o posto* (a assignment aberta) e *quem ocupa aquele posto hoje* (`LocationOccupant`). Os três divergem por motivos diferentes e a divergência de cada um tem tratamento próprio:
  - ativo achado em outro lugar → atualiza `locationId` e registra o anterior;
  - ativo achado numa mesa que **não** é a da assignment → ou foi emprestado informalmente, ou a posse está errada. O auditor decide, o sistema não adivinha;
  - posto **sem ocupante aberto** com ativo entregue a ele → é o *posto vago* da F2 aparecendo no chão da fábrica, e a auditoria é o momento em que alguém descobre quem sentou ali
- [ ] **P** Cálculo do valor contábil atual (depreciação linear com piso) — campo calculado, nunca coluna
- [ ] **P** Relatório de depreciação com totais (custo, acumulado, valor atual) — `recharts` já está no `package.json` e **nunca foi importado**; gráfico de curva sai sem instalar nada
- [ ] **P** Relatório de garantias e EOL vencendo em N dias
- [ ] **P** `Setting` de alertas: liga/desliga, destinatários, threshold em dias
- [ ] **M** Envio de e-mail SMTP (`nodemailer`) — hoje o `.env` só tem `DATABASE_URL` e `AGENT_TOKEN`
- [ ] **M** Scheduler diário, gravando `lastAlertRunAt` para sobreviver a restart (o `setInterval` do `zombie-cleaner.job.ts` reinicia a cada deploy)
- [ ] **P** Integração com webhook (Slack / Teams)
- [ ] **P** Central de alertas dentro do app

---

## Fase 9 — Campos Customizados

- [ ] **M** `CustomField` — nome, slug, elemento (TEXT / TEXTAREA / LISTBOX / CHECKBOX / RADIO / DATE), formato, help text, obrigatório, único
- [ ] **M** Motor de validação por formato: IP, IPv4, IPv6, MAC, e-mail, URL, numérico, alfanumérico, data, booleano, regex custom
- [ ] **M** `CustomFieldset` ancorado em **modelo E categoria, com precedência do modelo** — ver [`FASE-9-PLANO-ITAM.md`](./FASE-9-PLANO-ITAM.md), D58. O Snipe-IT ancora só no modelo, e o `AssetModel` existe desde a F1; a categoria fica porque `Asset` **não tem `categoryId`** (ela vem do modelo) e porque "todo notebook pede patrimônio" é regra de categoria, não de modelo.
  ⚠️ **Correção:** uma versão anterior deste item dizia que o `AssetModel` "já tem a coluna reservada" para o fieldset. **Não tem** — verificado no schema: as colunas dele são `id, name, eolMonths, modelNumber, notes, manufacturerId, categoryId`. A F1 adiou o atributo, não o criou; a coluna nasce na F9
- [ ] **M** Valores em `customFields Json? @db.JsonB` + índice GIN (D7)
- [ ] **M** Renderização dinâmica no formulário e como coluna na tabela
- [ ] **G** Tela de administração de campos e conjuntos
- [ ] **P** Flags de visibilidade (`showInListView`, `displayInUserView`, `showInEmail`)
- [ ] **P** Valor padrão por modelo
- [ ] **M** Campo customizado cifrado em repouso — **`server/core/crypto/cipher.ts` já existe** (nasceu na F6): `cifrar(claro, aad)` / `decifrar(pacote, aad)`, formato `enc:v1:<kid>:<iv>:<tag>:<ct>` (D81), com chaveiro e canário de boot (D91). Aqui o prefixo `enc:` é obrigatório de verdade — dentro do mesmo `JsonB` convivem valores cifrados e comuns, e sem marca não há como saber qual é qual
- [ ] **P** Campos customizados no import e no export CSV

---

## Fase 10 — Etiquetas, Relatórios e Importação

- [ ] **M** Código de barras 1D (Code128) e QR 2D por ativo (`bwip-js` + `qrcode`)
- [ ] **G** Impressão de etiquetas em PDF com layout configurável (folha, tamanho, gutters, logo, campos) + **preview antes de gastar a folha**
- [ ] **M** Busca global otimizada para leitor de código de barras (match exato de asset tag/serial primeiro, depois `ILIKE`)
- [ ] **P** Export CSV de qualquer listagem — **com BOM UTF-8**, senão o Excel em PT-BR abre acentos quebrados
- [ ] **P** ⚠️ **A chave de produto da licença NÃO pode entrar no CSV.** É a quarta porta por onde ela poderia sair (as outras três foram fechadas na F6: a allowlist da resposta, o diff do `ActivityLog` e o `sanitize.ts`). O export lê `License` direto; sem uma allowlist explícita aqui, `productKey` viaja no arquivo — cifrada, mas fora do banco, e num arquivo que circula por e-mail. O certo é exportar `productKeyMask`
- [ ] **G** Importador CSV com mapeamento de colunas, update de existentes e relatório de erros por linha (`Import` + `ImportRow`). **Posse importada passa pelo checkout**, não por `UPDATE` em `assignedToId` (D17): a coluna de responsável do CSV vira uma `Assignment` com `checkoutAt` retroativo
- [ ] **M** Seção de Relatórios (`/relatorios`) com os relatórios prontos do Snipe-IT, mais os que só existem aqui: *posto vago*, *ativos por posto*, *o que cada pessoa responde (direto × por posto)*
- [ ] **M** Custom report builder com seleção de colunas — `columns` validado contra **allowlist**, nunca montar `select` do Prisma com string do cliente
- [ ] **M** `Setting` singleton + tela de Configurações (branding, logo, favicon, cor, locale, timezone, formato de data, moeda) — o `AppSetting` já existe desde a F1 (é onde mora o `assetTagNext`)
- [ ] **P** `src/lib/format.ts` com `Intl.DateTimeFormat` / `Intl.NumberFormat` lendo do `Setting`
- [ ] **M** Backup do banco e dos anexos pela interface (`pg_dump -Fc`) + retenção
- [ ] **M** Seletor de colunas visíveis com preferência salva — o catálogo de colunas paga por três gaps (sort allowlist, custom report, picker)
- [ ] **M** Combobox com busca acima de 200 opções — hoje `/options` tem teto de 200 e o `ReferenceSelect` não tem campo de busca (observação 7 da auditoria da F1; a perda silenciosa de vínculo já foi fechada, navegar além das 200 não)

---

## Fase 11 — Acesso avançado

- [ ] **G** `Group` + permissões granulares por módulo (view / create / edit / delete / checkout por tipo de item)
- [ ] **P** Permissão sobre dado sensível: chave de licença, custo de compra, lista de processos, comandos RMM
- [ ] **P** Campos de identidade do colaborador: nome dividido, matrícula, cargo, telefone, endereço
- [ ] **P** `Department` como entidade (hoje é texto livre em `User.department`)
- [ ] **P** Gestor do colaborador (`managerId`) e visão de liderados
- [ ] **M** **A fronteira entre departamento, gestor e posto** — as três coisas parecem responder "de quem é isto?" e respondem a perguntas diferentes. Documentar e respeitar:
  - **o posto responde pelo ativo.** `Assignment` → `LocationOccupant` é a cadeia que diz quem responde por um equipamento, e é a única (D16);
  - **o departamento agrupa pessoas.** Serve para relatório ("quanto o Comercial tem em equipamento"), rateio de custo e filtro de tela. Um `Department` **não** detém ativo: entregar "para o Comercial" é entregar para uma sala ou para uma pessoa;
  - **o gestor é rota de escalonamento**, não detentor. Ele recebe o aviso de overdue e aprova a baixa; não aparece em `resolverResponsaveis`.
  Consequência prática: `Location.manager` (que já existe desde a F1) e `User.managerId` **não** entram na resolução de responsabilidade. Se um dia "o gestor responde junto" for regra do cliente, é decisão nova e explícita, não efeito colateral de ter as duas colunas
- [ ] **P** Ciclo de vida do colaborador: ativo/inativo, admissão, desligamento, VIP, remoto — o desligamento dispara o check-in em massa **e** o encerramento das ocupações (F4)
- [ ] **M** Listagem de pessoas com busca, paginação e filtros
- [ ] **M** `ApiToken` pessoal (geração, prefixo, hash, revogação, `lastUsedAt`)
- [ ] **M** 2FA TOTP (`otplib` + `qrcode`)
- [ ] **M** Sincronização LDAP / Active Directory (`ldapts`)
- [ ] **M** SSO — OIDC com Entra ID (não SAML), recusando login de quem não está cadastrado
- [ ] **M** Portal do colaborador: ver o que é meu, aceitar o termo, solicitar item — com os **dois baldes** (direto × por posto), senão a pessoa devolve o monitor da sala achando que era dela
- [ ] **P** Avatar do colaborador (começar por iniciais geradas, sem upload)

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
      → F5 (estoque) ✅ → F6 (licenças) ✅ → F7 (convergência RMM)
         → F8 (ciclo de vida) → F9 (campos) → F10 (relatórios) → F11 (acesso)
```

**A F0 até a F4 estão completas.** As três últimas fecharam pelo
[`FECHAMENTO-F2-F4-PLANO-ITAM.md`](./FECHAMENTO-F2-F4-PLANO-ITAM.md), organizado em cinco **levas**
e não em três fases — porque o armazenamento de arquivo (Etapa G da F2) era pré-requisito da
assinatura e do PDF (Etapas A e B da F4), e o correio servia aos dois lados. Nenhuma revisão de
fase isolada teria visto essa dependência: ela só aparece olhando as três juntas.

**A F5 fechou**: as seis tabelas de estoque, o saldo derivado com trava na linha-pai e a
integração com a posse da F4 (holdings, desligamento, posto).

**A F6 fechou**: as três tabelas de licença, o assento **materializado** (D40) — porque uma
licença tem número de assentos conhecido e contrato por trás, enquanto no estoque a unidade é
intercambiável —, a escolha sem corrida por `SELECT … FOR UPDATE SKIP LOCKED` (D41) e a chave de
produto cifrada em `server/core/crypto/`, que é o mesmo arquivo que a **F9** vai usar para campo
customizado cifrado (D81).

**O próximo passo é a F7** — convergência RMM × ITAM. Ela depende da F6 num ponto que o D39
protege: a conformidade alimentada pelo software instalado é o join `LicenseSeat → Asset →
Endpoint → SoftwareInstallation`, e um assento que pudesse apontar para uma `Location` não teria
caminho até uma instalação — seria um buraco exatamente no relatório que justifica o módulo.

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
