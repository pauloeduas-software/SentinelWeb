import { useEffect, useState } from 'react';

/**
 * Atrasa a propagação de um valor até ele parar de mudar.
 *
 * Usado na busca das listagens: sem isto, cada tecla digitada vira uma
 * requisição ao servidor — "notebook" dispararia oito.
 */
export function useDebouncedValue<T>(value: T, delayMs = 300): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    // Tecla nova antes do prazo cancela o disparo anterior
    return () => clearTimeout(timer);
  }, [value, delayMs]);

  return debounced;
}
