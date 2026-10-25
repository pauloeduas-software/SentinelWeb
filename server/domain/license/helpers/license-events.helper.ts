
// A ENTREGA DE LICENÇA COMO EVENTO DE HISTÓRICO — do ativo e da pessoa.
//
// Os dois históricos leem a fonte `LICENCA` da tabela de entregas, cada um só
// com as SUAS (AA): a licença entregue ao computador aparece no computador, a
// entregue à pessoa aparece na pessoa. A forma do evento mora aqui para os dois
// não divergirem.

/** O que um evento de licença acrescenta: QUAL licença entrou ou saiu. */
export interface EventoDeLicenca {
  checkoutId: string;
  licenseId: string;
  licenseLabel: string;
  notes: string | null;
}

interface EntregaParaEvento {
  id: string;
  licenseId: string;
  license: { name: string };
  assignedPerson: { name: string } | null;
  assignedAsset: { assetTag: string; name: string | null } | null;
  checkoutAt: Date;
  checkinAt: Date | null;
  checkoutNotes: string | null;
}

export interface EventoBaseDeLicenca {
  id: string;
  action: 'CHECKOUT' | 'CHECKIN';
  at: Date;
  licenca: EventoDeLicenca;
}

/** Uma entrega vira UM ou DOIS eventos: a entrega sempre, a devolução se houve. */
export function eventosDaEntregaDeLicenca(entrega: EntregaParaEvento): EventoBaseDeLicenca[] {
  const base = {
    checkoutId: entrega.id,
    licenseId: entrega.licenseId,
    licenseLabel: entrega.license.name,
  };

  const saida: EventoBaseDeLicenca = {
    id: `licenca:${entrega.id}:entrega`,
    action: 'CHECKOUT',
    at: entrega.checkoutAt,
    licenca: { ...base, notes: entrega.checkoutNotes },
  };

  if (!entrega.checkinAt) return [saida];

  return [
    {
      id: `licenca:${entrega.id}:devolucao`,
      action: 'CHECKIN',
      at: entrega.checkinAt,
      licenca: { ...base, notes: null },
    },
    saida,
  ];
}
