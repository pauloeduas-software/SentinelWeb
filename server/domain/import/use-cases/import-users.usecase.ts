import { prisma } from '../../../core/database/prismaClient';
import { AppError } from '../../../core/errors/app-error';
import { createUser } from '../../user/use-cases/create-user.usecase';
import { updateUser } from '../../user/use-cases/update-user.usecase';
import type { Adaptador, PlanoDaLinha } from '../helpers/plano.types';
import { emailDoCsv } from '../helpers/valores.helper';

// A IMPORTAÇÃO DE PESSOAS (F10, Etapa D).
//
// A CHAVE É O E-MAIL, e ela é a única possível: nome não identifica ninguém —
// duas "Ana Silva" num quadro de 300 pessoas é o caso normal, não a exceção.
// Casar por nome fundiria os cadastros das duas, e o estrago apareceria quando
// alguém procurasse o notebook de uma delas.
//
// ═════════════════════════════════════════════════════════════════════════════
// O E-MAIL AMBÍGUO É LINHA IGNORADA COM MOTIVO, NÃO UM `findFirst` NO ESCURO.
//
// `User.email` não é `@unique` no Prisma: a unicidade é índice PARCIAL
// (`WHERE deleted_at IS NULL`), para um usuário na lixeira não travar o
// recadastro do mesmo endereço. Isso significa que o banco PERMITE duas linhas
// com o mesmo e-mail — uma viva e uma apagada.
//
// A consulta daqui passa pelo escopo da lixeira, então ela só vê a viva, que é
// a resposta certa. O caso que sobra é o contrário: e-mail que só existe na
// LIXEIRA. Ali o importador não restaura ninguém — restaurar um cadastro
// apagado em massa, por causa de uma linha de planilha, é exatamente o tipo de
// efeito que o dry-run existe para impedir. A linha vira um cadastro NOVO, e o
// índice parcial permite.
// ═════════════════════════════════════════════════════════════════════════════

export function adaptadorDePessoas(): Adaptador {
  async function planejar(
    linha: Record<string, string>,
    chave: string | undefined,
  ): Promise<PlanoDaLinha> {
    if (chave !== 'email') {
      throw new AppError(`Chave de atualização inválida para pessoas: ${chave ?? '(ausente)'}.`, 422);
    }

    if (!linha.email) {
      throw new AppError('A coluna de e-mail está vazia — é ela que identifica a pessoa.', 422);
    }

    const email = emailDoCsv(linha.email, 'E-mail');

    const existente = await prisma.user.findFirst({
      where: { email },
      select: { id: true, name: true, departmentId: true },
    });


    /**
     * NOME → ID do departamento, resolvido SOB DEMANDA.
     *
     * ═════════════════════════════════════════════════════════════════════
     * CHAMADA DEPOIS DAS VALIDAÇÕES BÁSICAS, e a ordem é o ponto.
     *
     * Enquanto esta consulta rodava no topo do `planejar`, uma linha sem nome e
     * com departamento desconhecido reclamava do DEPARTAMENTO — e quem montou a
     * planilha corrigia o nome do setor para então descobrir que faltava o nome
     * da pessoa. Duas rodadas de dry-run para dois problemas na mesma linha.
     *
     * A precedência certa é a do que IDENTIFICA a linha: sem nome não há pessoa
     * a cadastrar, e aí o departamento dela é pergunta que não se faz.
     *
     * E ela também deixou de consultar o banco para linhas que vão ser
     * recusadas de qualquer forma — numa planilha de 500 linhas com a coluna
     * mal preenchida, eram 500 consultas jogadas fora.
     * ═════════════════════════════════════════════════════════════════════
     *
     * NOME DESCONHECIDO É LINHA RECUSADA, nunca departamento criado. É a mesma
     * recusa do D132 para e-mail ambíguo, pelo mesmo raciocínio: o CSV é texto
     * digitado por alguém, e `Comercail` criaria um departamento novo ao lado do
     * `Comercial` certo. Depois disso, metade das pessoas aponta para o errado e
     * o relatório por departamento mente sem nenhum erro ter acontecido.
     *
     * Criar cadastro a partir de importação é a porta por onde o catálogo
     * apodrece. O dry-run mostra a linha recusada com o nome digitado, e quem
     * importou cadastra o departamento (ou corrige o typo) antes de aplicar —
     * que é exatamente para isso que o dry-run existe.
     */
    async function resolverDepartamento(): Promise<string | undefined> {
      if (!linha.department) return undefined;

      const nome = linha.department.trim();
      const departamento = await prisma.department.findFirst({
        // `mode: 'insensitive'` porque o CSV vem com a caixa que a pessoa
        // digitou: casar `comercial` com `Comercial` é acerto, não adivinhação —
        // o nome é `@unique`, então não há duas grafias para escolher entre.
        where: { name: { equals: nome, mode: 'insensitive' } },
        select: { id: true },
      });

      if (!departamento) {
        throw new AppError(
          `Departamento "${nome}" não está cadastrado. Cadastre-o em Configurações → ` +
          'Departamentos antes de importar, ou corrija a grafia na planilha.',
          422,
        );
      }
      return departamento.id;
    }

    if (!existente) {
      if (!linha.name) {
        throw new AppError('Pessoa nova precisa do nome, e a coluna Nome está vazia.', 422);
      }

      const dados = { name: linha.name, email, departmentId: (await resolverDepartamento()) ?? null };

      return {
        situacao: 'OK',
        descricao: `Cadastra ${linha.name}.`,
        aplicar: async (actorId) => (await createUser(dados, actorId)).id,
      };
    }

    // O QUE DE FATO MUDA. Campo ausente no arquivo não é "apague": é "não
    // mexa" — a mesma regra da ausência de linha (um arquivo com 300 das 500
    // pessoas não demite 200).
    const mudancas: Record<string, string | null> = {};
    if (linha.name && linha.name !== existente.name) mudancas.name = linha.name;

    // Compara IDS, não nomes: comparar texto com texto reimportaria a mesma
    // pessoa como "alterada" sempre que a caixa da planilha diferisse da do
    // cadastro.
    const departmentId = await resolverDepartamento();
    if (departmentId && departmentId !== existente.departmentId) {
      mudancas.departmentId = departmentId;
    }

    if (Object.keys(mudancas).length === 0) {
      return { situacao: 'IGNORADA', descricao: 'Já está como o arquivo pede.', entityId: existente.id };
    }

    return {
      situacao: 'OK',
      // O ROTULO em português, não o nome do campo: a linha do dry-run é lida
      // por quem montou a planilha, e "Atualiza departmentId de Laura" não
      // ajuda ninguém a decidir se aplica.
      descricao: `Atualiza ${Object.keys(mudancas).map(rotuloDoCampo).join(', ')} de ${existente.name}.`,
      aplicar: async (actorId) => {
        await updateUser(existente.id, mudancas, actorId);
        return existente.id;
      },
    };
  }

  return { planejar };
}

/** O nome do campo como a pessoa que montou a planilha o conhece. */
function rotuloDoCampo(campo: string): string {
  const rotulos: Record<string, string> = { name: 'nome', departmentId: 'departamento' };
  return rotulos[campo] ?? campo;
}
