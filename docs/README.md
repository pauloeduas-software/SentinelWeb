# Documentação do SentinelWeb

> **O critério das pastas é o ciclo de vida, não o assunto.** Cada zona tem uma regra, e é a
> regra que impede a pasta de apodrecer. Antes de escrever em `docs/`, pergunte qual das quatro
> frases descreve o que você está escrevendo.

| Pasta | A regra | O que mora lá |
|---|---|---|
| [`referencia/`](./referencia/) | **É verdade AGORA.** Mudou o código, muda aqui. Não conta história, não dá instrução. | o que o sistema é: camadas, modelo de posse, invariantes, acesso, testes, configurações, baixa do ativo, postos, licenças |
| [`guias/`](./guias/) | **Começa com um verbo.** Receita para quem já sabe o que quer. | criar uma migration, adicionar um domínio, escrever um teste |
| [`decisoes/`](./decisoes/) | **Não se reescreve.** Se a realidade mudou, a decisão é *superada* por outra, com link entre as duas. | as decisões numeradas (`D1`…`D164`) e as por letra (`A`…`Z`), um arquivo por assunto |
| [`historico/`](./historico/) | **Congelado na data.** Não se reescreve: o que ali se apresenta como vigente e deixou de ser ganha uma nota curta de status, com o link do que mudou. | os planos, as revisões e os fechamentos das onze fases |

E um arquivo na raiz: este mapa. Não há lista do que falta fazer — o que o sistema deixou de
fazer, e por quê, está em [`decisoes/escopo.md`](./decisoes/escopo.md).

---

## Por onde entrar

**Vou mexer no código.** Comece em [`referencia/arquitetura.md`](./referencia/arquitetura.md) —
as três camadas, os 17 domínios e o que o lint recusa. Se o que você vai mexer tem a ver com
quem responde por um equipamento, [`referencia/modelo-de-posse.md`](./referencia/modelo-de-posse.md)
é pré-requisito, não leitura opcional.

**Vou mexer em rota, cookie ou permissão.** [`referencia/acesso.md`](./referencia/acesso.md).
Rota nova nasce negada, e rota sem permissão declarada **derruba o boot** — é melhor saber disso
antes.

**Vou mexer nas Configurações ou na saída de um ativo.** [`referencia/configuracoes.md`](./referencia/configuracoes.md)
diz o que cada uma das seis tabelas é, o que a exclusão e a desativação recusam e quem as usa;
[`referencia/baixa.md`](./referencia/baixa.md), o que é dar baixa — e por que não é status nem lixeira.

**Vou mexer nos postos.** [`referencia/postos.md`](./referencia/postos.md) diz o que o posto é, onde
se cadastra e o que a exclusão e a desativação recusam.

**Vou mexer nas licenças ou no estoque.** [`referencia/licencas.md`](./referencia/licencas.md) diz as
contas, o status, o que a entrega e a devolução recusam, e onde a licença aparece fora da própria
tela; [`referencia/estoque.md`](./referencia/estoque.md) diz o mesmo do estoque, que segue a mesma
lógica.

**Vou mexer no banco.** [`referencia/invariantes.md`](./referencia/invariantes.md) diz o que
nunca pode ser falso e onde cada regra é defendida, e
[`guias/criar-uma-migration.md`](./guias/criar-uma-migration.md) tem a receita (**nunca**
`prisma migrate dev`).

**Quero saber por que isso é assim.** [`decisoes/README.md`](./decisoes/README.md) — o índice das
164 numeradas e das por letra, com as supersessões. Toda decisão tem um nome estável: `D137` é
`D137` e `O` é `O` para sempre, mesmo que o arquivo onde ela vive mude.

**Quero saber o que foi feito e quando.** [`historico/`](./historico/), uma fase por arquivo, com
o plano, o que a revisão achou e o que a execução decidiu por conta própria.

---

## As três perguntas que o mesmo fato recebe

O projeto acabou com o mesmo assunto em três zonas de propósito, e saber a diferença é o que
evita escrever a quarta cópia:

| | Pergunta | Exemplo com a posse |
|---|---|---|
| `referencia/` | **o que é?** | um ativo tem no máximo uma posse aberta; o alvo é uma pessoa ou um posto |
| `decisoes/` | **por que, e o que foi descartado?** | `Asset ⟷ User` N:M perde o posto e cresce multiplicativamente — **D14** |
| `referencia/invariantes.md` | **o que o sistema RECUSA para isso continuar verdade?** | o índice único parcial `assignments_um_aberto_por_ativo`, e o 409 que ele produz |

Se você está escrevendo a mesma frase na segunda zona, uma das duas está no lugar errado.

---

## Escrevendo aqui

1. **Decida a zona pela regra**, não pelo assunto. "Como fazer X" nunca vai em `referencia/`,
   mesmo que X seja sobre arquitetura — foi assim que a receita de migration foi morar na linha
   460 de um documento chamado *Arquitetura*, onde ninguém a procurava.
2. **Auditoria e revisão não ganham arquivo.** Elas atualizam o documento que revisaram: a
   revisão de um plano entra no plano, a correção de uma referência substitui o parágrafo errado.
   Documento de referência não carrega a lista das suas próprias correções — isso é o `git log`.
3. **Decisão nova continua a letra** (a próxima é a `AG`; a numeração `D` parou no `D164`, pelo
   motivo escrito em [*A segunda rodada*](./decisoes/README.md#a-segunda-rodada-ap)), entra no
   arquivo do assunto que ela governa e ganha linha no índice. Se ela corrige uma anterior, as
   duas apontam uma para a outra e a tabela de supersessões cresce.
4. **Um fato, um lugar.** Se precisar repetir, cite — o link é mais barato que a segunda cópia, e
   a segunda cópia é a que vai envelhecer sozinha.
