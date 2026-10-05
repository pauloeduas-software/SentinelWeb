# Acrescentar uma invariante

> Guia. Receita para quem já sabe o que quer fazer — o *porquê* está em
> [`../referencia/invariantes.md`](../referencia/invariantes.md) — inclusive a tabela que decide entre **banco** e **aplicação**.

---

1. Decida a coluna da tabela lá em cima. Na dúvida entre as duas: **banco**.
2. Se for de aplicação, ela mora no use-case **dentro da transação** de quem
   grava, nunca no controller — o controller não é o único caminho até o dado.
3. Escreva a mensagem antes do código. Se a mensagem não ensina o que fazer em
   seguida, a regra ainda não está entendida.
4. Acrescente a linha na tabela do começo do arquivo — e corrija o número no
   título dela. Referir-se a ela por "As onze" era o que fazia esta instrução
   apontar para um título que não existia mais a cada fase.
