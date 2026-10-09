import { useSystemSettingsQuery } from '../../domain/settings/settings.queries';
import { aplicarFormato } from '../helpers/format.helper';

// A CONFIGURAÇÃO DE SISTEMA, do lado da tela (F10, Etapa A).
//
// Dois hooks, e a divisão é por quem chama: `useSistema()` é leitura, usada por
// qualquer tela que queira o nome ou a logo da empresa;
// `useFormatoDoSistema()` é o ÚNICO que escreve — e é chamado UMA vez, no
// `Layout`, acima do roteador.

/** O recorte de sistema. Query compartilhada: chamar de dois lugares não dobra requisição. */
export function useSistema() {
  const { data, isPending } = useSystemSettingsQuery();
  return { configuracao: data, carregando: isPending };
}

/**
 * Aplica no navegador o que a configuração decide: formato de número e data.
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * POR QUE O `aplicarFormato` RODA NO RENDER, E NÃO NUM `useEffect`.
 *
 * `useEffect` roda DEPOIS da pintura. O primeiro render com a configuração na
 * mão já desenharia a tela inteira com o formato antigo, e nada depois disso
 * provocaria um novo render — o valor do módulo não é reativo, então a tela
 * ficaria em `pt-BR`/`BRL` até alguém navegar.
 *
 * Chamado aqui, ele está escrito antes de os filhos renderizarem (o pai
 * renderiza primeiro), e o render que chega com `data` já é o render correto.
 * É seguro porque a escrita é idempotente e derivada do próprio `data`: rodar
 * duas vezes com o mesmo valor não tem efeito nenhum.
 *
 * ═════════════════════════════════════════════════════════════════════════════
 */
export function useFormatoDoSistema() {
  const { configuracao } = useSistema();

  if (configuracao) {
    aplicarFormato({
      locale: configuracao.locale,
      dateFormat: configuracao.dateFormat,
      currency: configuracao.currency,
    });
  }

  return configuracao;
}
