import type { ConfigContext, ExpoConfig } from 'expo/config';

const IOS_BUNDLE_IDENTIFIER = process.env.IOS_BUNDLE_IDENTIFIER || 'com.questfit.app';
const ANDROID_PACKAGE = process.env.ANDROID_PACKAGE || 'com.questfit.app';

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: 'QuestFit',
  slug: 'questfit',
  scheme: 'questfit',
  version: '1.0.0',
  orientation: 'portrait',
  icon: './assets/images/icon.png',
  userInterfaceStyle: 'automatic',
  backgroundColor: '#0B0F14',
  ios: {
    bundleIdentifier: IOS_BUNDLE_IDENTIFIER,
    supportsTablet: true,
    usesAppleSignIn: true,
    infoPlist: {
      ITSAppUsesNonExemptEncryption: false,
    },
  },
  android: {
    package: ANDROID_PACKAGE,
    adaptiveIcon: {
      backgroundColor: '#0B0F14',
      foregroundImage: './assets/images/android-icon-foreground.png',
      monochromeImage: './assets/images/android-icon-monochrome.png',
    },
    predictiveBackGestureEnabled: false,
    // Only the permissions QuestFit actually uses. Background location is requested at runtime
    // only after the user opts in to screen-off tracking.
    permissions: [
      'ACCESS_COARSE_LOCATION',
      'ACCESS_FINE_LOCATION',
      'ACCESS_BACKGROUND_LOCATION',
      'FOREGROUND_SERVICE',
      'FOREGROUND_SERVICE_LOCATION',
      'POST_NOTIFICATIONS',
    ],
    blockedPermissions: ['android.permission.RECORD_AUDIO', 'android.permission.READ_CONTACTS'],
  },
  web: {
    output: 'single',
    favicon: './assets/images/favicon.png',
  },
  plugins: [
    'expo-router',
    [
      'expo-splash-screen',
      {
        backgroundColor: '#0B0F14',
        image: './assets/images/splash-icon.png',
        imageWidth: 120,
      },
    ],
    'expo-secure-store',
    'expo-font',
    'expo-web-browser',
    'expo-apple-authentication',
    [
      'expo-location',
      {
        locationWhenInUsePermission:
          'QuestFit uses your location while you record an activity to measure distance, pace and draw your route.',
        locationAlwaysAndWhenInUsePermission:
          'Allow "Always" so QuestFit can keep recording your activity when the screen is off. Location is only used while a recording is in progress.',
        locationAlwaysPermission:
          'QuestFit keeps recording your activity in the background only while a recording is in progress.',
        isIosBackgroundLocationEnabled: true,
        isAndroidBackgroundLocationEnabled: true,
        isAndroidForegroundServiceEnabled: true,
        motionUsagePermission: false,
      },
    ],
    [
      'expo-image-picker',
      {
        photosPermission: 'QuestFit lets you choose a profile picture from your photo library.',
        cameraPermission: false,
        microphonePermission: false,
      },
    ],
    [
      'expo-notifications',
      {
        color: '#1FC99A',
      },
    ],
    [
      'react-native-maps',
      {
        androidGoogleMapsApiKey: process.env.GOOGLE_MAPS_ANDROID_API_KEY,
      },
    ],
  ],
  experiments: {
    typedRoutes: true,
    reactCompiler: true,
  },
  extra: {
    eas: process.env.EAS_PROJECT_ID ? { projectId: process.env.EAS_PROJECT_ID } : undefined,
  },
});
