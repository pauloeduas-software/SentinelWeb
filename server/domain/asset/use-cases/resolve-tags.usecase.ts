import { prisma } from '../../../core/database/prismaClient';
import { idDaUrlDoPainel } from './global-search.usecase';

// RESOLVER UMA LISTA DE ETIQUETAS BIPADAS (F10, Etapa G).
//
// ═════════════════════════════════════════════════════════════════════════════
// POR QUE UMA ROTA PARA A LISTA, E NÃO N CHAMADAS À BUSCA.
//
// O gesto real da tela de etiquetas é bipar vinte e quatro equipamentos em
// sequência — uma folha cheia — ou colar uma coluna do Excel. Vinte e quatro
// chamadas a `/api/search` resolveriam, e seriam vinte e quatro viagens para uma
// pergunta que é UMA: "quais destes existem?".
//
// E a resposta precisa dizer o que NÃO achou. Uma lista de ids silenciosamente
// menor que a lista bipada faria a folha sair com 22 etiquetas de 24 bipes, e a
// pessoa só descobriria conferindo adesivo por adesivo.
//
// A PRIORIDADE É A MESMA DA BUSCA DO LEITOR: QR, etiqueta, série. Duas ordens
// diferentes para o mesmo bipe fariam o campo do cabeçalho e esta tela
// discordarem sobre o que é um acerto.
// ═════════════════════════════════════════════════════════════════════════════

/** Teto: a folha maior do sistema tem 500 etiquetas. */
const MAX_TERMOS = 500;

export interface AtivoResolvido {
  id: string;
  assetTag: string;
  name: string | null;
  serial: string | null;
}

export interface Resolucao {
  encontrados: AtivoResolvido[];
  /** O que foi bipado e não existe. A tela mostra para a pessoa conferir. */
  naoEncontrados: string[];
}

const SELECT = { id: true, assetTag: true, name: true, serial: true } as const;

export async function resolveTags(termos: readonly string[]): Promise<Resolucao> {
  // Sem `trim` agressivo e sem normalizar: zero à esquerda é parte da etiqueta.
  // O que sai são linhas vazias (o Excel cola uma no fim) e a repetição — bipar
  // o mesmo equipamento duas vezes é descuido, não um pedido de duas etiquetas.
  const limpos = [...new Set(termos.map((termo) => termo.trim()).filter(Boolean))]
    .slice(0, MAX_TERMOS);

  if (limpos.length === 0) return { encontrados: [], naoEncontrados: [] };

  // O QR vem antes: quem bipa o QR no campo manda a URL inteira.
  const idsDeQr = new Map<string, string>();
  for (const termo of limpos) {
    const id = idDaUrlDoPainel(termo);
    if (id) idsDeQr.set(id, termo);
  }

  // UMA consulta para os três caminhos. `findMany` com `OR` de três `in` é uma
  // varredura por índice em cada um, e não três viagens ao banco.
  const achados = await prisma.asset.findMany({
    where: {
      OR: [
        { id: { in: [...idsDeQr.keys()] } },
        { assetTag: { in: limpos } },
        { serial: { in: limpos } },
      ],
    },
    select: SELECT,
  });

  // A ORDEM É A DO PEDIDO: a folha sai na ordem em que os equipamentos foram
  // bipados, porque é nessa ordem que a pessoa vai conferir os adesivos.
  const porTermo = new Map<string, AtivoResolvido>();
  for (const ativo of achados) {
    porTermo.set(ativo.assetTag, ativo);
    if (ativo.serial) porTermo.set(ativo.serial, ativo);

    const termoDoQr = idsDeQr.get(ativo.id);
    if (termoDoQr) porTermo.set(termoDoQr, ativo);
  }

  const encontrados: AtivoResolvido[] = [];
  const naoEncontrados: string[] = [];
  const jaIncluidos = new Set<string>();

  for (const termo of limpos) {
    const ativo = porTermo.get(termo);

    if (!ativo) {
      naoEncontrados.push(termo);
      continue;
    }
    // O MESMO ativo bipado pela etiqueta e pela série aparece UMA vez: são dois
    // termos para um equipamento, e duas etiquetas iguais na folha é desperdício
    // de adesivo.
    if (jaIncluidos.has(ativo.id)) continue;

    jaIncluidos.add(ativo.id);
    encontrados.push(ativo);
  }

  return { encontrados, naoEncontrados };
}
