// Mora em arquivo próprio porque são DUAS portas que o mostram — a linha da
// listagem e o cabeçalho da ficha —, e duas cópias de um selo divergem na
// primeira troca de rótulo.

/**
 * O selo de posto DESATIVADO — o mesmo desenho do selo de status na ficha do
 * posto (borda fina, caixa alta, sem cor), para não competir com o amarelo do
 * vago, que é o sinal que esta tela existe para dar.
 */
export default function SeloDesativado() {
  return (
    <span
      className="px-1.5 py-0.5 border border-border-sutil rounded-[2px] text-text-tertiary text-[10px] uppercase tracking-widest"
      title="Posto desativado: continua no histórico, mas não recebe entrega nem ocupante novo."
    >
      Desativado
    </span>
  );
}
