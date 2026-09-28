import { z } from 'zod';
import { uuidObrigatorio, uuidOpcional, textoOpcional } from '../../shared/fields.schema';

// Contrato de entrada das rotas de reconciliação.
//
// `strictObject` como no resto do sistema: campo desconhecido vira 422 em vez de
// gravação silenciosa. Aqui isso fecha uma porta específica — não existe jeito
// de mandar `state: 'ACCEPTED'` pelo corpo e fechar uma sugestão sem executar o
// que ela propõe.

export const filtroDeSugestoesSchema = z.strictObject({
  state: z.enum(['PENDING', 'ACCEPTED', 'REJECTED', 'SUPERSEDED']).optional(),
  kind: z.enum(['LINK', 'MERGE', 'CHECKOUT', 'OCCUPANCY', 'SHARED_POST']).optional(),
  endpointId: uuidOpcional('máquina'),
  assetId: uuidOpcional('ativo'),
});

/**
 * O que a pessoa pode ACRESCENTAR ao aceitar.
 *
 * Existe por causa do `SHARED_POST`: o sistema propõe promover a máquina a posto
 * compartilhado, mas quem decide QUAL posto é gente — pode ser um que já existe
 * e que o sistema não teria como adivinhar. Vazio, vale o que a sugestão propôs.
 */
export const aceiteSchema = z.strictObject({
  locationId: uuidOpcional('posto'),
  shift: textoOpcional('turno', 60),
});

export const vinculoSchema = z.strictObject({
  assetId: uuidObrigatorio('ativo'),
});

export const triagemSchema = z.strictObject({
  reviewState: z.enum(['UNREVIEWED', 'ALLOWED', 'BLOCKED'], 'situação inválida'),
});

export const fusaoSchema = z.strictObject({
  intoEndpointId: uuidObrigatorio('máquina de destino'),
});

/**
 * A ponte licença↔pacote (D102).
 *
 * O corpo é o CONJUNTO inteiro. Teto de 50 pacotes por licença: uma licença que
 * cobre mais que isso não é uma licença, é uma suíte — e suíte se cadastra como
 * licenças separadas, senão a conformidade não sabe dizer qual produto falta.
 */
export const softwareDaLicencaSchema = z.strictObject({
  packageIds: z.array(uuidObrigatorio('pacote')).max(50, 'no máximo 50 pacotes por licença'),
});

/** `?dias=` da lista de ociosos. Não é `strictObject` — ver o filtro de máquinas. */
export const janelaDeOciosidadeSchema = z.object({
  dias: z.coerce.number().int().min(1, 'dias: mínimo de 1').max(365, 'dias: máximo de 365').default(30),
});

/**
 * `?q=` e `?limite=` do catálogo de software descoberto.
 *
 * O teto de 200 é o mesmo raciocínio do `MAX_PER_PAGE` do `list-query`: sem ele,
 * `?limite=999999` manda o Postgres montar o catálogo inteiro de uma frota de
 * 500 máquinas em memória — e um catálogo de software é a maior tabela que esta
 * fase cria. A lista existe para alimentar um seletor com busca, não para
 * exportar o inventário.
 */
export const buscaDePacotesSchema = z.object({
  q: z.string().trim().max(200, 'busca: máximo de 200 caracteres').optional(),
  limite: z.coerce.number().int().min(1, 'limite: mínimo de 1').max(200, 'limite: máximo de 200').default(100),
});
