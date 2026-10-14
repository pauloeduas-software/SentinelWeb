import { createLogger } from '../../server/core/logger/logger';

export const logger = createLogger('seed');

export interface Seeder {
  name: string;
  run: () => Promise<void>;
}
