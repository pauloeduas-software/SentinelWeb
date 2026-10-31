import { createLogger } from '../../server/infra/logger/logger';

export const logger = createLogger('seed');

export interface Seeder {
  name: string;
  run: () => Promise<void>;
}
