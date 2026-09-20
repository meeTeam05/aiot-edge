/* eslint-env jest */

jest.mock('react-native-config', () => ({
  __esModule: true,
  default: { API_BASE_URL: 'https://smart-air.test/api' },
}));

jest.mock('react-native-keychain', () => {
  const keychain = {
    getGenericPassword: jest.fn(async () => false),
    resetGenericPassword: jest.fn(async () => true),
    setGenericPassword: jest.fn(async () => ({ service: 'com.smartair.mobile.session', storage: 'Keystore' })),
  };
  return { __esModule: true, default: keychain, ...keychain };
});
