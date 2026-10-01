import { Download } from 'lucide-react';

// O BOTÃO DE EXPORTAR (F10, Etapa C).
//
// Em `pages/components/` porque DUAS telas o usam — ativos e licenças — e a
// terceira (estoque) é a próxima. Ele não sabe o que está exportando: recebe a
// URL pronta de quem conhece os filtros, como todo componente desta pasta.
//
// É um `<a download>`, e não um `onClick` com `fetch`: o arquivo pode ter
// megabytes, e baixá-lo por `fetch` significa ter o conteúdo inteiro na memória
// da aba para depois criar um blob e um link temporário — duas cópias do mesmo
// arquivo para entregar o que o navegador entrega sozinho.
//
// O cookie de sessão vai junto porque é a MESMA origem. A rota é `/api/` e
// exige sessão, como todo arquivo deste sistema (D84).
//
// E ELE LEVA OS FILTROS DA TELA: o que sai no arquivo é o que a tabela está
// mostrando, sem paginação. Um botão que exportasse "tudo" enquanto a tela
// mostra 12 linhas filtradas entregaria cinco mil — e a pessoa descobriria
// contando linhas na planilha.

interface Props {
  url: string;
  /** Quantas linhas o filtro atual alcança. Entra no título, não no arquivo. */
  total: number;
}

export default function ExportarCsv({ url, total }: Props) {
  return (
    <a
      href={url}
      // `download` sem valor: o nome do arquivo vem do `Content-Disposition` do
      // servidor, que já o monta com a data. Um nome escrito aqui o venceria e
      // ficaria desatualizado na primeira mudança do outro lado.
      download
      title={`Exportar ${total} ${total === 1 ? 'linha' : 'linhas'} em CSV, com as colunas visíveis`}
      className="flex items-center gap-2 px-3 py-2 border border-border-sutil text-text-tertiary hover:text-text-primary hover:border-text-secondary font-mono text-[10px] uppercase tracking-widest transition-colors"
    >
      <Download size={12} /> CSV
    </a>
  );
}
