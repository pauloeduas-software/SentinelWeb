import { prisma } from '../../../core/database/prismaClient';
import { AppError } from '../../../core/errors/app-error';
import { apagar, gravar } from '../../../core/storage/storage';
import type { ArquivoRecebido } from '../../shared/multipart.helper';
import { APP_SETTING_ID } from '../helpers/app-setting.helper';
import { lerConfiguracaoDoSistema, type ConfiguracaoDoSistema } from '../helpers/system-settings.helper';

// A MARCA — logo e favicon (F10, Etapa A).
//
// POR QUE NÃO ENTROU NO `set-image.usecase.ts` DA F2: lá o desenho é "uma
// coluna `imagePath` por linha de quatro tabelas", e a chave é o `id`. Aqui são
// DUAS colunas na MESMA linha, e a linha é fixa (`singleton`). Encaixar isto
// naquele delegate exigiria um alvo que não tem `imagePath` e um id que não
// varia — a função ficaria com dois casos que não se parecem.
//
// O QUE É COMPARTILHADO de verdade mora em `core/storage/` (os bytes, D83) e em
// `domain/shared/multipart.helper.ts` (as recusas da borda). Isto aqui é só a
// coluna.
//
// NÃO HÁ `ActivityLog`, e é a escolha das outras duas telas de configuração
// (descoberta, F7; alertas, F8): nenhuma grava trilha. Elas são mais
// consequentes que esta — desligar `alertsEnabled` cala o sino inteiro — e o
// projeto decidiu que configuração global não tem aba Histórico para mostrar o
// log. Acrescentar trilha só para a logo seria a terceira regra.

/** Teto da marca. Logo de empresa não tem 10 MB; favicon tem 15 KB. */
export const LIMITE_DA_MARCA_BYTES = 2 * 1024 * 1024;

const MARCAS = {
  logo: { coluna: 'logoPath', rotulo: 'Logo' },
  favicon: { coluna: 'faviconPath', rotulo: 'Favicon' },
} as const;

export type MarcaVisual = keyof typeof MARCAS;
export const MARCAS_VISUAIS = Object.keys(MARCAS) as MarcaVisual[];

/**
 * Troca o caminho na coluna e devolve o anterior, para quem chama apagar o
 * arquivo DEPOIS do commit.
 *
 * `upsert` e não `update` pelo mesmo motivo do resto do domínio: um banco
 * restaurado de backup antigo pode não ter a linha, e o primeiro upload de logo
 * não deve falhar com um 404 apontando para uma tabela que ninguém conhece.
 */
async function trocarCaminho(
  marca: MarcaVisual,
  novoCaminho: string | null,
): Promise<{ anterior: string | null; configuracao: ConfiguracaoDoSistema }> {
  const coluna = MARCAS[marca].coluna;

  const antes = await lerConfiguracaoDoSistema();

  const configuracao = await prisma.appSetting.update({
    where: { id: APP_SETTING_ID },
    data: { [coluna]: novoCaminho },
    select: {
      companyName: true,
      logoPath: true,
      faviconPath: true,
      primaryColor: true,
      locale: true,
      dateFormat: true,
      currency: true,
      csvDelimiter: true,
      backupRetentionDays: true,
    },
  });

  return { anterior: antes[coluna], configuracao };
}

/**
 * Grava o arquivo e aponta a coluna para ele.
 *
 * A ORDEM É A DO ANEXO (F2): arquivo primeiro, linha depois, e o arquivo novo
 * é apagado se a linha falhar. Gravar a linha primeiro deixaria, numa falha de
 * disco, a tela pedindo uma imagem que o download responde 404.
 *
 * O ARQUIVO ANTIGO SAI DEPOIS do `update`. Apagá-lo antes deixaria a coluna
 * apontando para um arquivo que não existe mais caso a gravação da linha
 * falhasse — e a tela mostraria um quadrado quebrado sem ninguém ter feito nada.
 */
export async function setBranding(
  marca: MarcaVisual,
  arquivo: ArquivoRecebido,
): Promise<ConfiguracaoDoSistema> {
  const gravado = await gravar('imagens', arquivo.mimeType, arquivo.bytes);

  let resultado;
  try {
    resultado = await trocarCaminho(marca, gravado.path);
  } catch (erro) {
    await apagar(gravado.path);
    throw erro;
  }

  await apagar(resultado.anterior);
  return resultado.configuracao;
}

/** Remove a marca: a coluna volta a `null` e o arquivo sai do disco. */
export async function clearBranding(marca: MarcaVisual): Promise<ConfiguracaoDoSistema> {
  const { anterior, configuracao } = await trocarCaminho(marca, null);
  await apagar(anterior);
  return configuracao;
}

/**
 * O caminho relativo da marca, para a rota que a transmite.
 *
 * 404 quando a coluna está nula: "não há logo configurada" é uma resposta, e a
 * tela desenha o nome da empresa em texto. Devolver `null` daqui faria o
 * controller decidir o status, que é a escolha que este use-case já tomou.
 */
export async function getBrandingPath(marca: MarcaVisual): Promise<string> {
  const configuracao = await lerConfiguracaoDoSistema();
  const caminho = configuracao[MARCAS[marca].coluna];

  if (!caminho) throw new AppError(`${MARCAS[marca].rotulo} não configurada.`, 404);
  return caminho;
}
