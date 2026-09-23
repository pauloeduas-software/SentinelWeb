import { peekNextAssetTag } from '../use-cases/app-settings.usecase';

export const settingsController = {
  async nextAssetTag() {
    return peekNextAssetTag();
  },
};
