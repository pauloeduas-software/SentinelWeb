// O mapa `campo` → motivo de um erro da API — função pura, sem I/O.
//
// Mora em `pages/helpers/` porque quem a usa é formulário, e porque `pages` NÃO
// PODE importar `core/api` (o lint recusa): a classe `ErroDaApi` vive lá, e
// checar `instanceof` aqui atravessaria a seta `pages → domain → core`.
//
// Então a leitura é estrutural: qualquer erro que carregue um `fields` de texto
// serve. É a mesma forma do `resumoDaPosse`, que trata a ausência do campo em
// vez de exigir o tipo exato.

/**
 * Extrai `fields` de um erro, ou `{}` quando ele não tem.
 *
 * O `{}` importa: um formulário que espera o mapa e recebe `undefined` teria que
 * tratar o caso em cada `erros[slug]`. Devolvendo sempre um objeto, a ausência
 * de mensagem é simplesmente a ausência da chave.
 */
export function errosPorCampo(erro: unknown): Record<string, string> {
  if (typeof erro !== 'object' || erro === null) return {};

  const fields = (erro as { fields?: unknown }).fields;
  if (typeof fields !== 'object' || fields === null || Array.isArray(fields)) return {};

  const saida: Record<string, string> = {};
  for (const [campo, motivo] of Object.entries(fields)) {
    if (typeof motivo === 'string') saida[campo] = motivo;
  }
  return saida;
}
