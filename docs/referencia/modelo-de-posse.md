# Modelo de Posse e Responsabilidade

> **Este documento é o contrato.** Schema, use-cases, telas e os planos de fase
> derivam dele. Quando algo aqui mudar, muda aqui primeiro.
>
> Nasceu da pergunta: *"um computador, mouse etc. está na Mesa 1, e essa mesa é
> usada de manhã pela Laura e à tarde pela Ana — as duas são responsáveis. Como
> isso se modela?"*
>
> A resposta do Snipe-IT é: não se modela. A dele é a Camada 1 abaixo, e só.

---

## O problema em uma frase

Um ativo tem **um** detentor. Mas um detentor pode ser **um posto de trabalho**,
e um posto pode ser ocupado por **várias pessoas** — em turnos diferentes, ao
mesmo tempo, ou os dois.

**Ativo é computador.** O que não é máquina — monitor, teclado, mouse, cabo — é
estoque, por quantidade, e as unidades entregues à mesa (`StockMovement` de
alvo posto) respondem pelos mesmos ocupantes que o computador. Um posto de
trabalho tem no máximo um ativo (invariante 19) e quantas unidades de estoque
precisar.

Modelar a responsabilidade como `Asset ⟷ Person` muitos-para-muitos **perde o
lugar**, que é a unidade real da operação, e faz a informação crescer
multiplicativamente:

| | vínculo direto equipamento ⟷ pessoa | Equipamento → Posto → Ocupantes |
|---|---|---|
| 1 computador e 5 unidades de estoque na mesa, 2 pessoas | 12 linhas | **2 ocupações** (o equipamento→mesa já é a posse) |
| Ana sai da empresa | atualizar 6 linhas | atualizar **1** |
| Chega um headset (estoque) na mesa | criar 2 linhas | **zero** — herda os dois responsáveis |
| Onde mora o turno "manhã"? | repetido em cada par | **uma vez**, no vínculo pessoa↔posto |
| 20 mesas × 6 equipamentos × 2 turnos | 240 linhas | 40 |

**A pluralidade não fica no equipamento. Fica no posto.**

---

## As três camadas

```
          ┌─────────────────────────────────────────────┐
 Camada 1 │  Assignment — a posse, alvo polimórfico      │  ← paridade Snipe-IT
          │  Asset ──> PERSON | WORKSTATION              │
          └───────────────────┬─────────────────────────┘
                              │ quando o alvo é WORKSTATION
          ┌───────────────────▼─────────────────────────┐
 Camada 2 │  WorkstationOccupant — quem ocupa o posto    │  ← o que o Snipe-IT não tem
          │  Workstation ──> N × (Person + turno)        │
          └───────────────────┬─────────────────────────┘
                              │
          ┌───────────────────▼─────────────────────────┐
 Camada 3 │  Responsabilidade — DERIVADA, nunca coluna   │
          │  resolverResponsaveis(asset) → Person[]      │
          └─────────────────────────────────────────────┘
```

### Camada 1 — `Assignment`: a posse

Uma linha por entrega. Alvo polimórfico (`targetType` + duas FKs nuláveis):
entrega-se para uma **pessoa** ou para um **posto**. Não há alvo "outro ativo":
ativo é computador, e o que acompanha a máquina (dock, monitor, cabo) é estoque,
por quantidade. E não há alvo **localização**: ela diz onde a coisa está
guardada, não quem a recebeu
([Y](../decisoes/posse.md#y--o-posto-sai-de-location-localização-guarda-posto-recebe)).

A pessoa é o **colaborador** (`Person`, a aba Colaboradores de Configurações) — nunca
a conta de quem opera o sistema, que é `User` e não recebe equipamento
([U](../decisoes/acesso.md#u--quem-recebe-equipamento-sai-de-user-colaborador-vira-catálogo-e-sobram-dois-cargos)).

- **Aberta** = `checkinAt IS NULL`. É a posse atual.
- **Fechada** = `checkinAt` preenchido. É histórico, e histórico não se apaga.
  Nem quando o alvo sai: o colaborador excluído vai para a lixeira (a linha
  fica), e o posto excluído deixa o nome por escrito em `targetWorkstationName`
  ([V](../decisoes/posse.md#v--excluir-não-apaga-o-passado-localização-por-referência-colaborador-pela-lixeira),
  [Y](../decisoes/posse.md#y--o-posto-sai-de-location-localização-guarda-posto-recebe)).
- **Uma aberta por ativo**, garantida por índice único parcial no banco —
  não por regra de aplicação que alguém pode esquecer:

  ```sql
  CREATE UNIQUE INDEX "assignments_um_aberto_por_ativo"
    ON "assignments"("assetId") WHERE "checkinAt" IS NULL;
  ```

  Esse índice é também **a alavanca da decisão**: o dia que N detentores
  simultâneos for necessário, derrubar o índice é a mudança — não reescrever a
  camada.

### Camada 2 — `WorkstationOccupant`: quem ocupa o posto

Uma linha por pessoa que ocupa um posto, com o turno.

- **Aberta** = `endedAt IS NULL`. É ocupante atual.
- `shift` é **texto livre** (`"Manhã"`, `"Tarde"`, `"12x36 A"`). Enum engessaria
  escalas reais; faixa de horário seria agenda, não inventário.
- **O turno se corrige no lugar, na ocupação aberta.** O lápis **Corrigir turno** do
  painel de ocupantes da ficha do posto abre o campo na própria linha — Enter salva,
  Esc cancela, vazio apaga o turno — e grava só o `shift`
  (`PATCH /api/workstations/:id/occupants/:occupantId`, com trilha no `ActivityLog`). A linha
  continua a mesma, com o mesmo `startedAt`: encerrar e reabrir fabricaria no histórico
  uma saída que não aconteceu e perderia a data de entrada. Ocupação **encerrada** não
  muda de turno (409) — é histórico ([Q](../decisoes/escopo.md#q--a-varredura-do-código-morto-o-que-não-tem-leitor-sai)).
- **A mesma pessoa não ocupa o mesmo posto duas vezes ao mesmo tempo:**

  ```sql
  CREATE UNIQUE INDEX "workstation_occupants_um_aberto_por_pessoa_posto"
    ON "workstation_occupants"("workstationId", "personId") WHERE "endedAt" IS NULL;
  ```

- **O posto é cadastro próprio** (`Workstation`), que FICA numa localização
  (`locationId`, obrigatória): a Mesa 1 fica na Filial. Ele não é um segundo
  campo de "onde" do ativo — o ativo continua com um, `Asset.locationId`, onde
  está guardado —: o posto é quem RECEBE, como a pessoa
  ([Y](../decisoes/posse.md#y--o-posto-sai-de-location-localização-guarda-posto-recebe)).
  O nome do posto é único no sistema. O cadastro dele está em
  [`postos.md`](postos.md).

### Camada 3 — Responsabilidade derivada

```
resolverResponsaveis(ativo):
  assignment ← a assignment ABERTA do ativo
  se não houver          →  []                        (sem detentor: estoque)
  targetType = PERSON    →  [aquela pessoa]
  targetType = WORKSTATION  →  ocupantes abertos daquele posto   ← Laura + Ana
```

**Nunca é coluna.** Coluna seria uma quarta fonte de verdade para o que as
Camadas 1 e 2 já dizem, e a divergência entre elas seria silenciosa.

---

## Quem responde pelo ativo — e só isso

| A pergunta | Quem responde | Onde isso mora |
|---|---|---|
| **Quem responde pelo ativo?** | a posse aberta → a pessoa, ou os ocupantes do posto | `resolverResponsaveis()` (Camada 3) |

Em uma linha: **o posto responde pelo ativo; a pessoa responde pelo posto.**

A localização **não aponta para pessoa nenhuma**. O "gestor da localidade"
(`Location.managerId`, D72) existiu como resposta da pergunta vizinha — *quem
atende quando o posto está vazio* — e saiu junto com a hierarquia: a tela não o
usava para decidir nada.

### O que a fronteira proíbe

Nada disso dá erro de compilação — por isso está escrito:

1. **Não há "responsável padrão" do lugar.** Se alguém voltar a pôr uma pessoa
   na localização, ela não entra em `resolverResponsaveis()`: se entrasse,
   **todo** ativo passaria a ter responsável e *"ativo em posto vago"* deixaria
   de ser expressável (ver abaixo).

2. **Não há terceiro alvo polimórfico.** Entregar "para o Comercial" é entregar
   para um **posto** (que tem ocupantes) ou para uma **pessoa**. Um alvo que não
   tem mesa nem chave criaria posse sem responsável possível — exatamente o
   vazio que a Camada 2 existe para preencher. É também por isso que a
   localização não recebe: ela não tem ocupante, e a entrega a ela seria posse
   que ninguém pode responder.

### Por que o vazio não tem `else`

A tentação é escrever, dentro da Camada 3: *"se o posto está vago, devolve
alguém"*. Isso destrói o sinal mais útil do modelo, porque três leitores
dependem de o vazio **continuar vazio**:

| Leitor | O que ele perde com o `else` |
|---|---|
| `PosseResolvida.postoVago` | a marca na ficha do ativo nunca mais acende |
| `GET /api/workstations?view=vagos` | a lista de posto sem ocupante fica vazia |
| `GET /api/reconciliation/idle` | o ativo parado em posto vago deixa de ser achável — e é ele que a reconciliação cruza com a telemetria |

*Quem está com isto?* **admite vazio.** O equipamento pode não estar entregue a
ninguém, ou estar numa mesa que ninguém ocupa. O vazio **é** o fato, e é o que a
ponte ITAM × RMM lê: máquina ligada todo dia num posto sem ocupante é a pergunta
que nenhum ITAM de prateleira formula.

Se um dia alguém precisar responder pelo posto vazio, a forma já existe: ele vira
**ocupante** do posto, com turno — a Camada 2 expressa isso sem coluna nova.

---

## Não há coluna de "quem responde" no ativo

`Asset.assignedToId` existiu como **cache do caso pessoa** — o id da pessoa quando a
posse aberta era direta, `null` quando o ativo estava num posto ou no estoque — e saiu
do schema ([Q](../decisoes/escopo.md#q--a-varredura-do-código-morto-o-que-não-tem-leitor-sai)).
Quem responde pelo ativo é a `Assignment` aberta, e só ela; a Camada 3 deriva o resto.

**Por quê:** uma coluna com a mesma resposta *ao lado* de uma tabela de posse são duas
fontes de verdade para o mesmo fato, e nada impede divergirem. É exatamente o erro que a
auditoria da F1 encontrou no tipo do status ("Em Uso" tipado `DEPLOYABLE`), um nível
acima. A defesa não é uma checagem de que as duas batem: é não haver a
segunda. A carga inicial de equipamento que já está com
alguém se faz pelo **checkout**, que é a operação que existe para isso.

---

## Como isso amarra no status

Era a suspeita certa: o modelo de posse mexe direto no `StatusLabelType`.

**1. `IN_USE` deixa de ser declaração e vira fato verificável.**
Hoje `IN_USE` + sem responsável é ambíguo — *em uso por quem?*. Com as três
camadas, o computador da Mesa 1 está em uso **por Laura e Ana**, e o banco prova.

**2. A invariante estado × posse** (ver `invariantes.md`): um ativo com
responsável resolvido não pode ter status de tipo `DEPLOYABLE` (estoque).

**3. Posto vago vira sinal operacional.** Ativo `IN_USE` cuja assignment aponta
para um posto **sem ocupantes abertos** = equipamento parado em posto vazio.
Candidato a ser recolhido, e é o `postoVago` que a reconciliação cruza com o uso
observado pelo agente (`GET /api/reconciliation/idle`). Nenhum ITAM de
prateleira responde isso.

**4. "Quais ativos a Laura responde?"** passa a existir: assignments PERSON dela
**+** ativos das assignments WORKSTATION dos postos que ela ocupa.

---

## O que este modelo NÃO resolve

Declarado aqui para não ser redescoberto em auditoria como se fosse defeito. São
limites escolhidos, não esquecimentos.

- **Mouse reserva na gaveta de uma mesa ocupada.** Se alguém der saída dele
  para a Mesa 1, ele aparece como responsabilidade da Laura e da Ana — que não
  sabem que ele existe. A saída é **não** entregar item de reserva:
  `locationId` (*onde está guardado*) continua separado da entrega (*quem responde*).
  Um ativo pode estar **em** um lugar sem ser **do** lugar. O modelo não impede o
  erro; ele dá o lugar certo para registrar a diferença.

- **N detentores diretos simultâneos** continua impossível por construção, e é
  proposital (D14): responsabilidade compartilhada sem um posto no meio é
  responsabilidade de ninguém. O caminho suportado é criar o posto. Se a
  necessidade aparecer mesmo assim, a alavanca está identificada — derrubar o
  índice parcial —, mas é decisão nova, não ajuste.

- **Escala com horário** (`08:00–12:00`, feriado, sobreposição) não existe.
  `shift` é rótulo (D15). Se virar necessidade, é tabela própria com semântica de
  agenda, não coluna nova em `WorkstationOccupant`.

- **Responsabilidade parcial ou hierárquica** (o gestor responde junto com quem
  usa) não é modelada, e a localização não tem gestor — ver a seção acima.

---

## Índices que não podem faltar

```sql
-- uma posse aberta por ativo
CREATE UNIQUE INDEX "assignments_um_aberto_por_ativo"
  ON "assignments"("assetId") WHERE "checkinAt" IS NULL;

-- uma ocupação aberta por (posto, pessoa)
CREATE UNIQUE INDEX "workstation_occupants_um_aberto_por_pessoa_posto"
  ON "workstation_occupants"("workstationId", "personId") WHERE "endedAt" IS NULL;

-- as consultas quentes da Camada 3
CREATE INDEX ON "assignments"("assetId", "checkinAt");
CREATE INDEX ON "workstation_occupants"("workstationId", "endedAt");
CREATE INDEX ON "workstation_occupants"("personId", "endedAt");
```

Os dois primeiros são **parciais**, o mesmo padrão já usado em `assets.assetTag`,
`assets.serial` e `users.email`: a regra vive no banco, não na memória de quem
escreve a próxima query.
