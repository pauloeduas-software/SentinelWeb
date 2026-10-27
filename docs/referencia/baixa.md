# Baixa do ativo

> O ativo que **deixou de ser da empresa** — vendido, doado, descartado, roubado.
> O que a baixa é, como se faz, o que ela recusa e o que ela não é.
>
> A regra permanente está em [`invariantes.md`](invariantes.md) (a 20); o porquê
> de ser coluna e não status está na decisão
> [D19](../decisoes/catalogo-e-ativo.md#d19--arquivar-descomissionar-e-apagar-são-três-coisas-com-três-colunas).

---

## Três perguntas, três lugares

O mesmo ativo responde três coisas diferentes, e cada uma mora num campo:

| Pergunta | Onde | Exemplo |
|---|---|---|
| **Em que estado ele está?** | o **status** (`statusId`) | Disponível, Em uso, Pendente, Inutilizável |
| **Ainda é da empresa?** | a **baixa** (`retiredAt` + `retiredReason`) | Vendido em 15/10/2026 |
| **Foi cadastrado de verdade?** | a **lixeira** (`deletedAt`) | cadastro feito por engano |

Por isso a baixa **não é um quinto tipo de status**: ela não substitui o estado
em que o equipamento saiu. Um notebook descartado sai "Inutilizável"; um vendido
pode sair "Disponível". Se a baixa fosse status, essa informação se perderia, e
"vendido" ficaria na mesma lista de "em conserto".

E **não é excluir**:

| | Excluir (lixeira) | Dar baixa |
|---|---|---|
| quando | o ativo foi cadastrado **por engano** | o ativo **saiu do patrimônio** |
| pede | só a confirmação | **motivo**, data e observação |
| depois | some do inventário; restaura-se da lixeira | continua no histórico e na vista **Baixados**; desfaz-se com **Reverter** |
| é | erro de digitação | fato contábil, datado |

---

## Como se faz

**Ficha do ativo › aba Detalhes › botão "Dar baixa"**, no rodapé. Abre um
formulário próprio — é uma operação, não um campo do cadastro:

| Campo | Regra |
|---|---|
| **Motivo** (obrigatório) | um de seis, lista fechada: Vendido, Descartado, Doado, Devolvido em garantia, Extraviado, Roubado |
| **Data da saída** (obrigatório) | vem preenchida com **hoje**, no fuso do navegador. Pode ser uma data passada — a venda foi na semana passada e o registro, hoje —, nunca futura (422) |
| **Observações** | a justificativa ("lote 2026/03, nota 1187"). Fica no ativo (`retiredNotes`) e aparece na aba Detalhes enquanto a baixa valer; a de cada baixa fica também na auditoria, no banco ([AB](../decisoes/acesso.md#ab--a-auditoria-volta-quem-fez-só-no-banco)) |

A API é `POST /api/assets/:id/retire` (`{ retiredReason, retiredAt?, notes? }`),
permitida a `ADMIN`, o único cargo ([Z](../decisoes/acesso.md#z--sobra-um-cargo-só-administrador-e-a-separação-de-cargos-fica-para-decidir)).

### Depois da baixa

- **Na ficha:** o selo "Vendido em 15/10/2026" no cabeçalho e uma faixa no topo da
  aba Detalhes, com o botão **Reverter**.
- **Na lista de Computadores:** o ativo sai da vista **Ativos** e passa a aparecer só na
  vista **Baixados**, que tem contador próprio. A **Lixeira** não olha a baixa.
- **Na aba Detalhes:** a observação, abaixo do selo.
- **Na auditoria, no banco:** a linha `RETIRE`, com quem fez, quando, o motivo e a
  observação. A aba Histórico é só movimentação e não a mostra ([AB](../decisoes/acesso.md#ab--a-auditoria-volta-quem-fez-só-no-banco)).
- **O status não muda.** Trocar o status é uma segunda decisão, com linha
  própria na auditoria.

---

## O que a baixa recusa

| Tentativa | Resposta | Por quê |
|---|---|---|
| dar baixa em ativo **entregue** (a pessoa ou a posto) | 409 `ATV-00042 está entregue e não pode receber baixa. Faça a devolução antes.` | "vendido" e "na mão da Laura" não podem ser verdade juntos. O sistema **não devolve sozinho**: apagaria quem estava com o equipamento e em que estado voltou |
| dar baixa em ativo que **tem licença** | 409 `ATV-00042 ainda tem a licença SolidWorks. Devolva pela tela de Licenças antes de dar baixa.` | a licença ficaria descontada do contrato, presa a uma máquina vendida. A recusa traz um link para o detalhe de cada licença, onde está o Devolver |
| dar baixa em ativo que **tem componente** | 409 `ATV-00042 ainda tem os componentes Memória RAM 8 GB ×2. Retire pela tela de Estoque antes de dar baixa.` | a peça continuaria "em uso" numa máquina vendida. A recusa traz um link para o detalhe de cada item, onde está o Retirar; se a peça foi junto, retire e diminua o total do item ([AI](../decisoes/estoque.md#ai--o-componente-é-uma-categoria-vai-só-para-computador-e-sai-pelo-retirar)) |
| dar baixa **duas vezes** | 409 `ATV-00042 já teve baixa em 15/10/2026.` | reescreveria a data em que ele deixou de ser patrimônio |
| data da saída **futura** | 422 | a baixa tiraria o ativo do inventário hoje por um fato que não aconteceu |
| **entregar** ativo baixado | 409 `ATV-00042 teve baixa em 15/10/2026 e não pode ser entregue. Desfaça a baixa antes.` | ele não é mais da empresa — vale com **qualquer** status, inclusive "Disponível" |
| entregar **licença** a ativo baixado | 409 `O ativo ATV-00042 teve baixa e não pode receber licença.` | a licença ficaria presa a uma máquina que não existe mais |
| entregar **componente** a ativo baixado | 409 `O ativo ATV-00042 teve baixa e não pode receber componente.` | pelo mesmo motivo |
| **vincular máquina** descoberta a ativo baixado | 409 `ATV-00042 teve baixa e não recebe máquina. Desfaça a baixa antes.` | o vínculo o traria de volta à cobertura e à telemetria. A descoberta automática também não o propõe nem o vincula — ele só conta para detectar ambiguidade |
| **Reverter** um ativo que não teve baixa | 409 `ATV-00042 não teve baixa.` | |

Na tela, o botão **Entregar** já vem desabilitado no ativo baixado, com o motivo
no `title` — na lista, no cabeçalho da ficha e na aba Posse —, e os seletores de
ativo (entrega de licença, entrega de componente, vínculo de máquina) não oferecem baixados.

**A baixa e a entrega do mesmo ativo, ao mesmo tempo,** não terminam com ele
baixado e entregue: as duas travam a linha do ativo antes de olhar a posse
(`asset/use-cases/lock-asset.usecase.ts`), e a que chega depois encontra a outra
feita e leva 409. Reverter, restaurar da lixeira e vincular máquina travam a
mesma linha — um duplo clique não grava o evento duas vezes, e a máquina não é
vinculada a um ativo que acabou de ter baixa.

## Reverter

Para a venda que não saiu, o roubado que apareceu, o clique errado.
`POST /api/assets/:id/unretire`, `ADMIN`, botão **Reverter** na ficha, que pede
confirmação.

- Limpa **as três** colunas juntas — `retiredAt`, `retiredReason` e `retiredNotes`:
  `retiredAt` sem motivo seria "saiu, não se sabe por quê", e a observação explicaria
  uma saída que não existe mais.
- **Não confere posse**: um ativo que volta ao patrimônio não contradiz nada.
- A auditoria grava o `UNRETIRE` **com o motivo, a data e a observação de onde ele
  voltou** — é a pergunta de quem audita a reversão.

---

## O que a baixa não registra

Fica de fora hoje, e é escolha, não esquecimento — entra quando a contabilidade
pedir:

- **Valor recebido e ganho ou perda** da venda (o CPC 27 manda reconhecer no
  resultado). A baixa guarda data e motivo, não valor.
- **Documento da baixa** (nota fiscal, boletim de ocorrência). Cabe na observação,
  como texto.
- **Apagamento dos dados** do equipamento antes de ele sair.
- **"Pendente de baixa"** como etapa. Faz-se com um status de tipo `PENDING`
  ("Aguardando descarte") antes da baixa. O mesmo vale para o **extravio**: um
  status `PENDING` ("Desaparecido") enquanto se apura, e a baixa como
  extraviado ou roubado só depois — ela é reversível, mas é fato contábil.
- **Devolução ao locador** (fim de locação) como motivo. Equipamento alugado que
  volta ao fornecedor hoje não tem motivo certo: nem "devolvido em garantia" nem
  "descartado" descrevem o fato.
- **Quem recebeu** (comprador, entidade da doação) e **quem aprovou** a baixa.

---

## Onde está e onde é testado

| | |
|---|---|
| dar baixa | `server/domain/asset/use-cases/retire-asset.usecase.ts` |
| a guarda da posse | `assert-retire-posse.usecase.ts` |
| reverter | `unretire-asset.usecase.ts` |
| a recusa na entrega | `assignment/use-cases/checkout-asset.usecase.ts`; na licença, `license/use-cases/checkout-license.usecase.ts` |
| as vistas Ativos / Baixados | `asset/helpers/asset-filters.helper.ts` |
| a tela | `src/pages/computadores/detalhe/components/{RetireModal,DetalhesTab}.tsx`, `src/pages/computadores/helpers/baixa.helper.ts` |
| testes | `tests/invariantes/posse.test.ts` (a baixa recusa entregue, licença, data futura e repetição; baixado não é entregue; reverter libera), `tests/corridas/posse.test.ts` (baixa × entrega), `tests/listagens/vistas-do-ativo.test.ts` (as vistas) |
