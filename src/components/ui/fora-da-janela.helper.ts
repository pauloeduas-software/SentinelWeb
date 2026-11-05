/**
 * Fechar a notificação não é clicar fora da janela: ela fica por cima do véu, e
 * sem isto o X do cartão levaria junto o formulário que estava sendo corrigido.
 */
export function naoFecharPelaNotificacao(evento: { target: EventTarget | null; preventDefault: () => void }): void {
  const alvo = (evento as { detail?: { originalEvent?: Event } }).detail?.originalEvent?.target ?? evento.target;
  if (alvo instanceof Element && alvo.closest('[data-notificacao]')) evento.preventDefault();
}
