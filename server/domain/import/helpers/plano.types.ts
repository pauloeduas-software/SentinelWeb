// O PLANO DE UMA LINHA (F10, Etapa D) — a peça que faz o dry-run e o apply
// serem o MESMO código.
//
// ═════════════════════════════════════════════════════════════════════════════
// `planejar()` RESOLVE E DECIDE; `aplicar()` SÓ GRAVA.
//
// O dry-run chama `planejar` e NÃO chama o `aplicar` que vem dentro do plano. O
// apply chama os dois. É isso que garante que a simulação e a execução
// enxerguem a mesma regra: não existe um caminho "de verdade" e outro "de
// mentira" que possam divergir — e divergir aqui significaria a tela prometer
// 500 linhas OK e a execução recusar 80.
//
// O APPLY RE-PLANEJA, e isso é de propósito: o dry-run é uma FOTO. Entre ele e
// o apply alguém pode ter cadastrado o ativo que faltava (a linha era ERRO e
// passa a ser OK) ou ter entregado o equipamento a outra pessoa (era OK e passa
// a ser ERRO). Aplicar o plano velho escreveria a decisão de um mundo que não
// existe mais.
// ═════════════════════════════════════════════════════════════════════════════

export type PlanoDaLinha =
  | {
      situacao: 'OK';
      /** O que vai acontecer, em português — é o que a tela mostra no dry-run. */
      descricao: string;
      /** Grava. Devolve o id da entidade criada ou atualizada. */
      aplicar: (actorId: string | null) => Promise<string>;
    }
  | {
      situacao: 'IGNORADA';
      descricao: string;
      /** O registro que já existia e já estava como o arquivo pede. */
      entityId?: string;
    }
  | { situacao: 'ERRO'; descricao: string };

/**
 * Um alvo de importação.
 *
 * É criado UMA VEZ por importação (`fabricar()`), e não por linha: é dentro da
 * instância que vivem os caches de nome → id. Num arquivo de 500 linhas com o
 * mesmo modelo, isso é uma consulta em vez de quinhentas.
 */
export interface Adaptador {
  planejar(linha: Record<string, string>, chave: string | undefined): Promise<PlanoDaLinha>;
  /**
   * O EFEITO QUE NÃO ESTÁ EM NENHUMA LINHA — só a ocupação tem (Etapa E).
   *
   * Importar ocupação muda quem responde por todo ativo entregue àquele posto,
   * sem tocar em uma `Assignment` sequer. Linha por linha o arquivo parece
   * correto; o que denuncia uma coluna trocada é o AGREGADO: "412 ativos passam
   * a ter responsável".
   *
   * Opcional porque os outros dois alvos não têm efeito desse tipo — o que eles
   * fazem está escrito na linha que o fazem. Chamado UMA vez, no fim do
   * dry-run, depois de todas as linhas terem sido planejadas: é o planejamento
   * que alimenta a conta.
   */
  efeitoDeSegundaOrdem?(): Promise<{ ganhamResponsavel: number; perdemResponsavel: number }>;
}

export type FabricaDeAdaptador = () => Adaptador;
