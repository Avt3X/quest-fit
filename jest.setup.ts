/* eslint-disable @typescript-eslint/no-require-imports */
// Global mocks for native modules that have no JS implementation under Jest.
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

jest.mock('react-native-reanimated', () => require('./src/test-utils/reanimated-mock'));

// Icon fonts are native assets; render the glyph name as text instead.
jest.mock('@expo/vector-icons', () => {
  const React = require('react');
  const { Text } = require('react-native');
  const MaterialCommunityIcons = ({ name, ...rest }: { name: string }) => React.createElement(Text, rest, name);
  MaterialCommunityIcons.glyphMap = new Proxy({}, { has: () => true });
  return { MaterialCommunityIcons };
});
