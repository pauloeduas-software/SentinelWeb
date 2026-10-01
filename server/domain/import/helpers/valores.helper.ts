import { AppError } from '../../../core/errors/app-error';

// OS VALORES DE UMA CÉLULA (F10, Etapa D).
//
// Toda função daqui LANÇA `AppError` com a frase que vai para a linha do
// relatório — e é o motor do import que a transforma em `ImportRow.message`. O
// texto fala do CABEÇALHO que a pessoa mapeou, não do token interno: quem lê o
// relatório está olhando a planilha dele.
//
// O FORMATO ACEITO É O QUE O EXPORT ESCREVE (D69): data ISO e número com ponto.
// Isso faz o round-trip fechar — exportar, editar no Excel e reimportar. E o
// `,` decimal é aceito também, porque é o que o Excel em português escreve numa
// célula de número formatada, e recusá-lo transformaria a ida e volta num
// trabalho de localizar e substituir.

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const BRASILEIRA = /^(\d{2})\/(\d{2})\/(\d{4})$/;

/**
 * Dia de calendário, à meia-noite UTC.
 *
 * O mesmo instante que `dataOpcional` do zod constrói (shared/fields.schema.ts),
 * e pelo mesmo motivo: data de compra é DIA, não instante, e
 * `new Date('2026-09-22T00:00')` seria hora local — num fuso a oeste de
 * Greenwich a data gravada voltaria um dia.
 *
 * Aceita `DD/MM/AAAA` além do ISO porque é o que a planilha brasileira mostra, e
 * uma recusa aqui mandaria a pessoa reformatar a coluna inteira. Mas o formato
 * ambíguo (`01/10/2026` × `10/01/2026`) é resolvido como DIA/MÊS, que é o que
 * aquela planilha significa — e a ajuda da coluna pede ISO justamente para quem
 * não quer depender dessa escolha.
 */
export function dataDoCsv(valor: string, rotulo: string): Date {
  if (ISO.test(valor)) {
    const data = new Date(`${valor}T00:00:00.000Z`);
    if (Number.isNaN(data.getTime())) {
      throw new AppError(`${rotulo}: "${valor}" não é uma data válida.`, 422);
    }
    return data;
  }

  const brasileira = BRASILEIRA.exec(valor);
  if (brasileira) {
    const [, dia, mes, ano] = brasileira;
    const data = new Date(`${ano}-${mes}-${dia}T00:00:00.000Z`);
    if (Number.isNaN(data.getTime())) {
      throw new AppError(`${rotulo}: "${valor}" não é uma data válida.`, 422);
    }
    // `2026-02-31` vira 3 de março no `Date`, sem erro. A conferência de volta
    // é o que transforma isso em recusa em vez de um dia errado no cadastro.
    if (data.toISOString().slice(0, 10) !== `${ano}-${mes}-${dia}`) {
      throw new AppError(`${rotulo}: o dia ${valor} não existe no calendário.`, 422);
    }
    return data;
  }

  throw new AppError(`${rotulo}: use o formato AAAA-MM-DD (ou DD/MM/AAAA). Recebido: "${valor}".`, 422);
}

/**
 * Dinheiro como STRING, do começo ao fim.
 *
 * Mesma regra do `valorMonetario` do zod: o Prisma aceita string num campo
 * `Decimal`, e converter para `number` no caminho reintroduziria o erro de
 * centavo que a coluna existe para evitar.
 *
 * Aceita `1.234,50` (o que o Excel em pt-BR escreve) e `1234.50` (o que o
 * export escreve). O ponto de milhar só é removido quando há vírgula decimal —
 * senão `1.234` seria lido como mil duzentos e trinta e quatro, e `1.5` como
 * quinze.
 */
export function dinheiroDoCsv(valor: string, rotulo: string): string {
  const limpo = valor.replace(/\s|R\$/g, '');
  const normalizado = limpo.includes(',') ? limpo.replace(/\./g, '').replace(',', '.') : limpo;

  if (!/^\d{1,10}(\.\d{1,2})?$/.test(normalizado)) {
    throw new AppError(
      `${rotulo}: use um valor como 1234.50. Recebido: "${valor}".`,
      422,
    );
  }
  return normalizado;
}

export function inteiroDoCsv(valor: string, rotulo: string, min = 0, max = 1_200): number {
  if (!/^-?\d+$/.test(valor)) {
    throw new AppError(`${rotulo}: "${valor}" não é um número inteiro.`, 422);
  }

  const numero = Number(valor);
  if (numero < min || numero > max) {
    throw new AppError(`${rotulo}: use um número entre ${min} e ${max}. Recebido: ${numero}.`, 422);
  }
  return numero;
}

/**
 * E-mail, normalizado para minúsculas.
 *
 * O casamento de pessoa é por e-mail (nunca por nome), e `Ana@Empresa.com` no
 * CSV tem de achar `ana@empresa.com` no cadastro — senão o import cria uma
 * segunda Ana e a planilha "funciona" duplicando gente.
 */
export function emailDoCsv(valor: string, rotulo: string): string {
  const email = valor.trim().toLowerCase();

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 200) {
    throw new AppError(`${rotulo}: "${valor}" não é um e-mail válido.`, 422);
  }
  return email;
}
