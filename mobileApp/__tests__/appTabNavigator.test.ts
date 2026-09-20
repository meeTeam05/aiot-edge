import { appTabRouteNames, persistentTabNavigatorOptions } from '../src/navigation/appTabConfig';
import { getRootNavigatorBranch } from '../src/navigation/rootBranch';

describe('persistent application tab shell', () => {
  it('routes an authenticated session into the app navigator', () => {
    expect(getRootNavigatorBranch('authenticated')).toBe('app');
  });

  it('declares the Flutter-equivalent Home, Notifications, and Profile tabs', () => {
    expect(appTabRouteNames).toEqual(['Home', 'Notifications', 'Profile']);
  });

  it('keeps inactive tabs mounted so their navigation state survives tab switches', () => {
    expect(persistentTabNavigatorOptions.detachInactiveScreens).toBe(false);
  });
});
