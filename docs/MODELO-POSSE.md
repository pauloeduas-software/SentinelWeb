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
          │  Asset ──> USER | ASSET | LOCATION           │
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

Uma linha por entrega. Alvo polimórfico (`targetType` + três FKs nuláveis), como
no Snipe-IT: entrega-se para uma **pessoa**, para uma **localização** ou para
**outro ativo** (a dock presa ao notebook).

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
  targetType = ASSET     →  resolverResponsaveis(ativo-alvo)  (máx. 1 salto)
```

**Nunca é coluna.** Coluna seria uma quarta fonte de verdade para o que as
Camadas 1 e 2 já dizem, e a divergência entre elas seria silenciosa.

O salto de `ASSET` é limitado a **um nível** de propósito: dock → notebook →
pessoa resolve; cadeia mais longa é sintoma de modelagem errada e vira ciclo.

---

## A fronteira: posto, gestor e departamento

> F11, Etapa C — **D72** e **D73**. A seção nasceu de três colunas que existem,
> apontam todas para uma pessoa e parecem responder a mesma pergunta:
> `Location.managerId` (desde a F1), `User.managerId` e `User.departmentId` (as
> duas da F11). Elas respondem a **quatro** perguntas diferentes, e misturá-las
> é o jeito mais fácil de reabrir o D16 por efeito colateral.

| A pergunta | Quem responde | Onde isso mora |
|---|---|---|
| **Quem responde pelo ativo?** | a posse aberta → a pessoa, ou os ocupantes do posto | `resolverResponsaveis()` (Camada 3) |
| **Quem responde pelo posto VAZIO?** | o gestor da localidade, subindo a árvore | `resolverEscalonamento()` |
| **Quem cobra a pessoa?** | o gestor dela | `User.managerId` |
| **A quem pertence o custo?** | o departamento | `User.departmentId` → `Department` |

Em uma linha: **o posto responde pelo ativo; a pessoa responde pelo posto; o
gestor da localidade responde pelo posto vazio — e nunca pelo posto ocupado.**

### O que a fronteira proíbe

Três coisas, e nenhuma delas dá erro de compilação — por isso estão escritas:

1. **`User.managerId` não entra em `resolverResponsaveis()`.** Gestor é rota de
   escalonamento: ele recebe o aviso de atraso e aprova a baixa. Pôr o gestor na
   lista de responsáveis faria toda devolução pendente ter dois nomes, e o
   segundo nunca esteve com o equipamento.

2. **`Location.managerId` não entra em `resolverResponsaveis()` tampouco.** Ele é
   a resposta da pergunta *vizinha* — quem atende o telefone quando o posto está
   vazio. Se ele entrasse, **todo** ativo passaria a ter responsável e *"ativo em
   posto vago"* deixaria de ser expressável (ver abaixo).

3. **`Department` não detém ativo.** Não há `targetType: 'DEPARTMENT'` em
   `Assignment`, e não vai haver: departamento não tem mesa, não tem chave e não
   assina termo. Entregar "para o Comercial" é entregar para uma **sala** (que é
   uma `Location`, e tem ocupantes) ou para uma **pessoa**. Um quarto alvo
   polimórfico criaria posse sem responsável possível — exatamente o vazio que a
   Camada 2 existe para preencher.

O departamento serve a outras três coisas, todas legítimas: relatório (*"quanto o
Comercial tem em equipamento"*), rateio de custo e filtro de tela. Nenhuma delas
é posse.

### Por que o escalonamento é função IRMÃ, e nunca um `else`

A tentação é escrever, dentro da Camada 3: *"se o posto está vago, devolve o
gestor da localidade"*. Isso destrói o sinal mais útil do modelo, porque três
leitores dependem de o vazio **continuar vazio**:

| Leitor | O que ele perde com o `else` |
|---|---|
| `PosseResolvida.postoVago` | a marca na ficha do ativo nunca mais acende |
| `GET /api/workstations?view=vagos` | o relatório de posto sem ocupante fica vazio |
| o alerta de ativo parado (job da F8) | para de disparar — tudo tem responsável |

São perguntas diferentes e por isso são duas funções:

- *quem está com isto?* — **admite vazio.** O equipamento pode estar no estoque,
  ou numa mesa que ninguém ocupa. O vazio **é** o fato.
- *para quem eu ligo?* — existe para **preencher** o vazio da primeira. Não diz
  quem é responsável; diz quem atende.

### Onde o escalonamento aparece

Três lugares, e em nenhum deles ele vira responsabilidade:

- **na ficha do ativo**, ao lado do `postoVago` que o motiva — é a aba Posse que
  o mostra, com a diferença entre *"gestor da Mesa 1"* e *"gestor do Andar 2,
  porque a Mesa 1 não tem"*;
- **no termo de entrega de alvo `LOCATION`** (D27 + D139): quem assina é um
  gestor, encontrado subindo a árvore. O 409 só dispara quando **nenhum**
  ancestral tem gestor;
- **no desligamento com substituto** (Etapa G): desligar quem gere localidade sem
  informar substituto é 409, porque deixar a localidade sem gestor é abrir o
  buraco que as duas linhas acima caem dentro.

### Se um dia "o gestor responde junto" for regra

É **decisão nova e explícita**, tomada aqui e com nome — não efeito colateral de
as colunas existirem. E a forma dela não é acrescentar o gestor à Camada 3: é
decidir se ele vira **ocupante** do posto (o que a Camada 2 já expressa, com
turno e tudo) ou se a responsabilidade passa a ter grau, que é tabela nova.

---

## O que acontece com `Asset.assignedToId`

**A coluna continua, o significado muda.** Ela passa a ser **cache do caso
`USER`**, e só:

| Situação | `assignedToId` | Fonte de verdade |
|---|---|---|
| Entregue para a Laura | id da Laura | `Assignment` (targetType USER) |
| Na Mesa 1 (Laura + Ana) | **`null`** | `Assignment` (targetType LOCATION) → ocupantes |
| Preso à dock | **`null`** | `Assignment` (targetType ASSET) |
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

**2. A invariante estado × posse** (ver `INVARIANTES.md`): um ativo com
responsável resolvido não pode ter status de tipo `DEPLOYABLE` (estoque) nem
`ARCHIVED` (fora de operação).

**3. Posto vago vira sinal operacional.** Ativo `IN_USE` cuja assignment aponta
para um local **sem ocupantes abertos** = equipamento parado em posto vazio.
Candidato a voltar ao estoque. Nenhum ITAM de prateleira responde isso.

**4. "Quais ativos a Laura responde?"** passa a existir: assignments USER dela
**+** ativos das assignments LOCATION dos postos que ela ocupa.

---

## O que este modelo NÃO resolve

Declarado para não ser redescoberto em auditoria:

- **Mouse reserva na gaveta de uma mesa ocupada** apareceria como
  responsabilidade dos ocupantes, se alguém fizer checkout dele para a mesa. A
  saída é não fazer checkout de item de reserva — `locationId` (*onde está*)
  continua separado da assignment (*quem responde*). Um ativo pode estar **em**
  um lugar sem ser **do** lugar.
- **N detentores diretos simultâneos** continua impossível por construção, e é
  proposital: responsabilidade compartilhada sem um posto no meio é
  responsabilidade de ninguém. O caminho é criar o posto.
- **Escala com horário** (`08:00–12:00`) não existe. `shift` é rótulo. Se virar
  necessidade, é tabela própria, não coluna nova aqui.

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
