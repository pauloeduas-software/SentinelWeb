import { $Enums } from '@prisma/client';

// AS TRÊS DIVERGÊNCIAS — função pura, sem I/O.
//
// ═════════════════════════════════════════════════════════════════════════════
// POR QUE ELAS SÃO TRÊS, E NÃO UMA.
//
// Antes do modelo de posse, auditar era conferir UM campo: o ativo está onde o
// sistema diz? Com as três camadas do docs/MODELO-POSSE.md, são três perguntas
// que divergem por motivos diferentes e pedem tratamentos diferentes:
//
//   ONDE ESTÁ         `Asset.locationId`      → o sistema CORRIGE
//   DE QUEM É O POSTO a `Assignment` aberta   → o sistema MARCA (D52)
//   QUEM OCUPA        `LocationOccupant`      → o sistema MARCA
//
// Só a primeira é escrita. As outras duas transferem RESPONSABILIDADE, e
// responsabilidade não muda por observação — muda por checkout, que é operação
// com autor, data e nota.
// ═════════════════════════════════════════════════════════════════════════════

/** O que a conferência precisa saber da posse aberta do ativo. */
export interface PosseParaConferencia {
  targetType: $Enums.AssignmentTarget | null;
  targetLocationId: string | null;
  /**
   * Alvo LOCATION sem nenhum ocupante aberto. Vem da Camada 3
   * (`resolverResponsaveis`), nunca recalculado aqui: duas definições de "posto
   * vago" divergiriam no primeiro ajuste, e esta é derivada — não há coluna para
   * empatar a discussão.
   */
  postoVago: boolean;
}

export interface EntradaDaConferencia {
  /** Onde o sistema acha que o ativo está. */
  localAtual: string | null;
  /**
   * Onde o auditor achou. `null` quando ele não informou local — conferir "está
   * aqui, como esperado" não exige repetir o id do lugar.
   */
  localEncontrado: string | null;
  posse: PosseParaConferencia;
}

export interface Divergencias {
  /** O ativo mudou de lugar? É a única que vira escrita. */
  mudouDeLugar: boolean;
  /** O ativo está numa mesa que NÃO é a do alvo da posse. */
  divergenciaDePosse: boolean;
  /** A posse aponta para um posto sem ninguém. */
  postoVago: boolean;
}

/**
 * Onde o ativo está DEPOIS da conferência: o que o auditor achou, ou o que já
 * estava gravado quando ele não informou nada.
 */
export function localDepois(entrada: EntradaDaConferencia): string | null {
  return entrada.localEncontrado ?? entrada.localAtual;
}

export function calcularDivergencias(entrada: EntradaDaConferencia): Divergencias {
  const local = localDepois(entrada);
  const { posse } = entrada;

  // ── DE QUEM É O POSTO ──────────────────────────────────────────────────────
  //
  // Só vale para alvo `LOCATION`, e a restrição é a honesta: com alvo `USER`, o
  // sistema não sabe onde a pessoa está — o notebook da Laura estar na sala de
  // reunião não é divergência nenhuma, é terça-feira. Com alvo `ASSET`, o lugar
  // certo é onde estiver o ativo-detentor, que pode ter se mexido junto.
  //
  // `local` nulo não é divergência: ativo sem localização cadastrada é cadastro
  // incompleto, e a auditoria não inventa o dado que falta.
  const divergenciaDePosse =
    posse.targetType === $Enums.AssignmentTarget.LOCATION
    && posse.targetLocationId !== null
    && local !== null
    && local !== posse.targetLocationId;

  return {
    mudouDeLugar: entrada.localEncontrado !== null && entrada.localEncontrado !== entrada.localAtual,
    divergenciaDePosse,
    postoVago: posse.postoVago,
  };
}
