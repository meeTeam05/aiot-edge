import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AxiosError, type AxiosResponse, type InternalAxiosRequestConfig } from 'axios';
import renderer, { act } from 'react-test-renderer';
import { Text } from 'react-native';

import { ApiError, httpClient } from '../src/api/httpClient';
import { deviceCommandApi } from '../src/features/device/api/deviceCommandApi';
import { useRelayCommandMutation } from '../src/features/device/hooks/useDeviceCommandMutations';
import { reconcileCommand } from '../src/features/device/services/commandReconciliation';

const originalAdapter = httpClient.defaults.adapter;

function success(config: InternalAxiosRequestConfig, data: unknown, status = 201): AxiosResponse {
  return { config, data, status, statusText: 'Created', headers: {} };
}

function failure(config: InternalAxiosRequestConfig, status: number, data: unknown): Promise<never> {
  return Promise.reject(new AxiosError('Request failed', undefined, config, undefined, success(config, data, status)));
}

beforeEach(() => {
  httpClient.defaults.adapter = async config => {
    switch (config.url) {
      case '/devices/aa%3Abb%3Acc%3Add%3Aee%3Aff/relay/1':
        return success(config, { command_id: 'relay-command-1' });
      case '/devices/aa%3Abb%3Acc%3Add%3Aee%3Aff/mode':
        return success(config, { command_id: 'mode-command-1' });
      case '/devices/aa%3Abb%3Acc%3Add%3Aee%3Aff/command':
        return success(config, { command_id: 'generic-command-1' });
      default:
        throw new Error(`Unexpected request: ${config.url}`);
    }
  };
});

afterEach(() => { httpClient.defaults.adapter = originalAdapter; });

describe('Device command API contracts', () => {
  it('maps relay and mode command submissions to pending command IDs', async () => {
    const [relay, mode] = await Promise.all([
      deviceCommandApi.sendRelay('AA:BB:CC:DD:EE:FF', 1, true),
      deviceCommandApi.sendMode('AA:BB:CC:DD:EE:FF', 'off'),
    ]);
    expect(relay).toEqual(expect.objectContaining({ commandId: 'relay-command-1', status: 'pending' }));
    expect(mode).toEqual(expect.objectContaining({ commandId: 'mode-command-1', status: 'pending' }));
  });

  it('normalizes backend command errors', async () => {
    httpClient.defaults.adapter = async config => failure(config, 409, { error: 'device offline' });
    await expect(deviceCommandApi.sendGeneric('device-1', { type: 'relay_set', relay: 1, state: true })).rejects.toMatchObject<ApiError>({
      name: 'ApiError', message: 'device offline', statusCode: 409,
    });
  });
});

describe('Flutter command reconciliation foundation', () => {
  const submittedAt = new Date('2026-09-19T02:00:00.000Z');
  const expected = { kind: 'relay' as const, channel: 1 as const, state: true };
  const shadow = { reported: { mode: 'on', relay_1: false }, desired: {}, updatedAt: null };

  it('keeps pending and sent commands unconfirmed, without changing reported shadow', () => {
    const unchangedShadow = { ...shadow, reported: { ...shadow.reported }, desired: { ...shadow.desired } };
    const now = new Date(submittedAt.getTime() + 1_000);
    expect(reconcileCommand({ command: { id: 'cmd-1', status: 'pending', errorMessage: null }, expected, reportedShadow: shadow, submittedAt, now })).toEqual({ state: 'pending', commandId: 'cmd-1' });
    expect(reconcileCommand({ command: { id: 'cmd-1', status: 'sent', errorMessage: null }, expected, reportedShadow: shadow, submittedAt, now })).toEqual({ state: 'sent', commandId: 'cmd-1' });
    expect(shadow).toEqual(unchangedShadow);
  });

  it('requires matching reported shadow after done, and handles error and timeout states', () => {
    expect(reconcileCommand({ command: { id: 'cmd-1', status: 'done', errorMessage: null }, expected, reportedShadow: shadow, submittedAt })).toEqual({ state: 'awaiting-reported-state', commandId: 'cmd-1' });
    expect(reconcileCommand({ command: { id: 'cmd-1', status: 'done', errorMessage: null }, expected, reportedShadow: { ...shadow, reported: { ...shadow.reported, relay_1: true } }, submittedAt })).toEqual({ state: 'confirmed', commandId: 'cmd-1' });
    expect(reconcileCommand({ command: { id: 'cmd-1', status: 'error', errorMessage: 'Relay fault' }, expected, reportedShadow: shadow, submittedAt })).toEqual({ state: 'failed', commandId: 'cmd-1', errorMessage: 'Relay fault' });
    expect(reconcileCommand({ command: { id: 'cmd-1', status: 'timeout', errorMessage: null }, expected, reportedShadow: shadow, submittedAt })).toEqual({ state: 'queued', commandId: 'cmd-1' });
  });

  it('uses Flutter’s five-second pending UI timeout without an optimistic update', () => {
    expect(reconcileCommand({ command: null, expected, reportedShadow: shadow, submittedAt, now: new Date(submittedAt.getTime() + 4_999) })).toEqual({ state: 'pending', commandId: '' });
    expect(reconcileCommand({ command: null, expected, reportedShadow: shadow, submittedAt, now: new Date(submittedAt.getTime() + 5_000) })).toEqual({ state: 'queued', commandId: '' });
  });
});

describe('Relay mutation hook', () => {
  let mutation: ReturnType<typeof useRelayCommandMutation> | null = null;

  function Probe() {
    mutation = useRelayCommandMutation('AA:BB:CC:DD:EE:FF');
    return <Text>{mutation.isPending ? 'pending' : mutation.commandId ?? 'idle'}</Text>;
  }

  it('exposes pending state and a command ID without patching query data', async () => {
    let resolveRequest: ((response: AxiosResponse) => void) | undefined;
    httpClient.defaults.adapter = _config => new Promise(resolve => { resolveRequest = response => resolve(response); });
    const queryClient = new QueryClient({ defaultOptions: { mutations: { gcTime: Infinity }, queries: { retry: false } } });
    queryClient.setQueryData(['device', 'aa:bb:cc:dd:ee:ff', 'shadow'], { reported: { relay_1: false } });
    let tree: renderer.ReactTestRenderer;
    let request: Promise<unknown> | undefined;
    await act(async () => { tree = renderer.create(<QueryClientProvider client={queryClient}><Probe /></QueryClientProvider>); });

    await act(async () => {
      request = mutation?.mutateAsync({ channel: 1, state: true });
      await new Promise<void>(resolve => setTimeout(() => resolve(), 0));
    });
    expect(tree!.root.findByType(Text).props.children).toBe('pending');
    expect(queryClient.getQueryData(['device', 'aa:bb:cc:dd:ee:ff', 'shadow'])).toEqual({ reported: { relay_1: false } });

    await act(async () => {
      resolveRequest?.(success({ url: '' } as InternalAxiosRequestConfig, { command_id: 'relay-command-1' }));
      await request;
      await new Promise<void>(resolve => setTimeout(() => resolve(), 20));
    });
    expect(tree!.root.findByType(Text).props.children).toBe('relay-command-1');
    expect(queryClient.getQueryData(['device', 'aa:bb:cc:dd:ee:ff', 'shadow'])).toEqual({ reported: { relay_1: false } });
    await act(async () => { tree!.unmount(); });
    queryClient.clear();
  });
});
