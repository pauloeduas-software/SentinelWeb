# Verificações de banco

SQL que **prova** uma invariante em vez de descrevê-la — ou, quando a regra vive na
aplicação, que **detecta** a linha que a viola. Roda numa transação que termina em
`ROLLBACK`: não deixa resíduo, e pode rodar no banco de trabalho.

Existe porque estas regras vivem no BANCO: um teste de aplicação passaria por
cima delas sem tocá-las. (A frase original dizia "porque o projeto ainda não tem
suíte de testes" — tem, desde a F5: `npm test`, contra Postgres real, ver
`docs/referencia/testes.md`. O que a suíte **não** alcança são os índices parciais e os
CHECKs, porque ela entra pela API, que nunca tenta violá-los.)

```bash
docker exec -i sentinel-postgres psql -U sentinel -d sentineldb -q -f - \
  < prisma/verificacoes/posse-invariantes.sql      # ou baixa.sql
```

`auditoria.sql` é de outro tipo: não prova nem detecta regra — é onde se **consulta** a auditoria,
que tela nenhuma lê (decisão AB). As perguntas recebem variáveis do `psql` (`-v registro=...`,
`-v conta=...`); a forma de chamar está no começo do arquivo.

| Arquivo | O que prova |
|---|---|
| `posse-invariantes.sql` | Os 7 cenários do modelo de posse (`docs/referencia/modelo-de-posse.md`): duas pessoas no mesmo posto passam; a mesma pessoa duas vezes falha; duplo checkout falha; a Camada 3 resolve o mouse da Mesa 1 para Laura (manhã) e Ana (tarde); devolver libera nova entrega; e o check-in fecha a linha sem apagar o histórico |
| `baixa.sql` | **Detecção, não prova.** As regras da baixa vivem na aplicação (`assert-sem-posse.usecase.ts`, `docs/referencia/baixa.md`), e as consultas procuram a linha que escapou delas: ativo baixado ou na lixeira com posse aberta, motivo de baixa sem data (ou data sem motivo), baixa sem o `RETIRE` na auditoria e observação de baixa num ativo que não saiu |
| `auditoria.sql` | **Consulta, não prova.** Quem fez o quê, no horário de Brasília: tudo de um registro (mesmo renomeado), o que uma conta fez e o que aconteceu com ela, busca por pedaço do nome, uma requisição pelo `X-Request-Id`, senha errada e bloqueio por conta, o que o sistema fez sozinho e quem fez quanto |

**Como ler o resultado:** os passos marcados `-> esperado: FALHA` devem imprimir
um `ERROR: duplicate key ... um_aberto_por_...`. Ausência de erro ali é a
regressão — significa que o índice parcial sumiu. Em `baixa.sql` é o contrário: toda consulta
tem que voltar **vazia**, e uma linha ali é escrita que chegou ao banco por fora das guardas —
um `psql` à mão, um script de carga ou uma regressão no use-case.
