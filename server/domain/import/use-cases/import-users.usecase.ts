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
      select: { id: true, name: true, department: true },
    });

    if (!existente) {
      if (!linha.name) {
        throw new AppError('Pessoa nova precisa do nome, e a coluna Nome está vazia.', 422);
      }

      const dados = { name: linha.name, email, department: linha.department ?? null };

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
    if (linha.department && linha.department !== existente.department) {
      mudancas.department = linha.department;
    }

    if (Object.keys(mudancas).length === 0) {
      return { situacao: 'IGNORADA', descricao: 'Já está como o arquivo pede.', entityId: existente.id };
    }

    return {
      situacao: 'OK',
      descricao: `Atualiza ${Object.keys(mudancas).join(', ')} de ${existente.name}.`,
      aplicar: async (actorId) => {
        await updateUser(existente.id, mudancas, actorId);
        return existente.id;
      },
    };
  }

  return { planejar };
}
