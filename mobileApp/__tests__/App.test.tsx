import { atmosphereTokens } from '../src/design/tokens';

describe('React Native foundation', () => {
  it('preserves the Flutter primary design tokens', () => {
    expect(atmosphereTokens.colors.brand).toBe('#0F6B5C');
    expect(atmosphereTokens.radius.card).toBe(22);
  });
});
