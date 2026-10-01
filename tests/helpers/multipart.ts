// O CORPO `multipart/form-data` MONTADO À MÃO — é o que o navegador manda.
//
// POR QUE À MÃO E NÃO COM UMA BIBLIOTECA: o `app.inject()` recebe `payload` e
// `headers`, e o que precisa ser exercitado é exatamente o que chega pelo fio —
// o boundary, o `Content-Disposition` com `filename`, o `Content-Type` da parte.
// Uma biblioteca montaria isso e esconderia justamente a borda que a rota lê.
//
// MORA EM `helpers/` porque três pastas de teste precisam do mesmo corpo: anexo
// e imagem (F2), a marca da configuração e o CSV do importador (F10). Copiado,
// um deles acabaria com um boundary que o `@fastify/multipart` aceita e outro
// não, e a diferença apareceria como "a rota recusou o arquivo".

export interface CorpoMultipart {
  payload: Buffer;
  headers: Record<string, string>;
}

/**
 * Um arquivo no campo `file`, que é o nome que todas as rotas de upload leem.
 *
 * `campos` são os campos de TEXTO que vão junto — o `target` e o `mapping` do
 * importador. Eles entram ANTES do arquivo porque é essa a ordem que um
 * `<form>` produz, e o handler lê o arquivo de dentro do fluxo: um campo
 * declarado depois do arquivo chegaria tarde para quem já decidiu o que fazer
 * com os bytes.
 */
export function corpoMultipart(
  nome: string,
  tipo: string,
  bytes: Buffer,
  campos: Record<string, string> = {},
): CorpoMultipart {
  const limite = '----sentinelteste';
  const partes: Buffer[] = [];

  for (const [chave, valor] of Object.entries(campos)) {
    partes.push(
      Buffer.from(
        `--${limite}\r\nContent-Disposition: form-data; name="${chave}"\r\n\r\n${valor}\r\n`,
        'utf8',
      ),
    );
  }

  partes.push(
    Buffer.from(
      `--${limite}\r\nContent-Disposition: form-data; name="file"; filename="${nome}"\r\n`
        + `Content-Type: ${tipo}\r\n\r\n`,
      'utf8',
    ),
    bytes,
    Buffer.from(`\r\n--${limite}--\r\n`, 'utf8'),
  );

  return {
    payload: Buffer.concat(partes),
    headers: { 'content-type': `multipart/form-data; boundary=${limite}` },
  };
}

/** Um PNG de 1×1, válido de verdade — o menor arquivo de imagem possível. */
export const PNG_1x1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
);

/** Um PDF mínimo. Serve para provar que a rota de IMAGEM o recusa. */
export const PDF_MINIMO = Buffer.from('%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF\n', 'utf8');
