import { prisma } from '../../../core/database/prismaClient';

// O CATÁLOGO DE SOFTWARE DESCOBERTO — a lista de onde a ponte do D102 escolhe.
//
// ═════════════════════════════════════════════════════════════════════════════
// SEM ESTA ROTA, A CONFORMIDADE NÃO EXISTIA NA PRÁTICA.
//
// A Etapa G entregou `PUT /api/licenses/:id/software` (ligar licença a pacote) e
// `GET /api/licenses/:id/compliance` (o relatório). Faltava a pergunta do meio:
// *quais pacotes existem para eu ligar?* Sem ela, `LicenseSoftware` era uma
// tabela sem caminho de escrita a partir da tela, e `calcularConformidade`
// devolvia `semVinculoDeSoftware: true` para sempre — relatório que nunca sai do
// estado vazio, com todo o motor por baixo funcionando.
//
// É o mesmo defeito que a suíte desta casa nasceu para pegar (docs/TESTES.md, o
// "defeito 1"): funcionalidade verificada pelo caminho da API e inalcançável
// pelo caminho do formulário.
// ═════════════════════════════════════════════════════════════════════════════

export interface PacoteDoCatalogo {
  id: string;
  name: string;
  version: string;
  publisher: string | null;
  /** Em quantas máquinas ele está instalado AGORA. É o que ordena a lista. */
  instalacoes: number;
}

/**
 * Os pacotes, dos mais instalados para os menos.
 *
 * **ORDENA POR INSTALAÇÃO, e não por nome**, porque a pergunta de quem abre esta
 * lista é "que licença eu preciso amarrar primeiro". O catálogo de uma frota real
 * tem milhares de linhas (cada runtime, cada atualização de segurança, cada
 * driver), e em ordem alfabética as primeiras cem são todas `7-Zip` e
 * `Adobe AIR` — nenhuma delas é a que alguém está tentando ligar a um contrato.
 *
 * `removedAt: null` na contagem: pacote desinstalado da frota inteira aparece
 * com zero e continua na lista, porque a licença dele pode continuar paga — e é
 * justamente esse cruzamento que a conformidade responde.
 */
export async function listarPacotesDeSoftware(
  busca?: string,
  limite = 100,
): Promise<{ total: number; rows: PacoteDoCatalogo[] }> {
  // A busca vale para os três campos porque é assim que se procura software: às
  // vezes pelo nome, às vezes pelo fabricante ("o que é da Autodesk?"), e às
  // vezes pela versão, quando o contrato é de uma só.
  const where = busca
    ? {
      OR: [
        { name: { contains: busca, mode: 'insensitive' as const } },
        { publisher: { contains: busca, mode: 'insensitive' as const } },
        { version: { contains: busca, mode: 'insensitive' as const } },
      ],
    }
    : {};

  const [total, pacotes] = await prisma.$transaction([
    prisma.softwarePackage.count({ where }),
    prisma.softwarePackage.findMany({
      where,
      select: {
        id: true,
        name: true,
        version: true,
        publisher: true,
        _count: { select: { installations: { where: { removedAt: null } } } },
      },
      // O `_count` não é ordenável no Prisma quando ele é filtrado, então a
      // ordenação final acontece em memória — sobre `limite` linhas, não sobre o
      // catálogo. O `orderBy` daqui é o que torna a página determinística.
      orderBy: [{ name: 'asc' }, { version: 'asc' }],
      take: limite,
    }),
  ]);

  const rows = pacotes
    .map((pacote) => ({
      id: pacote.id,
      name: pacote.name,
      version: pacote.version,
      publisher: pacote.publisher,
      instalacoes: pacote._count.installations,
    }))
    .sort((a, b) => b.instalacoes - a.instalacoes || a.name.localeCompare(b.name, 'pt-BR'));

  return { total, rows };
}

/**
 * Os pacotes já ligados a uma licença, para a tela abrir com o que existe.
 *
 * Separado da consulta de conformidade de propósito: o formulário precisa da
 * lista ligada para marcar as caixas, e o relatório precisa dela para cruzar
 * instalações. Chamar `calcularConformidade` só para preencher um seletor
 * pagaria duas varreduras de instalação por abertura de modal.
 */
export async function listarSoftwareDaLicenca(licenseId: string): Promise<PacoteDoCatalogo[]> {
  const vinculos = await prisma.licenseSoftware.findMany({
    where: { licenseId },
    select: {
      package: {
        select: {
          id: true,
          name: true,
          version: true,
          publisher: true,
          _count: { select: { installations: { where: { removedAt: null } } } },
        },
      },
    },
  });

  return vinculos
    .map(({ package: pacote }) => ({
      id: pacote.id,
      name: pacote.name,
      version: pacote.version,
      publisher: pacote.publisher,
      instalacoes: pacote._count.installations,
    }))
    .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
}
