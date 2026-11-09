import type { Cargo } from '../types/user.types';

// OS CARGOS NA TELA (AV), do menor para o maior: a ordem é a do seletor do
// formulário de Usuários. A frase diz o que cada um pode, para quem escolhe não
// precisar adivinhar pelo nome.
export const CARGOS_NA_TELA: readonly { valor: Cargo; nome: string; alcance: string }[] = [
  { valor: 'TECNICO', nome: 'Técnico', alcance: 'Cadastra, edita, entrega e devolve. Não exclui, não vê o valor da compra nem Configurações.' },
  { valor: 'SUPERVISOR', nome: 'Supervisor', alcance: 'Tudo do Técnico, mais excluir, baixa, licenças, valor da compra, comandos e Configurações.' },
  { valor: 'ADMIN', nome: 'Administrador', alcance: 'Tudo, e o único que mexe em Usuários.' },
];

export function nomeDoCargo(cargo: Cargo): string {
  return CARGOS_NA_TELA.find((item) => item.valor === cargo)?.nome ?? cargo;
}
