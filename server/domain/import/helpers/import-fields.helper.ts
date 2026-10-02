import type { ImportTarget } from '@prisma/client';
import { AppError } from '../../../core/errors/app-error';

// OS CAMPOS QUE CADA ALVO ACEITA (F10, Etapa D) — a allowlist do mapeamento.
//
// ═════════════════════════════════════════════════════════════════════════════
// O MAPEAMENTO É `{ cabeçalho do CSV → token }`, E O TOKEN VEM DAQUI.
//
// É o mesmo desenho do D67: o cliente escolhe TOKEN, nunca nome de coluna do
// banco. Um mapeamento que aceitasse `{ 'Etiqueta': 'passwordHash' }` escreveria
// na coluna que o token nomeia — e o import é o caminho mais largo que existe
// para escrever no banco: milhares de linhas, um clique.
//
// POR QUE A CHAVE DE ATUALIZAÇÃO É DECLARADA, E NÃO ADIVINHADA.
//
// Sem declarar, o importador teria que escolher sozinho como reconhecer uma
// linha já existente — e a escolha natural (o nome) está errada: duas pessoas
// se chamam "Ana Silva", e dois notebooks se chamam "Notebook da TI". Casar por
// nome num arquivo de 500 linhas funde cadastros diferentes, e o estrago só
// aparece quando alguém procura o equipamento de uma das duas Anas.
// ═════════════════════════════════════════════════════════════════════════════

export interface CampoDeImport {
  token: string;
  /** O que a tela mostra ao lado do `<select>` de mapeamento. */
  rotulo: string;
  /** Sem ele, a linha NOVA não pode ser criada. */
  obrigatorioNaCriacao?: boolean;
  /** Serve como chave de atualização. */
  chave?: boolean;
  /** A frase da ajuda — o formato esperado, quando não é texto livre. */
  ajuda?: string;
}

const CAMPOS: Record<ImportTarget, CampoDeImport[]> = {
  ASSETS: [
    { token: 'assetTag', rotulo: 'Etiqueta', chave: true, ajuda: 'Vazio: o sistema gera a próxima da sequência.' },
    { token: 'serial', rotulo: 'Nº de série', chave: true },
    { token: 'name', rotulo: 'Nome' },
    {
      token: 'model',
      rotulo: 'Modelo',
      obrigatorioNaCriacao: true,
      ajuda: 'O nome exato do modelo cadastrado. Dois fabricantes com modelo de mesmo nome exigem a coluna Fabricante.',
    },
    { token: 'manufacturer', rotulo: 'Fabricante', ajuda: 'Só para desambiguar o modelo.' },
    { token: 'status', rotulo: 'Status', ajuda: 'O nome exato do rótulo. Vazio: o primeiro status disponível.' },
    { token: 'location', rotulo: 'Localização' },
    { token: 'supplier', rotulo: 'Fornecedor' },
    { token: 'orderNumber', rotulo: 'Nº do pedido' },
    { token: 'purchaseDate', rotulo: 'Data de compra', ajuda: 'AAAA-MM-DD.' },
    { token: 'purchaseCost', rotulo: 'Custo de compra', ajuda: 'Número com ponto decimal: 1234.50.' },
    { token: 'warrantyMonths', rotulo: 'Garantia (meses)' },
    { token: 'notes', rotulo: 'Observações' },
    {
      token: 'responsavel',
      rotulo: 'Responsável (e-mail)',
      ajuda: 'O e-mail do colaborador. A posse entra como ENTREGA, nunca como campo do ativo (D17).',
    },
    {
      token: 'checkoutAt',
      rotulo: 'Entregue em',
      ajuda: 'AAAA-MM-DD. Vazio: hoje. Só vale com a coluna Responsável preenchida.',
    },
  ],

  USERS: [
    { token: 'email', rotulo: 'E-mail', obrigatorioNaCriacao: true, chave: true },
    { token: 'name', rotulo: 'Nome', obrigatorioNaCriacao: true },
    {
      token: 'department',
      rotulo: 'Departamento',
      // A COLUNA CONTINUA SENDO O NOME, e não o id — ninguém digita uuid em
      // planilha. Desde a F11 (Etapa D) o departamento é entidade, e o
      // importador resolve nome → id na hora de planejar.
      //
      // NOME DESCONHECIDO É LINHA RECUSADA, nunca departamento criado: um typo
      // (`Comercail`) criaria um cadastro ao lado do certo, e daí em diante o
      // relatório por departamento mentiria sem erro nenhum ter acontecido. É a
      // mesma recusa do D132 para e-mail ambíguo.
      ajuda: 'O nome exato do departamento, já cadastrado. Nome desconhecido recusa a linha.',
    },
  ],

  OCCUPANTS: [
    { token: 'local', rotulo: 'Local', obrigatorioNaCriacao: true, ajuda: 'O nome exato da localização (ele é único).' },
    { token: 'colaborador', rotulo: 'Colaborador (e-mail)', obrigatorioNaCriacao: true },
    { token: 'turno', rotulo: 'Turno' },
    { token: 'inicio', rotulo: 'Início', ajuda: 'AAAA-MM-DD. Vazio: hoje.' },
    {
      token: 'fim',
      rotulo: 'Fim',
      ajuda: 'AAAA-MM-DD. Preenchido ENCERRA a ocupação; vazio não encerra nada.',
    },
  ],
};

export function camposDoAlvo(target: ImportTarget): CampoDeImport[] {
  return CAMPOS[target];
}

// ─────────────────────────────────────────────────────────────────────────────
// OS CAMPOS CUSTOMIZADOS NO IMPORT (F9, o item que esperava a F10).
//
// ═════════════════════════════════════════════════════════════════════════════
// SÓ EM `ASSETS`, E SÓ OS NÃO CIFRADOS.
//
// Só em ativos porque é só o ativo que tem `customFields` (F9): pessoa, ocupação
// e estoque não têm a coluna, e oferecer o token nos outros alvos seria oferecer um
// mapeamento que o adaptador ignora em silêncio.
//
// E O CIFRADO FICA DE FORA, com o mesmo argumento do export invertido: ali o
// problema é o segredo SAIR num arquivo; aqui é ele ENTRAR por um. Uma planilha com
// a senha da BIOS de trezentas máquinas em texto, passando por e-mail e ficando no
// `Downloads` de quem a montou, é a pior forma possível de carregar segredo — e o
// caminho certo já existe: o campo no formulário do ativo, um por vez, cifrado na
// gravação.
//
// ⚠️ A VALIDAÇÃO DE FORMATO NÃO ACONTECE AQUI, e isso é reuso e não omissão: o
// adaptador monta `customFields` e entrega ao `createAsset`/`updateAsset`, que
// chamam o MESMO `validarCamposCustomizados()` do formulário (F9). Uma validação
// própria no importador seria uma segunda regra para IP, MAC e regex — e a segunda
// divergiria da primeira no primeiro ajuste.
// ═════════════════════════════════════════════════════════════════════════════

/** Um campo customizado, como o mapeamento o oferece. */
export interface CampoCustomizadoDeImport {
  slug: string;
  name: string;
  encrypted: boolean;
}

/** O prefixo do token — o MESMO do export de CSV (`cf:`). */
const PREFIXO_CF = 'cf:';

/**
 * Os campos customizados que o alvo aceita, já como `CampoDeImport`.
 *
 * Alvo que não é `ASSETS` devolve lista vazia, e cifrado é filtrado aqui — nos dois
 * casos o token simplesmente não existe, então o mapeamento que o mandar recebe o
 * 422 de "campo desconhecido" com a lista dos válidos.
 */
export function camposCustomizadosDoAlvo(
  target: ImportTarget,
  campos: readonly CampoCustomizadoDeImport[],
): CampoDeImport[] {
  if (target !== 'ASSETS') return [];

  return campos
    .filter((campo) => !campo.encrypted)
    .map((campo) => ({
      token: `${PREFIXO_CF}${campo.slug}`,
      rotulo: campo.name,
      ajuda: 'Campo customizado. O valor é validado pelo formato do campo, como no formulário.',
    }));
}

/** O slug dentro do token, ou `null` quando o token não é de campo customizado. */
export function slugDoTokenDeImport(token: string): string | null {
  return token.startsWith(PREFIXO_CF) ? token.slice(PREFIXO_CF.length) : null;
}

export function chavesDoAlvo(target: ImportTarget): string[] {
  return CAMPOS[target].filter((campo) => campo.chave).map((campo) => campo.token);
}

export interface MapeamentoValidado {
  /** `{ cabeçalho do CSV → token }`, já conferido contra a allowlist. */
  colunas: Record<string, string>;
  /**
   * O token que reconhece uma linha existente — e ele é OPCIONAL porque um dos
   * três alvos não tem chave de uma coluna só.
   *
   * ═══════════════════════════════════════════════════════════════════════════
   * EM `OCCUPANTS` A IDENTIDADE É O PAR (local, colaborador), E ELA JÁ ESTÁ NO
   * BANCO.
   *
   * O índice `location_occupants_um_aberto_por_pessoa_local` recusa a segunda
   * ocupação ABERTA do mesmo par. Pedir uma "chave" ali seria inventar uma
   * terceira resposta para uma pergunta que o banco já responde — e qualquer
   * coluna sozinha (só o local, só a pessoa) estaria errada: uma mesa tem dois
   * ocupantes, e uma pessoa ocupa dois postos.
   *
   * Em `ASSETS` e `USERS` a chave é obrigatória e declarada, nunca adivinhada:
   * a escolha natural (o nome) está errada, porque duas pessoas se chamam "Ana
   * Silva" e dois notebooks se chamam "Notebook da TI".
   * ═══════════════════════════════════════════════════════════════════════════
   */
  chave?: string;
}

/**
 * Confere o mapeamento contra a allowlist do alvo e contra os cabeçalhos do
 * arquivo.
 *
 * AS QUATRO RECUSAS:
 *
 *   token desconhecido        → 422 com a lista dos válidos (D67);
 *   token repetido            → 422: duas colunas do CSV escrevendo no mesmo
 *                               campo é ambiguidade, e a última venceria em
 *                               silêncio;
 *   cabeçalho que não existe  → 422: mapear "Etiqueta" num arquivo cujo
 *                               cabeçalho é "etiqueta " (com espaço) produziria
 *                               uma coluna sempre vazia;
 *   chave não mapeada         → 422: sem a coluna da chave no arquivo, toda
 *                               linha seria tratada como nova.
 */
export function validarMapeamento(
  target: ImportTarget,
  mapeamento: MapeamentoValidado,
  cabecalhos: readonly string[],
  /**
   * Os campos customizados do sistema, para os tokens `cf:<slug>` (F9/F10).
   *
   * Por PARÂMETRO porque esta função é pura e tem teste puro
   * (`tests/importacao/mapeamento.puro.test.ts`): quem consulta o banco é o
   * use-case do dry-run, uma vez por arquivo. Lista vazia é o sistema sem campo
   * customizado nenhum, e aí todo `cf:` é desconhecido — que é a verdade.
   */
  camposCustomizados: readonly CampoCustomizadoDeImport[] = [],
): MapeamentoValidado {
  const validos = new Set([
    ...CAMPOS[target].map((campo) => campo.token),
    ...camposCustomizadosDoAlvo(target, camposCustomizados).map((campo) => campo.token),
  ]);
  const tokens = Object.values(mapeamento.colunas);

  const desconhecidos = tokens.filter((token) => !validos.has(token));
  if (desconhecidos.length > 0) {
    throw new AppError(
      `Campo desconhecido no mapeamento: ${desconhecidos.join(', ')}. `
        + `Válidos para ${target}: ${[...validos].join(', ')}.`,
      422,
      { validos: [...validos] },
    );
  }

  const repetidos = tokens.filter((token, indice) => tokens.indexOf(token) !== indice);
  if (repetidos.length > 0) {
    throw new AppError(
      `Duas colunas do arquivo estão mapeadas para o mesmo campo: ${[...new Set(repetidos)].join(', ')}.`,
      422,
    );
  }

  const ausentes = Object.keys(mapeamento.colunas).filter((titulo) => !cabecalhos.includes(titulo));
  if (ausentes.length > 0) {
    throw new AppError(
      `O arquivo não tem a coluna "${ausentes.join('", "')}". Cabeçalhos encontrados: `
        + `"${cabecalhos.join('", "')}".`,
      422,
      { cabecalhos: [...cabecalhos] },
    );
  }

  const chavesAceitas = chavesDoAlvo(target);

  if (chavesAceitas.length === 0) {
    // `OCCUPANTS`: a identidade é o PAR, garantida por índice único parcial. Uma
    // chave mandada aqui seria ignorada em silêncio, e silêncio é o que este
    // projeto recusa.
    if (mapeamento.chave) {
      throw new AppError(
        `${target} não usa chave de atualização: a linha é identificada pelo par `
          + '(local, colaborador), e a unicidade da ocupação aberta é do banco.',
        422,
      );
    }
  } else {
    if (!mapeamento.chave || !chavesAceitas.includes(mapeamento.chave)) {
      throw new AppError(
        `Chave de atualização inválida: ${mapeamento.chave ?? '(ausente)'}. `
          + `Para ${target}, use ${chavesAceitas.join(' ou ')}.`,
        422,
      );
    }

    if (!tokens.includes(mapeamento.chave)) {
      throw new AppError(
        `A chave de atualização (${mapeamento.chave}) precisa estar entre as colunas mapeadas — `
          + 'sem ela, toda linha do arquivo seria tratada como um cadastro novo.',
        422,
      );
    }
  }

  const obrigatorios = CAMPOS[target].filter((campo) => campo.obrigatorioNaCriacao);
  const faltando = obrigatorios.filter((campo) => !tokens.includes(campo.token));
  if (faltando.length > 0 && target !== 'ASSETS') {
    // Em `ASSETS` a ausência é tolerada no MAPEAMENTO e cobrada por LINHA: um
    // arquivo que só atualiza custo de ativos já cadastrados não precisa da
    // coluna Modelo, e exigi-la ali tornaria a atualização impossível. Nos
    // outros dois alvos, não há atualização sem os campos obrigatórios.
    throw new AppError(
      `Falta mapear: ${faltando.map((campo) => campo.rotulo).join(', ')}.`,
      422,
    );
  }

  return mapeamento;
}

/**
 * A linha do CSV traduzida para tokens.
 *
 * Valor com espaço nas pontas vem de planilha e é erro de digitação, não dado:
 * `trim` em tudo. Célula vazia NÃO entra no objeto — é a diferença entre "não
 * mexa neste campo" e "apague este campo", e um import que apaga o que a
 * planilha não trouxe destruiria cadastro em massa (é a mesma regra da ausência
 * de linha: o arquivo com 300 das 500 pessoas não demite 200).
 */
export function mapearLinha(
  valores: Record<string, string>,
  mapeamento: MapeamentoValidado,
): Record<string, string> {
  const mapeada: Record<string, string> = {};

  for (const [titulo, token] of Object.entries(mapeamento.colunas)) {
    const valor = (valores[titulo] ?? '').trim();
    if (valor !== '') mapeada[token] = valor;
  }

  return mapeada;
}
