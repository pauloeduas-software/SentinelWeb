import { prisma } from '../../../core/database/prismaClient';
import { AppError } from '../../../core/errors/app-error';
import { addLocationOccupant } from '../../occupancy/use-cases/add-location-occupant.usecase';
import { endLocationOccupancy } from '../../occupancy/use-cases/end-location-occupancy.usecase';
import { updateOccupantShift } from '../../occupancy/use-cases/update-occupant-shift.usecase';
import type { Adaptador, PlanoDaLinha } from '../helpers/plano.types';
import { dataDoCsv, emailDoCsv } from '../helpers/valores.helper';

// A IMPORTAÇÃO DE OCUPAÇÃO DE POSTO (F10, Etapa E).
//
// ═════════════════════════════════════════════════════════════════════════════
// É A IMPORTAÇÃO MAIS PERIGOSA DAS TRÊS, E O MOTIVO NÃO É O QUE ELA ESCREVE.
//
// Ela escreve em `location_occupants`, e nada mais. Mas quem responde por um
// ativo entregue a um POSTO são os ocupantes abertos daquele posto
// (docs/MODELO-POSSE.md, Camada 3) — então acrescentar uma linha aqui muda quem
// responde por TODO equipamento daquela mesa, sem tocar em uma `Assignment`
// sequer.
//
// É exatamente o que o modelo promete ("chega um headset na mesa: zero linhas,
// herda os dois responsáveis") e é o que torna um nome de mesa errado em 300
// linhas uma transferência de responsabilidade do andar inteiro.
//
// POR ISSO O DRY-RUN CONTA O EFEITO: quantos ativos passam a ter responsável
// resolvido e quantos deixam de ter. Esse número é o que denuncia a coluna
// trocada ANTES de alguém clicar em aplicar — nenhuma outra informação do
// relatório revelaria isso, porque linha por linha o arquivo parece correto.
//
// A IDEMPOTÊNCIA NÃO É ESCRITA AQUI: ELA ESTÁ NO BANCO.
//
// O índice `location_occupants_um_aberto_por_pessoa_local` recusa a segunda
// ocupação ABERTA do mesmo par (local, pessoa). O importador traduz o `P2002`
// em "já existente, ignorada" em vez de erro — reimportar o mesmo arquivo é
// seguro por construção, não por checagem.
// ═════════════════════════════════════════════════════════════════════════════

interface Pessoa {
  id: string;
  name: string;
  isActive: boolean;
}

/** O que o arquivo faz com cada posto — a base da contagem do efeito. */
interface EfeitoNoLocal {
  abre: number;
  encerra: number;
}

export function adaptadorDeOcupacao(): Adaptador {
  const localPorNome = new Map<string, { id: string; name: string }>();
  const pessoaPorEmail = new Map<string, Pessoa | null>();
  /** Por `locationId`: quantas ocupações o arquivo abriria e quantas encerraria. */
  const efeitos = new Map<string, EfeitoNoLocal>();

  async function buscarLocal(nome: string) {
    if (!localPorNome.has(nome)) {
      // `Location.name` é `@unique`, então o nome É chave — é o que o plano da
      // fase afirma e o schema confirma. A busca é insensível a caixa com
      // `take: 2` porque o índice único é sensível: "Mesa 1" e "mesa 1" podem
      // coexistir, e escolher uma das duas seria sorteio.
      const achados = await prisma.location.findMany({
        where: { name: { equals: nome, mode: 'insensitive' } },
        select: { id: true, name: true },
        take: 2,
      });

      if (achados.length === 0) {
        throw new AppError(
          `Localização "${nome}" não está cadastrada. Cadastre o posto antes de importar a `
            + 'ocupação dele — criar localização a partir de uma planilha de ocupação encheria a '
            + 'árvore de locais com erro de digitação.',
          422,
        );
      }
      if (achados.length > 1) {
        throw new AppError(
          `Existe mais de uma localização chamada "${nome}", diferindo só em maiúsculas e `
            + 'minúsculas. Unifique o cadastro antes de importar.',
          422,
        );
      }

      localPorNome.set(nome, achados[0]);
    }

    return localPorNome.get(nome)!;
  }

  async function buscarPessoa(email: string) {
    if (!pessoaPorEmail.has(email)) {
      // `findFirst` e não `findUnique`: a unicidade de `User.email` é índice
      // PARCIAL (`WHERE deleted_at IS NULL`), que o Prisma não conhece. E é o
      // `findFirst` que recebe o escopo da lixeira, então só acha quem vive.
      pessoaPorEmail.set(email, await prisma.user.findFirst({
        where: { email },
        select: { id: true, name: true, isActive: true },
      }));
    }

    const pessoa = pessoaPorEmail.get(email) ?? null;
    if (!pessoa) {
      throw new AppError(
        `Não há colaborador com o e-mail "${email}". Importe as pessoas antes da ocupação.`,
        422,
      );
    }
    if (!pessoa.isActive) {
      throw new AppError(
        `O colaborador "${pessoa.name}" está desligado e não pode ocupar um posto — `
          + 'ocupar é assumir responsabilidade por tudo que está na mesa.',
        422,
      );
    }
    return pessoa;
  }

  function contar(locationId: string, campo: keyof EfeitoNoLocal) {
    const atual = efeitos.get(locationId) ?? { abre: 0, encerra: 0 };
    atual[campo] += 1;
    efeitos.set(locationId, atual);
  }

  async function planejar(linha: Record<string, string>): Promise<PlanoDaLinha> {
    if (!linha.local) throw new AppError('A coluna do local está vazia.', 422);
    if (!linha.colaborador) throw new AppError('A coluna do colaborador está vazia.', 422);

    const local = await buscarLocal(linha.local);
    const pessoa = await buscarPessoa(emailDoCsv(linha.colaborador, 'Colaborador'));
    const turno = linha.turno ?? null;

    const inicio = linha.inicio ? dataDoCsv(linha.inicio, 'Início') : null;
    const fim = linha.fim ? dataDoCsv(linha.fim, 'Fim') : null;

    // O INÍCIO NÃO PODE SER FUTURO, e a regra é a mesma do `dataNaoFutura` da
    // tela: uma ocupação com `endedAt IS NULL` já conta como ocupante ATUAL em
    // toda consulta e no índice único — "começa semana que vem" gravaria como
    // presente quem ninguém vê no posto, e ainda bloquearia o cadastro de quem
    // está lá hoje.
    if (inicio && inicio.getTime() > Date.now()) {
      throw new AppError('A data de início está no futuro.', 422);
    }
    if (fim && inicio && fim < inicio) {
      throw new AppError('A data de fim é anterior à de início.', 422);
    }

    const aberta = await prisma.locationOccupant.findFirst({
      where: { locationId: local.id, userId: pessoa.id, endedAt: null },
      select: { id: true, shift: true, startedAt: true },
    });

    // ── `FIM` PREENCHIDO: ENCERRA ───────────────────────────────────────────
    if (fim) {
      if (!aberta) {
        return {
          situacao: 'IGNORADA',
          descricao: `${pessoa.name} não tem ocupação aberta em ${local.name} para encerrar.`,
        };
      }
      if (aberta.startedAt > fim) {
        throw new AppError(
          `A saída (${fim.toISOString().slice(0, 10)}) é anterior à entrada `
            + `(${aberta.startedAt.toISOString().slice(0, 10)}).`,
          422,
        );
      }

      contar(local.id, 'encerra');

      return {
        situacao: 'OK',
        descricao: `Encerra a ocupação de ${pessoa.name} em ${local.name} em ${fim.toISOString().slice(0, 10)}.`,
        aplicar: async (actorId) => {
          await endLocationOccupancy(local.id, aberta.id, actorId, fim);
          return aberta.id;
        },
      };
    }

    // ── `FIM` VAZIO: NÃO ENCERRA NADA ───────────────────────────────────────
    //
    // É a regra que o plano da fase declara, e ela é a mesma da ausência de
    // linha: um arquivo com 300 das 500 pessoas não demite 200. Vazio aqui
    // significa "esta ocupação continua", nunca "encerre as outras".
    if (aberta) {
      if ((aberta.shift ?? null) === turno) {
        return {
          situacao: 'IGNORADA',
          descricao: `${pessoa.name} já ocupa ${local.name}.`,
          entityId: aberta.id,
        };
      }

      return {
        situacao: 'OK',
        descricao: `Corrige o turno de ${pessoa.name} em ${local.name}: `
          + `${aberta.shift ?? '(vazio)'} → ${turno ?? '(vazio)'}.`,
        aplicar: async (actorId) => {
          await updateOccupantShift(aberta.id, turno, actorId);
          return aberta.id;
        },
      };
    }

    contar(local.id, 'abre');

    return {
      situacao: 'OK',
      descricao: `Põe ${pessoa.name} em ${local.name}${turno ? ` (turno ${turno})` : ''}.`,
      aplicar: async (actorId) => {
        const criada = await addLocationOccupant(
          local.id,
          { userId: pessoa.id, shift: turno, startedAt: inicio },
          actorId,
        );
        return criada.id;
      },
    };
  }

  /**
   * O EFEITO DE SEGUNDA ORDEM — o número que o dry-run mostra antes do apply.
   *
   * A conta é por POSTO, e não por linha, porque é assim que a Camada 3
   * funciona: o que muda a responsabilidade de um ativo não é "a Laura entrou",
   * é "a mesa passou de ZERO para ALGUM ocupante" (ou o contrário).
   *
   *   antes = 0 e depois > 0  → todo ativo entregue àquele posto GANHA responsável
   *   antes > 0 e depois = 0  → todo ativo entregue àquele posto PERDE responsável
   *
   * Um posto que vai de um para dois ocupantes não entra na conta: os ativos
   * dele já tinham responsável e continuam tendo (passam a ter dois, o que é o
   * caso que o modelo existe para descrever).
   *
   * `depois` é uma PREVISÃO: ela soma as aberturas e subtrai os encerramentos
   * que o arquivo faria, sobre a contagem de agora.
   */
  async function efeitoDeSegundaOrdem() {
    let ganhamResponsavel = 0;
    let perdemResponsavel = 0;

    for (const [locationId, efeito] of efeitos) {
      const [abertasAgora, ativosNoPosto] = await Promise.all([
        prisma.locationOccupant.count({ where: { locationId, endedAt: null } }),
        // Consulta em `asset` (e não nas `assignments` do posto) para a extension
        // de soft delete agir: ativo na lixeira não conta como equipamento na
        // mesa.
        prisma.asset.count({
          where: { assignments: { some: { targetLocationId: locationId, checkinAt: null } } },
        }),
      ]);

      const depois = abertasAgora + efeito.abre - efeito.encerra;

      if (abertasAgora === 0 && depois > 0) ganhamResponsavel += ativosNoPosto;
      if (abertasAgora > 0 && depois <= 0) perdemResponsavel += ativosNoPosto;
    }

    return { ganhamResponsavel, perdemResponsavel };
  }

  return { planejar, efeitoDeSegundaOrdem };
}
