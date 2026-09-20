import type { QueryClient } from '@tanstack/react-query';

import { deviceDashboardQueryKeys } from '../../device/hooks/useDeviceDashboardQueries';
import { homeQueryKeys } from '../../home/hooks/useHomeQueries';
import { completeProvisioningSession } from './provisioningSessionLifecycle';

/** Invalidates only provisioning-affected data before clearing temporary workflow state. */
export async function finalizeProvisioningHandoff(
  queryClient: QueryClient,
  deviceId: string,
  complete: () => Promise<void> = completeProvisioningSession,
): Promise<void> {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: homeQueryKeys.devices() }),
    queryClient.invalidateQueries({ queryKey: deviceDashboardQueryKeys.device(deviceId) }),
  ]);
  await complete();
}
