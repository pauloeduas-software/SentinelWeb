# Verificações de banco

SQL que **prova** uma invariante em vez de descrevê-la. Roda numa transação que
termina em `ROLLBACK`: não deixa resíduo, e pode rodar no banco de trabalho.

Existe porque o projeto ainda não tem suíte de testes (`docs/ARQUITETURA.md`) e
porque estas regras vivem no BANCO — um teste de aplicação passaria por cima
delas sem tocá-las.

```bash
docker exec -i sentinel-postgres psql -U sentinel -d sentineldb -q -f - \
  < prisma/verificacoes/posse-invariantes.sql
```

| Arquivo | O que prova |
|---|---|
| `posse-invariantes.sql` | Os 7 cenários do modelo de posse (`docs/MODELO-POSSE.md`): duas pessoas no mesmo posto passam; a mesma pessoa duas vezes falha; duplo checkout falha; a Camada 3 resolve o mouse da Mesa 1 para Laura (manhã) e Ana (tarde); devolver libera nova entrega; e o check-in fecha a linha sem apagar o histórico |

**Como ler o resultado:** os passos marcados `-> esperado: FALHA` devem imprimir
um `ERROR: duplicate key ... um_aberto_por_...`. Ausência de erro ali é a
regressão — significa que o índice parcial sumiu.
