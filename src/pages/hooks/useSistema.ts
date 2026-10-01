import { useEffect } from 'react';
import { useSystemSettingsQuery, urlDaMarca } from '../../domain/settings/settings.queries';
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

/** O endereço da logo, ou `null` quando não há nenhuma configurada. */
export function useUrlDaLogo(): string | null {
  const { configuracao } = useSistema();
  return configuracao?.logoPath ? urlDaMarca('logo') : null;
}

/**
 * Aplica no navegador o que a configuração decide: formato de número e data,
 * a cor da marca e o favicon.
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
 * A COR e o FAVICON, ao contrário, mexem no DOM fora do React — e isso é
 * `useEffect` por definição.
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

  const corDaMarca = configuracao?.primaryColor;
  const temFavicon = configuracao?.faviconPath != null;

  useEffect(() => {
    if (!corDaMarca) return;

    // `--color-marca` é um token NOVO, e de propósito: a tentação é escrever em
    // `--color-text-primary`, que é a cor do texto E o fundo de todo botão do
    // painel. Uma cor de marca escura ali deixaria botão escuro com letra
    // escura — ilegível, e descoberto só por quem configurou. Aqui a cor
    // aparece onde foi escolhida aparecer.
    document.documentElement.style.setProperty('--color-marca', corDaMarca);
  }, [corDaMarca]);

  useEffect(() => {
    if (!temFavicon) return;

    const link = document.querySelector<HTMLLinkElement>("link[rel='icon']");
    if (!link) return;

    const anterior = link.href;
    const anteriorType = link.type;
    // O `type` sai de cena: o arquivo é PNG/JPG/WEBP e o `index.html` declara
    // `image/svg+xml`. Com o type errado o Chrome ignora o ícone em silêncio.
    link.removeAttribute('type');
    link.href = urlDaMarca('favicon');

    return () => {
      link.href = anterior;
      if (anteriorType) link.type = anteriorType;
    };
  }, [temFavicon]);

  return configuracao;
}
