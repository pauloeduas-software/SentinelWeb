import type { ImportTarget } from '@prisma/client';
import { adaptadorDeAtivos } from '../use-cases/import-assets.usecase';
import { adaptadorDePessoas } from '../use-cases/import-users.usecase';
import { adaptadorDeOcupacao } from '../use-cases/import-occupants.usecase';
import type { FabricaDeAdaptador } from './plano.types';

// O MAPA ALVO → ADAPTADOR, num lugar só.
//
// `Record<ImportTarget, …>` e não um `switch`: com o tipo do enum como chave, um
// alvo novo no `schema.prisma` NÃO COMPILA até ter adaptador. Um `switch` com
// `default` aceitaria o alvo novo e falharia em runtime, na primeira
// importação de quem o escolheu.
export const ADAPTADORES: Record<ImportTarget, FabricaDeAdaptador> = {
  ASSETS: adaptadorDeAtivos,
  USERS: adaptadorDePessoas,
  OCCUPANTS: adaptadorDeOcupacao,
};
