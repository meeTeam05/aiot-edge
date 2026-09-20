export interface OtaVersion {
  version: string;
  filename: string;
  url: string;
}

/** Normalized GET /devices/:id/ota/versions response. */
export interface OtaCatalogResponse {
  deviceId: string;
  currentVersion: string | null;
  deviceOnline: boolean;
  versions: OtaVersion[];
}

/** A POST /devices/:id/ota request was accepted; it is not OTA completion. */
export interface OtaRequest {
  deviceId: string;
  version: string;
  filename: string;
  status: 'accepted';
}

export class OtaDataMappingError extends Error {
  constructor() {
    super('Unexpected server response');
    this.name = 'OtaDataMappingError';
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function record(value: unknown): Record<string, unknown> {
  if (!isRecord(value)) throw new OtaDataMappingError();
  return value;
}

function requiredString(value: Record<string, unknown>, key: string): string {
  const field = value[key];
  if (typeof field !== 'string' || field.length === 0) throw new OtaDataMappingError();
  return field;
}

function nullableString(value: Record<string, unknown>, key: string): string | null {
  const field = value[key];
  if (field === undefined || field === null) return null;
  if (typeof field !== 'string') throw new OtaDataMappingError();
  return field;
}

function requiredBoolean(value: Record<string, unknown>, key: string): boolean {
  const field = value[key];
  if (typeof field !== 'boolean') throw new OtaDataMappingError();
  return field;
}

function otaVersionFromDto(value: unknown): OtaVersion {
  const dto = record(value);
  return {
    version: requiredString(dto, 'version'),
    filename: requiredString(dto, 'filename'),
    url: requiredString(dto, 'url'),
  };
}

/** Mirrors Flutter DeviceService.getOtaCatalog's strict response validation. */
export function otaCatalogFromDto(value: unknown): OtaCatalogResponse {
  const dto = record(value);
  if (!Array.isArray(dto.versions)) throw new OtaDataMappingError();
  return {
    deviceId: requiredString(dto, 'device_id'),
    currentVersion: nullableString(dto, 'current_version'),
    deviceOnline: requiredBoolean(dto, 'device_online'),
    versions: dto.versions.map(otaVersionFromDto),
  };
}

/** Maps the backend's 202 request acknowledgement without representing progress. */
export function otaRequestFromDto(value: unknown): OtaRequest {
  const dto = record(value);
  if (requiredString(dto, 'status') !== 'accepted') throw new OtaDataMappingError();
  return {
    deviceId: requiredString(dto, 'device_id'),
    version: requiredString(dto, 'version'),
    filename: requiredString(dto, 'filename'),
    status: 'accepted',
  };
}
