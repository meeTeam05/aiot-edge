import { useQuery } from '@tanstack/react-query';
import { deviceService } from '../services/deviceService';

export const otaCatalogQueryKey = (deviceId: string) => ['ota-catalog', deviceId] as const;

export function useOtaCatalog(deviceId: string) {
  return useQuery({
    queryKey: otaCatalogQueryKey(deviceId),
    queryFn: () => deviceService.getOtaCatalog(deviceId),
    enabled: deviceId.length > 0,
  });
}
