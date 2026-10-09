import { z } from 'zod';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { peekNextAssetTag, salvarConfiguracaoDaDescoberta } from '../use-cases/app-settings.usecase';
import { lerConfiguracaoDaDescoberta } from '../../reconciliation/helpers/discovery-settings.helper';
import {
  configuracaoDaDescobertaSchema,
  configuracaoDoSistemaSchema,
} from '../schemas/settings.schema';
import {
  lerConfiguracaoDoSistema, salvarConfiguracaoDoSistema,
} from '../helpers/system-settings.helper';
import {
  LIMITE_DA_MARCA_BYTES, MARCAS_VISUAIS, clearBranding, getBrandingPath, setBranding,
  type MarcaVisual,
} from '../use-cases/set-branding.usecase';
import { lerArquivo } from '../../shared/multipart.helper';
import { abrir, existe } from '../../../core/storage/storage';
import { mimeDoArquivo } from '../../../core/storage/mime';
import { AppError } from '../../../core/errors/app-error';

// `:marca` é validada contra a allowlist, nunca usada para montar nome de
// coluna a partir do que chegou — o mapa de `set-branding.usecase.ts` é que faz
// a tradução, e ele é declarado em código.
const marcaParamSchema = z.strictObject({
  marca: z.enum(MARCAS_VISUAIS as [MarcaVisual, ...MarcaVisual[]], 'marca inválida: use logo ou favicon'),
});

export const settingsController = {
  async nextAssetTag() {
    return peekNextAssetTag();
  },

  async getDiscovery() {
    return lerConfiguracaoDaDescoberta();
  },

  async saveDiscovery(request: FastifyRequest) {
    const dados = configuracaoDaDescobertaSchema.parse(request.body ?? {});
    return salvarConfiguracaoDaDescoberta(dados);
  },

  // ── A CONFIGURAÇÃO DE SISTEMA (F10) ──────────────────────────────────────
  //
  // Mesma forma dos dois pares acima — `GET` do recorte, `PUT` com todos os
  // campos opcionais. O que muda é a marca: ela é ARQUIVO, então entra por
  // rota própria em `multipart/form-data` e não pelo JSON do `PUT`.

  async getSystem() {
    return lerConfiguracaoDoSistema();
  },

  async saveSystem(request: FastifyRequest) {
    const dados = configuracaoDoSistemaSchema.parse(request.body ?? {});
    return salvarConfiguracaoDoSistema(dados);
  },

  async setBranding(request: FastifyRequest) {
    const { marca } = marcaParamSchema.parse(request.params);
    const arquivo = await lerArquivo(request, {
      apenasImagem: true,
      limiteBytes: LIMITE_DA_MARCA_BYTES,
    });
    return setBranding(marca, arquivo);
  },

  async clearBranding(request: FastifyRequest) {
    const { marca } = marcaParamSchema.parse(request.params);
    return clearBranding(marca);
  },

  async getBranding(request: FastifyRequest, reply: FastifyReply) {
    const { marca } = marcaParamSchema.parse(request.params);
    const caminho = await getBrandingPath(marca);

    // A MESMA conferência da imagem de ativo, e pelo mesmo motivo: a coluna
    // pode apontar para um arquivo que não está mais no disco (alguém limpou o
    // `UPLOAD_DIR`, ou o backup voltou só o banco). Sem ela o `createReadStream`
    // estouraria DEPOIS de a resposta ter começado, e o cliente receberia uma
    // imagem truncada em vez de um erro.
    if (!(await existe(caminho))) {
      throw new AppError('O arquivo desta marca não está mais no servidor.', 404);
    }

    return reply
      .header('Content-Type', mimeDoArquivo(caminho))
      // `private` e `no-store` como em todo arquivo que sai por rota com
      // sessão (D84): um proxy que guardasse a resposta a entregaria para a
      // próxima pessoa — e aqui ela é pequena e muda pouco, o que torna o
      // cache ainda mais tentador e igualmente errado.
      .header('Cache-Control', 'private, max-age=0, no-store')
      .send(abrir(caminho));
  },
};
