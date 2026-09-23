import PDFDocument from 'pdfkit';

// O PDF DO TERMO — `pdfkit`, sem Chromium.
//
// Um headless browser seriam ~300 MB de imagem e um processo a mais para
// produzir uma página A4. O `pdfkit` desenha no próprio processo.
//
// GERADO NO INSTANTE DO ACEITE E GUARDADO, nunca regenerado sob demanda (D30).
// Regenerar montaria o documento com os dados de HOJE — o ativo pode ter mudado
// de nome, de local e de dono —, e um PDF que se recalcula não prova nada. É o
// D29 (o EULA copiado) aplicado ao arquivo.

export interface DadosDoTermo {
  assetTag: string;
  assetName: string | null;
  modelo: string;
  serial: string | null;
  signerName: string;
  signerEmail: string;
  /** Para quem a posse foi aberta — pode ser o posto, e não o signatário (D27). */
  alvo: string;
  eulaSnapshot: string;
  acceptedAt: Date;
  /** PNG da assinatura como data URL, vindo do `<canvas>`. */
  assinaturaPng: Buffer | null;
}

function dataHoraBR(data: Date): string {
  const iso = data.toISOString();
  const [ano, mes, dia] = iso.slice(0, 10).split('-');
  return `${dia}/${mes}/${ano} às ${iso.slice(11, 16)} (UTC)`;
}

/**
 * Desenha o termo e devolve os bytes.
 *
 * `Promise<Buffer>` em vez de stream porque o arquivo precisa estar INTEIRO
 * antes de ser gravado: o `storage.gravar` recebe bytes, e gravar um PDF pela
 * metade deixaria um documento ilegível com aparência de assinado.
 */
export function gerarTermoPdf(dados: DadosDoTermo): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 56 });
    const pedacos: Buffer[] = [];

    doc.on('data', (pedaco: Buffer) => pedacos.push(pedaco));
    doc.on('end', () => resolve(Buffer.concat(pedacos)));
    doc.on('error', reject);

    doc.fontSize(16).text('Termo de responsabilidade', { align: 'center' });
    doc.moveDown(1.5);

    doc.fontSize(10);
    linha(doc, 'Equipamento', dados.assetName ? `${dados.assetTag} — ${dados.assetName}` : dados.assetTag);
    linha(doc, 'Modelo', dados.modelo);
    if (dados.serial) linha(doc, 'Número de série', dados.serial);
    linha(doc, 'Entregue a', dados.alvo);
    doc.moveDown(1);

    doc.fontSize(9).text(dados.eulaSnapshot, { align: 'justify' });
    doc.moveDown(2);

    doc.fontSize(10);
    linha(doc, 'Aceito por', dados.signerName);
    linha(doc, 'E-mail', dados.signerEmail);
    linha(doc, 'Data do aceite', dataHoraBR(dados.acceptedAt));

    if (dados.assinaturaPng) {
      doc.moveDown(1);
      doc.fontSize(9).text('Assinatura:');
      // `fit` e não largura fixa: o `<canvas>` do navegador varia de tamanho com
      // a tela, e uma imagem esticada faria a assinatura parecer outra.
      doc.image(dados.assinaturaPng, { fit: [220, 90] });
    }

    doc.end();
  });
}

function linha(doc: PDFKit.PDFDocument, rotulo: string, valor: string): void {
  doc.text(`${rotulo}: `, { continued: true }).text(valor);
}
