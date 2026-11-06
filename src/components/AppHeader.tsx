import { Menu } from 'lucide-react';
import MenuDoUsuario from './MenuDoUsuario';
import { Button } from './ui/button';
import { TopProgress } from './ui/top-progress';
import { useBarraLateral } from '../hooks/useBarraLateral';
import { useVagaDoTitulo } from '../hooks/useVagaDoTitulo';
import { useConsultasEmVoo } from '../queries/atividade.queries';

// O CABEÇALHO, depois de a navegação sair dele.
//
// ═══════════════════════════════════════════════════════════════════════════
// O QUE SAIU, E POR QUE O QUE FICOU FICOU.
//
// SAIU a `<nav>` de catorze links (foi para `AppSidebar`): com eles aqui, o
// cabeçalho ficava mais largo que a janela e, sendo `sticky`, dava rolagem
// horizontal à página inteira — em toda tela, inclusive sem tabela larga.
//
// FICOU o que precisa estar à mão em todas as telas: o título da página, que ela
// mesma desenha na vaga (`useVagaDoTitulo`), o menu do usuário, com o tema, a conta
// e o Sair, e a faixa de carregamento na borda de baixo, que qualquer consulta
// acende. Botão de página não vem para cá (BB).
//
// E ENTROU o botão da gaveta, que abaixo de `md` é a ÚNICA forma de alcançar o
// menu.
// ═══════════════════════════════════════════════════════════════════════════

export default function AppHeader() {
  const abrirNoCelular = useBarraLateral((estado) => estado.abrirNoCelular);
  const registrarVaga = useVagaDoTitulo((estado) => estado.registrar);
  const carregando = useConsultasEmVoo();

  return (
    <header className="sticky top-0 z-20 flex h-14 shrink-0 items-center gap-3 border-b border-border-sutil bg-bg-base px-3 md:px-6">
      <Button
        variant="ghost"
        size="icon-sm"
        onClick={abrirNoCelular}
        aria-label="Abrir menu"
        className="md:hidden"
      >
        <Menu />
      </Button>

      <div ref={registrarVaga} className="flex min-w-0 flex-1 items-center gap-2" />

      <MenuDoUsuario />

      <TopProgress ativa={carregando} />
    </header>
  );
}
