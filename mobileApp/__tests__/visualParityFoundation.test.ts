import { Platform } from 'react-native';

import { appIconRegistry, iconForName } from '../src/components/ui/icons';
import { fontFamily, typography } from '../src/design/typography';
import { sparklinePath } from '../src/features/device/components/Sparkline';

const nativeConfig = require('../react-native.config.js') as { assets: string[] };

describe('Flutter visual-parity foundation', () => {
  it('maps Flutter semantic icon names to Lucide vector components', () => {
    expect(iconForName('settings')).toBe(appIconRegistry.settings);
    expect(iconForName('back')).toBe(appIconRegistry.back);
    expect(typeof appIconRegistry.warning).toBe('object');
  });

  it('registers the exact Flutter font source and uses native family names', () => {
    expect(nativeConfig.assets).toContain('../app/assets/fonts/');
    expect(fontFamily.sans).toBe(Platform.OS === 'android' ? 'PlusJakartaSans' : 'Plus Jakarta Sans');
    expect(fontFamily.mono).toBe(Platform.OS === 'android' ? 'JetBrainsMono-Regular' : 'JetBrains Mono');
  });

  it('keeps Flutter typography weights and normalized line-height metrics', () => {
    expect(typography.pageTitle).toMatchObject({ fontSize: 36, fontWeight: '700', lineHeight: 43 });
    expect(typography.body).toMatchObject({ fontSize: 15, fontWeight: '500', lineHeight: 20 });
    expect(typography.mono).toMatchObject({ fontSize: 13, fontWeight: '400', lineHeight: 18 });
  });

  it('uses Flutter-equivalent normalized geometry for up to 30 dashboard trend points', () => {
    expect(sparklinePath([10, 15, 20])).toBe('M0.00 28.00 L50.00 16.00 L100.00 4.00');
    expect(sparklinePath(Array.from({ length: 31 }, (_, index) => index)).match(/[ML]/g)).toHaveLength(30);
  });
});
