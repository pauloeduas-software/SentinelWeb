import { z } from 'zod';

// Contrato da configuração da descoberta (F7).
//
// Os tetos e os pisos não são decoração: são o que impede uma configuração de
// transformar o painel inteiro em alarme. `ghostDays: 0` faria toda a frota
// virar fantasma no dia seguinte; `shadowHours: 0` faria cada máquina nova
// nascer como Shadow IT antes de o primeiro handshake terminar de chegar.
const inteiroEntre = (rotulo: string, min: number, max: number) =>
  z
    .number(`${rotulo} deve ser um número`)
    .int(`${rotulo} deve ser inteiro`)
    .min(min, `${rotulo}: mínimo de ${min}`)
    .max(max, `${rotulo}: máximo de ${max}`);

export const configuracaoDaDescobertaSchema = z.strictObject({
  discoveryMode: z.enum(['OFF', 'SUGGEST', 'ON'], 'modo de descoberta inválido').optional(),
  ghostDays: inteiroEntre('dias para ativo fantasma', 1, 365).optional(),
  shadowHours: inteiroEntre('horas para Shadow IT', 1, 720).optional(),
});
