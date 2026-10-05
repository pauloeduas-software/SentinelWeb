# As 142 decisões do SentinelWeb

> Toda decisão de arquitetura do projeto, arquivada **pelo assunto que ela governa** — não pela
> fase que a tomou. A numeração `D1`…`D142` é contínua e global: ela é o nome da decisão e não
> muda, mesmo que o arquivo onde ela vive mude.
>
> **A regra desta pasta:** decisão escrita aqui **não se reescreve.** Se a realidade mudou, ela é
> **superada** por outra, com link entre as duas. O log é o que diz por quanto tempo cada regra
> governou — reescrever apaga essa informação.
>
> Quem quer saber **o que vale hoje**, leia [`../referencia/`](../referencia/).
> Quem quer saber **o que foi feito e quando**, leia [`../historico/`](../historico/).

## Os dez assuntos

| Arquivo | Assunto | Decisões |
|---|---|---|
| [`reconciliacao.md`](./reconciliacao.md) | Reconciliação | 35 |
| [`acesso.md`](./acesso.md) | Acesso | 22 |
| [`catalogo-e-ativo.md`](./catalogo-e-ativo.md) | Catálogo e ativo | 15 |
| [`posse.md`](./posse.md) | Posse | 13 |
| [`relatorios-import-etiquetas.md`](./relatorios-import-etiquetas.md) | Relatórios, import e etiquetas | 13 |
| [`ciclo-de-vida.md`](./ciclo-de-vida.md) | Ciclo de vida | 12 |
| [`licencas.md`](./licencas.md) | Licenças | 11 |
| [`campos-customizados.md`](./campos-customizados.md) | Campos customizados | 8 |
| [`plataforma.md`](./plataforma.md) | Plataforma | 7 |
| [`estoque.md`](./estoque.md) | Estoque | 6 |

## Correções e supersessões

As decisões não se reescrevem, então quando uma corrige a outra isso fica escrito nas duas. As
que corrigem algo anterior:

| Corrige | É corrigida por | O que mudou |
|---|---|---|
| **D42** (formato da cifra) | **D81** | o formato `v1:iv:tag:ct` foi **substituído** por `enc:v1:<kid>:<iv>:<tag>:<ct>`, com AAD |
| **D43** (`burnedAt` × `retiredAt`) | **D92** | a fórmula dos assentos livres: `aposentados` é exibido e **nunca** subtraído |
| **D66** (a view do responsável) | **D129** | a view filtra a lixeira, não emite responsável nulo e fala `DIRETO`/`POSTO`/`ATIVO` |
| **D75** (`Department` em duas migrações) | **D135** | o contrato muda com a entidade, não no `DROP COLUMN` |
| **D77** (dado sensível no `select`) | **D140** | em `JsonB` isso é impossível: mascarar depois é o limite da regra, não exceção |
| **D16** (responsabilidade derivada) | **D130**, **D139** | a derivação tem UMA implementação por pergunta — nem a view nem o aceite criam a segunda |

Quatro decisões nasceram para resolver **conflito entre dois planos**, e não de uma fase só:
**D79** (cada job tem a própria linha), **D80** (um `ApiToken` com dono polimórfico), **D81** (uma
cifra para os dois usos) e **D82** (`terminate` não existe; o `offboard` é estendido). Elas estão
arquivadas no assunto que governam, com o conflito original descrito dentro de cada uma.

> ⚠️ **A fase 0 usa uma numeração LOCAL.** O
> [`../historico/fase-00-base-tecnica.md`](../historico/fase-00-base-tecnica.md) chama suas
> sub-etapas de `D1. Migração`, `D2. O escopo automático`… — isso **antecede** este esquema e
> **não** corresponde às D1–D4 desta tabela. É registro histórico e ficou como está.

## O índice

| # | Decisão | Onde |
|---|---|---|
| **D1** | `InventoryItem` vira `Asset`; o `Asset` atual (descoberto pelo agente) vira `Endpoint` | [Catálogo e ativo](./catalogo-e-ativo.md#d1--inventoryitem-vira-asset-o-asset-atual-descoberto-pelo-agente-vira-endpoint) |
| **D2** | `Folder` morre | [Catálogo e ativo](./catalogo-e-ativo.md#d2--folder-morre) |
| **D3** | `quantity` sai do `Asset` | [Catálogo e ativo](./catalogo-e-ativo.md#d3--quantity-sai-do-asset) |
| **D4** | `Company` / Full Multiple Companies Support: descartado | [Plataforma](./plataforma.md#d4--company--full-multiple-companies-support-descartado) |
| **D5** | Nada de texto livre onde o Snipe-IT tem tabela | [Catálogo e ativo](./catalogo-e-ativo.md#d5--nada-de-texto-livre-onde-o-snipe-it-tem-tabela) |
| **D6** | Baselinar as migrations antes de tocar em qualquer coluna — e NÃO com `migrate dev` | [Plataforma](./plataforma.md#d6--baselinar-as-migrations-antes-de-tocar-em-qualquer-coluna--e-não-com-migrate-dev) |
| **D7** | Campos customizados em `JsonB`, não em DDL dinâmico | [Campos customizados](./campos-customizados.md#d7--campos-customizados-em-jsonb-não-em-ddl-dinâmico) |
| **D8** | Catálogo sem soft delete. O delete é real, bloqueado por uso | [Catálogo e ativo](./catalogo-e-ativo.md#d8--catálogo-sem-soft-delete-o-delete-é-real-bloqueado-por-uso) |
| **D9** | Um domínio `catalog` com sete especificações. Não sete domínios | [Catálogo e ativo](./catalogo-e-ativo.md#d9--um-domínio-catalog-com-sete-especificações-não-sete-domínios) |
| **D10** | `type` vira `enum` do Prisma, não `String` | [Catálogo e ativo](./catalogo-e-ativo.md#d10--type-vira-enum-do-prisma-não-string) |
| **D11** | Rota de opções separada da listagem | [Catálogo e ativo](./catalogo-e-ativo.md#d11--rota-de-opções-separada-da-listagem) |
| **D12** | O `Asset` nasce inteiro na F1. `inventory_items` é apagada, não migrada | [Catálogo e ativo](./catalogo-e-ativo.md#d12--o-asset-nasce-inteiro-na-f1-inventory_items-é-apagada-não-migrada) |
| **D13** | A segurança do rename depende de o `Asset` novo **não** ter `status`, `lastSeen` nem `hwid` | [Catálogo e ativo](./catalogo-e-ativo.md#d13--a-segurança-do-rename-depende-de-o-asset-novo-não-ter-status-lastseen-nem-hwid) |
| **D14** | O detentor é singular; o ALVO é que é polimórfico | [Posse](./posse.md#d14--o-detentor-é-singular-o-alvo-é-que-é-polimórfico) |
| **D15** | O posto de trabalho é uma `Location`, não uma entidade nova | [Posse](./posse.md#d15--o-posto-de-trabalho-é-uma-location-não-uma-entidade-nova) |
| **D16** | Responsabilidade é DERIVADA, nunca coluna | [Posse](./posse.md#d16--responsabilidade-é-derivada-nunca-coluna) |
| **D17** | `Asset.assignedToId` deixa de ser editável pelo formulário | [Posse](./posse.md#d17--assetassignedtoid-deixa-de-ser-editável-pelo-formulário) |
| **D18** | `AssetLog` não nasce. A aba Histórico lê o `ActivityLog` | [Catálogo e ativo](./catalogo-e-ativo.md#d18--assetlog-não-nasce-a-aba-histórico-lê-o-activitylog) |
| **D19** | Arquivar, descomissionar e apagar são três coisas, com três colunas | [Catálogo e ativo](./catalogo-e-ativo.md#d19--arquivar-descomissionar-e-apagar-são-três-coisas-com-três-colunas) |
| **D20** | "Arquivados" e "posto vago" são filtros do domínio, não `view` do `core` | [Catálogo e ativo](./catalogo-e-ativo.md#d20--arquivados-e-posto-vago-são-filtros-do-domínio-não-view-do-core) |
| **D21** | Ação em massa é tudo ou nada; entrega em massa não será (F4) | [Catálogo e ativo](./catalogo-e-ativo.md#d21--ação-em-massa-é-tudo-ou-nada-entrega-em-massa-não-será-f4) |
| **D22** | Sessão em cookie `httpOnly`, não em `localStorage` | [Acesso](./acesso.md#d22--sessão-em-cookie-httponly-não-em-localstorage) |
| **D23** | `actorId` é parâmetro obrigatório, não `AsyncLocalStorage` | [Acesso](./acesso.md#d23--actorid-é-parâmetro-obrigatório-não-asynclocalstorage) |
| **D24** | O histórico anterior fica sem ator. Não há backfill | [Acesso](./acesso.md#d24--o-histórico-anterior-fica-sem-ator-não-há-backfill) |
| **D25** | Ocupação de posto não ganha coluna de ator | [Acesso](./acesso.md#d25--ocupação-de-posto-não-ganha-coluna-de-ator) |
| **D26** | `createdById`/`updatedById` só onde a tela mostra | [Acesso](./acesso.md#d26--createdbyidupdatedbyid-só-onde-a-tela-mostra) |
| **D27** | Num posto com duas pessoas, quem assina o termo é o gestor da localidade | [Posse](./posse.md#d27--num-posto-com-duas-pessoas-quem-assina-o-termo-é-o-gestor-da-localidade) |
| **D28** | Quando o último ocupante sai, a posse continua aberta | [Posse](./posse.md#d28--quando-o-último-ocupante-sai-a-posse-continua-aberta) |
| **D29** | O EULA é copiado para o `Acceptance`, não referenciado | [Posse](./posse.md#d29--o-eula-é-copiado-para-o-acceptance-não-referenciado) |
| **D30** | O PDF é gerado no aceite e guardado. Nunca regenerado | [Posse](./posse.md#d30--o-pdf-é-gerado-no-aceite-e-guardado-nunca-regenerado) |
| **D31** | Entrega em massa é por linha, com relatório. (O oposto da F2.) | [Posse](./posse.md#d31--entrega-em-massa-é-por-linha-com-relatório-o-oposto-da-f2) |
| **D32** | Desligamento é uma operação com nome próprio, e fecha as duas camadas | [Posse](./posse.md#d32--desligamento-é-uma-operação-com-nome-próprio-e-fecha-as-duas-camadas) |
| **D33** | O acessório entregue a um posto é **do posto**; os ocupantes respondem solidariamente | [Estoque](./estoque.md#d33--o-acessório-entregue-a-um-posto-é-do-posto-os-ocupantes-respondem-solidariamente) |
| **D34** | Saldo é sempre **calculado**, nunca coluna | [Estoque](./estoque.md#d34--saldo-é-sempre-calculado-nunca-coluna) |
| **D35** | Um domínio `stock`, não três fatias verticais | [Estoque](./estoque.md#d35--um-domínio-stock-não-três-fatias-verticais) |
| **D36** | Os três têm lixeira; aqui o D8 não se aplica | [Estoque](./estoque.md#d36--os-três-têm-lixeira-aqui-o-d8-não-se-aplica) |
| **D37** | `Consumable` não tem devolução; não é validação, é ausência | [Estoque](./estoque.md#d37--consumable-não-tem-devolução-não-é-validação-é-ausência) |
| **D38** | Devolução parcial de componente **divide a linha** | [Estoque](./estoque.md#d38--devolução-parcial-de-componente-divide-a-linha) |
| **D39** | Assento de licença **não** vai para um posto | [Licenças](./licencas.md#d39--assento-de-licença-não-vai-para-um-posto) |
| **D40** | Assento materializado, ocupação em tabela própria | [Licenças](./licencas.md#d40--assento-materializado-ocupação-em-tabela-própria) |
| **D41** | `FOR UPDATE SKIP LOCKED`, e o preço dele | [Licenças](./licencas.md#d41--for-update-skip-locked-e-o-preço-dele) |
| **D42** | Chave cifrada numa coluna versionada, sem plano B em claro | [Licenças](./licencas.md#d42--chave-cifrada-numa-coluna-versionada-sem-plano-b-em-claro) |
| **D43** | `burnedAt` e `retiredAt` são fatos diferentes | [Licenças](./licencas.md#d43--burnedat-e-retiredat-são-fatos-diferentes) |
| **D44** | Status da licença é derivado, nunca coluna | [Licenças](./licencas.md#d44--status-da-licença-é-derivado-nunca-coluna) |
| **D45** | A FK mora no `Endpoint`, e as tabelas não se fundem | [Reconciliação](./reconciliacao.md#d45--a-fk-mora-no-endpoint-e-as-tabelas-não-se-fundem) |
| **D46** | Evidência ambígua é evidência **zero** | [Reconciliação](./reconciliacao.md#d46--evidência-ambígua-é-evidência-zero) |
| **D47** | O usuário logado sugere **ocupação** quando a posse é do posto | [Reconciliação](./reconciliacao.md#d47--o-usuário-logado-sugere-ocupação-quando-a-posse-é-do-posto) |
| **D48** | Dois usuários na mesma máquina é **evidência de posto compartilhado** | [Reconciliação](./reconciliacao.md#d48--dois-usuários-na-mesma-máquina-é-evidência-de-posto-compartilhado) |
| **D49** | Observação de usuário é agregada por dia, com retenção | [Reconciliação](./reconciliacao.md#d49--observação-de-usuário-é-agregada-por-dia-com-retenção) |
| **D50** | `lastSeenByAgentAt` existe e **nunca** se chama `lastSeen` | [Reconciliação](./reconciliacao.md#d50--lastseenbyagentat-existe-e-nunca-se-chama-lastseen) |
| **D51** | Auto-provisionamento nasce em `SUGGEST` | [Reconciliação](./reconciliacao.md#d51--auto-provisionamento-nasce-em-suggest) |
| **D52** | A auditoria corrige *onde está*. Nunca *quem responde* | [Ciclo de vida](./ciclo-de-vida.md#d52--a-auditoria-corrige-onde-está-nunca-quem-responde) |
| **D53** | `lastAuditAt` é coluna. `nextAuditAt` não nasce | [Ciclo de vida](./ciclo-de-vida.md#d53--lastauditat-é-coluna-nextauditat-não-nasce) |
| **D54** | A auditoria é registrada por ATIVO. O posto é a unidade de trabalho | [Ciclo de vida](./ciclo-de-vida.md#d54--a-auditoria-é-registrada-por-ativo-o-posto-é-a-unidade-de-trabalho) |
| **D55** | Valor contábil é calculado no servidor. Sempre | [Ciclo de vida](./ciclo-de-vida.md#d55--valor-contábil-é-calculado-no-servidor-sempre) |
| **D56** | O job diário não é `setInterval` de 24 h. É tick curto com compare-and-set | [Ciclo de vida](./ciclo-de-vida.md#d56--o-job-diário-não-é-setinterval-de-24-h-é-tick-curto-com-compare-and-set) |
| **D57** | A central no app é o canal primário; SMTP mora no `.env` | [Ciclo de vida](./ciclo-de-vida.md#d57--a-central-no-app-é-o-canal-primário-smtp-mora-no-env) |
| **D58** | O conjunto ancora na **categoria** e no **modelo**, com precedência do modelo | [Campos customizados](./campos-customizados.md#d58--o-conjunto-ancora-na-categoria-e-no-modelo-com-precedência-do-modelo) |
| **D59** | Valores em `JsonB` na linha do ativo. Não DDL dinâmico, não EAV | [Campos customizados](./campos-customizados.md#d59--valores-em-jsonb-na-linha-do-ativo-não-ddl-dinâmico-não-eav) |
| **D60** | O `slug` é imutável. O valor órfão não é apagado | [Campos customizados](./campos-customizados.md#d60--o-slug-é-imutável-o-valor-órfão-não-é-apagado) |
| **D61** | Obrigatoriedade é do **vínculo**, não do campo | [Campos customizados](./campos-customizados.md#d61--obrigatoriedade-é-do-vínculo-não-do-campo) |
| **D62** | Cifra é `enc:v1:` dentro do JsonB, com rota própria para revelar | [Campos customizados](./campos-customizados.md#d62--cifra-é-encv1-dentro-do-jsonb-com-rota-própria-para-revelar) |
| **D63** | Filtrar por campo customizado: sim. Ordenar: não, nesta fase | [Campos customizados](./campos-customizados.md#d63--filtrar-por-campo-customizado-sim-ordenar-não-nesta-fase) |
| **D64** | A parte plana é spec de catálogo; a composição é domínio próprio | [Campos customizados](./campos-customizados.md#d64--a-parte-plana-é-spec-de-catálogo-a-composição-é-domínio-próprio) |
| **D65** | Não nasce tabela `Setting`. O `AppSetting` cresce | [Relatórios, import e etiquetas](./relatorios-import-etiquetas.md#d65--não-nasce-tabela-setting-o-appsetting-cresce) |
| **D66** | Responsável resolvido é uma **view**, não coluna nem cache | [Relatórios, import e etiquetas](./relatorios-import-etiquetas.md#d66--responsável-resolvido-é-uma-view-não-coluna-nem-cache) |
| **D67** | O builder recebe token. Nunca campo, nunca SQL | [Relatórios, import e etiquetas](./relatorios-import-etiquetas.md#d67--o-builder-recebe-token-nunca-campo-nunca-sql) |
| **D68** | Importação é de dois passos, e o dry-run é obrigatório | [Relatórios, import e etiquetas](./relatorios-import-etiquetas.md#d68--importação-é-de-dois-passos-e-o-dry-run-é-obrigatório) |
| **D69** | O export manda número cru e data ISO — e trata fórmula | [Relatórios, import e etiquetas](./relatorios-import-etiquetas.md#d69--o-export-manda-número-cru-e-data-iso--e-trata-fórmula) |
| **D70** | QR leva URL. Código de barras leva a etiqueta | [Relatórios, import e etiquetas](./relatorios-import-etiquetas.md#d70--qr-leva-url-código-de-barras-leva-a-etiqueta) |
| **D71** | O catálogo de colunas é declarado duas vezes, de propósito | [Relatórios, import e etiquetas](./relatorios-import-etiquetas.md#d71--o-catálogo-de-colunas-é-declarado-duas-vezes-de-propósito) |
| **D72** | Posto responde pelo ativo; departamento agrupa pessoas; gestor escalona | [Acesso](./acesso.md#d72--posto-responde-pelo-ativo-departamento-agrupa-pessoas-gestor-escalona) |
| **D73** | `resolverEscalonamento()` é função separada de `resolverResponsaveis()` | [Acesso](./acesso.md#d73--resolverescalonamento-é-função-separada-de-resolverresponsaveis) |
| **D74** | Desligar não é apagar. E encerrar ocupações é passo do fluxo | [Acesso](./acesso.md#d74--desligar-não-é-apagar-e-encerrar-ocupações-é-passo-do-fluxo) |
| **D75** | `Department` é a décima spec do catálogo, e a troca de coluna é em duas migrações | [Acesso](./acesso.md#d75--department-é-a-décima-spec-do-catálogo-e-a-troca-de-coluna-é-em-duas-migrações) |
| **D76** | Permissão é união permissiva. Não existe `deny` | [Acesso](./acesso.md#d76--permissão-é-união-permissiva-não-existe-deny) |
| **D77** | Dado sensível é filtrado no `select`, não mascarado na resposta | [Acesso](./acesso.md#d77--dado-sensível-é-filtrado-no-select-não-mascarado-na-resposta) |
| **D78** | LDAP sincroniza; OIDC autentica; ninguém entra sem cadastro | [Acesso](./acesso.md#d78--ldap-sincroniza-oidc-autentica-ninguém-entra-sem-cadastro) |
| **D79** | Cada job tem a própria linha de execução. `lastAlertRunAt` não é coluna de `AppSetting` | [Plataforma](./plataforma.md#d79--cada-job-tem-a-própria-linha-de-execução-lastalertrunat-não-é-coluna-de-appsetting) |
| **D80** | Um `ApiToken` só, com dono polimórfico | [Acesso](./acesso.md#d80--um-apitoken-só-com-dono-polimórfico) |
| **D81** | Um arquivo e um formato de cifra, para os dois usos | [Plataforma](./plataforma.md#d81--um-arquivo-e-um-formato-de-cifra-para-os-dois-usos) |
| **D82** | `terminate` não existe. A F11 **estende** o `offboard` | [Posse](./posse.md#d82--terminate-não-existe-a-f11-estende-o-offboard) |
| **D83** | O armazenamento é `core/storage/`; a linha é do domínio | [Plataforma](./plataforma.md#d83--o-armazenamento-é-corestorage-a-linha-é-do-domínio) |
| **D84** | Anexo não é rota estática. Ele sai por `/api/`, com sessão | [Plataforma](./plataforma.md#d84--anexo-não-é-rota-estática-ele-sai-por-api-com-sessão) |
| **D85** | `?view=archived` é a quarta vista, e a listagem padrão passa a excluir `ARCHIVED` | [Catálogo e ativo](./catalogo-e-ativo.md#d85--viewarchived-é-a-quarta-vista-e-a-listagem-padrão-passa-a-excluir-archived) |
| **D86** | E-mail é *best-effort* com log. O que não pode se perder tem linha em tabela | [Plataforma](./plataforma.md#d86--e-mail-é-best-effort-com-log-o-que-não-pode-se-perder-tem-linha-em-tabela) |
| **D87** | Entrega com alvo `ASSET` não emite termo | [Posse](./posse.md#d87--entrega-com-alvo-asset-não-emite-termo) |
| **D88** | Aceite pendente não bloqueia a entrega | [Posse](./posse.md#d88--aceite-pendente-não-bloqueia-a-entrega) |
| **D89** | A troca do `AGENT_TOKEN` pelo `ApiToken` é por convivência, com prazo | [Acesso](./acesso.md#d89--a-troca-do-agent_token-pelo-apitoken-é-por-convivência-com-prazo) |
| **D90** | Quem reconcilia trava tudo; quem entrega trava um assento | [Licenças](./licencas.md#d90--quem-reconcilia-trava-tudo-quem-entrega-trava-um-assento) |
| **D91** | Chaveiro, não chave: o `kid` vem da própria chave | [Licenças](./licencas.md#d91--chaveiro-não-chave-o-kid-vem-da-própria-chave) |
| **D92** | `livres` sai das linhas; `aposentados` não entra na subtração | [Licenças](./licencas.md#d92--livres-sai-das-linhas-aposentados-não-entra-na-subtração) |
| **D93** | Assento é posse, e a posse do projeto já tem três lugares | [Licenças](./licencas.md#d93--assento-é-posse-e-a-posse-do-projeto-já-tem-três-lugares) |
| **D94** | Anexo de licença sai da fase | [Licenças](./licencas.md#d94--anexo-de-licença-sai-da-fase) |
| **D95** | Quem carimba o ativo é o **job**, não o handshake | [Reconciliação](./reconciliacao.md#d95--quem-carimba-o-ativo-é-o-job-não-o-handshake) |
| **D96** | **Uma** tabela de sugestão, com discriminante | [Reconciliação](./reconciliacao.md#d96--uma-tabela-de-sugestão-com-discriminante) |
| **D97** | A recusa tem memória, e a memória tem chave | [Reconciliação](./reconciliacao.md#d97--a-recusa-tem-memória-e-a-memória-tem-chave) |
| **D98** | `AgentStatus` tem **dois** valores; "nunca visto" é pergunta do ativo | [Reconciliação](./reconciliacao.md#d98--agentstatus-tem-dois-valores-nunca-visto-é-pergunta-do-ativo) |
| **D99** | O teste do agente entra por **WebSocket de verdade** | [Reconciliação](./reconciliacao.md#d99--o-teste-do-agente-entra-por-websocket-de-verdade) |
| **D100** | A chave do pacote é derivada, e o hash do software é do **servidor** | [Reconciliação](./reconciliacao.md#d100--a-chave-do-pacote-é-derivada-e-o-hash-do-software-é-do-servidor) |
| **D101** | A allowlist de usuários ignorados nasce **nesta** fase | [Reconciliação](./reconciliacao.md#d101--a-allowlist-de-usuários-ignorados-nasce-nesta-fase) |
| **D102** | Licença ↔ pacote é vínculo **explícito**, nunca casamento por nome | [Reconciliação](./reconciliacao.md#d102--licença--pacote-é-vínculo-explícito-nunca-casamento-por-nome) |
| **D103** | Merge não apaga: o endpoint perdedor ganha `mergedIntoId` | [Reconciliação](./reconciliacao.md#d103--merge-não-apaga-o-endpoint-perdedor-ganha-mergedintoid) |
| **D104** | MAC é sinal de **MERGE**, não de vínculo | [Reconciliação](./reconciliacao.md#d104--mac-é-sinal-de-merge-não-de-vínculo) |
| **D105** | Dois hashes de software: o que **chegou** e o que foi **normalizado** | [Reconciliação](./reconciliacao.md#d105--dois-hashes-de-software-o-que-chegou-e-o-que-foi-normalizado) |
| **D106** | O que o agente velho não sabe, ele **não desfaz** | [Reconciliação](./reconciliacao.md#d106--o-que-o-agente-velho-não-sabe-ele-não-desfaz) |
| **D107** | O aceite **age e depois fecha**, e a ordem erra para o lado certo | [Reconciliação](./reconciliacao.md#d107--o-aceite-age-e-depois-fecha-e-a-ordem-erra-para-o-lado-certo) |
| **D108** | A fusão preserva o `lastSeen` mais recente, não o `createdAt` mais antigo | [Reconciliação](./reconciliacao.md#d108--a-fusão-preserva-o-lastseen-mais-recente-não-o-createdat-mais-antigo) |
| **D109** | O hash é da **afirmação**, não da evidência | [Reconciliação](./reconciliacao.md#d109--o-hash-é-da-afirmação-não-da-evidência) |
| **D110** | A fila tem **três** portas de saída, e a terceira é o mundo | [Reconciliação](./reconciliacao.md#d110--a-fila-tem-três-portas-de-saída-e-a-terceira-é-o-mundo) |
| **D111** | A janela da agregação corta na **meia-noite**, não em "há N×24 horas" | [Reconciliação](./reconciliacao.md#d111--a-janela-da-agregação-corta-na-meia-noite-não-em-há-n24-horas) |
| **D112** | `discoveryMode = OFF` desliga a descoberta | [Reconciliação](./reconciliacao.md#d112--discoverymode--off-desliga-a-descoberta) |
| **D113** | O turno é a **moda** dos turnos, não a média das horas | [Reconciliação](./reconciliacao.md#d113--o-turno-é-a-moda-dos-turnos-não-a-média-das-horas) |
| **D114** | O seletor de posto oferece **posto**, e a spec de localizações já dizia onde | [Reconciliação](./reconciliacao.md#d114--o-seletor-de-posto-oferece-posto-e-a-spec-de-localizações-já-dizia-onde) |
| **D115** | A rota da aba chama `/machine`, e devolve o que a aba mostra | [Reconciliação](./reconciliacao.md#d115--a-rota-da-aba-chama-machine-e-devolve-o-que-a-aba-mostra) |
| **D116** | A `AssetChange` ganha escritor, e ele mora no handshake | [Reconciliação](./reconciliacao.md#d116--a-assetchange-ganha-escritor-e-ele-mora-no-handshake) |
| **D117** | A conformidade ganha **porta de entrada**: o catálogo de pacotes | [Reconciliação](./reconciliacao.md#d117--a-conformidade-ganha-porta-de-entrada-o-catálogo-de-pacotes) |
| **D118** | A configuração da descoberta ganha tela, e a allowlist com ela | [Reconciliação](./reconciliacao.md#d118--a-configuração-da-descoberta-ganha-tela-e-a-allowlist-com-ela) |
| **D119** | Assinatura na `key`, nunca `setState` em efeito | [Reconciliação](./reconciliacao.md#d119--assinatura-na-key-nunca-setstate-em-efeito) |
| **D120** | `proporSugestao` não recebe cliente, porque abre transação | [Reconciliação](./reconciliacao.md#d120--proporsugestao-não-recebe-cliente-porque-abre-transação) |
| **D121** | Casar a conta busca os **candidatos**, não o cadastro inteiro | [Reconciliação](./reconciliacao.md#d121--casar-a-conta-busca-os-candidatos-não-o-cadastro-inteiro) |
| **D122** | `Asset.suggestions`, e não o nome que o `prisma format` escreveu | [Reconciliação](./reconciliacao.md#d122--assetsuggestions-e-não-o-nome-que-o-prisma-format-escreveu) |
| **D123** | A janela do job é do FUSO e da HORA configurados. `inicioDoDia` ganha parâmetro | [Ciclo de vida](./ciclo-de-vida.md#d123--a-janela-do-job-é-do-fuso-e-da-hora-configurados-iniciododia-ganha-parâmetro) |
| **D124** | A auditoria pelo agente nasce no JOB, uma por ativo por dia, e só quando o SERIAL confere | [Ciclo de vida](./ciclo-de-vida.md#d124--a-auditoria-pelo-agente-nasce-no-job-uma-por-ativo-por-dia-e-só-quando-o-serial-confere) |
| **D125** | `dedupeKey` tem uma regra por tipo, e ela carrega o id da ORIGEM | [Ciclo de vida](./ciclo-de-vida.md#d125--dedupekey-tem-uma-regra-por-tipo-e-ela-carrega-o-id-da-origem) |
| **D126** | O webhook tem allowlist de destino; `notifiedAt` é do ALERTA, e a rodada seguinte reenvia o nulo | [Ciclo de vida](./ciclo-de-vida.md#d126--o-webhook-tem-allowlist-de-destino-notifiedat-é-do-alerta-e-a-rodada-seguinte-reenvia-o-nulo) |
| **D127** | Alerta não nasce para ativo fora do parque | [Ciclo de vida](./ciclo-de-vida.md#d127--alerta-não-nasce-para-ativo-fora-do-parque) |
| **D128** | A central nasce só com os sinais do ATIVO | [Ciclo de vida](./ciclo-de-vida.md#d128--a-central-nasce-só-com-os-sinais-do-ativo) |
| **D129** | A view devolve responsável REAL, e fala a língua da tela | [Relatórios, import e etiquetas](./relatorios-import-etiquetas.md#d129--a-view-devolve-responsável-real-e-fala-a-língua-da-tela) |
| **D130** | Posto vago continua saindo do `POSTO_VAGO` | [Relatórios, import e etiquetas](./relatorios-import-etiquetas.md#d130--posto-vago-continua-saindo-do-posto_vago) |
| **D131** | Posse importada é checkout retroativo e **silencioso** | [Relatórios, import e etiquetas](./relatorios-import-etiquetas.md#d131--posse-importada-é-checkout-retroativo-e-silencioso) |
| **D132** | Pessoa casa por e-mail com `findFirst`, e e-mail ambíguo é linha ignorada | [Relatórios, import e etiquetas](./relatorios-import-etiquetas.md#d132--pessoa-casa-por-e-mail-com-findfirst-e-e-mail-ambíguo-é-linha-ignorada) |
| **D133** | O export não monta `select`: ele reusa o do domínio | [Relatórios, import e etiquetas](./relatorios-import-etiquetas.md#d133--o-export-não-monta-select-ele-reusa-o-do-domínio) |
| **D134** | A rota de import declara os próprios limites de multipart | [Relatórios, import e etiquetas](./relatorios-import-etiquetas.md#d134--a-rota-de-import-declara-os-próprios-limites-de-multipart) |
| **D135** | O contrato do departamento muda na Etapa D, não no `DROP COLUMN` | [Acesso](./acesso.md#d135--o-contrato-do-departamento-muda-na-etapa-d-não-no-drop-column) |
| **D136** | Permissão efetiva é lida na consulta de sessão que já existe, e não entra no `request.user` | [Acesso](./acesso.md#d136--permissão-efetiva-é-lida-na-consulta-de-sessão-que-já-existe-e-não-entra-no-requestuser) |
| **D137** | Rota sem permissão declarada derruba o boot | [Acesso](./acesso.md#d137--rota-sem-permissão-declarada-derruba-o-boot) |
| **D138** | Relatório que é sobre dinheiro exige a permissão na rota, não na coluna | [Acesso](./acesso.md#d138--relatório-que-é-sobre-dinheiro-exige-a-permissão-na-rota-não-na-coluna) |
| **D139** | O escalonamento tem uma implementação, e o aceite passa a usá-la | [Acesso](./acesso.md#d139--o-escalonamento-tem-uma-implementação-e-o-aceite-passa-a-usá-la) |
| **D140** | O D77 é regra de coluna. Em JsonB, mascarar depois é o limite, não a exceção | [Acesso](./acesso.md#d140--o-d77-é-regra-de-coluna-em-jsonb-mascarar-depois-é-o-limite-não-a-exceção) |
| **D141** | O portal se chama pelo que lista | [Acesso](./acesso.md#d141--o-portal-se-chama-pelo-que-lista) |
| **D142** | `api_tokens.userId` ganha FK antes de existir token pessoal | [Acesso](./acesso.md#d142--api_tokensuserid-ganha-fk-antes-de-existir-token-pessoal) |
