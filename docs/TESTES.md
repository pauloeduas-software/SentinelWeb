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
npm test          # roda tudo, uma vez
npm run test:watch
npx vitest run tests/corridas          # só uma pasta
npx vitest run -t "etiqueta automática" # só o que casa com o nome
```

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
| `tests/invariantes/` | as do [`INVARIANTES.md`](./INVARIANTES.md) | vermelho aqui = o dado já pode estar errado no banco |
| `tests/corridas/` | duas requisições simultâneas, e o placar | o que "passa no teste com um usuário" |
| `tests/listagens/` | o que cada vista e cada leitura DEVOLVE, e o que ela esconde | filtro que esconde demais não dá erro: some linha e ninguém percebe |
| `tests/estoque/` | o saldo derivado, a trava da linha-pai e o que a F5 não pode perder da F4 | é a única pasta POR DOMÍNIO, e é de propósito: as três asserções que importam (invariante, corrida e operação) contam a mesma história sobre as mesmas seis tabelas, e separá-las em três pastas faria quem investiga um saldo errado abrir três arquivos distantes |

### `estoque/` — as duas que falhariam em silêncio

Toda a pasta existe por causa de dois testes, e vale ler o porquê antes de
mexer neles:

- **`operacoes.test.ts` › o desligamento não esvazia o posto.** Sem o
  `targetType: 'USER'` no `where`, desligar a Laura devolve ao estoque os 5
  mouses da Mesa 1 — que continuam fisicamente na mesa, agora com a Ana. O saldo
  **bate**, as linhas foram fechadas corretamente, nenhum erro é logado, e a
  falta só aparece quando alguém vai buscar um mouse na gaveta.
- **`operacoes.test.ts` › a retirada parcial divide a linha.** Se alguém trocar a
  divisão por um decremento de `assignedQty`, o estado atual continua CERTO — a
  soma das abertas não muda — e só o histórico desaparece. Nenhuma tela quebra.

Nos dois casos a asserção é sobre o BANCO, não sobre a resposta HTTP: é o estado
final que precisa estar certo, e ele é exatamente o que uma resposta `200`
plausível esconderia.

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

Sete arquivos, e cada um prova uma coisa que passaria despercebida:

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
- **`chave.test.ts`** — as três portas por onde o segredo poderia sair: a
  resposta, o diff do `ActivityLog` e o `sanitizeForLog`. O último **falharia
  antes da F6**: o regex de `SENSITIVE_KEY` não casava com `productKey`. Também
  prova o AAD — chave copiada de outra licença por dentro do banco não é
  revelada.
- **`operacoes.test.ts`** — a queima na devolução e o status derivado nas quatro
  bordas do calendário, onde um `<=` trocado por `<` só apareceria no dia exato.
- **`historico.test.ts`** — a trilha da licença, `VIEW_KEY` inclusive.
- **`posse.test.ts`** — o desligamento fecha o assento da PESSOA e **não** o do
  ATIVO, e os 409 de `DELETE` de pessoa e de ativo citam o assento. E a promessa
  contra o cumprimento: o conjunto que `GET /users/:id/holdings` devolve é
  **exatamente** o que o `offboard` fecha, com a queima caindo em quem a tela
  marcou. É o que impede o modal de desligamento de prometer devolução e
  entregar destruição.
- **`canario.test.ts`** — o canário grava no primeiro boot, **derruba** a troca
  acidental de chave e **se regrava** com a chave ativa numa rotação. O último é
  o que faz a rotação ter fim: sem ele o canário fica preso ao `kid` da chave
  que o escreveu, e a antiga nunca pode sair do ambiente — o boot passaria a
  falhar pedindo de volta uma chave que já não cifra nada.

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

---

## Acrescentar um arquivo

```ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { criarApi, type ApiDeTeste } from '../helpers/app';
import { cenarioDePosse } from '../helpers/fixtures';

let api: ApiDeTeste;
let cenario: Awaited<ReturnType<typeof cenarioDePosse>>;

beforeAll(async () => {
  api = await criarApi();
  cenario = await cenarioDePosse(api);   // 1 ativo, 2 pessoas, 1 posto
});

afterAll(async () => { await api.fechar(); });

it('descreve a regra, não o código', async () => {
  const { status } = await api.post(`/api/assets/${cenario.ativo.id}/checkout`, {
    targetType: 'USER', targetUserId: cenario.laura,
  });
  expect(status).toBe(201);
});
```

Três regras:

1. **Tudo por HTTP.** O Prisma entra só para **ler** o resultado ou para provar
   uma regra de banco que a API recusa antes (é o caso de
   `invariantes/check-assignment.test.ts`, o único que escreve SQL cru).
2. **Um `criarApi()` por arquivo**, em `beforeAll`. O teto do rate limit é contado
   em memória por instância: uma instância para a suíte inteira faria o arquivo
   de número quinze tomar 429 por causa dos catorze anteriores.
3. **Sem depender da ordem dos testes.** Os testes do mesmo arquivo compartilham
   banco (semear custa um argon2, e pagá-lo por `it` levaria minutos), então cada
   um cria o que precisa com nome próprio.
