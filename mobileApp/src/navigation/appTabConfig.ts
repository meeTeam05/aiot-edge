export const appTabRouteNames = ['Home', 'Notifications', 'Profile'] as const;

/** Mirrors Flutter's StatefulShellRoute.indexedStack: inactive tabs stay mounted. */
export const persistentTabNavigatorOptions = {
  detachInactiveScreens: false,
} as const;
