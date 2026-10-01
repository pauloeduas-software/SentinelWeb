import type { ImportTarget } from '@prisma/client';
import { BOM, celula } from '../../shared/csv.helper';
import { camposDoAlvo, chavesDoAlvo } from '../helpers/import-fields.helper';

// O MODELO DE CSV BAIXÁVEL (F10, Etapas D e E).
//
// POR QUE ELE EXISTE: a alternativa é a pessoa descobrir os cabeçalhos pelo
// erro. O modelo leva os títulos na ordem certa, com UMA linha de exemplo — e a
// linha de exemplo é o que transforma "AAAA-MM-DD" de instrução em demonstração.
//
// ELE É GERADO DO MESMO `camposDoAlvo()` que valida o mapeamento, então não
// existe a versão do modelo que diverge da allowlist: acrescentar um campo
// aceito muda o arquivo baixado no mesmo commit.

/** Um valor de exemplo por campo. Nada aqui vai para o banco. */
const EXEMPLOS: Record<string, string> = {
  assetTag: 'ATV-00042',
  serial: 'SN123456789',
  name: 'Notebook da diretoria',
  model: 'Latitude 5420',
  manufacturer: 'Dell',
  status: 'Em uso',
  location: 'Mesa 1',
  supplier: 'Loja do Hardware',
  orderNumber: 'NF-9912',
  purchaseDate: '2024-03-15',
  purchaseCost: '4350.90',
  warrantyMonths: '36',
  notes: 'Comprado no lote do financeiro',
  responsavel: 'laura@empresa.com',
  checkoutAt: '2024-03-20',

  email: 'laura@empresa.com',
  department: 'Financeiro',

  local: 'Mesa 1',
  colaborador: 'laura@empresa.com',
  turno: 'manhã',
  inicio: '2024-03-01',
  fim: '',
};

export function modeloDeCsv(target: ImportTarget, delimitador: string): string {
  const campos = camposDoAlvo(target);

  const cabecalho = campos.map((campo) => celula(campo.rotulo, delimitador)).join(delimitador);
  const exemplo = campos
    .map((campo) => celula(EXEMPLOS[campo.token] ?? '', delimitador))
    .join(delimitador);

  return `${BOM}${cabecalho}\r\n${exemplo}\r\n`;
}

/** Para a tela montar o `<select>` de mapeamento sem conhecer o servidor. */
export function camposParaATela(target: ImportTarget) {
  return {
    target,
    chaves: chavesDoAlvo(target),
    campos: camposDoAlvo(target).map((campo) => ({
      token: campo.token,
      rotulo: campo.rotulo,
      obrigatorioNaCriacao: campo.obrigatorioNaCriacao ?? false,
      chave: campo.chave ?? false,
      ajuda: campo.ajuda ?? null,
      exemplo: EXEMPLOS[campo.token] ?? null,
    })),
  };
}
