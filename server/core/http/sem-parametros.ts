import { z } from 'zod';

// A ROTA QUE NÃO ACEITA NADA — nem query, nem corpo.
//
// Sem schema nenhum, a rota ignoraria em silêncio o que chegasse: um
// `?state=REJECTED` devolveria as pendentes, e um `{ notes }` na devolução
// pareceria gravado. É a mesma falha muda que o `strictObject` fecha no resto
// da API, então aqui também a chave desconhecida vira 422.
export const SEM_PARAMETROS = z.strictObject({});
