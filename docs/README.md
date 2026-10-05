# Documentação do SentinelWeb

> **O critério das pastas é o ciclo de vida, não o assunto.** Cada zona tem uma regra, e é a
> regra que impede a pasta de apodrecer. Antes de escrever em `docs/`, pergunte qual das quatro
> frases descreve o que você está escrevendo.

| Pasta | A regra | O que mora lá |
|---|---|---|
| [`referencia/`](./referencia/) | **É verdade AGORA.** Mudou o código, muda aqui. Não conta história, não dá instrução. | o que o sistema é: camadas, modelo de posse, invariantes, acesso, testes |
| [`guias/`](./guias/) | **Começa com um verbo.** Receita para quem já sabe o que quer. | criar uma migration, adicionar um domínio, escrever um teste |
| [`decisoes/`](./decisoes/) | **Não se reescreve.** Se a realidade mudou, a decisão é *superada* por outra, com link entre as duas. | as 142 decisões (`D1`…`D142`), uma pasta por assunto |
| [`historico/`](./historico/) | **Congelado na data.** Não se atualiza. | os planos, as revisões e os fechamentos das onze fases |

E dois arquivos na raiz: [`ROADMAP.md`](./ROADMAP.md), que é o que falta fazer, e este mapa.

---

## Por onde entrar

**Vou mexer no código.** Comece em [`referencia/arquitetura.md`](./referencia/arquitetura.md) —
as três camadas, os 26 domínios e o que o lint recusa. Se o que você vai mexer tem a ver com
quem responde por um equipamento, [`referencia/modelo-de-posse.md`](./referencia/modelo-de-posse.md)
é pré-requisito, não leitura opcional.

**Vou mexer em rota, cookie ou permissão.** [`referencia/acesso.md`](./referencia/acesso.md).
Rota nova nasce negada, e rota sem permissão declarada **derruba o boot** — é melhor saber disso
antes.

**Vou mexer no banco.** [`referencia/invariantes.md`](./referencia/invariantes.md) diz o que
nunca pode ser falso e onde cada regra é defendida, e
[`guias/criar-uma-migration.md`](./guias/criar-uma-migration.md) tem a receita (**nunca**
`prisma migrate dev`).

**Quero saber por que isso é assim.** [`decisoes/README.md`](./decisoes/README.md) — o índice das
142, com as supersessões. Toda decisão tem um número estável: `D137` é `D137` para sempre, mesmo
que o arquivo onde ela vive mude.

**Quero saber o que foi feito e quando.** [`historico/`](./historico/), uma fase por arquivo, com
o plano, o que a revisão achou e o que a execução decidiu por conta própria.

---

## As três perguntas que o mesmo fato recebe

O projeto acabou com o mesmo assunto em três zonas de propósito, e saber a diferença é o que
evita escrever a quarta cópia:

| | Pergunta | Exemplo com a posse |
|---|---|---|
| `referencia/` | **o que é?** | um ativo tem no máximo uma posse aberta; o alvo pode ser pessoa, posto ou outro ativo |
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
3. **Decisão nova continua a numeração** (a próxima é a `D143`), entra no arquivo do assunto que
   ela governa e ganha linha no índice. Se ela corrige uma anterior, as duas apontam uma para a
   outra e a tabela de supersessões cresce.
4. **Um fato, um lugar.** Se precisar repetir, cite — o link é mais barato que a segunda cópia, e
   a segunda cópia é a que vai envelhecer sozinha.
