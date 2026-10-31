// O que de um colaborador sai para o cliente quando vem EMBUTIDO numa posse,
// numa ocupação ou numa entrega de estoque — em UM lugar só.
//
// Mora no domínio `person` de propósito: quem decide o que é público de um
// colaborador é o dono dele, não quem o embute na resposta. Espelha o contrato
// de src/types/person.types.ts.
export const PERSON_PUBLIC_SELECT = {
  id: true,
  name: true,
  email: true,
  createdAt: true,
} as const;

// O MESMO colaborador, mais o estado do vínculo com a empresa e as notas — para
// a FICHA.
//
// Separado do de cima porque o de cima vai embutido em toda posse e toda
// ocupação, e `isActive` e as notas viajariam em cada linha de histórico de todo
// ativo para serem usados numa tela só.
export const PERSON_DETAIL_SELECT = {
  ...PERSON_PUBLIC_SELECT,
  isActive: true,
  notes: true,
} as const;
