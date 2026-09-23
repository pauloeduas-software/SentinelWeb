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
