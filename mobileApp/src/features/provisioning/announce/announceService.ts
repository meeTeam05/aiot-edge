import { markProvisioningAnnounced, useProvisioningSessionStore } from '../session';

import { announceApi, type AnnounceApi } from './announceApi';
import { AnnouncePollingError } from './models/announceModels';

export const ANNOUNCE_POLL_INTERVAL_MS = 2_000;
export const ANNOUNCE_POLL_TIMEOUT_MS = 60_000;

interface AnnounceServiceDependencies {
  api?: AnnounceApi;
  now?: () => number;
  delay?: (milliseconds: number) => Promise<void>;
  complete?: () => Promise<void>;
}

function delay(milliseconds: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, milliseconds));
}

interface ActivePoll {
  cancelled: boolean;
  promise: Promise<void>;
}

/** Flutter-equivalent immediate, single-flight cloud announce poller. */
export class CloudAnnounceService {
  private readonly api: AnnounceApi;
  private readonly now: () => number;
  private readonly wait: (milliseconds: number) => Promise<void>;
  private readonly complete: () => Promise<void>;
  private active: ActivePoll | null = null;

  constructor({ api = announceApi, now = Date.now, delay: wait = delay, complete = markProvisioningAnnounced }: AnnounceServiceDependencies = {}) {
    this.api = api;
    this.now = now;
    this.wait = wait;
    this.complete = complete;
  }

  start(): Promise<void> {
    if (this.active !== null) return this.active.promise;
    const poll: ActivePoll = { cancelled: false, promise: Promise.resolve() };
    poll.promise = this.run(poll).finally(() => {
      if (this.active === poll) this.active = null;
    });
    this.active = poll;
    return poll.promise;
  }

  async retry(): Promise<void> {
    const previous = this.active;
    this.cancel();
    if (previous !== null) {
      try {
        await previous.promise;
      } catch {
        // A cancelled/failed prior poll is expected before retrying.
      }
    }
    return this.start();
  }

  cancel(): void {
    if (this.active !== null) this.active.cancelled = true;
  }

  private async run(poll: ActivePoll): Promise<void> {
    const session = useProvisioningSessionStore.getState().session;
    const deviceId = session?.registeredDeviceId ?? session?.deviceMac;
    if ((session?.status !== 'device_configured' && session?.status !== 'failed') || deviceId === undefined) {
      throw new AnnouncePollingError('sessionMissing', 'Device configuration must complete before cloud confirmation');
    }

    useProvisioningSessionStore.getState().setStatus('waiting_cloud_announce');
    const deadline = this.now() + ANNOUNCE_POLL_TIMEOUT_MS;
    let lastError: Error | null = null;

    while (!poll.cancelled) {
      try {
        const announced = await this.api.check(deviceId);
        if (poll.cancelled) break;
        if (announced) {
          await this.complete();
          return;
        }
        lastError = null;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error('Cloud announcement check failed');
      }

      if (this.now() >= deadline) {
        const message = lastError === null
          ? 'Device did not announce within 60 seconds. Check Wi-Fi and try again.'
          : `Device did not announce within 60 seconds. Last error: ${lastError.message}`;
        useProvisioningSessionStore.getState().setFailed();
        throw new AnnouncePollingError('timeout', message);
      }
      await this.wait(ANNOUNCE_POLL_INTERVAL_MS);
    }

    throw new AnnouncePollingError('cancelled', 'Cloud announcement check cancelled');
  }
}
