// OS CAMPOS QUE ENTRAM NO DIFF DO `ActivityLog`.

export const LICENSE_AUDITED = [
  'name', 'seatsTotal', 'reassignable', 'maintained',
  'expirationDate', 'terminationDate',
  'licensedToName', 'licensedToEmail',
  'minSeats',
  'categoryId', 'manufacturerId',
  'orderNumber', 'purchaseDate', 'purchaseCost', 'notes',
] as const;

/** Campos varridos pela busca `?q=`. */
export const LICENSE_SEARCHABLE = [
  'name', 'licensedToName', 'licensedToEmail', 'orderNumber',
] as const;
