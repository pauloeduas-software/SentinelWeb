# Decisões da posse e da responsabilidade

> O coração do projeto, e a parte em que o Snipe-IT deixou de ser referência. O contrato está em [`referencia/modelo-de-posse.md`](../referencia/modelo-de-posse.md); aqui está por que ele é assim.
>
> **A regra desta pasta:** decisão escrita aqui **não se reescreve**. Se a realidade mudou, a
> decisão é **superada** por outra, com link entre as duas — é o log que diz por quanto tempo
> cada regra governou. O índice das 164 está em [`README.md`](./README.md).
>
> Decisões neste arquivo: D14–D17, D27–D32, D82, D87–D88, B/K da segunda rodada (ver
> [`README.md`](./README.md#a-segunda-rodada-ap)), V e Y.
> A execução que as aplicou está em [`../historico/`](../historico/).

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
`20260923011728_posse_e_ocupacao` (hoje, no bloco à mão da `0_init`) e no comentário do model, nos dois lugares
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

> **Superada em parte pela localização plana (commit `ff34364`):** a árvore que este argumento
> usa saiu — `Location` não tem mais `parentId`, guarda de ciclo nem gestor; a lista é plana e
> o nome único diz onde a mesa fica (`Mesa 1 — Filial SP`). A decisão fica de pé pelo outro
> motivo que ela dá: o ativo já aponta para `Location`, e uma `Workstation` paralela lhe daria
> dois campos de "onde".
>
> **Superada por [Y](#y--o-posto-sai-de-location-localização-guarda-posto-recebe):** o posto sai
> de `Location` e vira `Workstation`. O motivo que tinha ficado de pé também caiu — o posto não é
> um segundo campo de "onde", é quem RECEBE, como a pessoa. Fica de pé o resto desta decisão: o
> ocupante como tabela (`WorkstationOccupant`), vários por posto, e o `shift` como texto livre.

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
> graváveis em separado."* — `../historico/fase-01-catalogo-e-ativo.md`, *Auditoria das F0 e F1*, o que restou,
> item 3

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

> **Superada pela varredura [Q](./escopo.md#q--a-varredura-do-código-morto-o-que-não-tem-leitor-sai):** a coluna saiu do schema. O
> "Descartado: apagar a coluna" acima perdeu o argumento antes de perder a decisão — a listagem
> passou a derivar a posse em lote (`resolverResponsaveisEmLote`) e deixou de ler o cache, que
> respondia errado no caso do posto; sem leitor, ele era só mais um lugar para divergir. O que o
> D17 defendia — a posse tem um dono, a operação — vale mais forte sem a coluna.

---

## D27 — Num posto com duas pessoas, quem assina o termo é o gestor da localidade.

**Decidido.** Com `targetType = LOCATION` e categoria que exige aceite, sai **um**
termo, para o `Location.managerId` — coluna que existe desde a F1 e nunca foi lida
por nada. Os ocupantes recebem **ciência por e-mail**, não assinatura.

**Descartado: cada ocupante assina o seu.** São N documentos para **um** fato: o
ativo ficaria com aceite "parcialmente pendente" enquanto um dos N não assina — e
ele já está na mesa desde o primeiro dia. Pior no tempo: quem entra em março
reabriria o aceite de um ativo entregue em janeiro, ou trabalharia sob um termo
que nunca viu.

**Descartado: posto não tem termo.** É justamente o equipamento compartilhado que
some — o de todos e de ninguém; dispensar o documento aí é dispensá-lo onde serve.
**Descartado: o primeiro ocupante assina pelos outros** — cria responsabilidade que
a pessoa não escolheu e que o modelo não reconhece: a Camada 3 devolve Laura e Ana
como iguais, sem primeiro nem segundo.

**Por que o gestor.** `Location.managerId` já nomeia o responsável formal daquele
lugar — nasceu com `onDelete: SetNull` porque *"desligar o gestor não pode derrubar
a filial"*, ou seja, a localidade sempre teve dono no schema. E porque o
`../referencia/modelo-de-posse.md` recusa N detentores diretos com a frase *"responsabilidade
compartilhada sem um posto no meio é responsabilidade de ninguém"*: o termo do
posto é a mesma frase no plano documental — um nome no papel.

**O que esta decisão NÃO faz, e é o que impede a contradição:** assinar o termo
**não** torna o gestor responsável resolvido. `resolverResponsaveis()` continua
devolvendo os ocupantes, e só — o `posse.md` declara responsabilidade
hierárquica fora do modelo, e esta decisão é sobre **quem firma o documento**,
camada que não existe na resolução.

**Sem gestor, o checkout é recusado com 409** — *"defina o gestor de «Mesa 1» antes
de entregar equipamento com termo de aceite"*. Não se emite termo para ninguém.
Categoria **sem** `requireAcceptance` entrega normalmente: não há documento.

---

## D28 — Quando o último ocupante sai, a posse continua aberta.

**Decidido.** Encerrar a última `LocationOccupant` aberta de um posto **não** fecha
as `Assignment` daquele posto. Os ativos passam a aparecer no relatório de **posto
vago** (F2, Etapa E) e `resolverResponsaveis()` devolve lista vazia com
`postoVago: true` — que é exatamente o que `posse.types.ts` já declara.

**Descartado: fechar as assignments automaticamente.** Seria o sistema fazendo um
check-in que ninguém fez. O equipamento continua fisicamente na mesa, e a devolução
tem data, estado, nota e — com a F3 — quem recebeu. É o raciocínio que
`assert-status-posse.usecase.ts` já aplica ao recusar mandar ativo entregue para
`DEPLOYABLE`: **bloqueia, nunca limpa sozinho** — limpar sozinho é perda de dado
silenciosa.

**Descartado: recusar a saída do último ocupante enquanto houver ativo no posto.**
A pessoa já saiu; o fato é do mundo, não do banco. Sistema que recusa registrar o
que aconteceu produz dado falso na hora seguinte — alguém encerra por SQL, ou deixa
a Laura "ocupando" há seis meses um posto onde não trabalha.
**Descartado: transferir a responsabilidade ao gestor** — contradiz o
`posse.md` e faria dele responsável por um parque inteiro sem ato nenhum.
Ele assina o termo (D27); não herda a guarda.

**O que a saída do último ocupante faz:** grava `ActivityLog` no local e, com o
alerta da F8, avisa o gestor de que há N ativos em posto vago. É **sinal**, não
erro, e nenhuma invariante é violada: a posse continua aberta, e o que esvaziou
foi a Camada 2.

---

## D29 — O EULA é copiado para o `Acceptance`, não referenciado.

**Decidido:** `eulaSnapshot` guarda o texto no instante da emissão.
**Descartado:** FK para `Category` e ler `eulaText` na hora de exibir.
**Por quê:** editar o EULA da categoria mudaria, retroativamente, o que centenas de
pessoas assinaram — sem log em `assets` e sem ninguém perceber. Um termo que muda
depois de assinado não é termo.

---

## D30 — O PDF é gerado no aceite e guardado. Nunca regenerado.

**Decidido:** o arquivo nasce no `accept-term.usecase.ts`; o caminho vai em `pdfPath`.
**Descartado:** gerar sob demanda em `GET /api/acceptances/:id/pdf`.
**Por quê:** regenerar monta o documento com os dados de **hoje** — o ativo pode ter
mudado de nome, de local e de dono. O PDF existe para provar o que foi assinado, e
prova que se recalcula não prova nada. É o D29 no arquivo.

---

## D31 — Entrega em massa é por linha, com relatório. (O oposto da F2.)

**Decidido:** `bulk-checkout` processa cada ativo na sua transação e devolve o que
entrou e o que foi recusado, com o motivo. **Descartado:** tudo ou nada, como a
ação em massa da F2 (D21).
**Por quê:** não é inconsistência, é a natureza da operação. Edição em massa é
**uma** intenção aplicada a N linhas — metade aplicada é estado que ninguém pediu.
Checkout em massa são **N entregas independentes**: um kit de 8 itens em que 1
está com outra pessoa ainda entrega 7, e refazer os 7 à mão é pior que ler um
relatório de uma linha.

---

## D32 — Desligamento é uma operação com nome próprio, e fecha as duas camadas.

**Decidido:** `POST /api/users/:id/offboard` fecha posses `USER` abertas **e**
ocupações abertas, na mesma transação, com uma nota comum. **Descartado:**
`checkin-all` só sobre `Assignment`, como o TODO descrevia.
**Por quê:** devolver os ativos diretos e deixar a pessoa ocupando a Mesa 1 mantém
um desligado como responsável resolvido por todo equipamento daquele posto — o
`resolverResponsaveis()` continua devolvendo o nome dele, e o 409 de exclusão
dispara sem que ninguém entenda por quê. Por isso o 409 do `DELETE` conta **as
duas** coisas, não só as posses.

---

## D82 — `terminate` não existe. A F11 **estende** o `offboard`.

**O conflito.** O `offboard` da F4 (D32) e o `terminate` da F11 (Etapa D) são a
mesma operação, escrita duas vezes: as duas fecham posses e ocupações.

**O que aconteceria.** Duas rotas fazendo a mesma coisa divergem, e a que divergir
vai esquecer **o mesmo passo**: encerrar as ocupações de posto. É o passo que não
dá erro quando falta — a responsabilidade do posto é **derivada**
([`../referencia/modelo-de-posse.md`](../referencia/modelo-de-posse.md), Camada 3), então um desligado continua
aparecendo como responsável por tudo que está na Mesa 1, meses depois, e nenhuma
consulta acusa. É o bug mais perigoso do modelo, e duas rotas é a forma mais fácil
de criá-lo.

**Decidido:** **uma** rota e **um** use-case — `POST /api/users/:id/offboard`,
`server/domain/user/use-cases/offboard-user.usecase.ts` — que **cresce** a cada
fase em vez de ganhar um irmão.

| Fase | O que o `offboard` passa a fazer |
|---|---|
| **F4** *(feito)* | devolve as posses diretas, encerra as ocupações de posto, marca `terminatedAt` + `isActive = false`, registra tudo no `ActivityLog` |
| **F11** | acrescenta a **guarda do substituto** para quem é gestor, e a **revogação de sessões e `ApiToken`s** (D80) |

A Etapa D da F11 deixa de ser *"criar o desligamento"* e passa a ser
**"estender o desligamento"**.

> **Nota de estado.** O `offboard` da F4 **já grava** `terminatedAt` e
> `isActive` — a F11 não precisa acrescentá-los, só o que está na linha dela
> acima. O plano da F11 descreve o passo 4 como se a coluna ainda não existisse.

**Afeta:** [`../historico/fase-11-acesso-avancado.md`](../historico/fase-11-acesso-avancado.md) (Etapa D e o passo 4 do
D74). A F4 não muda.

---

## D87 — Entrega com alvo `ASSET` não emite termo.

**Decidido:** `targetType = ASSET` nunca gera `Acceptance`, mesmo que a categoria exija aceite.
**Descartado:** emitir o termo para o responsável resolvido do ativo detentor.
**Por quê:** o D27 decidiu quem assina quando o alvo é um posto e deixou o alvo `ASSET` de fora
— porque nele **não há pessoa nenhuma**. A dock foi entregue ao notebook; quem responde pelo
notebook pode mudar amanhã por um checkout que não menciona a dock, e o termo ficaria assinado
por alguém que não tem mais relação com o equipamento.

O documento segue o notebook: quem assinou o termo dele assinou por um conjunto, e é essa a
leitura que a aba Posse já mostra com o salto de um nível do D16. Emitir um segundo termo para o
mesmo objeto físico é pedir duas assinaturas para um fato.

---

## D88 — Aceite pendente não bloqueia a entrega.

**Decidido:** o checkout conclui, a `Assignment` abre, o status vai para `IN_USE` e o
`Acceptance` nasce pendente ao lado. Pendência é **linha de relatório**, não estado da posse.
**Descartado:** a entrega ficar em estado intermediário até a assinatura.
**Por quê:** é o **D28 aplicado ao documento**. O equipamento já está na mão da pessoa — o fato
é do mundo, não do banco. Um sistema que recusa registrar o que aconteceu produz dado falso na
hora seguinte: quem precisa entregar o notebook hoje entregaria e cadastraria depois, ou
cadastraria como se não exigisse termo.

**E é o que torna o D27 coerente no tempo:** com alvo `LOCATION`, o termo espera o gestor, que
pode estar de férias. Travar a entrega até ele assinar é travar a Mesa 1 por uma assinatura —
exatamente o que o D27 recusou ao descartar *"cada ocupante assina o seu"*.

**O que a pendência faz:** aparece em `GET /api/acceptances?view=pendentes`, é reenviável, e
expira. `resolverResponsaveis()` **não** muda — quem está com o equipamento responde por ele,
assinado ou não.

---

## K — O alvo `ASSET` sai da posse

**Decidido:** `AssignmentTarget` fica com `USER` e `LOCATION`. `targetAssetId`, a relação, o
índice e o CHECK de "não entregue a si mesmo" saem do schema; o CHECK da coerência do alvo
(invariante 5) é refeito para as duas FKs que restam.
**Supera:** [D14](#d14--o-detentor-é-singular-o-alvo-é-que-é-polimórfico), no que descreve o
`ASSET` como terceiro alvo possível, e [D87](#d87--entrega-com-alvo-asset-não-emite-termo), que
fica sem objeto — não existe mais entrega de alvo `ASSET` para não emitir termo sobre.

**Por quê:** o alvo `ASSET` existia para o componente entregue a outro ativo — um pente de RAM
"pertencendo" a um notebook. Com [I](./catalogo-e-ativo.md#i--ativo-é-computador) (ativo é
computador) esse caso deixa de existir: o pente não é `Asset`, é estoque, e o que o acompanha é
`StockMovement`, não `Assignment`. Um computador não é entregue a outro computador — a posse
entre dois ativos nunca teve um caso de uso real fora do componente, e o componente saiu com o
D153/[J](./estoque.md#j--o-estoque-volta-como-stockitem--stockmovement).

**O que isso simplifica:** a Camada 3 perde um salto — `resolverResponsaveis()` passa de seis
consultas em lote para quatro, porque não precisa mais seguir `targetAssetId` até achar um alvo
que não seja outro ativo. `via` passa a ser só `DIRETO` ou `POSTO`, nunca um terceiro valor. A aba
Ativo sai do modal de entrega; os selects, rótulos e tipos do contrato que já falavam só de
pessoa e posto não mudam.

**O que a migração faz:** apaga as posses de alvo `ASSET` antes de encolher o enum — zero linhas
nos bancos deste projeto, então não há dado real em jogo, mas a ordem (apagar antes de encolher)
é a mesma do D153 e de toda redução de enum do projeto: o Postgres não aceita um valor em uso
desaparecer da definição.

---

## B — Invariante 19, na forma final: **um ativo por posto de trabalho**

**Decidido:** um posto de trabalho (`Location.isWorkstation`) tem no máximo **um** `Asset` com
posse aberta apontando para ele. A regra é sobre o ativo, não sobre "ativo com máquina vinculada".
Descrição completa, com as três portas e o que cada uma impede, em
[`../referencia/invariantes.md`](../referencia/invariantes.md#19--no-máximo-um-ativo-por-posto-de-trabalho).

**A forma intermediária, pela qual ela passou primeiro:** nasceu como "no máximo **um
computador** por posto", com computador definido como *ativo com máquina (`Endpoint`) vinculada*
— não categoria, porque categoria é texto livre e um 409 não pode depender de alguém ter digitado
"Desktop" igual. Essa forma tinha **quatro** portas: a entrega (`checkout-asset`), o vínculo de
máquina (vincular um `Endpoint` a um ativo já num posto com computador), a marca
`isWorkstation` (ligar a marca num local que já tem mais de um computador) e a restauração da
lixeira.

**Por quê a forma intermediária não se sustentou:** com [I](./catalogo-e-ativo.md#i--ativo-é-computador)
(ativo é computador — nada que não é máquina entra em `/ativos`), a pergunta "este ativo é um
computador?" ficou sempre verdadeira, e a porta do vínculo e o filtro da cascata de reconciliação
(que recusava propor vínculo para ativo já num posto com computador) pararam de proteger
qualquer coisa: vincular ou não a máquina deixou de mudar o que o ativo **é**, só o que a ficha
dele consegue mostrar (telemetria ou "sem agente"). Um desktop cujo agente ainda não chegou já era
o computador da mesa antes de a forma intermediária admitir isso.

**Supera:** nada do D1–D164 — a invariante 19 nasceu depois do corte do ITAM e nunca teve
decisão própria nesta pasta, só a entrada em `invariantes.md`. Esta decisão registra onde ela
chegou, incluindo o PATCH de correção de turno do ocupante
(`PATCH /api/locations/:id/occupants/:occupantId`), que entrou na mesma leva por tocar o mesmo
caminho de posse de posto.

**O que ficou em TRÊS portas, e por quê a quarta não é redundante com nenhuma das outras:**
entrega, marca e restauração da lixeira — ver a tabela completa em `invariantes.md`. A do vínculo
saiu porque, na forma final, vincular máquina não decide a vaga; a vaga é decidida na entrega.

> **A varredura [Q](./escopo.md#q--a-varredura-do-código-morto-o-que-não-tem-leitor-sai) deu tela
> ao PATCH de correção de turno**, que até ali nenhuma tela chamava: um lápis **Corrigir turno**
> em cada ocupação aberta do painel de ocupantes (ficha do posto e Configurações › Localizações).
> A alternativa — encerrar a ocupação e abri-la de novo — fabricaria no histórico uma saída que
> não aconteceu e perderia a data de entrada.

> **Superada em parte por [Y](#y--o-posto-sai-de-location-localização-guarda-posto-recebe):** a
> marca `isWorkstation` saiu com o posto virando cadastro próprio, e com ela a porta da marca —
> sobram duas portas, a entrega e a restauração. A rota do turno passou a
> `PATCH /api/workstations/:id/occupants/:occupantId`, e o painel de ocupantes só existe na ficha
> do posto.

---

## V — Excluir não apaga o passado: localização por referência, colaborador pela lixeira

**Decidido:** a exclusão de localização e de colaborador passa a ser recusada só pelo que está com
eles **agora** — e o histórico de posse dos itens continua mostrando o nome dos dois depois.

- **Localização funciona como status e categoria:** cadastro de referência. O 409 conta só o
  presente — ativo ou item de estoque guardado nela (lixeira inclusive), entrega e saída de estoque
  abertas, ocupante atual. Sem nada disso, ela é **apagada de verdade**, sem lixeira. Antes do
  `DELETE`, as linhas já fechadas que apontam para ela — entrega devolvida, saída devolvida,
  ocupação encerrada — perdem a ligação e guardam o nome por escrito (`targetLocationName` em
  `assignments` e `stock_movements`, `locationName` em `location_occupants`). Os CHECKs da forma
  da posse aceitam a linha sem FK só quando ela está fechada e com o nome preenchido. As FKs
  continuam `Restrict`, como rede.
- **Colaborador vai para a lixeira:** a única tabela do catálogo com `deletedAt`, aba Lixeira e
  Restaurar. O 409 conta só a posse aberta, com a frase da invariante 6 (*"…antes de excluir"*); o
  que já foi devolvido não segura, porque a linha da pessoa fica e o histórico continua apontando
  para ela. O e-mail fica livre enquanto ela está na lixeira (índice parcial), e restaurar recusa
  se ele foi reaproveitado. Não há "apagar de vez".
- **Desativar continua** nas duas, com a mesma regra da exclusão no colaborador.

**Supera:** em parte, o [D8](./catalogo-e-ativo.md#d8--catálogo-sem-soft-delete-o-delete-é-real-bloqueado-por-uso)
— uma tabela do catálogo ganha lixeira — e, no
[U](./acesso.md#u--quem-recebe-equipamento-sai-de-user-colaborador-vira-catálogo-e-sobram-dois-cargos),
o colaborador que "exclui de verdade, e só sem histórico".
**Mantém:** o 409 por uso do D8 para as outras cinco tabelas, e a invariante 6 inteira.

**Por quê:** o pedido do usuário — poder excluir localização e colaborador sem perder o histórico
dos itens, recusando só quem está com algo agora. O que segurava os dois era o passado: o
histórico de posse guardava só o id e buscava o nome no cadastro, então as FKs `Restrict`
recusavam apagar qualquer um que já tivesse aparecido numa linha, mesmo devolvida.

**Por quê dois caminhos, e não um:** a pergunta é *de quem é o histórico*. O do colaborador é
**dele** — a ficha existe para responder "o que já esteve com a Laura" —, e recadastrá-lo depois de
excluir partiria esse histórico em dois, com os equipamentos antigos presos a um cadastro que
ninguém abre. Excluir por engano e recontratar acontecem, e a lixeira com Restaurar devolve a
mesma pessoa. A localização é referência: quando ela sai, o lugar acabou, ninguém quer a "Mesa 7"
de volta, e recriar uma "Mesa 7" não estraga nada — o histórico de cada item continua dizendo onde
ele esteve. Foi a correção do usuário a uma primeira proposta que tratava os dois igual.

**Por quê o nome é gravado na exclusão, e não em cada entrega:** o resultado na tela é o mesmo
— enquanto o local existe, o histórico mostra o nome atual dele, como sempre mostrou; quando ele
sai, mostra o último nome que teve —, e não toca nenhum caminho de escrita da posse nem pede
preencher os registros antigos.

**Como os outros fazem:** o Snipe-IT esconde o excluído (soft delete) e tem lista de excluídos com
Restaurar para usuários e ativos; o GLPI tem lixeira e "apagar de vez", e só consegue apagar de
vez porque o histórico dele guarda o nome por escrito. Aqui o colaborador segue o primeiro e a
localização, o segundo — sem lixeira, porque ninguém precisa dela de volta.

> **Superada em parte por [Y](#y--o-posto-sai-de-location-localização-guarda-posto-recebe):** o
> que recebia — entrega, saída de estoque, ocupante — era o posto, e o posto saiu de `Location`.
> A metade da localização desta decisão passa a ele: o 409 pelo presente e o nome por escrito
> (`targetWorkstationName`, `workstationName`) são do posto agora. A localização ficou só com o
> que guarda, sem passado preso a ela — a regra do status, sem `beforeDelete`.

---

## Y — O posto sai de `Location`: localização guarda, posto recebe

**Decidido:** o posto de trabalho vira cadastro próprio — `Workstation`, com nome, a localização
onde ele fica (`locationId`, obrigatória), notas e `isActive` — e a `Location` volta a ser só lugar.

- **Localização diz onde a coisa está guardada:** o ativo (`Asset.locationId`), o item de estoque
  (`StockItem.locationId`) e, agora, o posto. Ela não recebe entrega, saída de estoque nem
  ocupante. A regra é a do status: o 409 conta só o que aponta para ela agora — ativo e item
  guardados (lixeira inclusive) e postos que ficam nela —, e sem isso ela é apagada de verdade,
  sem `beforeDelete` e sem nome por escrito, porque nenhum histórico aponta para ela.
  `Asset.location` passa de `SetNull` a `Restrict`, a mesma rede do status e do item.
- **Posto é quem recebe:** o alvo da entrega (`AssignmentTarget` = `PERSON | WORKSTATION`), da saída
  de estoque (`StockTarget` = `PERSON | WORKSTATION`) e da ocupação (`WorkstationOccupant`, que era
  `LocationOccupant`). O cadastro tem a regra do status e passa pelo MESMO CRUD do catálogo
  (`workstationSpec`, fora de `CATALOG_SPECS`): nome único, desativar, 409 só pelo que está nele
  agora — entrega e saída abertas, ocupante atual — e exclusão de verdade, com o passado desligado e
  o nome por escrito (`targetWorkstationName`, `workstationName`), exatamente como V fazia com o
  local. Ele se cria, edita, desativa e exclui na tela **Postos**; Configurações não tem aba de posto.
- **A invariante 19 vale para todo posto**, com duas portas — a entrega e a restauração da lixeira.
  A porta da marca sai com a marca: não há mais como fazer "virar posto" um lugar que já tem dois
  ativos.
- **A entrega a um lugar que não é posto deixa de existir.** A sala de reunião com dois
  computadores é dois ativos **guardados** nela, com status "Em uso" — o uso sem responsável que o
  `StatusLabelType` já previa.

**Supera:** [D15](#d15--o-posto-de-trabalho-é-uma-location-não-uma-entidade-nova), no que ela
decide — o posto é uma `Location`; fica de pé o resto dela: o ocupante como tabela, vários por
posto, e o `shift` como texto livre. [B](#b--invariante-19-na-forma-final-um-ativo-por-posto-de-trabalho),
na porta da marca. [V](#v--excluir-não-apaga-o-passado-localização-por-referência-colaborador-pela-lixeira),
na metade da localização: a regra do presente e do nome por escrito passa ao posto, e a localização
fica sem passado para guardar.
**Mantém:** [C](./catalogo-e-ativo.md#c--o-ativo-entregue-a-um-posto-sai-de-ativos-a-ficha-do-posto-é-rota)
— o ativo entregue a um posto sai de `/ativos`; o recorte "só onde `isWorkstation` é true" fica
sem objeto, porque só posto recebe —, a invariante 19 inteira, a Camada 3 (`resolverResponsaveis`,
`postoVago`) e a lixeira só no colaborador.

**Por quê:** o pedido do usuário, ao rever a tela de Localizações: categoria, status e fabricante
funcionam do mesmo jeito, e a localização não — o 409 dela somava cinco contagens, um
`beforeDelete` gravava nome, havia a trava da marca e a ação de ocupantes. A diferença não era de
regra (V já a pusera na regra do status), era de **papel**: a mesma tabela dizia onde a coisa
está guardada e recebia coisas como um colaborador. O segundo papel era o do posto, e o servidor
o aceitava em qualquer lugar — entrega e ocupante iam até para o "Depósito de TI", e só a tela
escondia.

**Por quê o argumento do D15 não segura mais:** ele dizia que uma `Workstation` paralela daria
ao ativo dois campos de "onde". Não dá: o posto não é "onde", é **quem recebe** — como a pessoa.
O ativo continua com um campo de onde (`locationId`), e a entrega aponta para quem o recebeu,
pessoa ou posto. A árvore que o D15 também usava já tinha saído com a localização plana.

**O nome do posto continua único no sistema**, e não por localização: os seletores da entrega,
da saída de estoque e do vínculo de máquina mostram só o nome, e duas "Mesa 1" lado a lado seriam
a mesma escolha duas vezes.

**O que a migração faz:** zero postos e zero posses para local nos bancos deste projeto, então é
só DDL — a tabela `workstations`; o valor `LOCATION` renomeado para `WORKSTATION` nos dois enums;
as colunas e FKs de alvo de `assignments` e `stock_movements` passando para o posto;
`location_occupants` virando `workstation_occupants`; e `locations.isWorkstation` saindo. Os CHECKs
da forma da posse (invariante 5) e o índice parcial da ocupação (invariante 2) são reescritos antes
de as colunas mudarem: `DROP COLUMN` derruba em silêncio o CHECK inteiro que a cita.

---

## Onde o modelo vive no código — D14 a D17

Para quem for verificar, e para quem for mexer. A tabela cobre as quatro decisões do **modelo**;
as da operação (D27–D32, D87, D88) estavam nos use-cases de `assignment/`, `acceptance/` e
`user/` — o `acceptance/` saiu com o termo (D150), o desligamento com o segundo de-escopo (O), e o
que sobrou delas está em `assignment/`, `occupancy/` e `user/`, com as provas em
`tests/invariantes/posse.test.ts` e `tests/corridas/posse.test.ts`.

| Decisão | Onde está aplicada |
|---|---|
| D14 | `prisma/schema.prisma` (model `Assignment`, enum `AssignmentTarget`) · migration `0_init` (índice `assignments_um_aberto_por_ativo`) |
| D15 (o que ficou de pé, ver Y) | `prisma/schema.prisma` (model `WorkstationOccupant`, campo `shift`) · mesma migration (índice `workstation_occupants_um_aberto_por_pessoa_posto`) |
| D16 | use-case de resolução no domínio de posse — **nenhuma coluna** em `Asset` · invariante estado × posse em [`../referencia/invariantes.md`](../referencia/invariantes.md) |
| D17 | superada por [Q](./escopo.md#q--a-varredura-do-código-morto-o-que-não-tem-leitor-sai): `Asset.assignedToId` não existe mais, e checkout/checkin escrevem só a `Assignment` |
