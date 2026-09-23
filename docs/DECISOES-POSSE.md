# Decisões do modelo de posse — D14 a D17

> Continuação da numeração de decisões do [`ITAM-TODO.md`](./ITAM-TODO.md).
> O **modelo** está em [`MODELO-POSSE.md`](./MODELO-POSSE.md) — lá está o contrato.
> Aqui está **por que ele é assim**, o que foi descartado no caminho e o que
> quebra se alguém reverter.
>
> Mesmo formato das D1–D13: o que foi decidido, por quê, o que foi descartado e
> por quê, e o que quebra na reversão. O que o sistema **recusa** para o modelo
> continuar verdadeiro está em [`INVARIANTES.md`](./INVARIANTES.md).
>
> Origem: a pergunta do dono do projeto durante a auditoria da F1 — *"um
> computador, mouse etc. está na Mesa 1, e essa mesa é usada de manhã pela Laura
> e à tarde pela Ana — as duas são responsáveis. Como isso se modela?"*

---

## O Snipe-IT é referência, não autoridade

As D1–D13 usaram o Snipe-IT como régua: onde ele tem tabela, nós temos tabela;
onde ele tem enum, nós temos enum. Funcionou porque ele já resolveu esses
problemas.

**Aqui ele para.** A resposta do Snipe-IT à pergunta da Mesa 1 é que ela não se
modela: ele tem só a Camada 1 (`Assignment` com alvo polimórfico) e, quando o
alvo é uma localização, a pergunta *"quem responde por isto?"* fica sem resposta
— a localização não tem gente dentro.

Então estas quatro decisões não são de paridade. São o ponto onde copiar sairia
**errado** — e onde "o Snipe-IT faz assim" deixa de ser argumento.

---

## D14 — O detentor é singular; o ALVO é que é polimórfico

**Decidido.** Um ativo tem **no máximo uma** posse aberta. Não há caminho, nem
por API nem por SQL do Prisma, para dois detentores simultâneos do mesmo ativo.
O que varia é **o que** pode ser o detentor: pessoa (`USER`), localização
(`LOCATION`) ou outro ativo (`ASSET`).

A garantia é do banco, não da aplicação:

```sql
CREATE UNIQUE INDEX "assignments_um_aberto_por_ativo"
  ON "assignments"("assetId") WHERE "checkinAt" IS NULL;
```

Índice único **parcial**, o mesmo padrão já usado em `assets.assetTag`,
`assets.serial` e `users.email`: a regra vive onde o esquecimento não alcança.
Duplo checkout não é "validação que o use-case faz" — é **P2002**, e o
`error-handler` da F0 já o traduz em 409.

**Por quê.** A pluralidade existe, mas ela não é do ativo: é **do posto**. A
Mesa 1 tem duas responsáveis; o mouse tem uma detentora só, que é a Mesa 1. Ao
empurrar a pluralidade um nível acima, cada fato fica registrado uma vez e no
lugar onde muda.

**Descartado: `Asset ⟷ User` muitos-para-muitos.** É a modelagem óbvia para
"duas pessoas respondem pelo mouse", e ela **perde o posto** — que é a unidade
real da operação — e faz a informação crescer multiplicativamente:

| | `Asset ⟷ User` direto | Ativo → Posto → Ocupantes |
|---|---|---|
| 3 ativos na mesa, 2 pessoas | 6 linhas | **2 linhas** (o ativo→mesa já existe em `locationId`) |
| Ana sai da empresa | atualizar 3 linhas | atualizar **1** |
| Chega um headset na mesa | criar 2 linhas | **zero** — herda os dois responsáveis |
| Onde mora o turno "manhã"? | repetido em cada par | **uma vez**, no vínculo pessoa↔posto |
| 20 mesas × 5 ativos × 2 turnos | 200 linhas | 40 |

A coluna da direita não é só menor: ela é a única em que *"chegou um headset na
mesa"* não exige ninguém lembrar de cadastrar responsável. O modelo N:M erra em
silêncio — o headset entra sem dono e ninguém percebe até a auditoria.

**Descartado também: um `Assignment` por pessoa, sem o índice parcial.** Mesmo
efeito do N:M com passo extra, e pior: quebra a pergunta *"qual é a posse atual
deste ativo?"*, que deixa de ter resposta única e passa a ser uma lista que
alguém precisa interpretar.

**A alavanca está declarada.** Se um dia N detentores diretos simultâneos for
necessidade real, a mudança é **derrubar aquele índice** — não reescrever a
camada. Tudo que depende da cardinalidade (o `assertUmaPosseAberta` do checkout,
o cache de `assignedToId`, `resolverResponsaveis`) foi escrito sabendo que o
índice é a fonte da regra. Está anotado na migration
`20260923011728_posse_e_ocupacao` e no comentário do model, nos dois lugares
onde alguém olharia antes de mexer.

**O que quebra se for revertido.** Derrubar o índice sem trocar o resto derruba
quatro coisas de uma vez: o duplo checkout deixa de ser impossível e vira bug
silencioso; `Asset.assignedToId` (cache de UM usuário) passa a mentir por
construção; `resolverResponsaveis` deixa de ter "a assignment aberta" e precisa
decidir o que fazer com N; e o histórico fica ambíguo — o check-in não sabe qual
linha fechar.

---

## D15 — O posto de trabalho é uma `Location`, não uma entidade nova

**Decidido.** "Mesa 1" é uma `Location`, folha da árvore que a F1 já entregou
(`Sede → Andar 2 → Sala 3 → Mesa 1`). Quem ocupa o posto vive em
`LocationOccupant` — uma linha por pessoa, com `shift` e `endedAt`.

**Por quê.** A hierarquia já existe, com `parentId`, guarda de ciclo e gestor. E
o ativo **já aponta** para ela por `locationId`. Criar `Workstation` em paralelo
significaria duplicar a árvore ("a mesa fica em qual sala?" de novo) e dar ao
ativo **dois campos de onde** — `locationId` e `workstationId` — que podem
divergir e que ninguém saberia qual usar num relatório.

Postos não são um tipo diferente de lugar. São o último nível de um lugar.

**Descartado: `Workstation` como entidade própria.** Além da duplicação, ela
obrigaria a escolher para onde o `Assignment` aponta — localização ou posto —
e o alvo polimórfico ganharia uma quarta FK para dizer a mesma coisa.

**Descartado: ocupante como coluna de `Location`.** `Location.occupantId` não
comporta duas pessoas, e `Location.occupants String` (texto com nomes) não é
consultável, não sobrevive a desligamento e não responde *"o que a Laura
ocupa?"*.

**Descartado: `shift` como `enum`.** Um `enum` de `MANHA | TARDE | NOITE` quebra
no primeiro plantão 12x36, no revezamento A/B e no turno que começa 13h. É o
D10 (`type` vira `enum`) aplicado onde ele **não** se aplica: enum serve a
conjunto fechado definido pelo software; escala de trabalho é definida pela
operação do cliente.

**Descartado: `shift` como faixa de horário (`08:00–12:00`).** Isso é agenda, não
inventário. Traria consigo fuso, feriado, sobreposição e a pergunta de o que
fazer quando são 12h01. O ITAM precisa saber *quem responde*, não *quem está
sentado agora*.

`shift` é **rótulo livre** e assumidamente burro: `"Manhã"`, `"12x36 A"`,
`"Plantão fim de semana"`. Serve para diferenciar e para imprimir; não é
computado.

**O que quebra se for revertido.** Trocar `LocationOccupant` por uma entidade
`Workstation` paralela quebra o `locationId` do ativo como fonte de "onde"
(passa a haver duas), quebra a conferência de localização da auditoria física
(F8, que confere um campo só) e obriga a migrar `Assignment.targetLocationId`.
Trocar `shift` por enum quebra a primeira escala real que não couber nele — e aí
o valor vira `OUTRO`, que é texto livre com passos extras.

---

## D16 — Responsabilidade é DERIVADA, nunca coluna

**Decidido.** Não existe, e não vai existir, uma coluna `responsaveis` em
`Asset`. A pergunta *"quem responde por este ativo?"* é respondida por uma
função sobre as Camadas 1 e 2:

```
resolverResponsaveis(ativo):
  assignment ← a assignment ABERTA do ativo (checkinAt IS NULL)

  se não houver          →  []                        (sem detentor: estoque)
  targetType = USER      →  [aquele usuário]
  targetType = LOCATION  →  ocupantes ABERTOS daquele local   ← Laura + Ana
                            (LocationOccupant WHERE endedAt IS NULL)
  targetType = ASSET     →  resolverResponsaveis(ativo-alvo)  ← máximo 1 salto
```

**O salto de `ASSET` é limitado a um nível, e o limite é operacional:** na
segunda resolução só `USER` e `LOCATION` respondem. Se o ativo-alvo estiver ele
mesmo preso a um terceiro ativo, a função **para e devolve `[]`** — e isso é
sinal, não erro de código: dock → notebook → pessoa é a cadeia real; dock →
notebook → monitor → suporte → pessoa é modelagem errada tentando virar árvore.
O limite também é o que torna **ciclo impossível por construção** (A segura B, B
segura A termina em dois passos), sem precisar carregar conjunto de visitados.

**Por quê a coluna não existe.** As Camadas 1 e 2 **já dizem** quem responde.
Uma coluna seria uma quarta fonte de verdade para o mesmo fato, e a divergência
entre elas seria **silenciosa**: ninguém recebe erro quando a Ana sai da Mesa 1 e
a coluna continua com o nome dela em 5 ativos. O sintoma aparece meses depois, na
auditoria, como "o inventário está errado" — sem dizer onde.

Derivar custa uma consulta indexada (`assignments(assetId, checkinAt)` e
`location_occupants(locationId, endedAt)`, ambos criados). Manter coluna custa um
gatilho de atualização em **toda** operação que mexe em posse ou ocupação — e o
custo real não é o gatilho, é o dia em que alguém escrever a sexta operação e
esquecer dele.

**Descartado: coluna desnormalizada "por performance".** É otimização sem
medição contra um `COUNT(*)` que hoje varre dezenas de linhas. Quando houver
número que justifique, o caminho é view materializada ou cache com invalidação
explícita — os dois mantêm a origem como verdade. A coluna, não.

**Descartado: coluna preenchida por trigger do Postgres.** Resolve a divergência
e esconde a regra num lugar que nem o `schema.prisma` nem o `tsc` enxergam. O
projeto já decidiu o contrário na guarda de ciclo da `Location` (D8/F1): regra de
negócio fica em use-case, onde ela é lida; o banco garante **invariante**
(unicidade, FK), não cálculo.

**O que quebra se for revertido.** Acrescentar a coluna quebra a única coisa que
hoje não pode divergir. E quebra em cascata: o relatório de *posto vago* (F2)
passa a ler a coluna e some com o caso que ele existe para achar; o check-in em
massa do desligamento (F4) precisa saber reescrever a coluna de todo ativo do
posto que a pessoa ocupava; e a aba Posse (F2) passa a ter duas respostas
possíveis para a mesma tela.

---

## D17 — `Asset.assignedToId` deixa de ser editável pelo formulário

**Decidido.** A coluna continua. O significado muda: ela passa a ser **cache do
caso `USER`**, e só dele.

| Situação | `assignedToId` | Fonte de verdade |
|---|---|---|
| Entregue para a Laura | id da Laura | `Assignment` (`targetType` USER) |
| Na Mesa 1 (Laura + Ana) | **`null`** | `Assignment` (LOCATION) → ocupantes |
| Preso à dock | **`null`** | `Assignment` (ASSET) |
| No estoque | `null` | não há assignment aberta |

Sai do `createAssetSchema`, do `updateAssetSchema` e do campo "Responsável" do
modal. **Quem escreve são só o checkout e o checkin**, na mesma `$transaction`
que abre ou fecha a `Assignment`.

**Por quê.** Um campo editável à mão *ao lado* de uma tabela de posse são duas
fontes de verdade para o mesmo fato, e nada impede divergirem: eu edito o
"Responsável" no modal, a `Assignment` aberta continua apontando para outra
pessoa, e as duas telas do sistema passam a dar respostas diferentes sem nenhum
erro em lugar nenhum.

**É o mesmo erro que a auditoria da F1 encontrou um nível acima.** Lá, "Em Uso"
estava tipado `DEPLOYABLE` — um rótulo declarado à mão competindo com um fato
que o sistema deveria derivar, e a contradição estava em três arquivos ao mesmo
tempo sem quebrar teste nenhum. A conclusão daquela correção foi textual:

> *"É o que impede o status e a posse divergirem, já que agora as duas coisas são
> graváveis em separado."* — `AUDITORIA-F0-F1.md`, *O que resta*, item 3

Este é o mesmo movimento, uma camada abaixo: **se a operação existe, ela é a dona
do campo.** O que estava certo enquanto não havia checkout (marcar à mão quem
está com o quê) fica errado no instante em que o checkout existe.

**Descartado: manter o campo editável "para carga inicial".** Era o argumento que
sustentava o campo, e ele cai pelo mesmo motivo que caiu na auditoria: a carga
inicial de equipamento que já está com alguém se faz **pelo checkout**, que é a
operação que existe para isso — com data retroativa em `checkoutAt` e nota, o que
o campo do formulário nunca daria. Carga em massa é problema do importador (F10),
que chama o mesmo use-case.

**Descartado: apagar a coluna.** Ela paga por si em leitura: a listagem de ativos
mostra o responsável em toda linha, e sem o cache isso é um join extra por página
ou um `IN (...)` sobre `assignments` em toda listagem. Como cache escrito por um
único caminho, ela não pode divergir — o que a tornava perigosa era a escrita
livre, não a existência.

**O que quebra se for revertido.** Devolver o campo ao formulário reabre
exatamente a divergência descrita acima e, pior, torna o `resolverResponsaveis`
mentiroso para o caso mais comum: o ativo aparece com a Laura na tabela e com a
Ana na aba Posse. Também quebra o histórico — a posse editada à mão não deixa
linha em `Assignment`, então "quem teve este notebook antes?" perde períodos
inteiros sem avisar.

---

## O que este modelo não resolve

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
  usa) não é modelada. `Location.manager` e o `managerId` do colaborador (F11)
  existem para outra coisa — ver a fronteira na F11 do `ITAM-TODO.md`.

---

## Onde cada decisão vive no código

Para quem for verificar, e para quem for mexer.

| Decisão | Onde está aplicada |
|---|---|
| D14 | `prisma/schema.prisma` (model `Assignment`, enum `AssignmentTarget`) · migration `20260923011728_posse_e_ocupacao` (índice `assignments_um_aberto_por_ativo`) |
| D15 | `prisma/schema.prisma` (model `LocationOccupant`, campo `shift`) · mesma migration (índice `location_occupants_um_aberto_por_pessoa_local`) |
| D16 | use-case de resolução no domínio de posse — **nenhuma coluna** em `Asset` · invariante estado × posse em [`INVARIANTES.md`](./INVARIANTES.md) |
| D17 | comentário de `Asset.assignedToId` no schema · `server/domain/asset/schemas/asset.schema.ts` (o campo sai dos dois schemas) · checkout/checkin são os únicos gravadores |
