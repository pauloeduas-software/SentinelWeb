// MUDANÇA DE HARDWARE **DETECTADA**, e não digitada — função pura.
//
// ═════════════════════════════════════════════════════════════════════════════
// A `AssetChange` nasceu na Etapa B desta fase e ficou SEM ESCRITOR: a tabela
// existia, o índice existia, e nenhuma linha entrava nela. Tabela sem escritor
// não é meio caminho andado — é uma promessa no schema que a tela não cumpre, e
// é o mesmo defeito que o `installedSoftware` tinha antes da Etapa G (três
// ocorrências no código, todas de escrita).
//
// Este arquivo é a comparação, e ele é PURO de propósito: a regra sobre o que
// conta como mudança é a coisa que mais vai mudar com dado real de campo, e ela
// tem que ser testável sem banco nem handshake.
// ═════════════════════════════════════════════════════════════════════════════

/**
 * As especificações que o agente coleta e que valem a pena vigiar.
 *
 * `hostname` fica **fora**: ele muda por renomeação administrativa, não por
 * alguém abrir a máquina, e enchê-la de linhas de `AssetChange` faria a tabela
 * responder a pergunta errada. `lastSeen`, `status` e `loggedOnUser` também
 * ficam fora — os três mudam a cada mensagem e já têm lugar próprio.
 */
export interface EspecificacoesColetadas {
  manufacturer: string | null;
  hardwareModel: string | null;
  chassisType: string | null;
  biosSerial: string | null;
  systemUuid: string | null;
  cpuModel: string | null;
  osVersion: string | null;
  ramTotalBytes: bigint | null;
  diskTotalBytes: bigint | null;
}

export interface MudancaDetectada {
  field: keyof EspecificacoesColetadas;
  oldValue: string;
  newValue: string;
}

/**
 * Os campos vigiados, em ordem de leitura humana.
 *
 * Lista explícita e não `Object.keys`: ela é a allowlist do que vira linha de
 * histórico, e um campo novo no `Endpoint` não deve começar a gerar linhas só
 * por ter sido acrescentado ao model.
 */
const VIGIADOS: (keyof EspecificacoesColetadas)[] = [
  'manufacturer', 'hardwareModel', 'chassisType',
  'biosSerial', 'systemUuid', 'cpuModel', 'osVersion',
  'ramTotalBytes', 'diskTotalBytes',
];

function comoTexto(valor: string | bigint | null): string | null {
  if (valor === null) return null;
  const texto = typeof valor === 'bigint' ? valor.toString() : valor.trim();
  return texto.length > 0 ? texto : null;
}

/**
 * O que mudou entre o que estava gravado e o que o handshake acabou de trazer.
 *
 * **TRÊS COISAS NÃO SÃO MUDANÇA, e cada uma por um motivo diferente:**
 *
 * 1. **`null` → valor.** É a PRIMEIRA COLETA daquele campo, não uma troca de
 *    peça. O rollout do agente C# vai produzir isso às centenas no mesmo dia —
 *    500 máquinas ganhando `biosSerial` de uma vez —, e gravar tudo como
 *    "mudança de hardware" transformaria o histórico de cada ativo num relatório
 *    de deploy. Quem quer saber quando o campo apareceu tem o `ActivityLog` do
 *    vínculo.
 *
 * 2. **valor → `null`.** É o D106 do lado da detecção: o `registerHandshake`
 *    não APAGA o que o agente velho não sabe (`?? undefined`), então o campo
 *    ausente nem chega aqui como null — mas se chegasse, "não sei" não é
 *    "sumiu". Afirmar que a máquina perdeu a RAM porque a coleta falhou é a
 *    pior forma de errar: ninguém tem como contestar.
 *
 * 3. **Diferença só de espaço ou de caixa vazia.** `'  Dell  '` e `'Dell'` são o
 *    mesmo fabricante, e `''` é ausência escrita de outro jeito.
 */
export function mudancasDeHardware(
  antes: EspecificacoesColetadas,
  depois: EspecificacoesColetadas,
): MudancaDetectada[] {
  const mudancas: MudancaDetectada[] = [];

  for (const field of VIGIADOS) {
    const velho = comoTexto(antes[field]);
    const novo = comoTexto(depois[field]);

    if (velho === null || novo === null) continue;
    if (velho === novo) continue;

    mudancas.push({ field, oldValue: velho, newValue: novo });
  }

  return mudancas;
}
