// O COLABORADOR COMO ENDEREÇO — compartilhado pela página Colaboradores, que abre
// a ficha pela ação da linha, e pelos redirecionamentos dos endereços antigos
// (`src/App.tsx`).

/** O endereço da ficha de um colaborador (decisão AH). */
export function caminhoDoColaborador(personId: string): string {
  return `/colaboradores/${personId}`;
}
