import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { useAppTheme } from '../../../design/ThemeProvider';
import { getTheme } from '../../../design/theme';
import type { AppStackParamList } from '../../../navigation/types';
import { useCalibrationCommandTracking, useStartCalibrationMutation } from './hooks/useCalibration';
import type { CalibrationType } from './models/calibrationModels';

type Props = NativeStackScreenProps<AppStackParamList, 'DeviceCalibration'>;
type WizardStep = 'preparation' | 'running' | 'result';

/** Flutter three-step calibration wizard; command completion, not submission, determines success. */
export function CalibrationWizardScreen({ navigation, route }: Props) {
  const { theme } = useAppTheme();
  const { deviceId, sensor } = route.params;
  const label = displaySensorLabel(sensor);
  const [step, setStep] = useState<WizardStep>('preparation');
  const [commandId, setCommandId] = useState<string | null>(null);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [startError, setStartError] = useState<Error | null>(null);
  const startCalibration = useStartCalibrationMutation(deviceId);
  const tracking = useCalibrationCommandTracking(deviceId, commandId);
  const isRunning = startedAt !== null && (startCalibration.isPending || (commandId !== null && tracking.isPolling));
  const onBack = () => {
    if (navigation.canGoBack()) navigation.goBack();
    else navigation.navigate('DeviceSettings', { deviceId });
  };

  useEffect(() => {
    if (!isRunning || startedAt === null) return undefined;
    const updateElapsed = () => setElapsedSeconds(Math.max(0, Math.floor((Date.now() - startedAt) / 1_000)));
    updateElapsed();
    const timer = setInterval(updateElapsed, 1_000);
    return () => clearInterval(timer);
  }, [isRunning, startedAt]);

  useEffect(() => {
    if (commandId === null || tracking.isPolling) return;
    if (tracking.status === 'done') setStep('result');
    if (tracking.status === 'error' || tracking.status === 'timeout') setStep('result');
  }, [commandId, tracking.isPolling, tracking.status]);

  const beginSubmission = () => {
    setStartedAt(Date.now());
    setElapsedSeconds(0);
    setStartError(null);
    startCalibration.mutateAsync(sensor).then(submission => {
      setCommandId(submission.commandId);
    }).catch(error => {
      setStartError(error instanceof Error ? error : new Error(String(error)));
      setStep('result');
    });
  };
  const retry = () => {
    setCommandId(null);
    setElapsedSeconds(0);
    setStartedAt(null);
    setStartError(null);
    setStep('running');
  };

  return <SafeAreaView style={[styles.safeArea, { backgroundColor: theme.colors.background }]}>
    <WizardAppBar onBack={onBack} sensorLabel={label} theme={theme} />
    <StepDots current={step === 'preparation' ? 0 : step === 'running' ? 1 : 2} theme={theme} />
    <ScrollView contentContainerStyle={{ padding: theme.spacing.xxl, paddingBottom: theme.spacing.huge }}>
      {step === 'preparation' ? <PreparationStep onStart={() => setStep('running')} sensorLabel={label} theme={theme} /> : null}
      {step === 'running' ? <RunningStep elapsedSeconds={elapsedSeconds} isStarting={startCalibration.isPending} isRunning={isRunning} onBack={() => setStep('preparation')} onStart={beginSubmission} sensorLabel={label} status={tracking.status} theme={theme} /> : null}
      {step === 'result' ? <ResultStep error={startError ?? tracking.error} onRetry={retry} sensorLabel={label} status={startError === null ? tracking.status : 'error'} theme={theme} /> : null}
    </ScrollView>
  </SafeAreaView>;
}

function WizardAppBar({ onBack, sensorLabel, theme }: { onBack: () => void; sensorLabel: string; theme: ReturnType<typeof getTheme> }) {
  return <View style={[styles.appBar, { borderBottomColor: theme.colors.border, paddingHorizontal: theme.spacing.xl }]}><Pressable accessibilityLabel="Back" accessibilityRole="button" onPress={onBack} style={styles.appBarButton} testID="calibration-back"><Text style={[styles.backGlyph, { color: theme.colors.textPrimary }]}>‹</Text></Pressable><Text style={[styles.appBarTitle, { color: theme.colors.textPrimary }]}>Calibrate {sensorLabel} sensor</Text><View style={styles.appBarButton} /></View>;
}

function StepDots({ current, theme }: { current: number; theme: ReturnType<typeof getTheme> }) {
  return <View style={[styles.dots, { marginTop: theme.spacing.xxl }]} testID="calibration-step-dots">{[0, 1, 2].map(index => <View key={index} style={[styles.dot, { backgroundColor: index === current ? theme.colors.brand : theme.colors.surfaceVariant }]} />)}</View>;
}

function PreparationStep({ onStart, sensorLabel, theme }: { onStart: () => void; sensorLabel: string; theme: ReturnType<typeof getTheme> }) {
  const instructions = [
    'Place the device in the cleanest stable air available',
    'Keep it powered on for at least 24 hours (preheat period)',
    'Avoid traffic, smoke, cooking fumes, sprays, and strong odors',
    'Ensure stable temperature (15-25°C recommended)',
  ];
  return <View testID="calibration-preparation"><Text style={[theme.typography.h1, { color: theme.colors.textPrimary }]}>Preparation</Text><View style={[styles.card, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border, borderRadius: theme.radius.card, marginTop: theme.spacing.xl, padding: theme.spacing.xl }]}><Text style={[theme.typography.body, { color: theme.colors.textPrimary }]}>Before calibrating the {sensorLabel} sensor, ensure:</Text>{instructions.map((instruction, index) => <View key={instruction} style={[styles.instruction, { marginTop: theme.spacing.lg }]}><View style={[styles.number, { backgroundColor: theme.colors.brandTint }]}><Text style={[theme.typography.caption, { color: theme.colors.brand }]}>{index + 1}</Text></View><Text style={[theme.typography.body, styles.instructionText, { color: theme.colors.textSecondary }]}>{instruction}</Text></View>)}</View><View style={[styles.infoCard, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border, borderRadius: theme.radius.card, marginTop: theme.spacing.xxl, padding: theme.spacing.xl }]}><Text style={[styles.infoGlyph, { color: theme.colors.accent }]}>i</Text><Text style={[theme.typography.caption, styles.infoText, { color: theme.colors.textSecondary }]}>Calibration takes about 3 minutes; final confirmation can take up to 7 minutes. Without reference gas, readings are for trends and alerts, not lab-grade ppm.</Text></View><PrimaryButton label="Start calibration" onPress={onStart} testID="calibration-prepare-start" theme={theme} /></View>;
}

function RunningStep({ elapsedSeconds, isStarting, isRunning, onBack, onStart, sensorLabel, status, theme }: { elapsedSeconds: number; isStarting: boolean; isRunning: boolean; onBack: () => void; onStart: () => void; sensorLabel: string; status: string; theme: ReturnType<typeof getTheme> }) {
  if (!isRunning) return <View testID="calibration-ready"><Text style={[theme.typography.h1, { color: theme.colors.textPrimary }]}>Ready to calibrate</Text><View style={[styles.centerCard, styles.card, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border, borderRadius: theme.radius.card, marginTop: theme.spacing.xl, padding: theme.spacing.xxxl }]}><Text style={[styles.cog, { color: theme.colors.brand }]}>⚙</Text><Text style={[theme.typography.body, styles.centered, { color: theme.colors.textSecondary, marginTop: theme.spacing.lg }]}>Press the button below to start the {sensorLabel} sensor calibration process.</Text></View><PrimaryButton label="Start" onPress={onStart} testID="calibration-start" theme={theme} /><Pressable accessibilityRole="button" onPress={onBack} style={[styles.runningBack, { marginTop: theme.spacing.lg }]} testID="calibration-running-back"><Text style={[theme.typography.body, { color: theme.colors.textSecondary }]}>Back</Text></Pressable></View>;
  return <View testID="calibration-running"><Text style={[theme.typography.h1, { color: theme.colors.textPrimary }]}>Calibrating…</Text><View style={[styles.centerCard, styles.card, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border, borderRadius: theme.radius.card, marginTop: theme.spacing.xl, padding: theme.spacing.xxxl }]}><Text style={[styles.spinner, { color: theme.colors.brand }]}>◌</Text><Text style={[theme.typography.h2, { color: theme.colors.textPrimary, marginTop: theme.spacing.xxl }]}>Calibration in progress</Text><Text style={[styles.mono, { color: theme.colors.textSecondary, marginTop: theme.spacing.sm }]}>Elapsed: {elapsedSeconds}s</Text><Text style={[theme.typography.caption, styles.centered, { color: theme.colors.textSecondary, marginTop: theme.spacing.xl }]}>Command status: {isStarting ? 'pending' : status}</Text><Text style={[theme.typography.caption, styles.centered, { color: theme.colors.textSecondary, marginTop: theme.spacing.lg }]}>Please wait while the sensor samples a stable baseline. Keep the app open for final confirmation.</Text></View><View style={[styles.infoCard, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border, borderRadius: theme.radius.card, marginTop: theme.spacing.xxl, padding: theme.spacing.xl }]}><Text style={[styles.infoGlyph, { color: theme.colors.warn }]}>!</Text><Text style={[theme.typography.caption, styles.infoText, { color: theme.colors.textSecondary }]}>Do not close the app or move the device</Text></View></View>;
}

function ResultStep({ error, onRetry, sensorLabel, status, theme }: { error: Error | null; onRetry: () => void; sensorLabel: string; status: string; theme: ReturnType<typeof getTheme> }) {
  const successful = status === 'done' && error === null;
  const message = error?.message ?? `Calibration finished with status: ${status}`;
  return <View testID={successful ? 'calibration-success' : 'calibration-failure'}><Text style={[theme.typography.h1, { color: theme.colors.textPrimary }]}>{successful ? 'Calibration complete' : 'Calibration failed'}</Text><View style={[styles.centerCard, styles.card, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border, borderRadius: theme.radius.card, marginTop: theme.spacing.xl, padding: theme.spacing.xxxl }]}><Text style={[styles.resultGlyph, { color: successful ? theme.colors.brand : theme.colors.danger }]}>{successful ? '✓' : '!'}</Text><Text style={[theme.typography.h2, { color: successful ? theme.colors.brand : theme.colors.danger, marginTop: theme.spacing.lg }]}>{successful ? 'Success' : 'Calibration error'}</Text><Text style={[theme.typography.body, styles.centered, { color: theme.colors.textSecondary, marginTop: theme.spacing.sm }]}>{successful ? 'Calibration command completed. Recheck live sensor values after the device settles.' : message}</Text>{successful ? <Text style={[theme.typography.body, styles.centered, { color: theme.colors.textSecondary, marginTop: theme.spacing.sm }]}>The {sensorLabel} sensor baseline has been saved. Factory reset will keep this calibration.</Text> : null}</View>{successful ? null : <PrimaryButton label="Retry" onPress={onRetry} testID="calibration-retry" theme={theme} />}</View>;
}

function PrimaryButton({ label, onPress, testID, theme }: { label: string; onPress: () => void; testID: string; theme: ReturnType<typeof getTheme> }) {
  return <Pressable accessibilityRole="button" onPress={onPress} style={[styles.primaryButton, { backgroundColor: theme.colors.brand, borderRadius: theme.radius.button, marginTop: theme.spacing.xxxl }]} testID={testID}><Text style={[theme.typography.body, { color: theme.colors.surface }]}>{label}</Text></Pressable>;
}

function displaySensorLabel(sensor: CalibrationType): 'CO' | 'NO₂' { return sensor === 'co' ? 'CO' : 'NO₂'; }

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  appBar: { alignItems: 'center', borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: 'row', height: 56 },
  appBarButton: { alignItems: 'center', height: 44, justifyContent: 'center', width: 44 },
  backGlyph: { fontSize: 36, fontWeight: '300', lineHeight: 38 },
  appBarTitle: { flex: 1, fontFamily: 'PlusJakartaSans', fontSize: 17, fontWeight: '600', marginHorizontal: 4 },
  dots: { flexDirection: 'row', gap: 8, justifyContent: 'center' },
  dot: { borderRadius: 5, height: 10, width: 10 },
  card: { borderWidth: 1 },
  instruction: { alignItems: 'flex-start', flexDirection: 'row' },
  number: { alignItems: 'center', borderRadius: 12, height: 24, justifyContent: 'center', width: 24 },
  instructionText: { flex: 1, marginLeft: 12 },
  infoCard: { alignItems: 'flex-start', borderWidth: 1, flexDirection: 'row' },
  infoGlyph: { fontSize: 20, fontWeight: '700', lineHeight: 20 },
  infoText: { flex: 1, marginLeft: 12 },
  primaryButton: { alignItems: 'center', height: 52, justifyContent: 'center', paddingHorizontal: 24 },
  centerCard: { alignItems: 'center' },
  centered: { textAlign: 'center' },
  cog: { fontSize: 56 },
  spinner: { fontSize: 48 },
  mono: { fontFamily: 'JetBrainsMono', fontSize: 13 },
  resultGlyph: { fontSize: 56 },
  runningBack: { alignSelf: 'center' },
});
