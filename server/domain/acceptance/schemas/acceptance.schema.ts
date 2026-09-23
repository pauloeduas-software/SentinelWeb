import { z } from 'zod';
import { textoOpcional } from '../../shared/fields.schema';

// O contrato da página PÚBLICA de aceite. `strictObject` como o resto do
// sistema — e aqui ele vale mais: esta é a única rota sem sessão do domínio.

/**
 * O token na URL.
 *
 * Validado com regex, não só por comprimento: um `:token` que chega com
 * caractere fora do alfabeto base64url é ruído ou tentativa, e recusá-lo aqui
 * evita uma consulta ao banco por requisição inválida — que é o que transforma
 * varredura de token em carga.
 */
export const tokenParamSchema = z.strictObject({
  token: z.string().regex(/^[A-Za-z0-9_-]{43}$/, 'token inválido'),
});

/** Assinatura como data URL de PNG, vinda do `<canvas>.toDataURL()`. */
const assinatura = z
  .string()
  .regex(/^data:image\/png;base64,[A-Za-z0-9+/=]+$/, 'assinatura inválida')
  // ~1 MB de base64 é muito mais do que um rabisco de canvas precisa, e o teto
  // impede que o campo vire canal de upload sem passar pela allowlist de MIME.
  .max(1_400_000, 'assinatura grande demais');

export const acceptSchema = z.strictObject({
  /**
   * Opcional: aceitar sem desenhar continua sendo aceitar.
   *
   * O registro que prova o aceite é a LINHA — `acceptedAt`, com o token de uso
   * único que só quem recebeu o e-mail tinha. A imagem é reforço documental,
   * não a prova; exigi-la deixaria de fora quem abre o link pelo celular com a
   * tela quebrada, e a resposta a isso não pode ser "então não assina".
   */
  assinatura: assinatura.optional(),
});

export const declineSchema = z.strictObject({
  motivo: textoOpcional('motivo da recusa', 500),
});

/** `?view=` do relatório de aceites, no painel. */
export const acceptanceViewQuerySchema = z.strictObject({
  view: z.enum(['pendentes', 'aceitos', 'recusados', 'obsoletos', 'todos'], 'view inválida').default('pendentes'),
});
