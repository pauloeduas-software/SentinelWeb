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

O `.env.test` é **versionado**: não há segredo nele, o banco é descartável e a
senha é a do administrador que o próprio harness cria (`ADMIN_DE_TESTE`, em
`tests/setup/database.ts` — o seed não cria conta). Quem clonar o repositório roda `npm test` sem
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
| `tests/estoque/` | o saldo derivado, a trava da linha do item e as operações do `StockItem`/`StockMovement` | é uma das três pastas POR DOMÍNIO (com `descoberta/` e `licencas/`), e é de propósito: invariante, corrida e operação contam a mesma história sobre as mesmas duas tabelas, e separá-las faria quem investiga um saldo errado abrir três arquivos distantes |
| `tests/descoberta/` | a borda do agente, a cascata de matching por hardware, a fila, o vínculo manual e o comando — sem inferência por usuário logado ([A](../decisoes/reconciliacao.md#a--a-reconciliação-deixa-de-inferir-pessoa-pela-conta-do-sistema-operacional)) nem fusão de máquinas ([H](../decisoes/reconciliacao.md#h--a-fusão-de-máquinas-sai)) | a segunda pasta por domínio, pelo mesmo motivo: a história é uma só, do handshake até o cadastro que uma pessoa aceita ou vincula à mão |
| `tests/licencas/` | a conta da licença (compradas, em uso, livres), as entregas e as corridas na trava da licença ([AA](../decisoes/licencas.md#aa--a-licença-vira-quantidade-e-entregas-sem-vaga-numerada-sem-lixeira-com-encerradas)) | terceira pasta por domínio: contrato e entrega contam a mesma história |
| `tests/jobs/` | a janela de execução de um job (o D79) | o cenário que ela impede — dois jobs disputando a mesma coluna — não dá erro nenhum: o segundo simplesmente nunca roda |

### `estoque/` — a que falharia em silêncio

**`invariantes.test.ts` › os CHECKs do Postgres recusam a linha incoerente mesmo por fora da API.**
`stock_movements_forma` (uma unidade com exatamente um alvo), `stock_items_qty_nao_negativa`, a
devolução que não antecede a entrega, a que tem o dia sem o instante do registro, a devolvida sem
dizer como (ou o "como" na unidade em uso) e a entrega em uso sem item existem para quem não passa pelo use-case — o `psql` à mão, um
script. Testar isso por HTTP seria impossível por construção; o teste insere direto no banco e lê a
mensagem do Postgres.

**`invariantes.test.ts` › reduz o total até o que está em uso, e não abaixo.** Reduzir o total
abaixo das unidades que ainda estão com gente deixaria o disponível (`qty − em uso`) negativo por um
caminho que não é o psql à mão, e a frase do 409 carrega a conta para a tela não precisar recontar —
a mesma da licença ([AE](../decisoes/estoque.md#ae--o-estoque-segue-a-lógica-da-licença-total-na-edição-entrega-com-dia-desativar-em-vez-de-lixeira)).

**`corridas.test.ts` › 1 de 1 e 3 de 5.** Duas entregas simultâneas de um item com uma unidade só:
sem a trava da linha do item (`travarItemOuFalhar`), as duas contam "0 de 1 em uso" e as duas
inserem. Prova também a redução do total concorrente com a entrega, pela mesma trava, e as duas
devoluções da mesma entrega: fecha uma vez, e o carimbo da devolução não é reescrito. E o item e o
posto excluídos ao mesmo tempo, com entregas devolvidas em comum: os dois passam, e as entregas ficam
com os dois nomes por escrito. A trava das linhas na ordem do id, que evita o deadlock entre os
dois, não se prova aqui: numa tabela pequena o Postgres lê as linhas na mesma ordem pelos dois
caminhos.

Em todos os casos a asserção central é sobre o BANCO — a contagem de `StockMovement` abertas —, não
sobre a resposta HTTP: é o estado final que precisa estar certo, e é exatamente o que uma resposta
`201` plausível esconderia se a trava não existisse.

**`componente.test.ts` › a categoria decide para onde o item vai.** O componente
([AI](../decisoes/estoque.md#ai--o-componente-é-uma-categoria-vai-só-para-computador-e-sai-pelo-retirar))
que fosse para um colaborador ficaria "em uso" com uma pessoa, e o mouse num computador apareceria
na aba Componentes; nenhum dos dois quebra conta nenhuma, e por isso a recusa é testada nos dois
sentidos. O mesmo arquivo prova que o componente fica quando o computador muda de mãos, que a baixa
e a lixeira do computador com componente são recusadas com o item em link, e que o CHECK do alvo
`ASSET` exige o computador e só ele.

### `listagens/` — o que a vista devolve, e o que ela esconde

A regra do diretório: toda asserção diz as **duas** metades — o que apareceu e o
que **não** apareceu. Um filtro errado para mais não quebra nada: ele some com a
linha, a tela fica plausível, e a falta só é notada quando alguém procura um
equipamento que o sistema jurava não ter.

### `licencas/` — a conta, as entregas e a trava da licença

Nove arquivos, e cada um prova uma coisa que passaria despercebida. Cada `it` cria a sua
licença e os seus alvos quando vai mudá-los: rodado sozinho com `-t`, ele passa.

- **`operacoes.test.ts`** — a conta (compradas − em uso), a devolução que libera, o piso da
  redução e a frase, a quantidade de 1 a 100.000 e a nula ou vazia como 422, as datas que não
  antecedem a compra (também na edição, contra a data gravada), o valor da compra (vírgula
  aceita, ponto de milhar 422 com o nome do campo) e a máscara do campo, que a tela usa. O dia
  da entrega e o da devolução: passado pode, futuro não, devolução nunca antes da entrega;
  a entrega no passado nunca antes da compra nem da última devolução do mesmo alvo, e no dia
  dela passa, depois dela. E cada recusa da entrega: sem livre, mesmo alvo, dois alvos ou
  nenhum, vencida, encerrada, ativo baixado, na lixeira ou inexistente, colaborador desativado
  ou na lixeira — e o alvo conferido antes da licença. E a devolução pela entrega: o clique
  velho não devolve quem recebeu depois.
- **`status.test.ts`** — o status nas bordas do calendário, e o dia de Brasília provado nas
  funções puras com o instante na mão (22h30 de Brasília ainda é o mesmo dia). E o filtro de
  status, com as mesmas fronteiras: a encerrada só no `ENCERRADA`, e junto das outras na lista
  sem filtro; o `view` das abas que saíram é 422. A busca da lista por licenciado, e-mail,
  pedido, categoria e fabricante, com `_` como texto, e a ordem das encerradas.
- **`detalhe.test.ts`** — com quem está e o histórico de 15 em 15, e a busca pelo nome do
  colaborador ou do computador; o histórico recusa `?q=`, e a página além do fim vem vazia.
- **`ciclo.test.ts`** — Encerrar (com alguém usando, encerra e entra no alerta; passa a ser
  encerrada na lista; reabre ao apagar a data), o filtro "ainda em uso" das encerradas, excluir de vez pela
  regra do posto (a em uso recusa com quem; a devolvida some com as chaves, e as entregas ficam com
  o nome; a FK recusa por fora) e o alerta, na ordem de urgência e com a contagem
  de cada motivo. O bloco do alerta começa devolvendo tudo e apagando os vencimentos que os
  testes de cima deixaram: a caixa corta em seis.
- **`chave.test.ts`** — a lista de chaves da licença (a ordem digitada, o "cobre", a soma contra o
  comprado, a repetida; a edição que inclui, corrige e tira, a já entregue que não sai nem
  encolhe, e a correção que troca o texto entre duas chaves), a chave escolhida na entrega (obrigatória com chaves, cada uma até o que cobre, a de
  outra licença é 404), a troca, as rotas que nunca a devolvem — o alerta incluído, com uma
  licença que está nele —, a exclusão que leva as chaves junto, e como a tela a esconde.
- **`historico.test.ts`** — o histórico separado por alvo, e o da licença só com entregas e
  devoluções: cadastro e edição ficam na auditoria, e o histórico não os lê. A paginação sai do banco, e
  a entrega e a devolução no mesmo dia passado — o mesmo instante — vêm devolução primeiro.
- **`posse.test.ts`** — o 409 da pessoa e do ativo, com o nome de cada licença e as `refs` que
  a tela transforma em link, e a ficha e a aba Licenças que listam só o que é de cada um.
- **`invariantes.test.ts`** — os três CHECKs da entrega (a em uso tem licença), os dois
  índices parciais do alvo, a FK composta que recusa a chave de outra licença, os dois CHECKs e a
  unicidade da chave, e os três CHECKs da licença (quantidade e datas), por SQL cru.
- **`corridas.test.ts`** — oito entregas a oito pessoas DIFERENTES numa licença de três:
  passam três. Pessoas diferentes de propósito — com o mesmo alvo, a trava do alvo
  serializaria tudo antes da licença, e o teste passaria sem provar a trava que importa. Oito
  entregas simultâneas na mesma chave que cobre duas: passam duas. E a redução, a exclusão e o
  Encerrar contra a entrega, e a devolução dupla. A exclusão que perde
  tem que perder pela regra, com a frase dela — o 409 genérico da FK passaria sem a trava.


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

### `invariantes/auditoria.test.ts` — toda escrita tem dono

O teste central passa por cada rota de escrita da tela e confere que **toda** requisição 2xx
deixou ao menos uma linha em `audit_logs` com o número dela e a conta da sessão (`auditada()`).
Rota nova de escrita entra nessa lista. O mesmo arquivo prova o resto da [AB](../decisoes/acesso.md#ab--a-auditoria-volta-quem-fez-só-no-banco):
o autor no corpo é 422; uma segunda conta assina o que ela fez; o login grava a entrada como a
conta e a senha errada sem autor, e o bloqueio uma linha só por janela; a configuração salva num
banco sem a linha diz só o que a conta mandou; o vínculo repetido não
grava nada, e o aceite fecha a sugestão junto com o vínculo; `UPDATE` e `DELETE` na tabela são
recusados pelo banco, e o texto em branco também; o agente
e o job em `SUGGEST` não mexem em cadastro, posse nem estoque e não gravam; o
`conceder-administrador` não grava o que não mudou; e senha, hash e chave de licença nunca chegam à
tabela. `id-da-requisicao.test.ts` prova que o `X-Request-Id` do cliente é ignorado.

### `invariantes/versao.test.ts` — o Editar velho não grava por cima

O Editar manda o `updatedAt` que leu ao abrir ([AF](../decisoes/licencas.md#af--a-licença-entra-no-cadastro-das-configurações-e-o-editar-manda-o-formulário-inteiro)). Cada caso salva no meio — outra edição, o
Encerrar da licença, o total do item, a entrega do consumível, a entrega do computador — e prova que a versão velha é 409,
com a frase, e que nada foi gravado; a versão atual e a ausente passam, e a que não é data e hora
é 422. Cadastro novo com Editar entra nesta lista.

### `corridas/` — o placar, nunca "deu certo"

A asserção de um teste de corrida nunca é *"a requisição funcionou"*: é
**"exatamente UMA passou, e o banco tem exatamente UMA linha"**.

`Promise.all` sobre `app.inject()` dispara de verdade em paralelo — cada `inject`
entra no event loop como requisição independente e o Prisma tira uma conexão do
pool para cada. Quem serializa é o Postgres, que é o que se quer provar.

> Foi aqui que a invariante 6 nasceu: o teste de "desligar e entregar ao mesmo
> tempo" ficou vermelho com `{ posses: 1 }` na primeira execução, contra código
> que parecia certo e cujos comentários afirmavam ser seguro.

`vinculo.test.ts` é a corrida da máquina: dois vínculos da mesma máquina para ativos diferentes,
duas desvinculações e dois aceites da mesma sugestão — passa um de cada, e a auditoria tem um
`LINK` e um `UNLINK` só. Sem a trava da máquina, o segundo vínculo apagava o primeiro sem deixar
rastro. `login.test.ts` é a rajada de dez senhas erradas na mesma conta: o contador chega a dez, a
conta trava, e cada linha da auditoria leva o seu número, de 1 a 10. E a de dez tentativas na conta
já bloqueada: uma linha "bloqueada" só — sem a trava da conta, eram oito.

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
o administrador do harness; `api.anonimo` é o mesmo app sem cookie, para testar a
porta fechada. Os fixtures criam cenário **pela API**, nunca por `prisma.create`
— um registro criado por Prisma pula o zod da borda, o `strictObject`, a etiqueta
automática e a auditoria, e o teste passaria a provar coisas sobre um dado que
nenhum usuário consegue criar.

**Um arquivo por vez** (`fileParallelism: false`): é um banco só. Com paralelismo,
dois arquivos truncariam a tabela no meio do teste do outro, e a falha mudaria de
lugar a cada execução — suíte que falha sem repetir ensina a ignorar o vermelho.

Hoje **não há projeto nenhum** — uma configuração só, a do `vitest.config.ts`. O par de
projetos (`banco` + `puro`) saiu quando o corte de escopo levou o último arquivo
`.puro.test.ts`, e um projeto com zero arquivos não é separação. Volta junto com o próximo
teste que não precisar do banco.

---

---

## Para escrever um teste novo

O molde de arquivo, o fixture e a armadilha do sufixo estão em
[`../guias/escrever-um-teste.md`](../guias/escrever-um-teste.md).
