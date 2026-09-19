import { z } from 'zod';

const OtaVersionInfoSchema = z.object({
  version: z.string(),
  filename: z.string(),
  url: z.string(),
});

export type OtaVersionInfo = z.infer<typeof OtaVersionInfoSchema>;

const DeviceOtaCatalogSchema = z
  .object({
    device_id: z.string(),
    current_version: z.string().nullable(),
    device_online: z.boolean(),
    versions: z.array(OtaVersionInfoSchema),
  })
  .transform((raw) => ({
    deviceId: raw.device_id,
    currentVersion: raw.current_version,
    deviceOnline: raw.device_online,
    versions: raw.versions,
  }));

export type DeviceOtaCatalog = z.infer<typeof DeviceOtaCatalogSchema>;

/**
 * Throws a ZodError on any shape mismatch. The original Dart
 * `getOtaCatalog` wraps the same failure as `ApiException(0, 'Unexpected
 * server response')` — replicate that wrapping in the Phase 6 OTA service
 * (device_service.ts), not here.
 */
export function parseDeviceOtaCatalog(json: unknown): DeviceOtaCatalog {
  return DeviceOtaCatalogSchema.parse(json);
}
