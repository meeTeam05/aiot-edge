import Svg, { Path } from 'react-native-svg';

/** Flutter's custom 30-point SparklinePainter equivalent; presentation only. */
export function SensorSparkline({ color, values }: { color: string; values: number[] }) {
  if (values.length < 2) return null;
  return <Svg accessibilityLabel="Sensor trend" height={32} preserveAspectRatio="none" viewBox="0 0 100 32" width="100%"><Path d={sparklinePath(values)} fill="none" stroke={color} strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} /></Svg>;
}

export function sparklinePath(values: number[]): string {
  const displayed = values.slice(-30);
  const min = Math.min(...displayed);
  const max = Math.max(...displayed);
  const range = max - min;
  return displayed.map((value, index) => {
    const x = displayed.length === 1 ? 50 : (index / (displayed.length - 1)) * 100;
    const y = range === 0 ? 16 : 28 - ((value - min) / range) * 24;
    return `${index === 0 ? 'M' : 'L'}${x.toFixed(2)} ${y.toFixed(2)}`;
  }).join(' ');
}
