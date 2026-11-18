// A MÁQUINA VISTA DE OUTRAS TELAS — a aba Máquina e os links de uma recusa
// apontam para ela, como `caminhoDoItem` faz com o item de estoque.

/** O endereço de uma máquina: a ficha dela em Agentes (DF). */
export function caminhoDaMaquina(endpointId: string): string {
  return `/agentes/${endpointId}`;
}

/** Uma placa de vídeo, já lida do `Gpus` que o agente manda em PascalCase. */
interface PlacaDeVideo {
  nome: string;
  /** Em bytes. Nula na placa integrada e quando o driver não diz. */
  memoria: number | null;
}

function texto(origem: Record<string, unknown>, nome: string): string | null {
  const valor = origem[nome];
  return typeof valor === 'string' && valor.trim() ? valor : null;
}

/** A lista `Gpus` da máquina; o que não tiver nome não aparece. */
export function lerPlacasDeVideo(cru: unknown): PlacaDeVideo[] {
  if (!Array.isArray(cru)) return [];
  return cru.flatMap((item) => {
    if (!item || typeof item !== 'object') return [];
    const origem = item as Record<string, unknown>;
    const nome = texto(origem, 'Name');
    if (!nome) return [];
    const memoria = Number(origem.MemoryBytes);
    return [{ nome, memoria: Number.isFinite(memoria) && memoria > 0 ? memoria : null }];
  });
}

/** A memória da placa: "12 GB", "1,5 GB" ou "512 MB". */
export function formatarMemoriaDaPlaca(bytes: number): string {
  const gb = bytes / 1024 ** 3;
  if (gb >= 1) return `${Number.isInteger(gb) ? gb : gb.toFixed(1).replace('.', ',')} GB`;
  return `${Math.round(bytes / 1024 ** 2)} MB`;
}
