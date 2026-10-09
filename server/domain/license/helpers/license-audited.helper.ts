// OS CAMPOS QUE ENTRAM NO DIFF DO `ActivityLog`.

export const LICENSE_AUDITED = [
  'name', 'seatsTotal', 'reassignable', 'maintained',
  'expirationDate', 'terminationDate',
  'licensedToName', 'licensedToEmail',
  'minSeats',
  'categoryId', 'manufacturerId', 'supplierId',
  'orderNumber', 'purchaseDate', 'purchaseCost', 'notes',
] as const;

/** Allowlist de ordenação, exigida pelo `core/http/list-query.ts`. */
export const LICENSE_SORTABLE = [
  'name', 'seatsTotal', 'expirationDate', 'purchaseDate', 'createdAt',
] as const;

/** Campos varridos pela busca `?q=`. */
export const LICENSE_SEARCHABLE = [
  'name', 'licensedToName', 'licensedToEmail', 'orderNumber',
] as const;
