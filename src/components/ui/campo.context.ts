import { createContext } from 'react';

/** O id que o `Campo` deu ao rótulo, para o controle de dentro usar o mesmo. */
export const CampoContext = createContext<string | null>(null);
