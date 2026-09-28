import { prisma } from '../../../core/database/prismaClient';
import { AppError } from '../../../core/errors/app-error';

// ═════════════════════════════════════════════════════════════════════════════
// CONFORMIDADE ALIMENTADA PELO SOFTWARE REALMENTE INSTALADO — o pagamento do D39.
//
// O caminho inteiro, com a forma REAL que a F6 deixou:
//
//   SoftwareInstallation → Endpoint → Asset
//                                       ↕
//     LicenseSeatCheckout (assignedAssetId, checkinAt IS NULL) → LicenseSeat
//                                       ↕
//                          LicenseSoftware → SoftwarePackage
//
// O plano da fase dizia "`LicenseSeat` com alvo `Asset`". A árvore diz outra
// coisa: o assento NÃO aponta para o ativo — quem aponta é a OCUPAÇÃO dele
// (`LicenseSeatCheckout.assignedAssetId`), e só enquanto `checkinAt` é nulo.
// A diferença não é cosmética: é ela que faz "assento devolvido" sair da conta.
//
// E o D39 aparece aqui inteiro: um assento que pudesse ser entregue a um POSTO
// não teria caminho até uma instalação — o posto não roda software. Seria um
// buraco exatamente no relatório que justifica o módulo.
// ═════════════════════════════════════════════════════════════════════════════

export interface MaquinaEmDesconformidade {
  assetId: string;
  assetTag: string;
  assetName: string | null;
  hostname: string | null;
}

export interface Conformidade {
  licenseId: string;
  licenseName: string;
  /** Pacotes que a licença cobre. Vazio = ninguém ligou a licença ao software (D102). */
  pacotes: { id: string; name: string; version: string; publisher: string | null }[];
  /** Instalado numa máquina cujo ativo NÃO tem assento aberto desta licença. */
  instaladoSemAssento: MaquinaEmDesconformidade[];
  /** Assento pago, entregue a um ativo, e o software não está lá. */
  assentoSemInstalacao: MaquinaEmDesconformidade[];
  /**
   * Assentos entregues a PESSOAS. Ficam fora das duas contas de propósito:
   * licença de pessoa segue a pessoa entre máquinas, e cobrá-la de uma máquina
   * específica produziria alarme falso toda vez que alguém trocasse de
   * equipamento.
   */
  assentosDePessoa: number;
  /** `true` quando não há pacote ligado: as listas abaixo não significam nada. */
  semVinculoDeSoftware: boolean;
}

export async function calcularConformidade(licenseId: string): Promise<Conformidade> {
  const licenca = await prisma.license.findFirst({
    where: { id: licenseId },
    select: {
      id: true,
      name: true,
      software: { select: { package: { select: { id: true, name: true, version: true, publisher: true } } } },
    },
  });
  if (!licenca) throw new AppError('Licença não encontrada.', 404);

  const pacotes = licenca.software.map((vinculo) => vinculo.package);

  const [ocupacoes, assentosDePessoa] = await prisma.$transaction([
    prisma.licenseSeatCheckout.findMany({
      where: { checkinAt: null, assignedAssetId: { not: null }, seat: { licenseId } },
      select: { assignedAssetId: true },
    }),
    prisma.licenseSeatCheckout.count({
      where: { checkinAt: null, assignedUserId: { not: null }, seat: { licenseId } },
    }),
  ]);
  const comAssento = new Set(ocupacoes.map((ocupacao) => ocupacao.assignedAssetId!));

  if (pacotes.length === 0) {
    return {
      licenseId: licenca.id,
      licenseName: licenca.name,
      pacotes: [],
      instaladoSemAssento: [],
      assentoSemInstalacao: [],
      assentosDePessoa,
      semVinculoDeSoftware: true,
    };
  }

  // Quem TEM o software instalado, por ativo. `removedAt: null` e `assetId`
  // não nulo: instalação numa máquina sem cadastro é Shadow IT, e a resposta
  // para ela é vincular a máquina, não comprar licença.
  const instalacoes = await prisma.softwareInstallation.findMany({
    where: {
      removedAt: null,
      packageId: { in: pacotes.map((pacote) => pacote.id) },
      endpoint: { assetId: { not: null }, mergedIntoId: null },
    },
    select: {
      endpoint: {
        select: {
          hostname: true,
          asset: { select: { id: true, assetTag: true, name: true } },
        },
      },
    },
  });

  const comInstalacao = new Map<string, MaquinaEmDesconformidade>();
  for (const instalacao of instalacoes) {
    const ativo = instalacao.endpoint.asset;
    if (!ativo) continue;
    comInstalacao.set(ativo.id, {
      assetId: ativo.id,
      assetTag: ativo.assetTag,
      assetName: ativo.name,
      hostname: instalacao.endpoint.hostname,
    });
  }

  const instaladoSemAssento = [...comInstalacao.values()].filter((maquina) => !comAssento.has(maquina.assetId));

  const semInstalacaoIds = [...comAssento].filter((assetId) => !comInstalacao.has(assetId));
  const ativosSemInstalacao = semInstalacaoIds.length === 0 ? [] : await prisma.asset.findMany({
    where: { id: { in: semInstalacaoIds } },
    select: { id: true, assetTag: true, name: true, endpoint: { select: { hostname: true } } },
  });

  return {
    licenseId: licenca.id,
    licenseName: licenca.name,
    pacotes,
    instaladoSemAssento,
    assentoSemInstalacao: ativosSemInstalacao.map((ativo) => ({
      assetId: ativo.id,
      assetTag: ativo.assetTag,
      assetName: ativo.name,
      hostname: ativo.endpoint?.hostname ?? null,
    })),
    assentosDePessoa,
    semVinculoDeSoftware: false,
  };
}

/**
 * Liga (ou desliga) pacotes de software a uma licença — a ponte do D102.
 *
 * O corpo é o CONJUNTO inteiro, não um item: ligar e desligar pela mesma rota
 * evita a pergunta "e se eu mandar o mesmo pacote duas vezes". O que não está na
 * lista é desligado.
 *
 * Desligar apaga a linha da ponte, e só dela: `LicenseSoftware` é um vínculo de
 * configuração, não histórico. Ninguém vai auditar "esta licença já cobriu o
 * Acrobat em março" — o que se audita é assento e instalação, e os dois têm
 * tabela própria com data.
 */
export async function definirSoftwareDaLicenca(licenseId: string, packageIds: string[], actorId: string | null) {
  const licenca = await prisma.license.findFirst({ where: { id: licenseId }, select: { id: true } });
  if (!licenca) throw new AppError('Licença não encontrada.', 404);

  const pacotes = await prisma.softwarePackage.findMany({
    where: { id: { in: packageIds } },
    select: { id: true },
  });
  if (pacotes.length !== packageIds.length) {
    throw new AppError('Um ou mais pacotes de software não foram encontrados.', 404);
  }

  return prisma.$transaction(async (tx) => {
    await tx.licenseSoftware.deleteMany({ where: { licenseId, packageId: { notIn: packageIds } } });

    if (packageIds.length > 0) {
      await tx.licenseSoftware.createMany({
        data: packageIds.map((packageId) => ({ licenseId, packageId, createdById: actorId })),
        skipDuplicates: true,
      });
    }

    return tx.licenseSoftware.findMany({
      where: { licenseId },
      select: { package: { select: { id: true, name: true, version: true, publisher: true } } },
    });
  });
}

// O SOFTWARE DE UMA MÁQUINA morava aqui e passou para
// `get-asset-machine.usecase.ts`. Este arquivo responde "esta licença está sendo
// cumprida?"; aquele responde "o que é esta máquina?" — e a aba Máquina cresceu
// para mostrar especificação e mudança de hardware junto com a lista de
// programas. Vizinhança de tabela (`SoftwareInstallation`) não é vizinhança de
// assunto.
