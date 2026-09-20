import { getEnvironment } from '../environment';
import { realtimeEventFromDto, type RealtimeEvent } from './realtimeEvents';
import { SseParser } from './sseParser';

export interface RealtimeClientOptions {
  fetchImpl?: RealtimeFetch;
  initialReconnectDelayMs?: number;
  maxReconnectDelayMs?: number;
  onConnectionState?: (state: 'connected' | 'reconnecting' | 'disconnected' | 'error', error?: Error) => void;
  onEvent: (event: RealtimeEvent) => void;
  onUnauthorized?: () => Promise<void> | void;
  sleep?: (milliseconds: number) => Promise<void>;
}

export interface RealtimeStreamReader { read: () => Promise<{ done: boolean; value?: Uint8Array }>; releaseLock: () => void; }
export interface RealtimeStream { getReader: () => RealtimeStreamReader; }
export interface RealtimeFetchResponse { ok: boolean; status: number; body: RealtimeStream | null; }
export type RealtimeFetch = (url: string, options: { headers: Record<string, string>; signal: AbortSignal }) => Promise<RealtimeFetchResponse>;
interface Utf8Decoder { decode: (input?: Uint8Array, options?: { stream?: boolean }) => string; }

/** One bearer-authenticated GET /realtime owner. It is deliberately not an MQTT client. */
export class RealtimeClient {
  private readonly fetchImpl: RealtimeFetch;
  private readonly initialReconnectDelayMs: number;
  private readonly maxReconnectDelayMs: number;
  private readonly sleep: (milliseconds: number) => Promise<void>;
  private accessToken: string | null = null;
  private abortController: AbortController | null = null;
  private lastEventId: string | null = null;
  private running = false;

  constructor(private readonly options: RealtimeClientOptions) {
    this.fetchImpl = options.fetchImpl ?? (fetch as unknown as RealtimeFetch);
    this.initialReconnectDelayMs = options.initialReconnectDelayMs ?? 1_000;
    this.maxReconnectDelayMs = options.maxReconnectDelayMs ?? 30_000;
    this.sleep = options.sleep ?? (milliseconds => new Promise<void>(resolve => setTimeout(resolve, milliseconds)));
  }

  start(accessToken: string): void {
    if (this.running && this.accessToken === accessToken) return;
    this.stop();
    this.accessToken = accessToken;
    this.running = true;
    this.run().catch(error => {
      if (this.running) this.options.onConnectionState?.('error', error instanceof Error ? error : new Error('Realtime connection failed'));
    });
  }

  stop(): void {
    this.running = false;
    this.accessToken = null;
    this.abortController?.abort();
    this.abortController = null;
    this.options.onConnectionState?.('disconnected');
  }

  private async run(): Promise<void> {
    let delay = this.initialReconnectDelayMs;
    while (this.running && this.accessToken !== null) {
      try {
        this.options.onConnectionState?.(this.lastEventId === null ? 'reconnecting' : 'reconnecting');
        this.abortController = new AbortController();
        const response = await this.fetchImpl(`${getEnvironment().apiBaseUrl}/realtime`, {
          headers: { Accept: 'text/event-stream', Authorization: `Bearer ${this.accessToken}`, ...(this.lastEventId === null ? {} : { 'Last-Event-ID': this.lastEventId }) },
          signal: this.abortController.signal,
        });
        if (!response.ok) {
          if (response.status === 401) {
            this.running = false;
            await this.options.onUnauthorized?.();
            break;
          }
          throw new Error(`Realtime connection failed (${response.status})`);
        }
        if (response.body === null) throw new Error('Realtime response stream is empty');
        this.options.onConnectionState?.('connected');
        delay = this.initialReconnectDelayMs;
        await this.readStream(response.body);
      } catch (error) {
        if (!this.running || isAbortError(error)) break;
        this.options.onConnectionState?.('error', error instanceof Error ? error : new Error('Realtime connection failed'));
      } finally {
        this.abortController = null;
      }
      if (!this.running) break;
      this.options.onConnectionState?.('reconnecting');
      await this.sleep(delay);
      delay = Math.min(delay * 2, this.maxReconnectDelayMs);
    }
    if (!this.running) this.options.onConnectionState?.('disconnected');
  }

  private async readStream(stream: RealtimeStream): Promise<void> {
    const reader = stream.getReader();
    const decoder = createUtf8Decoder();
    const parser = new SseParser();
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        for (const frame of parser.add(decoder.decode(value, { stream: true }))) this.handleFrame(frame.id, frame.type, frame.data);
      }
      for (const frame of parser.add(decoder.decode())) this.handleFrame(frame.id, frame.type, frame.data);
    } finally {
      reader.releaseLock();
    }
  }

  private handleFrame(frameId: string | null, frameType: string | null, data: string): void {
    try {
      const parsed = JSON.parse(data) as Record<string, unknown>;
      if (frameId !== null && frameId.length > 0) parsed.id = frameId;
      if (frameType !== null && frameType.length > 0) parsed.type = frameType;
      const event = realtimeEventFromDto(parsed);
      if (event === null) return;
      this.lastEventId = event.id;
      this.options.onEvent(event);
    } catch {
      // Match Flutter: malformed SSE frames are ignored rather than terminating the stream.
    }
  }
}

function createUtf8Decoder(): Utf8Decoder {
  const constructor = (globalThis as unknown as { TextDecoder?: new () => Utf8Decoder }).TextDecoder;
  if (constructor === undefined) throw new Error('TextDecoder is unavailable for realtime streaming');
  return new constructor();
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError';
}
