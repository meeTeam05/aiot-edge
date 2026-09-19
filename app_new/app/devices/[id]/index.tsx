import { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { useColors } from '@/theme/useColors';
import { AppIcons } from '@/theme/icons';
import { AtmosphereTextStyles } from '@/theme/textStyles';
import { AtmosphereTokens } from '@/theme/tokens';

import { AtmosphereAppBar } from '@/components/shell/AtmosphereAppBar';
import { AtmosphereCard } from '@/components/atoms/AtmosphereCard';
import { DeviceModeCard } from '@/components/atoms/ModeCard';
import { SensorTile } from '@/components/atoms/SensorTile';
import { RelayCard } from '@/components/atoms/RelayCard';
import { EmptyState } from '@/components/atoms/EmptyState';

import { useDevices } from '@/queries/devices';
import { useCommands } from '@/queries/commands';
import { useTelemetryLive } from '@/hooks/useTelemetryLive';
import { deviceService } from '@/services/deviceService';

// Command hard-timeout for relay/mode toggles matches the Dart original's
// _shadowHardTimeout (device_dashboard_screen.dart) — these are near-instant
// firmware operations, unlike OTA/calibration which run for minutes.
const CONTROL_COMMAND_TIMEOUT_MS = 10_000;
const CONTROL_POLL_INTERVAL_MS = 1000;

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function formatRelativeTime(date: Date): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${date.getDate()}/${date.getMonth() + 1}`;
}

export default function DeviceDashboardScreen() {
  const { id: deviceId } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const c = useColors();

  const devicesQuery = useDevices();
  const commandsQuery = useCommands(deviceId);
  const telemetry = useTelemetryLive(deviceId);

  const device = (devicesQuery.data ?? []).find((d) => d.id === deviceId) ?? null;

  const [optimisticMode, setOptimisticMode] = useState<boolean | null>(null);
  const [modePending, setModePending] = useState(false);
  const [optimisticRelay1, setOptimisticRelay1] = useState<boolean | null>(null);
  const [optimisticRelay2, setOptimisticRelay2] = useState<boolean | null>(null);
  const [optimisticRelay3, setOptimisticRelay3] = useState<boolean | null>(null);
  const [relay1Pending, setRelay1Pending] = useState(false);
  const [relay2Pending, setRelay2Pending] = useState(false);
  const [relay3Pending, setRelay3Pending] = useState(false);

  const deviceOn = optimisticMode ?? (device?.mode ?? '').toLowerCase() === 'on';
  const relay1 = optimisticRelay1 ?? device?.relay1 ?? false;
  const relay2 = optimisticRelay2 ?? device?.relay2 ?? false;
  const relay3 = optimisticRelay3 ?? device?.relay3 ?? false;

  function goBack() {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/home');
    }
  }

  async function handleModeChange(value: boolean) {
    if (!device) return;
    setOptimisticMode(value);
    setModePending(true);
    try {
      const commandId = await deviceService.setMode(device.id, value ? 'on' : 'off');
      await deviceService.waitForCommandCompletion(device.id, commandId, {
        timeoutMs: CONTROL_COMMAND_TIMEOUT_MS,
        pollIntervalMs: CONTROL_POLL_INTERVAL_MS,
      });
    } catch (err) {
      Alert.alert('Could not change mode', errorMessage(err));
    } finally {
      setModePending(false);
      setOptimisticMode(null);
    }
  }

  async function handleRelayToggle(
    channel: 1 | 2 | 3,
    current: boolean,
    setOptimistic: (v: boolean | null) => void,
    setPending: (v: boolean) => void,
  ) {
    if (!device || !deviceOn) return;
    const next = !current;
    setOptimistic(next);
    setPending(true);
    try {
      const commandId = await deviceService.setRelay(device.id, channel, next);
      await deviceService.waitForCommandCompletion(device.id, commandId, {
        timeoutMs: CONTROL_COMMAND_TIMEOUT_MS,
        pollIntervalMs: CONTROL_POLL_INTERVAL_MS,
      });
    } catch (err) {
      Alert.alert('Could not toggle relay', errorMessage(err));
    } finally {
      setPending(false);
      setOptimistic(null);
    }
  }

  if (devicesQuery.isLoading) {
    return (
      <View style={[styles.screen, { backgroundColor: c.bg }]}>
        <AtmosphereAppBar variant="back" title="Device" onBack={goBack} />
        <View style={styles.blockingCenter}>
          <ActivityIndicator color={c.brand} />
        </View>
      </View>
    );
  }

  if (devicesQuery.isError) {
    return (
      <View style={[styles.screen, { backgroundColor: c.bg }]}>
        <AtmosphereAppBar variant="back" title="Device" onBack={goBack} />
        <EmptyState
          icon={AppIcons.warn}
          title="Failed to load device"
          body={errorMessage(devicesQuery.error)}
          primaryAction="Retry"
          onPrimaryAction={() => devicesQuery.refetch()}
        />
      </View>
    );
  }

  if (!device) {
    return (
      <View style={[styles.screen, { backgroundColor: c.bg }]}>
        <AtmosphereAppBar variant="back" title={deviceId ?? 'Device'} onBack={goBack} />
        <EmptyState
          icon={AppIcons.warn}
          title="Device not found"
          body="This device is not in your list. It may have been removed."
        />
      </View>
    );
  }

  const latestCommand = (commandsQuery.data ?? [])[0] ?? null;
  const numericSeries = (pick: (p: { temperature: number | null; humidity: number | null; coPpm: number | null; no2Ppm: number | null }) => number | null) =>
    telemetry.points.map(pick).filter((v): v is number => v !== null);

  return (
    <View style={[styles.screen, { backgroundColor: c.bg }]}>
      <AtmosphereAppBar
        variant="back"
        title={device.name}
        onBack={goBack}
        actions={
          <Pressable onPress={() => router.push(`/devices/${device.id}/settings`)} hitSlop={8}>
            <AppIcons.cog size={20} color={c.ink} />
          </Pressable>
        }
      />

      <ScrollView contentContainerStyle={styles.content}>
        <Text style={AtmosphereTextStyles.caption(device.online ? c.brand : c.ink3)}>
          {device.online ? '● Online' : '● Offline'}
        </Text>

        <View style={{ height: AtmosphereTokens.space16 }} />

        <DeviceModeCard
          mode={deviceOn ? 'on' : 'off'}
          online={device.online}
          onChange={modePending ? undefined : handleModeChange}
        />

        <View style={{ height: AtmosphereTokens.space20 }} />

        <View style={styles.sensorGrid}>
          <View style={styles.sensorCell}>
            <SensorTile
              value={deviceOn ? (telemetry.latest?.temperature?.toFixed(2) ?? null) : null}
              unit="°C"
              label="Temperature"
              icon={AppIcons.temp}
              tone="warm"
              sparkColor={c.danger}
              sparklineData={deviceOn ? numericSeries((p) => p.temperature) : []}
              dimmed={!deviceOn}
            />
          </View>

          <View style={styles.sensorCell}>
            <SensorTile
              value={deviceOn ? (telemetry.latest?.humidity?.toFixed(2) ?? null) : null}
              unit="%"
              label="Humidity"
              icon={AppIcons.humidity}
              tone="air"
              sparkColor={c.accent}
              sparklineData={deviceOn ? numericSeries((p) => p.humidity) : []}
              dimmed={!deviceOn}
            />
          </View>

          <View style={styles.sensorCell}>
            <SensorTile
              value={deviceOn ? (telemetry.latest?.coPpm?.toFixed(2) ?? null) : null}
              unit="ppm"
              label="CO"
              icon={AppIcons.cloud}
              tone="cool"
              sparkColor={c.brand}
              sparklineData={deviceOn ? numericSeries((p) => p.coPpm) : []}
              dimmed={!deviceOn}
            />
          </View>

          <View style={styles.sensorCell}>
            <SensorTile
              value={deviceOn ? (telemetry.latest?.no2Ppm?.toFixed(2) ?? null) : null}
              unit="ppm"
              label="NO₂"
              icon={AppIcons.smog}
              tone="no2"
              sparkColor="#7A4FD0"
              sparklineData={deviceOn ? numericSeries((p) => p.no2Ppm) : []}
              dimmed={!deviceOn}
            />
          </View>
        </View>

        <View style={{ height: AtmosphereTokens.space24 }} />

        <View style={styles.relaysHeaderRow}>
          <Text style={AtmosphereTextStyles.h2(c.ink)}>Relays</Text>
          <View style={{ width: AtmosphereTokens.space8 }} />
          <Text style={AtmosphereTextStyles.caption(c.ink3)}>- 3 channels</Text>
        </View>

        <View style={{ height: AtmosphereTokens.space12 }} />

        <View style={styles.relayGrid}>
          <View style={styles.relayCell}>
            <RelayCard
              channel={1}
              name="Fan"
              on={relay1}
              disabled={!deviceOn || relay1Pending}
              onToggle={() => handleRelayToggle(1, relay1, setOptimisticRelay1, setRelay1Pending)}
            />
          </View>

          <View style={styles.relayCell}>
            <RelayCard
              channel={2}
              name="Lamp"
              on={relay2}
              disabled={!deviceOn || relay2Pending}
              onToggle={() => handleRelayToggle(2, relay2, setOptimisticRelay2, setRelay2Pending)}
            />
          </View>

          <View style={styles.relayCell}>
            <RelayCard
              channel={3}
              name="Filter"
              on={relay3}
              disabled={!deviceOn || relay3Pending}
              onToggle={() => handleRelayToggle(3, relay3, setOptimisticRelay3, setRelay3Pending)}
            />
          </View>
        </View>

        <View style={{ height: AtmosphereTokens.space24 }} />

        <AtmosphereCard>
          <View style={styles.activityHeaderRow}>
            <Text style={[AtmosphereTextStyles.h2(c.ink), { flex: 1 }]}>Recent activity</Text>

            <Text
              style={AtmosphereTextStyles.body(c.brand)}
              onPress={() => router.push(`/devices/${device.id}/commands`)}
            >
              View all →
            </Text>
          </View>

          <View style={{ height: AtmosphereTokens.space12 }} />

          <Text style={AtmosphereTextStyles.body(c.ink2)}>
            {latestCommand
              ? `${latestCommand.status} · ${formatRelativeTime(latestCommand.createdAt)}`
              : 'No command activity yet.'}
          </Text>
        </AtmosphereCard>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  content: {
    padding: AtmosphereTokens.space20,
  },
  blockingCenter: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: AtmosphereTokens.space24,
  },
  sensorGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: AtmosphereTokens.space12,
  },
  sensorCell: {
    width: '47%',
  },
  relaysHeaderRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  relayGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: AtmosphereTokens.space12,
  },
  relayCell: {
    width: '47%',
  },
  activityHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
});
