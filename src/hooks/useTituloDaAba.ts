import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { nomeDaTela } from '../components/navegacao';

// O TÍTULO DA ABA DO NAVEGADOR, pela tela aberta: "Licenças · Sentinel".
//
// Com várias abas do painel abertas, todas se chamavam "Sentinel" e só abrindo
// cada uma se sabia qual era qual. O nome é o do menu (`nomeDaTela`), o mesmo
// que acende o item na barra lateral; as telas fora do menu têm o seu aqui.
const FORA_DO_MENU: Record<string, string> = {
  '/login': 'Entrar',
  '/conta': 'Minha conta',
};

const SISTEMA = 'Sentinel';

export function useTituloDaAba(): void {
  const { pathname } = useLocation();
  const tela = FORA_DO_MENU[pathname] ?? nomeDaTela(pathname);

  useEffect(() => {
    document.title = tela ? `${tela} · ${SISTEMA}` : SISTEMA;
  }, [tela]);
}
