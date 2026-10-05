# Escrever um teste

> Guia. Receita para quem já sabe o que quer fazer — o *porquê* está em
> [`../referencia/testes.md`](../referencia/testes.md) — por que a suíte só fala HTTP, e o que é `puro` × `banco`.

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
    targetType: 'USER', targetUserId: cenario.laura,
  });
  expect(status).toBe(201);
});
```

### ⚠️ Montando o cenário DENTRO de cada `it`? Passe um sufixo

```ts
const cenario = await cenarioDePosse(api, ' (posto-vago)');
```

`cenarioDePosse` cria fabricante, posto e dois colaboradores com nomes **fixos**, e os três têm
unicidade no banco (`@unique` em `Manufacturer.name` e `Location.name`, índice parcial no e-mail). A
segunda chamada no mesmo arquivo devolve **409 "Registro já existe" vindo de dentro do fixture** — que
se lê como defeito da aplicação, não do teste. Foi exatamente o que escondeu sete dos oito `it` de
`ciclo-de-vida/auditoria.test.ts` até a suíte rodar pela primeira vez.

O sufixo entra no nome do fabricante, do posto e das pessoas; a versão do **e-mail** é sanitizada
dentro do fixture (`' (posto-vago)'` → `laura.posto-vago@teste.local`), porque a parte local de um
e-mail não aceita espaço nem parêntese e o 422 resultante fala de algo que o teste não testa.

O padrão é **vazio**, e continua assim de propósito: `invariantes/posse.test.ts`,
`aceite/fluxo.test.ts` e `listagens/historico-da-pessoa.test.ts` comparam os nomes LITERAIS
(`'Laura Souza'`, `'Ana Lima'`, `'Mesa 1'`). Quem chama uma vez não muda nada.

> **Use o nome do caso, não um contador.** `' (posto-vago)'` diz qual `it` produziu o 409; `' (3)'`
> manda você contar `describe`s.

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
