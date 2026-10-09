# Decisões de escopo

> O que o sistema **deixou de fazer**, e por quê. Este é o único assunto desta pasta que
> subtrai: as outras dez decidem como uma coisa funciona, esta decide que ela não existe.
>
> **A regra desta pasta:** decisão escrita aqui **não se reescreve**. Se a realidade mudou, a
> decisão é **superada** por outra, com link entre as duas — é o log que diz por quanto tempo
> cada regra governou. O índice está em [`README.md`](./README.md).
>
> Decisões neste arquivo: D143–D164.
> A execução que as aplicou está em [`../historico/`](../historico/).

---

## D143 — O escopo é ITAM **+** RMM, e o critério de corte é a ponte

**Decidido:** sobrevive o que serve ao núcleo ITAM ou à ponte ITAM×RMM. Todo o resto sai.
**Descartado:** cortar a convergência.

O projeto cresceu até onze fases e 72.355 linhas de aplicação — porte de produto comercial, não
de TCC. A redução óbvia era cortar a metade RMM: `reconciliation` é o maior domínio do sistema
(4.242 linhas) e o assunto com mais decisões (35), e sem ele sobrava um ITAM limpo e defensável.

**Por quê não:** a convergência **é** a contribuição do trabalho. Um ITAM que só registra o que
alguém digitou é um CMDB manual, e existem dezenas. O que não existe é o cruzamento entre o que a
empresa comprou e o que o agente encontra instalado — e é dele que saem a conformidade de licença
(D102, D117) e a conferência automática (D124). Cortar o RMM deixaria o trabalho sem tese.

**O que isso obriga:** o corte sai inteiro das outras duas camadas — paridade com o Snipe-IT que
ninguém pediu, e plumbing de empresa grande. O critério é uma pergunta só: *isto serve ao núcleo
ITAM, ou à ponte?* Duas respostas "não" e a feature sai, por boa que seja.

**O piso que isso aceita:** com as duas metades de pé, ~50 mil linhas é o fundo. Não existe corte
que leve o projeto a 25 mil mantendo a convergência, e perseguir isso seria desfazer o D143.

---

## D144 — A conferência **manual** sai. A conferência pelo agente fica

**Decidido:** saem `record-audit`, `audit-location` e a tela `/auditorias`. Ficam o modelo
`Audit`, `audit-by-agent` e `lastAuditAt`.
**Supera:** [D52](./ciclo-de-vida.md#d52--a-auditoria-corrige-onde-está-nunca-quem-responde) e
[D54](./ciclo-de-vida.md#d54--a-auditoria-é-registrada-por-ativo-o-posto-é-a-unidade-de-trabalho),
no que elas descrevem do fluxo de quem confere com os olhos.
**Mantém:** [D53](./ciclo-de-vida.md#d53--lastauditat-é-coluna-nextauditat-não-nasce) e
[D124](./ciclo-de-vida.md#d124--a-auditoria-pelo-agente-nasce-no-job-uma-por-ativo-por-dia-e-só-quando-o-serial-confere).

**Por quê:** conferência física existe para alguém confirmar que a máquina está onde o cadastro
diz. Num ITAM+RMM o handshake confirma isso sozinho, todo dia, por ativo — que é literalmente o
que o D124 já implementou, com `AuditMethod.AGENTE`. Manter as duas é pagar duas vezes pela mesma
resposta, e a versão manual é a que só se faz **na ausência** de agente.

**O que se perde, assumido:** o ativo sem agente (monitor, cadeira, cabo) não tem como ser
conferido. É o custo aceito: ele continua tendo posse, histórico e localização — só não tem
carimbo de "alguém viu".

---

## D145 — Campos customizados saem inteiros

**Decidido:** saem o domínio `custom-field`, os três modelos, os dois enums e a parte plana que
morava na spec de catálogo (D64).
**Supera:** [D7](./campos-customizados.md#d7--campos-customizados-em-jsonb-não-em-ddl-dinâmico) e
[D58–D64](./campos-customizados.md) — as oito decisões do assunto.

**Por quê:** é a feature mais caramente genérica do projeto — 2.045 linhas de servidor, 933 de
tela e 2.252 de teste para que um administrador defina colunas que nós não sabemos quais são. Num
TCC não existe esse administrador: quem decide os campos do ativo somos nós, e decidir isso em
`schema.prisma` custa uma linha.

**Duas decisões ficam sem objeto, e não são apagadas:**
[D62](./campos-customizados.md#d62--cifra-é-encv1-dentro-do-jsonb-com-rota-própria-para-revelar)
(cifra dentro do JsonB) e
[D140](./acesso.md#d140--o-d77-é-regra-de-coluna-em-jsonb-mascarar-depois-é-o-limite-não-a-exceção)
(mascarar em JsonB). A cifra continua existindo, com o mesmo arquivo e o mesmo formato
([D81](./plataforma.md#d81--um-arquivo-e-um-formato-de-cifra-para-os-dois-usos),
[D91](./licencas.md#d91--chaveiro-não-chave-o-kid-vem-da-própria-chave)) — só tem um uso em vez de
dois, a chave da licença. Com isso o
[D77](./acesso.md#d77--dado-sensível-é-filtrado-no-select-não-mascarado-na-resposta) volta a ser a
regra inteira, sem a exceção que o D140 abriu.

---

## D146 — A importação de CSV sai. A carga é a descoberta

**Decidido:** saem o domínio `import`, os dois modelos, os três enums e a tela `/importacao`.
**Supera:** [D68](./relatorios-import-etiquetas.md#d68--importação-é-de-dois-passos-e-o-dry-run-é-obrigatório),
[D131](./relatorios-import-etiquetas.md#d131--posse-importada-é-checkout-retroativo-e-silencioso),
[D132](./relatorios-import-etiquetas.md#d132--pessoa-casa-por-e-mail-com-findfirst-e-e-mail-ambíguo-é-linha-ignorada) e
[D134](./relatorios-import-etiquetas.md#d134--a-rota-de-import-declara-os-próprios-limites-de-multipart).
**Mantém:** [D69](./relatorios-import-etiquetas.md#d69--o-export-manda-número-cru-e-data-iso--e-trata-fórmula) — o
**export** fica; é a direção que não tem substituto.

**Por quê:** importar planilha é o jeito de popular o inventário quando nada te conta o que
existe. O agente conta. Pelo D143, ter as duas é manter dois caminhos para o mesmo trabalho, e o
que sai é o que não é a tese. A carga inicial do que o agente **não** vê (periférico, mobiliário)
passa a ser formulário e `seed` — que é o que um TCC demonstra de todo jeito.

---

## D147 — As etiquetas saem

**Decidido:** sai o domínio `label`, a tela `/etiquetas` e o layout gravado no `AppSetting`.
**Supera:** [D70](./relatorios-import-etiquetas.md#d70--qr-leva-url-código-de-barras-leva-a-etiqueta).

**Por quê:** etiqueta é operação de almoxarifado — importa para quem vai colar adesivo em
trezentas máquinas, e não exercita nenhuma regra do sistema. O `assetTag` continua existindo e
continua sendo a identidade do ativo; o que sai é desenhar o papel.

---

## D148 — Permissão vira **papel**. Grupo, diretório, SSO e segundo fator saem

**Decidido:** `User.role` com três valores (`ADMIN`, `TECNICO`, `USUARIO`) no lugar da matriz de
permissões. Saem o modelo `Group`, o `AuthEvent`, o LDAP, o OIDC/PKCE e o TOTP.
**Supera:** [D76](./acesso.md#d76--permissão-é-união-permissiva-não-existe-deny),
[D78](./acesso.md#d78--ldap-sincroniza-oidc-autentica-ninguém-entra-sem-cadastro) e
[D136](./acesso.md#d136--permissão-efetiva-é-lida-na-consulta-de-sessão-que-já-existe-e-não-entra-no-requestuser).
**Mantém:** [D137](./acesso.md#d137--rota-sem-permissão-declarada-derruba-o-boot) e
[D138](./acesso.md#d138--relatório-que-é-sobre-dinheiro-exige-a-permissão-na-rota-não-na-coluna).

**Por quê:** são 2.300 linhas de servidor para um sistema que terá três contas, e nenhuma delas
exercita regra de ITAM. O que elas protegem — *esta rota exige mais que uma sessão* — um enum de
papel protege igual.

**O D137 fica, e é a razão de isto não ser um downgrade.** A conferência de cobertura no boot
continua: rota sem exigência declarada derruba o processo. O que muda é o que a exigência diz —
`ADMIN` em vez de uma união de permissões nomeadas. A tabela de rotas continua sendo o lugar onde
a decisão fica visível na revisão, e `route-permissions.ts` encolhe de 415 linhas para um mapa.

---

## D149 — O `ApiToken` sai, e o agente volta ao `AGENT_TOKEN`

**Decidido:** saem o modelo `ApiToken`, o enum `ApiTokenOwner`, a tela `/tokens` e o token
pessoal. O `/agent-hub` autentica por `AGENT_TOKEN` do `.env`.
**Supera:** [D80](./acesso.md#d80--um-apitoken-só-com-dono-polimórfico),
[D89](./acesso.md#d89--a-troca-do-agent_token-pelo-apitoken-é-por-convivência-com-prazo) e
[D142](./acesso.md#d142--api_tokensuserid-ganha-fk-antes-de-existir-token-pessoal).

**Por quê:** o D89 era uma migração com prazo — sair do segredo único no `.env` para um token por
agente, revogável. É a decisão certa para uma frota de verdade e irrelevante para uma banca: não
existe integração de terceiro para autenticar, e o agente da demonstração é um. O prazo do D89
expira sem ser cumprido, e isso fica escrito aqui em vez de virar dívida silenciosa.

---

## D150 — O termo de aceite sai

**Decidido:** saem o modelo `Acceptance`, o domínio, a rota pública `/api/aceite/*`, a tela do
termo, o PDF e o lembrete por e-mail.
**Supera:** [D27](./posse.md#d27--num-posto-com-duas-pessoas-quem-assina-o-termo-é-o-gestor-da-localidade),
[D29](./posse.md#d29--o-eula-é-copiado-para-o-acceptance-não-referenciado),
[D30](./posse.md#d30--o-pdf-é-gerado-no-aceite-e-guardado-nunca-regenerado),
[D87](./posse.md#d87--entrega-com-alvo-asset-não-emite-termo) e
[D88](./posse.md#d88--aceite-pendente-não-bloqueia-a-entrega).

**Por quê:** o aceite é peça jurídica, não de ITAM — ele prova que o colaborador assinou, e isso
não participa de nenhuma pergunta de inventário. Carregava a única rota pública não-trivial do
sistema (token de uso único, 32 bytes, validade), geração de PDF e a dependência de correio.

**Duas decisões ficam sem objeto:**
[D107](./reconciliacao.md#d107--o-aceite-age-e-depois-fecha-e-a-ordem-erra-para-o-lado-certo) e
[D139](./acesso.md#d139--o-escalonamento-tem-uma-implementação-e-o-aceite-passa-a-usá-la). O
`resolverEscalonamento()` do [D73](./acesso.md#d73--resolverescalonamento-é-função-separada-de-resolverresponsaveis)
**fica**: ele é lido pela tela de postos e pelo relatório por responsável. O que sai é o aceite ser
um dos chamadores dele — e o D139, que existia para garantir uma implementação só, continua
verdadeiro por ter menos um cliente, não por ter sido revogado.

**O e-mail não sai com ele:** `core/mail` continua, porque o lembrete de atraso da posse
([D86](./plataforma.md#d86--e-mail-é-best-effort-com-log-o-que-não-pode-se-perder-tem-linha-em-tabela))
usa o mesmo transporte.

---

## D151 — A central de alertas e o webhook saem

**Decidido:** saem o modelo `Alert`, o enum `AlertType`, o domínio, `core/webhook`, o job diário e
o sino do cabeçalho.
**Supera:** [D57](./ciclo-de-vida.md#d57--a-central-no-app-é-o-canal-primário-smtp-mora-no-env),
[D125](./ciclo-de-vida.md#d125--dedupekey-tem-uma-regra-por-tipo-e-ela-carrega-o-id-da-origem),
[D126](./ciclo-de-vida.md#d126--o-webhook-tem-allowlist-de-destino-notifiedat-é-do-alerta-e-a-rodada-seguinte-reenvia-o-nulo),
[D127](./ciclo-de-vida.md#d127--alerta-não-nasce-para-ativo-fora-do-parque) e
[D128](./ciclo-de-vida.md#d128--a-central-nasce-só-com-os-sinais-do-ativo).

**Por quê:** alerta é notificação, não inventário. Os sinais que ele vigia (garantia vencendo,
ativo sem handshake, assento esgotado) continuam **consultáveis** — são consultas sobre dados que
ficam. O que sai é empurrá-los para alguém, com deduplicação, retentativa e destino externo.

**O que NÃO sai com ele, e eu errei dizendo que sairia:** `core/jobs/claim-window.ts` e o modelo
`JobRun`. Eles parecem do alerta e do LDAP, mas `reconcile.job.ts` (a convergência) e
`overdue-reminder.job.ts` (a posse) também tomam a janela do dia por ali. O
[D79](./plataforma.md#d79--cada-job-tem-a-própria-linha-de-execução-lastalertrunat-não-é-coluna-de-appsetting)
continua valendo inteiro, e os
[D56](./ciclo-de-vida.md#d56--o-job-diário-não-é-setinterval-de-24-h-é-tick-curto-com-compare-and-set) e
[D123](./ciclo-de-vida.md#d123--a-janela-do-job-é-do-fuso-e-da-hora-configurados-iniciododia-ganha-parâmetro)
com ele.

---

## D152 — O valor contábil sai

**Decidido:** saem o modelo `Depreciation`, o enum `DepreciationFloorType`, o relatório e o cálculo
em `asset/helpers/depreciacao.helper.ts`.
**Supera:** [D55](./ciclo-de-vida.md#d55--valor-contábil-é-calculado-no-servidor-sempre).

**Por quê:** depreciação é contabilidade. O ativo mantém `purchaseCost` e `purchaseDate` — o fato
—, e o que sai é a regra de amortização, que é do financeiro e não do inventário. O D55 estava
certo no que decidia (calcular no servidor, nunca persistir); o que muda é não haver cálculo.

---

## D153 — Estoque vira **item** e **movimento**

**Decidido:** `Accessory`, `Consumable`, `Component` e seus três `Checkout` dão lugar a
`StockItem` + `StockMovement`. Sete modelos viram dois.
**Supera:** [D36](./estoque.md#d36--os-três-têm-lixeira-aqui-o-d8-não-se-aplica),
[D37](./estoque.md#d37--consumable-não-tem-devolução-não-é-validação-é-ausência) e
[D38](./estoque.md#d38--devolução-parcial-de-componente-divide-a-linha).
**Mantém:** [D33](./estoque.md#d33--o-acessório-entregue-a-um-posto-é-do-posto-os-ocupantes-respondem-solidariamente),
[D34](./estoque.md#d34--saldo-é-sempre-calculado-nunca-coluna) e
[D35](./estoque.md#d35--um-domínio-stock-não-três-fatias-verticais).

**Por quê:** os três eram o mesmo conceito com três tabelas — algo que tem quantidade, entra e
sai. A diferença entre eles era *o comportamento na devolução*, e é só isso que o D37 e o D38
descrevem. Com `StockMovement` carregando sinal e motivo, a devolução que não existe (consumível)
é a ausência de um movimento de entrada, e a parcial é um movimento de valor menor — sem dividir
linha.

**O D34 é o que torna isto barato:** saldo já era calculado, nunca coluna. Trocar as tabelas de
baixo não mexe em nenhuma resposta.

---

## D154 — Relatório vira três consultas fixas

**Decidido:** o builder sai. Ficam três relatórios declarados em código — ativos por responsável,
licenças e estoque — cada um com export.
**Supera:** [D67](./relatorios-import-etiquetas.md#d67--o-builder-recebe-token-nunca-campo-nunca-sql),
[D71](./relatorios-import-etiquetas.md#d71--o-catálogo-de-colunas-é-declarado-duas-vezes-de-propósito) e
[D133](./relatorios-import-etiquetas.md#d133--o-export-não-monta-select-ele-reusa-o-do-domínio).
**Mantém:** [D66](./relatorios-import-etiquetas.md#d66--responsável-resolvido-é-uma-view-não-coluna-nem-cache)/[D129](./relatorios-import-etiquetas.md#d129--a-view-devolve-responsável-real-e-fala-a-língua-da-tela)/[D130](./relatorios-import-etiquetas.md#d130--posto-vago-continua-saindo-do-posto_vago) — a
view do responsável, que as listagens também leem — e o D138.

**Por quê:** 2.948 linhas para montar consultas que, num TCC, são três. O D67 existia para que o
builder nunca recebesse SQL nem nome de campo cru; com as consultas escritas à mão a superfície
desaparece em vez de ser defendida, o que é o jeito mais forte de resolver o problema dele.

---

## D155 — Manutenção vira registro no histórico do ativo

**Decidido:** o modelo `Maintenance` fica, com tipo, data e custo. Saem a tela `/manutencoes`, a
aba própria e o fluxo de abrir/fechar. A manutenção aparece no histórico do ativo, junto do resto.
**Supera:** nada — o assunto não tinha decisão escrita.

**Por quê:** o que o ITAM precisa saber é *esta máquina foi para o conserto em tal data e custou
tanto*, que é uma linha no histórico. Gerenciar a ordem de serviço é ITSM, e é outro produto —
pelo mesmo raciocínio do D143 que manteve o RMM e cortou o resto.

---

## D156 — O portal do colaborador e o backup saem

**Decidido:** saem a tela `/meus-equipamentos` e o domínio `backup`.
**Supera:** [D141](./acesso.md#d141--o-portal-se-chama-pelo-que-lista).
**Mantém:** o modelo `Department`.

**Por quê o portal:** ele mostra ao colaborador o que está no nome dele — uma segunda tela sobre
dados que a tela de posse já mostra, para um perfil de usuário que a banca não vai usar. O D141
estava certo sobre o **nome** (a tela se chama pelo que lista); o que cai é a tela.

**Por quê o backup:** rotina de operação, não funcionalidade. `pg_dump` resolve numa linha de
`cron`, e nada no sistema depende dele.

**Por quê o `Department` fica, contra a primeira versão deste corte:** ele parecia pertencer ao
portal, mas está entranhado em `user` (criação, atualização, filtro, substituto) e é dimensão
legítima de ITAM — centro de custo de quem responde pelo ativo. Cortá-lo custaria edição em código
que fica, por nenhum ganho de escopo. O
[D75](./acesso.md#d75--department-é-a-décima-spec-do-catálogo-e-a-troca-de-coluna-é-em-duas-migrações)
e o [D135](./acesso.md#d135--o-contrato-do-departamento-muda-na-etapa-d-não-no-drop-column)
continuam valendo.

---

## D157 — A conferência sai **inteira**, inclusive a do agente

**Decidido:** saem o domínio `audit` completo, o modelo `Audit`, os enums `AuditResult` e
`AuditMethod`, a coluna `lastAuditAt` e a chamada em `reconcile.job.ts:143`.
**Supera:** [D144](#d144--a-conferência-manual-sai-a-conferência-pelo-agente-fica), que mantinha a
conferência pelo agente, e [D53](./ciclo-de-vida.md#d53--lastauditat-é-coluna-nextauditat-não-nasce).
**Mantém:** [D143](#d143--o-escopo-é-itam--rmm-e-o-critério-de-corte-é-a-ponte).

**Por quê o D144 não se sustentou:** ele preservava `audit-by-agent` por ser convergência, e isso
está certo. O que ele não pesou é que a conferência pelo agente **só tem valor com tela**: ela
grava "o serial confere, visto hoje" e ninguém lê esse registro em lugar nenhum depois que
`/auditorias` sai. Sem leitor, é escrita em banco que só cresce.

**O que isso custa, e é pouco:** o `auditarPeloAgente()` tinha **um** chamador — o job da
reconciliação, que fica. Tirar a chamada é uma linha, e o
[D124](./ciclo-de-vida.md#d124--a-auditoria-pelo-agente-nasce-no-job-uma-por-ativo-por-dia-e-só-quando-o-serial-confere)
fica sem objeto sem que nada mais no job se mexa.

**O que NÃO se perde:** `Endpoint.lastSeenByAgentAt`
([D50](./reconciliacao.md#d50--lastseenbyagentat-existe-e-nunca-se-chama-lastseen)) continua
respondendo "quando esta máquina foi vista pela última vez", que é a pergunta que levava alguém à
conferência. A resposta fica; o registro formal de que ela foi feita é que sai.

---

## D158 — Manutenção sai **inteira**

**Decidido:** saem o domínio `maintenance`, o modelo `Maintenance`, o enum `MaintenanceType`, a
tela `/manutencoes` e a aba do ativo.
**Supera:** [D155](#d155--manutenção-vira-registro-no-histórico-do-ativo), que mantinha o modelo
como linha de histórico.

**Por quê o D155 não se sustentou:** ele guardava tipo, data e custo "para o histórico". Mas sem
tela ninguém **cria** a linha — e o histórico do ativo já tem onde registrar que a máquina saiu
para conserto: o `ActivityLog`, por decisão do
[D18](./catalogo-e-ativo.md#d18--assetlog-não-nasce-a-aba-histórico-lê-o-activitylog), que recusou
um `AssetLog` próprio exatamente para não ter dois lugares contando a mesma coisa. Um modelo
`Maintenance` sem escritor seria o terceiro.

---

## D159 — A tela da convergência fica, e é a única das cinco que fica

**Decidido:** `/descobertas` e o domínio `reconciliation` permanecem inteiros. Saem as outras
quatro telas que entraram em dúvida junto com ela — manutenções (D158), conferência (D157),
importação (D146) e portal do colaborador (D156).
**Descartado:** cortar a tela de descobertas.

**Por quê esta é diferente das outras quatro:** as quatro são telas **sobre** dados que outra tela
já mostra, ou sobre processo que não é inventário. `/descobertas` é a única porta do
`reconciliation` — a fila de sugestões, os órfãos sem cadastro e os ociosos. Cortá-la deixaria
4.242 linhas de motor inalcançáveis.

**E esse erro já foi cometido aqui.** A segunda auditoria da fase 7 procurou o que a fase tinha de
motor pronto e **inalcançável pela tela**, achou "três entregas inteiras nesse estado", e as
[D113](./reconciliacao.md#d113--o-turno-é-a-moda-dos-turnos-não-a-média-das-horas)–[D122](./reconciliacao.md#d122--assetsuggestions-e-não-o-nome-que-o-prisma-format-escreveu)
nasceram para consertar isso. Cortar a tela agora seria reintroduzir, de propósito, o problema que
dez decisões já pagaram para resolver — e deixaria o trabalho sem o que demonstrar na defesa,
porque é nesta tela que a convergência **acontece** na frente de quem assiste.

**O que isso preserva, e é o D143:** o critério continua sendo a ponte ITAM×RMM. As quatro que
saem não a atravessam; esta é a ponte.

---

## D160 — O estoque **não** foi achatado

**Decidido:** `Accessory`, `Consumable`, `Component` e seus três `Checkout` ficam como
estão — sete modelos, 3.149 linhas.
**Supera:** [D153](#d153--estoque-vira-item-e-movimento), que decidiu trocá-los por
`StockItem` + `StockMovement`.

**Por quê o D153 não foi executado:** ele é o único item do de-escopo que **reescreve** em vez
de remover. Os outros quinze apagam código e ajustam quem o chamava; este troca o modelo de dados
embaixo de um domínio inteiro, das operações de entrega e devolução, da aba Componentes do ativo e
de 1.096 linhas de teste — tudo isso depois de o resto do corte já estar aplicado e verde.

**O que isso deixa na mesa, assumido:** ~1.600 linhas e cinco modelos. É o maior item isolado que
sobra, e o raciocínio do D153 continua correto — os três eram o mesmo conceito, e o
[D34](./estoque.md#d34--saldo-é-sempre-calculado-nunca-coluna) (saldo calculado, nunca coluna) é o
que tornaria a troca barata do lado das respostas.

**Por quê isto é uma decisão e não uma pendência:** porque o D153 está escrito, e uma decisão
escrita que não governa o código é pior do que decisão nenhuma — quem ler o arquivo acreditaria
num `StockItem` que não existe. O log diz o que é: a troca foi decidida, não foi feita, e o motivo
está aqui.

---

## D161 — Os relatórios que sobraram são **dois**, e não três

**Decidido:** ficam `GET /api/reports/prazos` (garantia e fim de vida vencendo) e
`GET /api/reports/responsabilidade` (direto × por posto × por ativo).
**Supera:** [D154](#d154--relatório-vira-três-consultas-fixas), que falava de "três — ativos por
responsável, licenças e estoque".

**Por quê três virou dois:** licença e estoque **já tinham export próprio** nos domínios deles
(`GET /api/licenses/export`, `GET /api/stock/alerts`), e o D154 os contou como se fossem nascer
dentro de `report`. Não precisavam: relatório que lê o domínio é melhor dentro do domínio, e
duplicá-los em `/api/reports/` criaria duas listas do mesmo dado — exatamente o que o D154 dizia
estar evitando ao manter uma tela só.

**O que o D154 acertou e continua valendo:** o builder saiu, e com ele
[D67](./relatorios-import-etiquetas.md#d67--o-builder-recebe-token-nunca-campo-nunca-sql),
[D71](./relatorios-import-etiquetas.md#d71--o-catálogo-de-colunas-é-declarado-duas-vezes-de-propósito) e
[D133](./relatorios-import-etiquetas.md#d133--o-export-não-monta-select-ele-reusa-o-do-domínio). A
view do responsável ficou.

---

## D162 — "Minha conta" sai, e o papel vira campo do formulário de usuário

**Decidido:** sai a tela `/minha-conta`. O papel se edita em `PUT /api/users/:id`, pelo formulário
de Usuários, e entra no `USER_LIST_SELECT`.
**Consequência de:** [D148](#d148--permissão-vira-papel-grupo-diretório-sso-e-segundo-fator-saem) e
[D149](#d149--o-apitoken-sai-e-o-agente-volta-ao-agent_token).

**Por quê a tela caiu:** ela tinha exatamente dois painéis — segundo fator e tokens pessoais. Os
dois saíram, e sobrou uma página com um cabeçalho. O D148 e o D149 não previram isso porque
olhavam o que removiam, não o que restava.

**Por quê o papel NÃO ganhou rota própria:** a matriz tinha
`PUT /api/users/:id/groups` porque o dono do dado era o grupo — quem decidia o que uma permissão
concedia era o domínio de acesso, e `user` não tinha o que opinar. Com papel o dono é a COLUNA, e
uma rota própria para gravar um enum de três valores seria cerimônia. O `PUT /api/users/:id` já
exigia `ADMIN`, que é a mesma exigência que a rota de grupos tinha: ninguém se promove sozinho.

**POR QUE ELE ENTRA NO `USER_LIST_SELECT`, e isto é um defeito evitado:** o formulário abre da
LISTAGEM. Sem o campo na linha, o `<select>` do papel inicializaria em `USUARIO` e **gravaria**
`USUARIO` — corrigir o e-mail de um administrador o rebaixaria, em silêncio. É palavra por palavra
o defeito que o `managerId` já tinha causado e que o comentário daquele select descreve;
a rede do `ultimo-administrador.ts` pegaria o caso do ÚLTIMO administrador, e os outros passariam.

---

## D163 — O mapa de coluna protegida é tipado `Papel`, porque `indexOf` de string estranha é **-1**

**Decidido:** `COLUNAS_COM_PERMISSAO` (export de ativos) e `TOKENS_COM_PERMISSAO` (relatório) têm
`Papel` no tipo do valor, não `string`.

**O defeito que isto fecha, e ele ACONTECEU durante o de-escopo:** os dois mapas guardavam chaves
de permissão (`purchaseCost: 'assets.viewCost'`). A troca para papel passou pelo compilador porque
o tipo era `string` — e `papelAlcanca()` compara por `indexOf` na hierarquia. O `indexOf` de
`'assets.viewCost'` é **-1**, e `USUARIO >= -1` é verdadeiro: a coluna de custo passou a sair no
CSV para qualquer sessão.

**Quem pegou:** `tests/invariantes/dado-sensivel.test.ts`, no caso "o EXPORT recusa a coluna de
custo pedida pelo nome". O
[D77](./acesso.md#d77--dado-sensível-é-filtrado-no-select-não-mascarado-na-resposta) chama o export
de "porta dos fundos" do dado sensível, e a porta abriu — por um `as string` que o tipo deixava
passar.

**Por quê o tipo e não só a correção:** corrigir os dois valores deixaria a próxima troca livre
para repetir o erro. Com `Papel` no tipo, o compilador recusa a string que não é papel, e o modo
de falhar deixa de existir em vez de ser lembrado.

---

## D164 — O `DEFAULT` da coluna **tranca o sistema**, e a migração precisa do backfill

**Decidido:** a migração do de-escopo traduz grupo → papel **antes** de derrubar `groups` e
`_GroupToUser`. `access.manage` ou `settings.manage` vira `ADMIN`; qualquer outra chave vira
`TECNICO`; sem grupo fica no `DEFAULT`.

**O DEFEITO QUE ISTO CONSERTA, E ELE ACONTECEU.** A coluna nasceu
`role Papel NOT NULL DEFAULT 'USUARIO'`, e esse `DEFAULT` é a decisão certa para conta NOVA — é a
porta fechada por padrão da F3 levada à autorização (D148). Aplicado a um banco que **já tem
gente**, ele rebaixou todos de uma vez, e os grupos foram derrubados na mesma migração: a
informação de quem era administrador deixou de existir no mesmo passo que a tornou necessária.

**O sintoma é o pior possível, e é silencioso no log de deploy:** a migração termina com sucesso,
o servidor sobe, a conferência de cobertura do D137 passa, o login responde 200 — e toda rota
depois dele responde 403, inclusive as que promoveriam alguém de volta. Foi o que apareceu na
primeira execução depois do corte: painel em branco e `/api/endpoints` em 403 para o
administrador.

**A saída quando já é tarde** (o banco onde a migração já rodou e os grupos já foram embora):
`npm run acesso:administrador -- <login ou e-mail>`, que é a linha de escape que existe
exatamente para o sistema trancado, ou `npm run db:seed`, que repõe o papel do administrador do
`.env`.

**POR QUE A TRADUÇÃO ERRA PARA `TECNICO` E NÃO PARA `USUARIO`:** quem tinha qualquer chave mexia
no inventário, e `TECNICO` é o que alcança o inventário. Rebaixar essa gente para `USUARIO` seria
tecnicamente defensável e praticamente um chamado por pessoa no dia seguinte — e a correção
exigiria um administrador, que é justamente o que o defeito tira.

**A lição, que vale além desta migração:** `DEFAULT` numa coluna nova é o valor para a LINHA que
ainda não existe. Para as que já existem, ele é uma escrita em massa disfarçada de declaração — e
quando a coluna governa acesso, é uma escrita em massa que se tranca para fora.
