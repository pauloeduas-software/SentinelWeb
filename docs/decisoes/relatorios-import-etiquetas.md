# Decisões de relatórios, importação e etiquetas

> O dado entrando e saindo do sistema: CSV, report builder, etiqueta e a view do responsável resolvido.
>
> **A regra desta pasta:** decisão escrita aqui **não se reescreve**. Se a realidade mudou, a
> decisão é **superada** por outra, com link entre as duas — é o log que diz por quanto tempo
> cada regra governou. O índice das 142 está em [`README.md`](./README.md).
>
> Decisões neste arquivo: D65–D71, D129–D134.
> A execução que as aplicou está em [`../historico/`](../historico/).

---

## D65 — Não nasce tabela `Setting`. O `AppSetting` cresce.

O TODO pede um *"`Setting` singleton"*; ele já existe desde a F1, com id fixo `singleton` e o
`assetTagNext` dentro. Uma segunda tabela de configuração global seria duas linhas para a mesma
pergunta, e a primeira dúvida de quem chegar depois seria *em qual delas eu escrevo?*

---

## D66 — Responsável resolvido é uma **view**, não coluna nem cache.

**Decidido:** `vw_asset_responsibles`, não materializada, lida por `$queryRaw` com `Prisma.sql`.
**Descartado:** coluna (é o D16); resolução em memória com teto; e materializar agora. Resolver
em memória serve para uma página de 25 ativos e **não serve para agrupar**: não dá para agrupar
por responsável aquilo que não foi buscado. A view é exata, não tem política de refresh
para ninguém esquecer, e os índices de que precisa **já existem** desde a migration do modelo de
posse (`assignments(assetId, checkinAt)`, `location_occupants(locationId, endedAt)`).

**O trade-off, assumido:** cada relatório paga os joins. A saída está pré-escrita — se o `EXPLAIN`
com 10 mil ativos doer, `CREATE MATERIALIZED VIEW` sobre **o mesmo SQL** + `REFRESH CONCURRENTLY`
no job diário da F8: uma linha de DDL, porque a derivação está num lugar só. Materializar não é a
quarta fonte de verdade que o D16 recusou — é cache reconstruível por comando, cujo modo de falha
é *desatualização visível*, não *divergência silenciosa*. E nada de `WITH RECURSIVE`: o salto de
`ASSET` é de **um nível** por decisão (D16), e uma CTE recursiva seguiria um ciclo alegremente.

---

## D67 — O builder recebe token. Nunca campo, nunca SQL.

**Decidido:** `Record<token, Prisma.Sql>` declarado em `report-columns.ts`; token desconhecido é
422. **Descartado:** montar `select` do Prisma com string do cliente, ou SQL por concatenação.
O perigo não é raw SQL; é SQL **controlado pelo cliente**. Um mapa de token para fragmento
declarado é tão seguro quanto um mapa de token para campo do Prisma, e é o único que expressa o
join da view — mesma forma do `sortable` de `core/http/list-query.ts`, que já resolveu isto para a
ordenação. Quando a **F11** chegar, este mapa passa a ser **filtrado por permissão**, senão o
export vira a porta dos fundos do custo de compra.

---

## D68 — Importação é de dois passos, e o dry-run é obrigatório.

**Decidido:** upload+mapeamento roda o dry-run e grava `ImportRow`; um segundo POST aplica.
**Descartado:** importar direto com "relatório no final". Import é a operação com maior razão
dano/esforço do sistema: um clique, milhares de linhas — e na Etapa E ela muda responsabilidade em
massa **sem tocar em posse nenhuma**. Ver antes o que vai acontecer é a única chance de perceber
que a coluna *Local* veio trocada.

---

## D69 — O export manda número cru e data ISO — e trata fórmula.

**Decidido:** ponto decimal, `YYYY-MM-DD`, e prefixo em valor que começa com `=`, `+`, `-` ou `@`.
**Descartado:** exportar já formatado em pt-BR. O export é a entrada do importador: um `1.234,50`
volta como lixo no round-trip. O custo — o Excel em pt-BR mostra número como texto até a pessoa
converter a coluna — está aceito, porque perder dado na volta é pior que um clique de formatação.
O BOM continua ali: ele resolve **acento**, que é o problema que o TODO nomeia.

---

## D70 — QR leva URL. Código de barras leva a etiqueta.

**Decidido:** o QR contém `${APP_URL}/ativos/:id`; o Code128 contém o `assetTag`.
(A rota era `/itam/assets/:id` quando esta decisão foi escrita; a tela passou a ser
`/ativos/:id`, e `/itam/assets/:id` continua respondendo por redirecionamento em
`App.tsx` — uma etiqueta impressa é para durar, então o QR leva o caminho NOVO.)
**Descartado:** os dois com o mesmo conteúdo. São dois leitores diferentes: a câmera do celular
abre link, o leitor de mão **digita texto** num campo. QR com a etiqueta obriga a copiar e colar;
código de barras com URL faz o leitor digitar 60 caracteres no campo de busca. A busca global
descarta o prefixo conhecido, para quem bipar o QR dentro do campo.

---

## D71 — O catálogo de colunas é declarado duas vezes, de propósito.

**Decidido:** allowlist no servidor (`asset-filters.helper.ts`, onde `ASSET_SORTABLE` já mora) e
catálogo de interface em `src/pages/ativos/helpers/`. **Descartado:** arquivo compartilhado.
O lint impede `src/` importar de `server/`, e a regra existe para não colocar o Prisma no bundle
do navegador — não vale furá-la por uma lista de strings. A divergência entre as duas é
**barulhenta**: token que o servidor não conhece vira 422 com a lista dos válidos.

---

## D129 — A view devolve responsável REAL, e fala a língua da tela

`deletedAt IS NULL` dentro da view; `userId` nulo não vira linha; `via` é
`DIRETO`/`POSTO`/`ATIVO`. **Descartado:** corrigir no consumidor — seriam três
relatórios lembrando do mesmo filtro, e o quarto esqueceria. A equivalência com
`resolverResponsaveisEmLote` é **testada**, não prometida.

---

## D130 — Posto vago continua saindo do `POSTO_VAGO`

A view não responde essa pergunta (o `JOIN` a elimina) e já há duas
implementações revisadas. **Descartado:** uma quarta perna com `LEFT JOIN` só para
caber tudo numa view — ela mudaria a cardinalidade das outras três e faria
`count(*)` por responsável passar a contar posto vazio.

---

## D131 — Posse importada é checkout retroativo e **silencioso**

`checkoutAt` passado + `semAviso` que pula termo e e-mail, usados **só** pelo
importador. **Descartado:** `UPDATE` direto em `assignedToId` (é o D17); e
importar com aviso ligado — 500 convites de assinatura para equipamento entregue
há anos é estrago que nenhum "desfazer" alcança, porque o e-mail já saiu.

---

## D132 — Pessoa casa por e-mail com `findFirst`, e e-mail ambíguo é linha ignorada

A unicidade de `User.email` é **parcial**. **Descartado:** casar por nome (o plano
já recusa) e `findUnique` (não compila).

---

## D133 — O export não monta `select`: ele reusa o do domínio

`license-select.helper.ts` devolve `productKeyMask` porque alguém pensou nisso na
F6. **Descartado:** uma allowlist de export paralela — ela nasceria certa e
envelheceria sozinha, e o dia em que divergir é o dia em que a chave viaja.

---

## D134 — A rota de import declara os próprios limites de multipart

O teto global (10 MB, `files: 1`, `fields: 10`) é o do anexo. O mapeamento viaja
como **um** campo JSON. **Descartado:** subir o teto global — ele protege as
rotas de anexo, que recebem arquivo de gente.
