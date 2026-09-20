import type { Home } from '../home/models/homeModels';

export type AddDeviceDestination =
  | { kind: 'loading' }
  | { kind: 'createHome' }
  | { kind: 'provision'; homeId: string }
  | { kind: 'chooseHome' };

/** Mirrors HomeScreen._handleAddDevice: cached homes win over an in-flight refresh. */
export function getAddDeviceDestination(homes: Home[], isLoading: boolean): AddDeviceDestination {
  if (isLoading && homes.length === 0) return { kind: 'loading' };
  if (homes.length === 0) return { kind: 'createHome' };
  if (homes.length === 1) {
    const [home] = homes;
    if (home) return { kind: 'provision', homeId: home.id };
  }
  return { kind: 'chooseHome' };
}
