import { createContext } from 'react';

/**
 * Avisa o `FormularioLateral` que a pessoa mexeu num controle que não é campo do
 * navegador, como o `Seletor` e o `Segmentado`. Fora dele, não faz nada.
 */
export const MarcarAlteracaoContext = createContext<() => void>(() => undefined);
