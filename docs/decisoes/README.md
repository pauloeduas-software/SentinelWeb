# As decisões do SentinelWeb

> Toda decisão de arquitetura do projeto, arquivada **pelo assunto que ela governa**.
> A numeração `D1`…`D164` é contínua e global: ela é o nome da decisão e não
> muda, mesmo que o arquivo onde ela vive mude. Depois do D164 o nome passou a ser letra (`A`, `B`…
> `AA`, `AB`…), pelo motivo em [*A segunda rodada*](#a-segunda-rodada-ap). Para achar uma decisão,
> procure o título: `grep -rn '^## D137 ' docs/decisoes`.
>
> **A regra desta pasta:** decisão escrita aqui **não se reescreve.** Se a realidade mudou, ela é
> **superada** por outra, com link entre as duas. O log é o que diz por quanto tempo cada regra
> governou — reescrever apaga essa informação.
>
> Quem quer saber **o que vale hoje**, leia [`../referencia/`](../referencia/).
> Quem quer saber **o que foi feito e quando**, veja o `git log`.

## Os onze assuntos

| Arquivo | Assunto |
|---|---|
| [`reconciliacao.md`](./reconciliacao.md) | Reconciliação |
| [`acesso.md`](./acesso.md) | Acesso |
| [`escopo.md`](./escopo.md) | **Escopo** — o que o sistema deixou de fazer |
| [`catalogo-e-ativo.md`](./catalogo-e-ativo.md) | Catálogo e ativo |
| [`posse.md`](./posse.md) | Posse |
| [`relatorios-import-etiquetas.md`](./relatorios-import-etiquetas.md) | Relatórios, import e etiquetas |
| [`ciclo-de-vida.md`](./ciclo-de-vida.md) | Ciclo de vida |
| [`licencas.md`](./licencas.md) | Licenças |
| [`campos-customizados.md`](./campos-customizados.md) | Campos customizados |
| [`plataforma.md`](./plataforma.md) | Plataforma |
| [`estoque.md`](./estoque.md) | Estoque |

## Correções e supersessões

As decisões não se reescrevem, então quando uma corrige a outra isso fica escrito nas duas. As
que corrigem algo anterior:

| Corrige | É corrigida por | O que mudou |
|---|---|---|
| **D42** (formato da cifra) | **D81** | o formato `v1:iv:tag:ct` foi **substituído** por `enc:v1:<kid>:<iv>:<tag>:<ct>`, com AAD |
| **D43** (`burnedAt` × `retiredAt`) | **D92** | a fórmula dos assentos livres: `aposentados` é exibido e **nunca** subtraído |
| **D66** (a view do responsável) | **D129** | a view filtra a lixeira, não emite responsável nulo e fala `DIRETO`/`POSTO`/`ATIVO` |
| **D75** (`Department` em duas migrações) | **D135** | o contrato muda com a entidade, não no `DROP COLUMN` |
| **D77** (dado sensível no `select`) | **D140** | em `JsonB` isso é impossível: mascarar depois é o limite da regra, não exceção |
| **D16** (responsabilidade derivada) | **D130**, **D139** | a derivação tem UMA implementação por pergunta — nem a view nem o aceite criam a segunda |
| **D5** (cinco tipos de status) | commit `505c520` (status enxuto) | o `ARCHIVED` sai: **quatro** tipos; cor e `showInNav` saem do `StatusLabel`; o seed cria um status por tipo |
| **D19** (três colunas de saída), **D127** | commit `505c520` (status enxuto) | sem `ARCHIVED`, sobram duas: `retiredAt` (a baixa) e `deletedAt` |
| **D20** (`?arquivados=`), **D85** (`?view=archived`) | commit `505c520` (status enxuto) | a vista, a aba e o contador de arquivados saem; `active` exclui só o baixado |
| **D4** e **D15** (a árvore de `Location`), **O** (`Location.managerId` fica) | commit `ff34364` (localização plana) | `parentId` e `managerId` saem: a lista é plana, e o nome único diz onde o lugar fica |
| **AF**, **AN**, **AO** (ações ao passar o mouse), **AT** (shadcn e tema claro) e **F** (a busca por etiqueta) | **AY** | a linha inteira abre o registro e as ações vão para o `⋯`; a situação pode ter cor; primitivos do shadcn só no que se usa, e tema claro e escuro; `GET /api/search` sai |
| **AY** (subtítulo de uma linha), **AT** (o estado da lista na URL, só a aba) | **AZ** | a página fica sem subtítulo, e a aba de Configurações mora no endereço |
| **AT** (o título fora do cabeçalho; o estado da lista na URL, só em Postos), **AY** (o título; detalhe em janela, no posto) | **BA** | o título da página volta ao cabeçalho, e o posto tem ficha em página, com o estado da lista na URL |
| **BA** (a ação na página; os filtros fora da URL), **AZ** (busca, filtro e página fora da URL) | **BB** | o cabeçalho só tem o título e o voltar, e toda lista guarda os filtros na URL |
| **P** (`USUARIO` não entra), **R** (em parte) | **U** | quem recebe equipamento sai de `User` e vira colaborador (catálogo); sobram dois cargos, e todo usuário tem senha |
| **D8** (catálogo sem lixeira, em parte), **U** (em parte) | **V** | só o presente segura a exclusão: a localização sai de verdade e o histórico guarda o nome por escrito; o colaborador vai para a lixeira, com Restaurar |
| a lixeira do usuário (`deletedAt`, `users_email_unique_undeleted`) | **W** | excluir usuário apaga a linha; ninguém rebaixa, desativa ou exclui a si mesmo |
| **D23**, **D24**, **D25**, **W** (em parte) | **X** | o histórico não guarda quem fez: as cinco colunas de autor e o parâmetro `actorId` saem, e usuário não grava histórico |
| **D15**, **B** (a porta da marca), **V** (a metade da localização) | **Y** | o posto sai de `Location` e vira `Workstation`: a localização só guarda, com a regra do status; o posto recebe entrega, estoque e ocupante |
| **U** (os dois cargos), **W** (o rebaixar) | **Z** | sobra um cargo só, `ADMIN`, com toda a validação dele; a separação de cargos é decisão a tomar |
| **Z** | **AV** | três cargos, `TECNICO < SUPERVISOR < ADMIN`: o Técnico opera, o Supervisor decide e o Administrador cuida das contas |
| **AU** (as 12 horas da sessão) | **BD** | a sessão vale 48 horas, ainda fixa e contada da entrada |
| **D19** (a lista fechada de motivos da baixa) | **BE** | o enum `RetiredReason` sai: os motivos são um cadastro de Configurações, e a baixa continua separada do status |
| **E** (o placar da varredura ao lado do botão) | **BF** | o placar vai para o cartão do canto inferior direito, como toda resposta a um clique |
| **AY** (o texto encolhe com a densidade) | **BH** | a densidade fica no espaçamento, e o texto tem piso de 12px |
| **C** (em parte: o computador fora da lista), **Y** (em parte: a C mantida), **BI** (em parte: o descartado) | **BJ** | o computador entregue a um posto continua na lista de Computadores, e a linha diz em que mesa ele está |
| **AE** (o link do detalhe), **AY** (detalhe é janela), **BA** (item e licença em janela), **BF** (o link que não abre no cartão) | **BK** | item e licença têm ficha em página, e o registro que não abre diz no lugar dela |
| **BJ** (em parte: os ocupantes na coluna Responsável) | **BL** | em toda tela, o responsável que aparece é o posto ou a pessoa direta; a pessoa fica pendurada no posto, na aba Responsáveis |
| **AN** (em parte: devolver pela ficha do posto), **BF** (em parte: a recusa do Devolver no posto), **D** (em parte: a devolução presa ao posto) | **BN** | o Devolver mora só na ficha do que foi entregue: posto e colaborador mostram, e a linha abre o registro |
| **BL** (em parte: o selo embaixo do posto), **BF** (em parte: o posto vago em `Aviso`) | **BO** | em Responsáveis vai só o nome, sem turno; posto vago é só a Situação do posto |
| **BB** (em parte: Entregar ou Devolver no card do computador) | **BQ** | Entregar e Devolver são dois botões, como em Estoque e Licenças, e a aba Responsáveis é uma só em toda ficha |
| **AW** (em parte: quem ocupou em cada entrega e o id do posto excluído), **BL** (em parte: a forma da aba Responsáveis) | **BP** | o que já foi mora na aba Histórico: o posto ganha a dele, e a aba Responsáveis mostra só o que está agora |
| **AB** (em parte: a observação da baixa numa aba), **AZ** (em parte: o modelo numa aba), **BB** (em parte: a primeira aba) | **BR** | a ficha do computador não tem aba Detalhes: os campos sobem para o card, e a primeira aba é Responsáveis |
| **BA** (em parte: um cartão por status), **BB** (em parte: cartão só em Computadores, Postos e Licenças) | **BT** | Estoque e Colaboradores abrem com Total, Ativos e Desativados, e o cartão de Computadores conta o tipo de status |
| **BB** e **BS** (em parte: Situação fora de Computadores e Licenças), **BO** (em parte: a Situação do posto) | **BU** | o nome é Status em toda tela, e o valor vai no masculino |

**O de-escopo (D143–D156) supera por subtração**, e é o maior grupo de supersessões do projeto:
a decisão antiga não estava errada, o que ela governava deixou de existir. Está inteiro em
[`escopo.md`](./escopo.md), e o critério é o D143 — sobrevive o que serve ao núcleo ITAM ou à
ponte ITAM×RMM.

| Corrige | É corrigida por | O que mudou |
|---|---|---|
| **D52**, **D54** (conferência física) | **D144** | a manual sai; a do agente (D124) fica, e era a que já respondia |
| **D7**, **D58**–**D64** (campos customizados) | **D145** | o assunto inteiro sai; a cifra fica com um uso só, e o D77 volta a ser regra inteira |
| **D68**, **D131**, **D132**, **D134** (importação) | **D146** | a carga é a descoberta; o **export** (D69) fica |
| **D70** (etiqueta) | **D147** | o `assetTag` fica; desenhar o papel sai |
| **D76**, **D78**, **D136** (permissão, LDAP, OIDC) | **D148** | matriz vira `User.role`; o D137 (cobertura no boot) fica |
| **D80**, **D89**, **D142** (`ApiToken`) | **D149** | o prazo do D89 expira sem ser cumprido, e por escrito |
| **D27**, **D29**, **D30**, **D87**, **D88** (aceite) | **D150** | o termo sai; o `resolverEscalonamento()` (D73) fica |
| **D57**, **D125**–**D128** (alertas) | **D151** | os sinais continuam consultáveis; empurrá-los sai. O D79 **não** sai |
| **D55** (valor contábil) | **D152** | `purchaseCost` fica; a amortização sai |
| **D36**, **D37**, **D38** (estoque) | **D153** | sete modelos viram `StockItem` + `StockMovement`; o D34 torna isso barato |
| **D67**, **D71**, **D133** (builder de relatório) | **D154** | três consultas em código; a superfície desaparece em vez de ser defendida |
| **D141** (nome do portal) | **D156** | o nome estava certo; a tela cai |
| **D144** (conferência pelo agente), **D53** | **D157** | sem tela ninguém lê o registro; o job perde uma linha e nada mais |
| **D155** (manutenção no histórico) | **D158** | sem tela ninguém cria a linha, e o `ActivityLog` (D18) já é o lugar |
| **D153** (estoque em item + movimento) | **D160** | o único item que REESCREVIA; não foi executado, e o log diz isso |
| **D154** (três relatórios) | **D161** | são dois: licença e estoque já exportavam pelos domínios deles |

**As decisões por letra também superam.** A segunda rodada e a varredura que veio depois dela
registram o "Supera:" do mesmo jeito, e o log só fica completo com elas na tabela:

| Corrige | É corrigida por | O que mudou |
|---|---|---|
| **D47**, **D48**, **D49** (inferência pela conta do sistema operacional) | **A** | a fila deixa de inferir pessoa; sai a invariante 14, e o D50 fica |
| **D115** (a rota da aba de telemetria) | **D** | a telemetria e o comando vão para a ficha do ativo e a do posto |
| **D42**, **D91** (a cifra), **D102** (licença ↔ pacote), **D81**, **D145** (em parte: a cifra que sobrava) | **G** | licença vira cadastro simples, sem conformidade de software nem chave cifrada |
| **D103**, **D104** (fusão de máquinas) | **H** | o `hwid` é estável entre reinstalações; não há o que fundir |
| **D36**, **D37**, **D38**, **D153**, **D160** (estoque) | **J** | `StockItem` + `StockMovement`, entrega por unidade, alvo em pessoa ou posto |
| **D14** (o `ASSET` como alvo), **D87** | **K** | a posse tem dois alvos: pessoa e posto |
| **D21**, **D31**, **D32**, **D82** (massa e desligamento), **D93** (em parte: o `offboard`), **D57**, **D86** (e-mail), **D66**, **D129**, **D130** (a view do responsável), **D73**, **D74**, **D75**, **D135**, **D156** (`Department`), **D154**, **D161** (relatórios), **D69**, **D138**, **D163** (export e relatório) | **O** | o segundo de-escopo: a régua do D143, aplicada sem a folga da primeira rodada |
| **D17** (`assignedToId`), **D26** (`createdById`/`updatedById`) | **Q** | a varredura do código morto: coluna, rota e parâmetro sem leitor saem |
| a credencial à parte (`username` + `set-password` — decisão da execução, sem número) | **R** | a senha nasce no cadastro do usuário e o login é o e-mail |
| **D40**, **D41**, **D43**, **D90**, **D92**, **D44** (em parte), a lixeira da licença | **AA** | a licença vira quantidade e entregas: sem vaga numerada, sem lixeira, sem reatribuível nem queima, com Encerradas e o "hoje" de Brasília |
| **X**, **D18** (em parte), **AA** (a licença sem trilha) | **AB** | a auditoria de quem fez volta, só no banco: conta, sistema ou login sem sessão, por escrito, numa linha que não se reescreve; os históricos das telas ficam só movimentação |
| **AA** (em parte: a chave em texto), **AB** (em parte: a marca da chave na auditoria) | **AC** | a chave vira lista: cada uma cobre uma quantidade, e a entrega escolhe uma, obrigatória quando a licença tem chaves |
| **AA** (em parte: a renovação de mesmo nome) | **AD** | renovar é editar o vencimento; o fim do suporte vai nas notas, a OEM fica com o computador e o comprovante é o número do pedido |
| **J** (em parte: a entrada e a baixa, a lixeira e a devolução por unidade), **V** (em parte: a lixeira do item na contagem da localização) | **AE** | o estoque segue a lógica da licença: o total é campo da edição, a entrega e a devolução têm dia, a devolução é de N unidades da entrega, e o item que acabou se desativa |
| **AA** (em parte: a aba Encerradas e o Encerrar sem volta na linha) | **AF** | a licença entra no cadastro das Configurações: a encerrada fica na lista, e Encerrar/Reabrir é o Desativar/Ativar dela, com a data; o Editar manda o formulário inteiro em todas as telas |
| **AE** (em parte: só o item nunca entregue se exclui), **AA** (em parte: a licença já entregue não se exclui) | **AG** | o item e a licença excluem pela regra do posto: só o que está em uso recusa, e o passado fica com o nome por escrito; as chaves vão junto com a licença |
| **U** (em parte: o colaborador como aba de Configurações) | **AH** | o menu se agrupa por assunto; o colaborador ganha página própria, na seção Pessoas, e a página Ativos vira Computadores; o cadastro e a API são os mesmos |
| **J** (em parte: o alvo em pessoa ou posto) | **AI** | a categoria ganha o tipo Componente: o item dela vai só para computador, fica nele até o Retirar, e o computador com componente não recebe baixa nem vai para a lixeira |
| **AE** (em parte: o total ao menos 1 sempre), **J** (em parte: toda entrega se devolve) | **AJ** | o consumível é uma categoria cuja entrega não volta; o total é o que existe e chega a 0 |
| **AC** (em parte: a chave já entregue não sai da lista) | **AK** | a chave só prende enquanto tem entrega aberta; as devolvidas com ela perdem a ligação |
| **B**, **Y** (em parte: a porta da restauração) | **AL** | o computador entregue não vai para a lixeira, como não recebe baixa: faça a devolução antes |
| a nota de que a data da entrega nunca vem do cliente | **AM** | a entrega e a devolução do computador têm o dia, como a licença e o estoque; "hoje" é o dia de Brasília em toda data |
| **AA**, **AF** (em parte: encerrar em uso e o alerta dele), **AE** (em parte: desativar com unidade fora), **Y** (em parte: o posto com desativar), **AM** (em parte: o que ficava de fora) | **AN** | o que está em uso bloqueia o Encerrar e o Desativar; o posto perde o Desativar; compra e encerramento não são futuros; o fim da ocupação e a devolução pelo posto ganham o dia |
| o Desativar do catálogo (commit `ff34364`, com a invariante 21), **AF** (em parte: o Desativar em todas as telas), **AN** (em parte: o catálogo que ficava de fora), **Y** (em parte: a localização desativada) | **AO** | categoria, status, fabricante, modelo e localização perdem o Desativar, como no Snipe-IT; a exclusão continua bloqueada pelo uso, e o 409 diz o que tirar |
| o `conceder-administrador` (sem número), **T** (em parte: o "criado à mão") | **AP** | o administrador nasce por comando, como no Snipe-IT: nome, e-mail e senha como parâmetro; serve à instalação nova e a quem perdeu a senha |

Quatro decisões nasceram para resolver **um conflito**:
**D79** (cada job tem a própria linha), **D80** (um `ApiToken` com dono polimórfico), **D81** (uma
cifra para os dois usos) e **D82** (`terminate` não existe; o `offboard` é estendido). Elas estão
arquivadas no assunto que governam, com o conflito original descrito dentro de cada uma.

---

## A segunda rodada (A–P)

O corte do ITAM (D143–D164) foi a **primeira** rodada de de-escopo, com numeração contínua D1–D164.
Depois dela o projeto passou por uma **segunda** rodada — mais de-escopo (O), a forma final da
invariante 19 (B), o retorno do estoque numa forma diferente da que o D153 previu (J) e meia dúzia
de outras decisões que vieram da revisão do que ficou
depois do corte. Elas usam **letra**, não número: a numeração D é contínua porque corresponde à ordem em
que o código citava "invariante N" e "D N" — recomeçá-la nesta rodada criaria colisão com os D's
que o código ainda cita. Letra deixa claro, só pelo nome, que a decisão é desta rodada.

A letra continuou depois dela, pelo mesmo motivo: `Q`, `R`… e, acabado o alfabeto, `AA`, `AB`…

**`N` não existe, de propósito.** As correções de segurança e consistência desta rodada (custo
de compra vazando por uma quarta porta, comando que respondia sucesso sem confirmação do socket,
status padrão do ativo novo, unidade de rede em bit misturada com byte) não são decisão de
arquitetura — são a aplicação de regras já decididas (D77, acima de tudo) em um lugar que tinha
escapado. Ficam só no `git log`, não aqui: decisão registrada sem ser decisão nova é
ruído para quem procura o que mudou de ideia.
