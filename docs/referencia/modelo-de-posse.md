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

Um ativo tem **um** detentor. Mas um detentor pode ser **um lugar**, e um lugar
pode ser ocupado por **várias pessoas** — em turnos diferentes, ao mesmo tempo,
ou os dois.

Modelar isso como `Asset ⟷ User` muitos-para-muitos **perde o lugar**, que é a
unidade real da operação, e faz a informação crescer multiplicativamente:

| | `Asset ⟷ User` direto | Ativo → Posto → Ocupantes |
|---|---|---|
| 3 ativos na mesa, 2 pessoas | 6 linhas | **2 linhas** (o ativo→mesa já existe em `locationId`) |
| Ana sai da empresa | atualizar 3 linhas | atualizar **1** |
| Chega um headset na mesa | criar 2 linhas | **zero** — herda os dois responsáveis |
| Onde mora o turno "manhã"? | repetido em cada par | **uma vez**, no vínculo pessoa↔posto |
| 20 mesas × 5 ativos × 2 turnos | 200 linhas | 40 |

**A pluralidade não fica no ativo. Fica no posto.**

---

## As três camadas

```
          ┌─────────────────────────────────────────────┐
 Camada 1 │  Assignment — a posse, alvo polimórfico      │  ← paridade Snipe-IT
          │  Asset ──> USER | LOCATION                   │
          └───────────────────┬─────────────────────────┘
                              │ quando o alvo é LOCATION
          ┌───────────────────▼─────────────────────────┐
 Camada 2 │  LocationOccupant — quem ocupa o posto       │  ← o que o Snipe-IT não tem
          │  Location ──> N × (User + turno)             │
          └───────────────────┬─────────────────────────┘
                              │
          ┌───────────────────▼─────────────────────────┐
 Camada 3 │  Responsabilidade — DERIVADA, nunca coluna   │
          │  resolverResponsaveis(asset) → User[]        │
          └─────────────────────────────────────────────┘
```

### Camada 1 — `Assignment`: a posse

Uma linha por entrega. Alvo polimórfico (`targetType` + duas FKs nuláveis):
entrega-se para uma **pessoa** ou para uma **localização**. Não há alvo "outro
ativo": ativo é computador, e o que acompanha a máquina (dock, monitor, cabo) é
estoque, por quantidade.

- **Aberta** = `checkinAt IS NULL`. É a posse atual.
- **Fechada** = `checkinAt` preenchido. É histórico, e histórico não se apaga.
- **Uma aberta por ativo**, garantida por índice único parcial no banco —
  não por regra de aplicação que alguém pode esquecer:

  ```sql
  CREATE UNIQUE INDEX "assignments_um_aberto_por_ativo"
    ON "assignments"("assetId") WHERE "checkinAt" IS NULL;
  ```

  Esse índice é também **a alavanca da decisão**: o dia que N detentores
  simultâneos for necessário, derrubar o índice é a mudança — não reescrever a
  camada.

### Camada 2 — `LocationOccupant`: quem ocupa o posto

Uma linha por pessoa que ocupa uma localização, com o turno.

- **Aberta** = `endedAt IS NULL`. É ocupante atual.
- `shift` é **texto livre** (`"Manhã"`, `"Tarde"`, `"12x36 A"`). Enum engessaria
  escalas reais; faixa de horário seria agenda, não inventário.
- **A mesma pessoa não ocupa o mesmo posto duas vezes ao mesmo tempo:**

  ```sql
  CREATE UNIQUE INDEX "location_occupants_um_aberto_por_pessoa_local"
    ON "location_occupants"("locationId", "userId") WHERE "endedAt" IS NULL;
  ```

- **Mesa 1 é uma `Location`**, folha da árvore que já existe
  (`Sede → Andar 2 → Sala 3 → Mesa 1`). Não se cria entidade `Workstation`
  paralela: duplicaria a hierarquia e daria ao ativo dois campos de "onde".

### Camada 3 — Responsabilidade derivada

```
resolverResponsaveis(ativo):
  assignment ← a assignment ABERTA do ativo
  se não houver          →  []                        (sem detentor: estoque)
  targetType = USER      →  [aquele usuário]
  targetType = LOCATION  →  ocupantes abertos daquele local   ← Laura + Ana
```

**Nunca é coluna.** Coluna seria uma quarta fonte de verdade para o que as
Camadas 1 e 2 já dizem, e a divergência entre elas seria silenciosa.

---

## A fronteira: quem responde pelo ativo, e quem só atende o telefone

> **D72.** `Location.managerId` existe desde a F1, aponta para uma pessoa e
> parece responder a mesma pergunta da Camada 3. Não responde — e confundir as
> duas é o jeito mais fácil de reabrir o D16 por efeito colateral.

| A pergunta | Quem responde | Onde isso mora |
|---|---|---|
| **Quem responde pelo ativo?** | a posse aberta → a pessoa, ou os ocupantes do posto | `resolverResponsaveis()` (Camada 3) |
| **Quem atende quando o posto está vazio?** | o gestor da localidade | `Location.managerId`, exibido na ficha do posto |

Em uma linha: **o posto responde pelo ativo; a pessoa responde pelo posto; o
gestor da localidade nunca responde pelo posto ocupado.**

### O que a fronteira proíbe

Nada disso dá erro de compilação — por isso está escrito:

1. **`Location.managerId` não entra em `resolverResponsaveis()`.** Ele é a
   resposta da pergunta *vizinha* — quem atende o telefone quando o posto está
   vazio. Se ele entrasse, **todo** ativo passaria a ter responsável e *"ativo em
   posto vago"* deixaria de ser expressável (ver abaixo).

2. **Não há quarto alvo polimórfico.** Entregar "para o Comercial" é entregar
   para uma **sala** (que é uma `Location`, e tem ocupantes) ou para uma
   **pessoa**. Um alvo que não tem mesa nem chave criaria posse sem responsável
   possível — exatamente o vazio que a Camada 2 existe para preencher.

### Por que o vazio não tem `else`

A tentação é escrever, dentro da Camada 3: *"se o posto está vago, devolve o
gestor da localidade"*. Isso destrói o sinal mais útil do modelo, porque três
leitores dependem de o vazio **continuar vazio**:

| Leitor | O que ele perde com o `else` |
|---|---|
| `PosseResolvida.postoVago` | a marca na ficha do ativo nunca mais acende |
| `GET /api/workstations?view=vagos` | a lista de posto sem ocupante fica vazia |
| `GET /api/reconciliation/idle` | o ativo parado em posto vago deixa de ser achável — e é ele que a reconciliação cruza com a telemetria |

*Quem está com isto?* **admite vazio.** O equipamento pode não estar entregue a
ninguém, ou estar numa mesa que ninguém ocupa. O vazio **é** o fato, e é o que a
ponte ITAM × RMM lê: máquina ligada todo dia num posto sem ocupante é a pergunta
que nenhum ITAM de prateleira formula.

### Se um dia "o gestor responde junto" for regra

É **decisão nova e explícita**, tomada aqui e com nome — não efeito colateral de
a coluna existir. E a forma dela não é acrescentar o gestor à Camada 3: é decidir
se ele vira **ocupante** do posto (o que a Camada 2 já expressa, com turno e
tudo) ou se a responsabilidade passa a ter grau, que é tabela nova.

---

## O que acontece com `Asset.assignedToId`

**A coluna continua, o significado muda.** Ela passa a ser **cache do caso
`USER`**, e só:

| Situação | `assignedToId` | Fonte de verdade |
|---|---|---|
| Entregue para a Laura | id da Laura | `Assignment` (targetType USER) |
| Na Mesa 1 (Laura + Ana) | **`null`** | `Assignment` (targetType LOCATION) → ocupantes |
| No estoque | `null` | não há assignment aberta |

E — **isto é a parte que muda comportamento** — ela deixa de ser editável pelo
formulário de ativo. Sai do `createAssetSchema`/`updateAssetSchema` e do modal.
Quem escreve é **só** o checkout e o checkin.

**Por quê:** um campo editável à mão *ao lado* de uma tabela de posse são duas
fontes de verdade para o mesmo fato, e nada impede divergirem. É exatamente o
erro que a auditoria da F1 encontrou no tipo do status ("Em Uso" tipado
`DEPLOYABLE`), um nível acima. A carga inicial de equipamento que já está com
alguém se faz pelo **checkout**, que é a operação que existe para isso.

---

## Como isso amarra no status

Era a suspeita certa: o modelo de posse mexe direto no `StatusLabelType`.

**1. `IN_USE` deixa de ser declaração e vira fato verificável.**
Hoje `IN_USE` + sem responsável é ambíguo — *em uso por quem?*. Com as três
camadas, o mouse da Mesa 1 está em uso **por Laura e Ana**, e o banco prova.

**2. A invariante estado × posse** (ver `invariantes.md`): um ativo com
responsável resolvido não pode ter status de tipo `DEPLOYABLE` (estoque) nem
`ARCHIVED` (fora de operação).

**3. Posto vago vira sinal operacional.** Ativo `IN_USE` cuja assignment aponta
para um local **sem ocupantes abertos** = equipamento parado em posto vazio.
Candidato a ser recolhido, e é o `postoVago` que a reconciliação cruza com o uso
observado pelo agente (`GET /api/reconciliation/idle`). Nenhum ITAM de
prateleira responde isso.

**4. "Quais ativos a Laura responde?"** passa a existir: assignments USER dela
**+** ativos das assignments LOCATION dos postos que ela ocupa.

---

## O que este modelo NÃO resolve

Declarado aqui para não ser redescoberto em auditoria como se fosse defeito. São
limites escolhidos, não esquecimentos.

- **Mouse reserva na gaveta de uma mesa ocupada.** Se alguém fizer checkout dele
  para a Mesa 1, ele aparece como responsabilidade da Laura e da Ana — que não
  sabem que ele existe. A saída é **não** fazer checkout de item de reserva:
  `locationId` (*onde está*) continua separado da assignment (*quem responde*).
  Um ativo pode estar **em** um lugar sem ser **do** lugar. O modelo não impede o
  erro; ele dá o lugar certo para registrar a diferença.

- **N detentores diretos simultâneos** continua impossível por construção, e é
  proposital (D14): responsabilidade compartilhada sem um posto no meio é
  responsabilidade de ninguém. O caminho suportado é criar o posto. Se a
  necessidade aparecer mesmo assim, a alavanca está identificada — derrubar o
  índice parcial —, mas é decisão nova, não ajuste.

- **Escala com horário** (`08:00–12:00`, feriado, sobreposição) não existe.
  `shift` é rótulo (D15). Se virar necessidade, é tabela própria com semântica de
  agenda, não coluna nova em `LocationOccupant`.

- **Responsabilidade parcial ou hierárquica** (o gestor responde junto com quem
  usa) não é modelada. `Location.managerId` existe para outra coisa — ver a
  fronteira acima.

---

## Índices que não podem faltar

```sql
-- uma posse aberta por ativo
CREATE UNIQUE INDEX "assignments_um_aberto_por_ativo"
  ON "assignments"("assetId") WHERE "checkinAt" IS NULL;

-- uma ocupação aberta por (posto, pessoa)
CREATE UNIQUE INDEX "location_occupants_um_aberto_por_pessoa_local"
  ON "location_occupants"("locationId", "userId") WHERE "endedAt" IS NULL;

-- as consultas quentes da Camada 3
CREATE INDEX ON "assignments"("assetId", "checkinAt");
CREATE INDEX ON "location_occupants"("locationId", "endedAt");
CREATE INDEX ON "location_occupants"("userId", "endedAt");
```

Os dois primeiros são **parciais**, o mesmo padrão já usado em `assets.assetTag`,
`assets.serial` e `users.email`: a regra vive no banco, não na memória de quem
escreve a próxima query.
