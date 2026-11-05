// A FAIXA DE CARREGAMENTO, na borda de baixo do cabeçalho. `ativa` vem de quem a
// desenha (`AppHeader`, com `useConsultasEmVoo`): este arquivo fica sem HTTP, como
// o resto de `components`.
//
// Indeterminada de propósito: uma consulta JSON não informa progresso, e barra que
// salta para 90% e espera é mentira educada.
export function TopProgress({ ativa }: { ativa: boolean }) {
  if (!ativa) return null;
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 bottom-0 h-0.5 overflow-hidden">
      <div className="h-full bg-primary motion-safe:animate-carregando" />
    </div>
  );
}
