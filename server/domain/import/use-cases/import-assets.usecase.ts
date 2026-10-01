import { prisma } from '../../../core/database/prismaClient';
import { AppError } from '../../../core/errors/app-error';
import { createAsset } from '../../asset/use-cases/create-asset.usecase';
import { updateAsset } from '../../asset/use-cases/update-asset.usecase';
import { checkoutAsset } from '../../assignment/use-cases/checkout-asset.usecase';
import { escolherStatusPorTipo } from '../../assignment/use-cases/checkout-asset.usecase';
import type { Adaptador, PlanoDaLinha } from '../helpers/plano.types';
import { dataDoCsv, dinheiroDoCsv, emailDoCsv, inteiroDoCsv } from '../helpers/valores.helper';

// A IMPORTAÇÃO DE ATIVOS (F10, Etapa D) — e a parte que não existe em ITAM de
// prateleira é a última coluna.
//
// ═════════════════════════════════════════════════════════════════════════════
// A POSSE IMPORTADA PASSA PELO CHECKOUT. SEMPRE (D17).
//
// A coluna *Responsável* NÃO vira `UPDATE` em `assets.assignedToId`. Aquela
// coluna é CACHE do caso `USER` da posse, tem um único escritor (o
// checkout/checkin) e o importador não vai ser o segundo — foi para isso que o
// campo saiu do formulário de ativo na F4.
//
// O que ela vira é uma `Assignment` com `checkoutAt` RETROATIVO, criada pelo
// mesmo `checkoutAsset()` que a tela usa — com as duas chaves que a leva D0
// acrescentou (D131):
//
//   `checkoutAt`  a entrega aconteceu em março, não hoje. Sem isto, o histórico
//                 de posse da empresa inteira nasceria mentindo a data.
//   `semAviso`    nem termo de aceite, nem e-mail. Uma carga de 500 linhas
//                 mandaria 500 convites para assinar o recebimento de um
//                 notebook que a pessoa usa desde 2024 — e o e-mail não volta.
//
// E A ORDEM DO STATUS É O QUE FAZ ISSO FUNCIONAR. O checkout só aceita ativo
// `DEPLOYABLE` ("está no estoque, pode ser entregue"), então um ativo criado
// direto como "Em uso" seria recusado na linha seguinte. O importador cria
// DISPONÍVEL e passa o status do CSV como `statusId` DA ENTREGA — que é um
// parâmetro que o checkout já aceita e aplica. A invariante 4 fica satisfeita
// pelo caminho normal, sem o importador escrever status à mão.
// ═════════════════════════════════════════════════════════════════════════════

/** Os campos comparáveis de um ativo que já existe — o que decide IGNORADA. */
const SELECT_EXISTENTE = {
  id: true,
  assetTag: true,
  serial: true,
  name: true,
  notes: true,
  orderNumber: true,
  purchaseDate: true,
  purchaseCost: true,
  warrantyMonths: true,
  statusId: true,
  // O `type` do status, e não só o `statusId`: é ele que diz se o checkout vai
  // aceitar este ativo, e a pergunta tem de ser feita no DRY-RUN. Ver a guarda
  // em `planejarAtualizacao`.
  status: { select: { type: true, name: true } },
  modelId: true,
  locationId: true,
  supplierId: true,
  assignments: {
    where: { checkinAt: null },
    select: { id: true, targetType: true, targetUserId: true },
    take: 1,
  },
} as const;

interface Pessoa {
  id: string;
  name: string;
  isActive: boolean;
}

export function adaptadorDeAtivos(): Adaptador {
  // OS CACHES SÃO DA IMPORTAÇÃO, não do processo: a instância nasce e morre com
  // o arquivo. Num CSV de 500 linhas do mesmo modelo, isso é UMA consulta em vez
  // de quinhentas — e um cache global diria o nome antigo depois de alguém
  // renomear o modelo numa outra aba.
  const statusPorNome = new Map<string, { id: string; name: string } | null>();
  const modeloPorChave = new Map<string, { id: string } | 'AMBIGUO' | null>();
  const localPorNome = new Map<string, { id: string } | null>();
  const fornecedorPorNome = new Map<string, { id: string } | null>();
  const pessoaPorEmail = new Map<string, Pessoa | null>();

  /**
   * O CASAMENTO POR NOME É INSENSÍVEL A MAIÚSCULAS — e isso não é tolerância
   * com dado sujo: é o que separa uma importação que funciona de uma que
   * recusa 500 linhas por causa de uma letra.
   *
   * O status do seed chama-se "Em Uso". Uma planilha escreve "Em uso", "EM USO"
   * ou "em uso", e nenhuma das três está errada do ponto de vista de quem
   * preencheu. Exigir a grafia exata transformaria a carga inicial num jogo de
   * adivinhação — e o primeiro teste desta etapa foi reprovado exatamente por
   * isso, com a mensagem "Status 'Em uso' não está cadastrado" ao lado do
   * cadastro que existe.
   *
   * MAS A AMBIGUIDADE CONTINUA SENDO RECUSADA. Se o cadastro tiver "Em Uso" e
   * "em uso" como dois rótulos distintos (o índice único é sensível a caixa,
   * então o banco permite), escolher um dos dois seria sorteio. É o D46 outra
   * vez: evidência ambígua é evidência zero.
   */
  function decidir<T>(achados: T[], rotulo: string, nome: string): T {
    if (achados.length === 0) throw new AppError(`${rotulo} "${nome}" não está cadastrado.`, 422);

    if (achados.length > 1) {
      throw new AppError(
        `Existe mais de um ${rotulo.toLowerCase()} chamado "${nome}", diferindo só em maiúsculas e `
          + 'minúsculas. Unifique o cadastro antes de importar.',
        422,
      );
    }
    return achados[0];
  }

  /** Igual ao nome, ignorando a caixa. `take: 2` basta para saber se há ambiguidade. */
  const porNome = (nome: string) => ({
    where: { name: { equals: nome, mode: 'insensitive' as const } },
    take: 2,
  });

  async function buscarStatus(nome: string) {
    if (!statusPorNome.has(nome)) {
      const achados = await prisma.statusLabel.findMany({
        ...porNome(nome),
        select: { id: true, name: true },
      });
      statusPorNome.set(nome, decidir(achados, 'Status', nome));
    }
    return statusPorNome.get(nome)!;
  }

  /**
   * O modelo por NOME — e a ambiguidade é recusada, não resolvida por sorteio.
   *
   * `AssetModel.name` NÃO é único: a unicidade é `(manufacturerId, modelNumber)`.
   * Dois fabricantes podem ter um modelo "Latitude 5420" cadastrado, e escolher
   * o primeiro que o banco devolver vincularia metade da frota ao fabricante
   * errado — sem erro nenhum, e descoberto meses depois num relatório por
   * fabricante. É o D46 aplicado ao import: evidência ambígua é evidência zero.
   */
  async function buscarModelo(nome: string, fabricante: string | undefined) {
    const chave = `${nome}||${fabricante ?? ''}`;

    if (!modeloPorChave.has(chave)) {
      const encontrados = await prisma.assetModel.findMany({
        where: {
          name: { equals: nome, mode: 'insensitive' },
          ...(fabricante ? { manufacturer: { name: { equals: fabricante, mode: 'insensitive' } } } : {}),
        },
        select: { id: true, manufacturer: { select: { name: true } } },
        take: 5,
      });

      modeloPorChave.set(
        chave,
        encontrados.length === 0 ? null
          : encontrados.length === 1 ? { id: encontrados[0].id }
            : 'AMBIGUO',
      );
    }

    const achado = modeloPorChave.get(chave) ?? null;

    if (achado === null) {
      throw new AppError(
        fabricante
          ? `Modelo "${nome}" do fabricante "${fabricante}" não está cadastrado.`
          : `Modelo "${nome}" não está cadastrado.`,
        422,
      );
    }
    if (achado === 'AMBIGUO') {
      throw new AppError(
        `Existe mais de um modelo chamado "${nome}", de fabricantes diferentes. `
          + 'Acrescente a coluna Fabricante ao arquivo e mapeie-a para desambiguar.',
        422,
      );
    }
    return achado;
  }

  async function buscarLocal(nome: string) {
    if (!localPorNome.has(nome)) {
      // `Location.name` é `@unique`, então o nome É chave aqui — ao contrário do
      // modelo acima. A busca ainda é por `findMany`: o índice único é sensível
      // a caixa, então "Mesa 1" e "mesa 1" podem coexistir e a ambiguidade tem
      // de ser vista.
      const achados = await prisma.location.findMany({ ...porNome(nome), select: { id: true } });
      localPorNome.set(nome, decidir(achados, 'Localização', nome));
    }
    return localPorNome.get(nome)!;
  }

  async function buscarFornecedor(nome: string) {
    if (!fornecedorPorNome.has(nome)) {
      const achados = await prisma.supplier.findMany({ ...porNome(nome), select: { id: true } });
      fornecedorPorNome.set(nome, decidir(achados, 'Fornecedor', nome));
    }
    return fornecedorPorNome.get(nome)!;
  }

  /**
   * A pessoa por E-MAIL, nunca por nome (e o nome não é nem aceito no arquivo).
   *
   * `findFirst` e não `findUnique`: `User.email` deixou de ser `@unique` no
   * Prisma — a unicidade é índice PARCIAL (`WHERE deleted_at IS NULL`), para um
   * usuário na lixeira não travar o recadastro do mesmo endereço. `findFirst`
   * passa pelo escopo da lixeira, então só acha quem vive.
   */
  async function buscarPessoa(email: string) {
    if (!pessoaPorEmail.has(email)) {
      pessoaPorEmail.set(email, await prisma.user.findFirst({
        where: { email },
        select: { id: true, name: true, isActive: true },
      }));
    }
    const pessoa = pessoaPorEmail.get(email) ?? null;
    if (!pessoa) {
      throw new AppError(
        `Não há colaborador com o e-mail "${email}". Importe as pessoas antes dos ativos, `
          + 'ou cadastre esta e reimporte a linha.',
        422,
      );
    }
    if (!pessoa.isActive) {
      throw new AppError(`O colaborador "${pessoa.name}" está desligado e não pode receber posse.`, 422);
    }
    return pessoa;
  }

  /** O que a linha quer gravar nas colunas do ativo. Lança no primeiro valor inválido. */
  async function camposDaLinha(linha: Record<string, string>) {
    const dados: Record<string, unknown> = {};

    if (linha.assetTag) dados.assetTag = linha.assetTag;
    if (linha.serial) dados.serial = linha.serial;
    if (linha.name) dados.name = linha.name;
    if (linha.notes) dados.notes = linha.notes;
    if (linha.orderNumber) dados.orderNumber = linha.orderNumber;
    if (linha.purchaseDate) dados.purchaseDate = dataDoCsv(linha.purchaseDate, 'Data de compra');
    if (linha.purchaseCost) dados.purchaseCost = dinheiroDoCsv(linha.purchaseCost, 'Custo de compra');
    if (linha.warrantyMonths) dados.warrantyMonths = inteiroDoCsv(linha.warrantyMonths, 'Garantia (meses)');
    if (linha.location) dados.locationId = (await buscarLocal(linha.location)).id;
    if (linha.supplier) dados.supplierId = (await buscarFornecedor(linha.supplier)).id;
    if (linha.model) dados.modelId = (await buscarModelo(linha.model, linha.manufacturer)).id;

    return dados;
  }

  /** `checkoutAt` só vale com responsável — a data de uma entrega que não existe não significa nada. */
  function dataDaEntrega(linha: Record<string, string>): Date | undefined {
    if (!linha.checkoutAt) return undefined;
    if (!linha.responsavel) {
      throw new AppError(
        'A coluna "Entregue em" veio preenchida sem a coluna "Responsável": não há entrega a datar.',
        422,
      );
    }

    const data = dataDoCsv(linha.checkoutAt, 'Entregue em');
    if (data.getTime() > Date.now()) {
      throw new AppError('A data da entrega está no futuro.', 422);
    }
    return data;
  }

  async function planejar(
    linha: Record<string, string>,
    chave: string | undefined,
  ): Promise<PlanoDaLinha> {
    // A validação do mapeamento já exigiu a chave para este alvo; a guarda aqui
    // é a rede de quem chamar o adaptador por outro caminho.
    if (!chave) throw new AppError('A importação de ativos precisa de uma chave de atualização.', 422);

    const valorDaChave = linha[chave];

    // CHAVE VAZIA: a etiqueta pode ser gerada; a série, não.
    //
    // Série é um dado FÍSICO — está gravado no equipamento —, então uma linha
    // sem ela não tem como ser reconhecida nem agora nem na reimportação.
    // Etiqueta o sistema sabe gerar (é o contador da F1), e é o caso real de
    // quem cadastra 500 equipamentos novos de uma nota fiscal.
    if (!valorDaChave && chave === 'serial') {
      throw new AppError(
        'A coluna do número de série está vazia. Com a série como chave, a linha não pode ser '
          + 'reconhecida — preencha-a ou use a etiqueta como chave.',
        422,
      );
    }

    const existente = valorDaChave
      ? await prisma.asset.findFirst({
          where: chave === 'serial' ? { serial: valorDaChave } : { assetTag: valorDaChave },
          select: SELECT_EXISTENTE,
        })
      : null;

    const entregaEm = dataDaEntrega(linha);
    const pessoa = linha.responsavel
      ? await buscarPessoa(emailDoCsv(linha.responsavel, 'Responsável'))
      : null;
    const statusDoArquivo = linha.status ? await buscarStatus(linha.status) : null;

    return existente
      ? planejarAtualizacao(linha, existente, pessoa, statusDoArquivo, entregaEm)
      : planejarCriacao(linha, pessoa, statusDoArquivo, entregaEm);
  }

  async function planejarCriacao(
    linha: Record<string, string>,
    pessoa: Pessoa | null,
    statusDoArquivo: { id: string; name: string } | null,
    entregaEm: Date | undefined,
  ): Promise<PlanoDaLinha> {
    if (!linha.model) {
      throw new AppError(
        'Ativo novo precisa do modelo, e a coluna Modelo está vazia (ou não foi mapeada).',
        422,
      );
    }

    const dados = await camposDaLinha(linha);

    // COM RESPONSÁVEL: nasce DISPONÍVEL e a ENTREGA aplica o status do arquivo.
    // Sem: o status do arquivo vai direto, e "Em uso" sem posse é legítimo — é o
    // posto vago da invariante 4.
    const statusDeEstoque = pessoa
      ? await escolherStatusPorTipo(prisma, 'DEPLOYABLE', 'Disponível')
      : statusDoArquivo?.id ?? (await escolherStatusPorTipo(prisma, 'DEPLOYABLE', 'Disponível'));

    const descricao = pessoa
      ? `Cadastra o ativo e entrega a ${pessoa.name}${entregaEm ? ` (em ${entregaEm.toISOString().slice(0, 10)})` : ''}.`
      : 'Cadastra o ativo.';

    return {
      situacao: 'OK',
      descricao,
      aplicar: async (actorId) => {
        const criado = await createAsset(
          { ...dados, statusId: statusDeEstoque, modelId: dados.modelId as string },
          actorId,
        );

        if (pessoa) {
          await checkoutAsset(criado.id, {
            targetType: 'USER',
            targetUserId: pessoa.id,
            statusId: statusDoArquivo?.id ?? null,
            checkoutAt: entregaEm ?? null,
            // Ver o cabeçalho deste arquivo: nem termo, nem e-mail (D131).
            semAviso: true,
          }, actorId);
        }

        return criado.id;
      },
    };
  }

  async function planejarAtualizacao(
    linha: Record<string, string>,
    existente: {
      id: string;
      status: { type: string; name: string };
      assignments: { id: string; targetType: string; targetUserId: string | null }[];
    } & Record<string, unknown>,
    pessoa: Pessoa | null,
    statusDoArquivo: { id: string; name: string } | null,
    entregaEm: Date | undefined,
  ): Promise<PlanoDaLinha> {
    const dados = await camposDaLinha(linha);
    const posseAberta = existente.assignments[0] ?? null;

    // ── A POSSE ─────────────────────────────────────────────────────────────
    let vaiEntregar = false;

    if (pessoa) {
      if (!posseAberta) {
        vaiEntregar = true;
      } else if (posseAberta.targetType === 'USER' && posseAberta.targetUserId === pessoa.id) {
        // Já está com essa pessoa: o arquivo não pede mudança nenhuma de posse.
        vaiEntregar = false;
      } else {
        // TRANSFERIR EM MASSA NÃO ACONTECE POR IMPORT, e a recusa é a decisão.
        //
        // Devolver e reentregar seria o caminho — e ele apaga a única
        // informação de quem estava com o equipamento se a pessoa não quis isso
        // (é o argumento da invariante 4: bloqueia, nunca limpa sozinho). Numa
        // planilha de 500 linhas, uma coluna de responsável desatualizada
        // movimentaria o parque inteiro sem ninguém pedir.
        throw new AppError(
          'Este ativo já está entregue a outro alvo. Faça a devolução pela tela antes de importar '
            + 'uma posse diferente — o import não transfere posse em massa.',
          422,
        );
      }
    }

    // ── A GUARDA QUE FAZ O DRY-RUN NÃO MENTIR ───────────────────────────────
    //
    // `checkoutAsset` recusa com 409 ("Só ativo disponível pode ser entregue") o
    // ativo que não está `DEPLOYABLE` — é a invariante 4, e ela é certa. O que
    // estava errado era QUANDO a recusa aparecia: o `planejar` não olhava o
    // status do ativo que já existe, então a simulação prometia "entrega a
    // Laura" e o apply devolvia ERRO naquela linha. Ver a tela dizer OK e o
    // arquivo falhar depois é exatamente a divergência entre os dois passos que
    // o D68 existe para não ter.
    //
    // E O CASO É REAL, não teórico: ativo "Em uso" SEM posse aberta é legítimo
    // (é o posto vago da invariante 4), e é o estado em que uma planilha de
    // correção encontra metade do parque de quem está arrumando o cadastro.
    //
    // No ativo NOVO não existe o problema: `planejarCriacao` o cria disponível
    // de propósito, justamente para a entrega poder acontecer em seguida.
    if (vaiEntregar && existente.status.type !== 'DEPLOYABLE') {
      throw new AppError(
        `Este ativo está como "${existente.status.name}", e só ativo disponível pode ser entregue. `
          + 'Ponha-o num status disponível pela tela antes de importar a posse — o import não '
          + 'muda o status para abrir posse por conta própria.',
        422,
      );
    }

    // O STATUS: se vamos entregar, ele é parâmetro da ENTREGA (e o checkout
    // exige `DEPLOYABLE` agora). Senão, é campo do ativo.
    if (statusDoArquivo && !vaiEntregar) dados.statusId = statusDoArquivo.id;

    // ── O QUE DE FATO MUDA ──────────────────────────────────────────────────
    const mudancas = Object.entries(dados).filter(([campo, valor]) => {
      const atual = existente[campo];

      // Data: comparar o DIA, não o instante — o banco devolve `Date` e o
      // arquivo traz meia-noite UTC.
      if (valor instanceof Date && atual instanceof Date) {
        return valor.toISOString().slice(0, 10) !== atual.toISOString().slice(0, 10);
      }
      // `Decimal`: o custo de compra vem do arquivo como STRING e do banco como
      // OBJETO `Decimal.js`. Comparar como número é o que evita "1234.5" ≠
      // "1234.50" virar uma atualização que não muda nada.
      //
      // ⚠️ SÓ QUANDO O LADO DO BANCO É NÚMERO OU `Decimal`. Comparar como número
      // dois lados de TEXTO era um defeito silencioso: a série "0012345" e a
      // série "12345" viravam "iguais" (as duas dão 12345), e a correção que a
      // planilha trazia era descartada sem nada no relatório — num campo cujo
      // valor é FÍSICO, gravado na carcaça do equipamento. Valia também para
      // etiqueta e número de pedido com zero à esquerda.
      const bancoENumerico = typeof atual === 'number'
        || (typeof atual === 'object' && atual !== null && !(atual instanceof Date));

      if (typeof valor === 'string' && bancoENumerico) {
        return Number(valor) !== Number(atual);
      }

      // Texto é texto, e `null` é `null`: nada de normalizar nada.
      return valor !== atual;
    });

    if (mudancas.length === 0 && !vaiEntregar) {
      return {
        situacao: 'IGNORADA',
        descricao: 'Já está como o arquivo pede.',
        entityId: existente.id,
      };
    }

    const partes: string[] = [];
    if (mudancas.length > 0) partes.push(`atualiza ${mudancas.map(([campo]) => campo).join(', ')}`);
    if (vaiEntregar && pessoa) partes.push(`entrega a ${pessoa.name}`);

    return {
      situacao: 'OK',
      descricao: `${partes.join(' e ')}.`,
      aplicar: async (actorId) => {
        if (mudancas.length > 0) {
          await updateAsset(existente.id, Object.fromEntries(mudancas), actorId);
        }

        if (vaiEntregar && pessoa) {
          await checkoutAsset(existente.id, {
            targetType: 'USER',
            targetUserId: pessoa.id,
            statusId: statusDoArquivo?.id ?? null,
            checkoutAt: entregaEm ?? null,
            semAviso: true,
          }, actorId);
        }

        return existente.id;
      },
    };
  }

  return { planejar };
}
