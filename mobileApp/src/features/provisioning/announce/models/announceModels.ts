export interface AnnounceResponse {
  announced: boolean;
}

export class AnnounceDataMappingError extends Error {
  constructor() {
    super('Unexpected device announce response');
    this.name = 'AnnounceDataMappingError';
  }
}

export class AnnouncePollingError extends Error {
  constructor(
    public readonly code: 'timeout' | 'cancelled' | 'sessionMissing',
    message: string,
  ) {
    super(message);
    this.name = 'AnnouncePollingError';
  }
}

export function announceResponseFromDto(value: unknown): AnnounceResponse {
  if (typeof value !== 'object' || value === null || Array.isArray(value) || !('announced' in value) || typeof value.announced !== 'boolean') {
    throw new AnnounceDataMappingError();
  }
  return { announced: value.announced };
}
