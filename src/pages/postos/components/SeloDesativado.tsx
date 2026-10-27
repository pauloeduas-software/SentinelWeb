// Mora em arquivo próprio porque são DUAS portas que o mostram — a linha da
// listagem e o cabeçalho da ficha —, e duas cópias de um selo divergem na
// primeira troca de rótulo.

/**
 * A marca de posto DESATIVADO — a mesma das Configurações (`CatalogTable`) e
 * de Usuários: o padrão do cadastro é um só, e a mesma palavra do botão que a
 * causou.
 */
export default function SeloDesativado() {
  return (
    <span
      className="text-[10px] text-status-warning uppercase tracking-widest"
      title="Posto desativado: continua no histórico, mas não recebe entrega nem ocupante novo."
    >
      desativado
    </span>
  );
}
