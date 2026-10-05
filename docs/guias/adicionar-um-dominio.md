# Adicionar um domínio

> Guia. Receita para quem já sabe o que quer fazer — o *porquê* está em
> [`../referencia/arquitetura.md`](../referencia/arquitetura.md).

---

```
server/domain/licenca/
├── licenca.maestro.ts                      # as rotas
├── controllers/licenca.controller.ts       # entrada/saída HTTP
└── use-cases/list-licencas.usecase.ts      # o que o negócio faz
```

1. Escreva o use-case primeiro (é o que tem teste e regra).
2. O controller só converte requisição ↔ use-case.
3. O maestro só lista rotas.
4. Registre em **`app.ts`** (não em `server.ts`): `await LicencaMaestro.setupRoutes(server);`
5. No front: `src/domain/licenca/licenca.store.ts` + `src/pages/<contexto>/`.

---

## Quando quebrar em `use-cases/`

Os quatro domínios de hoje já têm o esqueleto completo. Para um domínio **novo**,
comece simples e quebre quando um dos dois acontecer:

1. o arquivo do domínio passar de ~250 linhas; **ou**
2. a mesma operação for chamada de **dois lugares** (rota + job, rota + WebSocket).

O critério 2 é o que importa de verdade. Exemplo real: `touchAsset` é chamada
pelo hub do agente a cada mensagem e o `markStaleAssetsOffline` pelo job — por
isso são use-cases, não linhas soltas dentro da rota.

Não crie `controllers/` + `use-cases/` para um CRUD de quatro linhas só por
simetria: três arquivos para `prisma.x.findMany()` é cerimônia, não arquitetura.
