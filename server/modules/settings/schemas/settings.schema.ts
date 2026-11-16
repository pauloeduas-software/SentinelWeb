import { z } from 'zod';

// Contrato da configuração da descoberta.
//
// Os tetos e os pisos não são decoração: são o que impede uma configuração de
// transformar o painel inteiro em alarme. `ghostDays: 0` faria toda a frota
// contar como sumida no dia seguinte.
const inteiroEntre = (rotulo: string, min: number, max: number) =>
  z
    .number(`${rotulo} deve ser um número`)
    .int(`${rotulo} deve ser um número inteiro`)
    .min(min, `${rotulo}: mínimo de ${min}`)
    .max(max, `${rotulo}: máximo de ${max}`);

export const configuracaoDaDescobertaSchema = z.strictObject({
  discoveryMode: z.enum(['OFF', 'SUGGEST', 'ON'], 'modo de descoberta inválido').optional(),
  ghostDays: inteiroEntre('dias sem contato', 1, 365).optional(),
});
