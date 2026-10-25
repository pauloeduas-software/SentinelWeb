# Escrever um teste

> Guia. Receita para quem já sabe o que quer fazer — o *porquê* está em
> [`../referencia/testes.md`](../referencia/testes.md) — por que a suíte só fala HTTP, e por que todo teste fala com o banco.

---

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
    targetType: 'PERSON', targetPersonId: cenario.laura,
  });
  expect(status).toBe(201);
});
```

### ⚠️ Montando o cenário DENTRO de cada `it`? Passe um sufixo

```ts
const cenario = await cenarioDePosse(api, ' (posto-vago)');
```

`cenarioDePosse` cria fabricante, posto e dois colaboradores com nomes **fixos**, e os três têm
unicidade no banco (`@unique` em `Manufacturer.name` e `Workstation.name`, índice parcial no e-mail). A
segunda chamada no mesmo arquivo devolve **409 "Registro já existe" vindo de dentro do fixture** — que
se lê como defeito da aplicação, não do teste. Foi exatamente o que escondeu sete dos oito `it` do
arquivo da conferência física (`ciclo-de-vida/auditoria.test.ts`, que saiu com ela no corte de escopo — D144, D157) até a
suíte rodar pela primeira vez.

O sufixo entra no nome do fabricante, do posto e das pessoas; a versão do **e-mail** é sanitizada
dentro do fixture (`' (posto-vago)'` → `laura.posto-vago@teste.local`), porque a parte local de um
e-mail não aceita espaço nem parêntese e o 422 resultante fala de algo que o teste não testa.

O padrão é **vazio**, e continua assim de propósito: `invariantes/posse.test.ts` e
`listagens/historico-da-pessoa.test.ts` comparam os nomes LITERAIS (`'Laura Souza'`,
`'Ana Lima'`, `'Mesa 1'`). Quem chama uma vez não muda nada.

> **Use o nome do caso, não um contador.** `' (posto-vago)'` diz qual `it` produziu o 409; `' (3)'`
> manda você contar `describe`s.

Três regras:

1. **Tudo por HTTP.** O Prisma entra só para **ler** o resultado ou para provar
   uma regra de banco que a API recusa antes (é o caso de
   `invariantes/check-assignment.test.ts` e de `estoque/invariantes.test.ts`, os dois únicos
   que escrevem SQL cru — os `CHECK` da posse e do estoque).
2. **Um `criarApi()` por arquivo**, em `beforeAll` — cada arquivo abre e fecha a sua.
   Isto **já não é** limite de quantas requisições o arquivo pode fazer: o teto do rate
   limit era contado em memória por instância e dividia arquivo por aritmética, e o
   limitador deixou de ser registrado no teste (`server/app.ts`, `comTetoDeRequisicao`).
   Escreva o arquivo pelo assunto; quem prova o teto é `invariantes/teto-de-requisicao.test.ts`
   — o único arquivo que monta duas instâncias, uma de cada montagem, porque o que ele
   prova é a diferença entre as duas.
3. **Sem depender da ordem dos testes.** Os testes do mesmo arquivo compartilham
   banco (semear custa um argon2, e pagá-lo por `it` levaria minutos), então cada
   um cria o que precisa com nome próprio.
4. **Rota nova de escrita entra no teste da auditoria.** `invariantes/auditoria.test.ts`
   passa cada escrita da tela por `auditada()`, que confere a linha em `audit_logs` com o
   número da requisição e a conta da sessão ([AB](../decisoes/acesso.md#ab--a-auditoria-volta-quem-fez-só-no-banco)).
   A rota que ficar fora da lista não é conferida — e a que esquecer a auditoria só aparece ali.
