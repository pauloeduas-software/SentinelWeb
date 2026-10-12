# Testes

> Como rodar, o que a suíte prova e como acrescentar um arquivo.
>
> A suíte nasceu contra um risco nomeado: **não havia teste nenhum**, e a
> auditoria da F0/F1 mostrou o custo disso. O defeito 1 — a etiqueta automática
> inalcançável pela tela — passou por ter sido verificado pelo caminho da API e
> não pelo do formulário. As duas suítes de `curl` daquela auditoria (120 e
> depois 34 asserções) foram descartadas porque testavam um **processo**, não a
> aplicação.

```bash
npm test               # roda tudo, uma vez
npm run test:watch
npx vitest run tests/corridas           # só uma pasta
npx vitest run -t "etiqueta automática"  # só o que casa com o nome
```

### Uma configuração só, porque todo teste fala com o banco

Houve dois projetos: arquivo terminado em **`.puro.test.ts`** exercitava função
pura e rodava sem `globalSetup`, o que permitia um `npm run test:puro` numa
máquina sem contêiner. O corte de escopo levou o último arquivo puro, e um
projeto com zero arquivos não é separação — é um script que sai com erro sem
nenhum teste ter falhado. O par (projeto + sufixo no nome do arquivo) volta junto
com o próximo teste puro.

---

## O banco de teste, e a trava

A suíte roda contra Postgres **de verdade** — o mesmo container do
`docker-compose.yml`, em outro banco: `sentineldb_test`.

Não há mock de Prisma, e é deliberado. Metade do que esta suíte precisa provar é
comportamento **do banco**: os índices únicos parciais, os `CHECK`, o
`FOR UPDATE`, o `TRUNCATE ... CASCADE`. Contra um mock, todos passariam sem
existir.

**Antes de cada arquivo o banco é esvaziado e semeado de novo.** Não existe teste
que "arruma depois": um teste que limpa o que criou só limpa quando **passa**, e o
que falha no meio deixa sujeira que quebra o arquivo seguinte com uma mensagem
sobre outra coisa.

> ### A trava
>
> Como o harness **apaga todas as tabelas** do banco apontado, ele lê o nome do
> banco e **se recusa a rodar** se ele não terminar em `_test`:
>
> ```
> RECUSADO: o harness apaga TODAS as tabelas do banco apontado, e
> "sentineldb" não termina em "_test".
> ```
>
> A verificação roda duas vezes — no `globalSetup` e no setup de cada arquivo —
> porque são **processos diferentes**, cada um com o seu `process.env`.

O `.env.test` é **versionado**: não há segredo nele, o banco é descartável e o
administrador é o mesmo do seed. Quem clonar o repositório roda `npm test` sem
configurar nada (só precisa do Postgres de pé: `docker compose up -d`).

---

## O que cada pasta prova

| Pasta | O que está lá | Por que existe |
|---|---|---|
| `tests/harness.test.ts` | banco descartável, seed aplicado, app sem porta, porta fechada | se este arquivo falha, **nenhum outro resultado significa nada** |
| `tests/formularios/` | o corpo **literal** que cada modal monta | é o teste que teria pego o defeito 1 |
| `tests/invariantes/` | as do [`invariantes.md`](invariantes.md) | vermelho aqui = o dado já pode estar errado no banco |
| `tests/corridas/` | duas requisições simultâneas, e o placar | o que "passa no teste com um usuário" |
| `tests/listagens/` | o que cada vista e cada leitura DEVOLVE, e o que ela esconde | filtro que esconde demais não dá erro: some linha e ninguém percebe |
| `tests/estoque/` | o saldo derivado, a trava da linha do item e as operações do `StockItem`/`StockMovement` | é a única pasta POR DOMÍNIO que sobrou, e é de propósito: invariante, corrida e operação contam a mesma história sobre as mesmas duas tabelas, e separá-las faria quem investiga um saldo errado abrir três arquivos distantes |
| `tests/descoberta/` | a borda do agente, a cascata de matching por hardware, a fila, o vínculo manual e o comando — sem inferência por usuário logado ([A](../decisoes/reconciliacao.md#a--a-reconciliação-deixa-de-inferir-pessoa-pela-conta-do-sistema-operacional)) nem fusão de máquinas ([H](../decisoes/reconciliacao.md#h--a-fusão-de-máquinas-sai)) | a segunda pasta por domínio, pelo mesmo motivo: a história é uma só, do handshake até o cadastro que uma pessoa aceita ou vincula à mão |
| `tests/licencas/` | o assento materializado e a corrida do `SKIP LOCKED` — sem chave cifrada nem canário, que saíram com a conformidade de software ([G](../decisoes/licencas.md#g--software-instalado-e-conformidade-de-licença-saem-licença-vira-cadastro-simples)) | terceira pasta por domínio: contrato e assento contam a mesma história |
| `tests/jobs/` | a janela de execução de um job (o D79) | o cenário que ela impede — dois jobs disputando a mesma coluna — não dá erro nenhum: o segundo simplesmente nunca roda |
| `tests/configuracoes/` | o recorte de `GET/PUT /api/settings` e o que ele NÃO leva ao navegador | o `AppSetting` encolheu junto com cada corte de escopo; este arquivo prova que o que saiu do schema também saiu do contrato |

### `estoque/` — a que falharia em silêncio

**`invariantes.test.ts` › o CHECK do banco recusa a linha incoerente mesmo por fora da API.**
`stock_movements_forma` (SAIDA com exatamente um alvo e uma unidade), `stock_items_qty_nao_negativa`
e a devolução que não antecede a saída existem para quem não passa pelo use-case — o `psql` à mão,
um script. Testar isso por HTTP seria impossível por construção; o teste insere direto no banco e
lê a mensagem do Postgres.

**`invariantes.test.ts` › recusa a BAIXA abaixo do que está fora.** Dar baixa de mais unidades do
que há fora do estoque gravaria `qty` menor que o número de unidades que ainda estão com gente — o
saldo (`qty − fora`) ficaria negativo por um caminho que não é o psql à mão, e a frase do 409 carrega
os números (`qty`, `fora`, `baixa`) para a tela não precisar recontar.

**`corridas.test.ts` › 1 de 1 e 3 de 5.** Duas saídas simultâneas de um item com uma unidade só:
sem a trava da linha do item (`travarItemOuFalhar`), as duas contam "0 de 1 fora" e as duas inserem.
Prova também a BAIXA concorrente com a SAÍDA no mesmo item, pela mesma trava.

Em todos os casos a asserção central é sobre o BANCO — a contagem de `StockMovement` abertas —, não
sobre a resposta HTTP: é o estado final que precisa estar certo, e é exatamente o que uma resposta
`201` plausível esconderia se a trava não existisse.

### `listagens/` — o que a vista devolve, e o que ela esconde

A regra do diretório: toda asserção diz as **duas** metades — o que apareceu e o
que **não** apareceu. Um filtro errado para mais não quebra nada: ele some com a
linha, a tela fica plausível, e a falta só é notada quando alguém procura um
equipamento que o sistema jurava não ter.

É também onde mora a armadilha do filtro que o próprio sistema oferece:
`vistas-do-ativo.test.ts` prova que clicar no contador de um status arquivado
devolve os ativos dele, em vez da lista vazia que a exclusão da vista padrão
produziria sozinha.

### `licencas/` — a corrida que o `SKIP LOCKED` ganha

Cinco arquivos (sem `chave.test.ts` nem `canario.test.ts`, que saíram com a cifra —
[G](../decisoes/licencas.md#g--software-instalado-e-conformidade-de-licença-saem-licença-vira-cadastro-simples)),
e cada um prova uma coisa que passaria despercebida:

- **`corridas.test.ts`** — oito entregas numa licença de cinco assentos, sem
  `await` entre elas. Passam cinco `201` e três `409`, **em assentos distintos**.
  A asserção dos assentos distintos é o que separa `SKIP LOCKED` de fila: com
  `FOR UPDATE` puro o placar seria o mesmo e todo mundo teria esperado. O
  terceiro caso cobre a corrida que o D41 não cita — devolver e entregar em
  seguida, que só funciona porque o checkin trava a linha do assento.
- **`reconciliacao.test.ts`** — a invariante 11 (`COUNT(sem retiredAt) =
  seatsTotal`) através de 5→8→6→8, provando que a numeração usa `MAX+1` e não
  colide com os aposentados; e a aritmética do D92, que a fórmula do plano
  prospectivo erraria.
- **`operacoes.test.ts`** — a queima na devolução e o status derivado nas quatro
  bordas do calendário, onde um `<=` trocado por `<` só apareceria no dia exato.
- **`historico.test.ts`** — a trilha da licença.
- **`posse.test.ts`** — o 409 do `DELETE` de pessoa e de ativo cita o assento que ainda está
  ocupado, com o número; e desativar a pessoa pela edição recusa o checkout de assento com 409 —
  a mesma régua das outras três pontas da invariante 6.


### `descoberta/` — a única pasta que fala WebSocket

Nove arquivos. A fila de sugestões não infere mais pessoa pela conta do sistema operacional
([A](../decisoes/reconciliacao.md#a--a-reconciliação-deixa-de-inferir-pessoa-pela-conta-do-sistema-operacional)) —
o que resta é o vínculo entre máquina e ativo, por evidência de hardware:

- **`cascata.test.ts` › serial ambíguo ou de fábrica vale ZERO.** "To Be Filled By O.E.M." e
  qualquer serial repetido em duas máquinas do parque não geram vínculo nenhum — evidência
  ambígua é evidência zero (D46). É a asserção que, se cair, faz a cascata casar duas máquinas
  reais com o mesmo ativo.
- **`vincular-e-entregar.test.ts` › o vínculo manual não é atômico com a entrega, por decisão**
  ([E](../decisoes/reconciliacao.md#e--descobertas-ganha-vínculo-manual-e-reconciliar-agora)).
  Quando a entrega falha (o posto já tem um ativo — invariante 19), o vínculo FICA; a resposta
  diz isso. E desvincular a máquina depois **não libera a vaga** — o ativo continua sendo o da
  mesa, porque a invariante 19 é sobre o ativo, não sobre a máquina vinculada ([B](../decisoes/posse.md#b--invariante-19-na-forma-final-um-ativo-por-posto-de-trabalho)).
- **`varredura-manual.test.ts` › "Reconciliar agora" é serializado.** Duas chamadas ao mesmo
  tempo: uma varre, a outra é 409 — o mesmo guarda que o job de hora em hora usa.
- **`hardware.test.ts` › primeira coleta NÃO é troca de peça.** O rollout do agente faz 500
  máquinas ganharem `biosSerial` no mesmo dia. Sem esta asserção, cada uma entra com nove linhas
  de "mudança de hardware" e o histórico de todo ativo do parque vira um relatório de deploy
  (D116).
- **`maquina-e-comando.test.ts` › "máquina não existe" e "agente desconectado" são 404 e 409
  distintos**, e o comando só responde sucesso com o envio confirmado pelo socket — não por
  achar a conexão no mapa ([D](../decisoes/reconciliacao.md#d--a-telemetria-e-o-comando-vão-para-a-ficha-do-ativo-e-a-do-posto)).
- **`fila.test.ts` e `ciclo-de-vida-da-fila.test.ts`** provam que a mesma sugestão não empilha
  (invariante 13) e que aceitar uma sugestão já realizada não inventa devolução no histórico —
  o aceite de reatribuição é checkin + checkout, e aceitar "entregar à Ana" um ativo já entregue
  à Ana gravaria uma devolução que nunca aconteceu.
- **`uso-agregado.test.ts`** roda a mesma agregação com duas janelas, porque a pergunta é se
  "idempotente" quer dizer que a segunda passada escreve o **mesmo** valor (D111).

E o `handshake.test.ts` guarda a regressão mais silenciosa que a borda do agente podia
introduzir: `ramTotalBytes` tem que sair como **string** em `/api/endpoints`. Com
`BigInt` cru, o `JSON.stringify` do Fastify morre com *"Do not know how to
serialize a BigInt"* — na rota que a ficha do ativo e a do posto consultam.

**Aqui o `inject` não serve, e é a única exceção da suíte** (D99). O `/agent-hub` é
WebSocket, e `inject` não faz upgrade: `tests/helpers/agente.ts` sobe a aplicação
numa porta efêmera (`port: 0`) e fala com ela por um cliente `ws` de verdade. A
alternativa — chamar `handleAgentMessage()` direto — pularia o parser, a tabela de
sinônimos PascalCase/camelCase e o `readOptionalBigInt`, ou seja, pularia
exatamente onde o agente velho e o novo se distinguem. É o mesmo princípio que faz
os fixtures criarem cenário pela API.

### `formularios/` — o corpo literal

A regra do diretório: **copiar o objeto que a tela monta**, campo por campo, e
mandá-lo inteiro. Nunca escrever um corpo "para a ocasião".

Um formulário React inicializa todo campo de texto com `''` e **manda a chave**,
vazia. `.optional()` do zod aceita a chave **ausente**, não a chave vazia. Os dois
corpos são diferentes e só um existe na vida real — foi essa distinção que custou
o defeito 1, e ela volta a cada campo novo.

### `corridas/` — o placar, nunca "deu certo"

A asserção de um teste de corrida nunca é *"a requisição funcionou"*: é
**"exatamente UMA passou, e o banco tem exatamente UMA linha"**.

`Promise.all` sobre `app.inject()` dispara de verdade em paralelo — cada `inject`
entra no event loop como requisição independente e o Prisma tira uma conexão do
pool para cada. Quem serializa é o Postgres, que é o que se quer provar.

> Foi aqui que a invariante 6 nasceu: o teste de "desligar e entregar ao mesmo
> tempo" ficou vermelho com `{ posses: 1 }` na primeira execução, contra código
> que parecia certo e cujos comentários afirmavam ser seguro.

---

## As três peças do harness

**1. `server/app.ts` — montar ≠ subir.** `buildApp()` devolve a aplicação
configurada sem abrir porta, sem ligar job e sem instalar handler de sinal. O
`server.ts` ficou com o processo. É o que permite `app.inject()`: requisição em
memória pelo **mesmo** grafo de produção — mesmos plugins, mesma ordem, mesmo
`preHandler` global, mesmo error-handler.

**2. `tests/setup/` — o banco.** `global-setup.ts` cria o banco e aplica as
migrations **uma vez** por execução (`migrate deploy`, nunca `db push`: o SQL
escrito à mão — índices parciais e CHECKs — não existiria no banco de teste, e a
suíte provaria coisas sobre um schema que produção não tem). `each-file.ts`
trunca e semeia **por arquivo**.

**3. `tests/helpers/` — o cliente.** `criarApi()` monta a aplicação e entra como
o administrador do seed; `api.anonimo` é o mesmo app sem cookie, para testar a
porta fechada. Os fixtures criam cenário **pela API**, nunca por `prisma.create`
— um registro criado por Prisma pula o zod da borda, o `strictObject`, a etiqueta
automática e o `ActivityLog`, e o teste passaria a provar coisas sobre um dado que
nenhum usuário consegue criar.

**Um arquivo por vez** (`fileParallelism: false`): é um banco só. Com paralelismo,
dois arquivos truncariam a tabela no meio do teste do outro, e a falha mudaria de
lugar a cada execução — suíte que falha sem repetir ensina a ignorar o vermelho.

Hoje há **um projeto só** (`banco`) — o par de projetos (`banco` + `puro`) saiu quando o
corte de escopo levou o último arquivo `.puro.test.ts`, e um projeto com zero arquivos não é
separação. Volta junto com o próximo teste que não precisar do banco.

---

---

## Para escrever um teste novo

O molde de arquivo, o fixture e a armadilha do sufixo estão em
[`../guias/escrever-um-teste.md`](../guias/escrever-um-teste.md).
