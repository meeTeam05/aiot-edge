import { StyleSheet, View } from 'react-native';

import { atmosphereTokens } from '../design/tokens';

const dotOpacities = [
  0.3, 0.5, 0.7, 0.5, 0.3,
  0.5, 1, 1, 1, 0.5,
  0.7, 1, 1, 1, 0.7,
  0.5, 1, 1, 1, 0.5,
  0.3, 0.5, 0.7, 0.5, 0.3,
] as const;

interface BrandMarkProps {
  size?: number;
}

/** CSS recreation of Flutter's 5×5 AtmosphereDotLogo painter. */
export function BrandMark({ size = 64 }: BrandMarkProps) {
  const dotSize = size / 9;
  const spacing = size / 6;

  return (
    <View accessibilityLabel="Smart Air" style={{ width: size, height: size }}>
      {dotOpacities.map((opacity, index) => {
        const column = index % 5;
        const row = Math.floor(index / 5);
        return (
          <View
            key={`${row}-${column}`}
            style={[
              styles.dot,
              {
                width: dotSize,
                height: dotSize,
                borderRadius: dotSize / 2,
                left: column * spacing,
                top: row * spacing,
                opacity,
              },
            ]}
          />
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  dot: {
    position: 'absolute',
    backgroundColor: atmosphereTokens.colors.brand,
  },
});
