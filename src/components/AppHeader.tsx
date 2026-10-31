import { Menu } from 'lucide-react';
import BuscaDoLeitor from './BuscaDoLeitor';
import { useBarraLateral } from '../hooks/useBarraLateral';

// O CABEÇALHO, depois de a navegação sair dele.
//
// ═══════════════════════════════════════════════════════════════════════════
// O QUE SAIU, E POR QUE O QUE FICOU FICOU.
//
// SAIU a `<nav>` de catorze links (foi para `AppSidebar`): com eles aqui, o
// cabeçalho ficava mais largo que a janela e, sendo `sticky`, dava rolagem
// horizontal à página inteira — em toda tela, inclusive sem tabela larga.
//
// SAIU a marca, que agora encabeça a barra lateral, e SAIU o nome de quem está
// logado, que agora é o rodapé dela: sessão não é informação de tela, e aqui
// disputava largura com a busca do leitor.
//
// SAIU o nome da tela: ele repetia o título que a própria página já tem logo
// abaixo. Foi para a aba do navegador (`useTituloDaAba`).
//
// FICOU o que precisa estar visível em todas as telas:
//   a busca do leitor   conferir prateleira é bipar vinte equipamentos em
//                       sequência (F10, Etapa G); navegar até uma tela de busca
//                       entre cada um viraria vinte navegações;
//   o sino              a única coisa da moldura que muda sozinha.
//
// E ENTROU o botão da gaveta, que abaixo de `md` é a ÚNICA forma de alcançar o
// menu. Antes desta mudança não havia nenhuma: a `<nav>` era `hidden` nessa
// faixa, e o painel ficava sem navegação no celular.
// ═══════════════════════════════════════════════════════════════════════════

export default function AppHeader() {
  const abrirNoCelular = useBarraLateral((estado) => estado.abrirNoCelular);

  return (
    <header className="sticky top-0 z-20 flex h-14 shrink-0 items-center justify-between gap-4 border-b border-border-sutil bg-bg-base px-4 md:px-6">
      <div className="flex min-w-0 items-center gap-3">
        <button
          type="button"
          onClick={abrirNoCelular}
          aria-label="Abrir menu"
          className="p-2 text-text-tertiary transition-colors hover:text-text-primary md:hidden"
        >
          <Menu size={16} />
        </button>
      </div>

      <div className="flex shrink-0 items-center gap-4 font-mono text-xs">
        <div className="hidden md:block">
          <BuscaDoLeitor />
        </div>
      </div>
    </header>
  );
}
