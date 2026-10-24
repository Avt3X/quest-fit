// Auth session storage. On iOS/Android the session (access + refresh token) lives in the platform
// keychain / keystore via expo-secure-store. SecureStore values are size-limited on some devices,
// so the serialized session is split into chunks. On web there is no secure enclave; the browser's
// localStorage is used, which is the standard for web SPAs.
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

const CHUNK_SIZE = 1800;
const countKey = (key: string) => `${key}.chunks`;
const chunkKey = (key: string, i: number) => `${key}.${i}`;

function safeKey(key: string): string {
  return key.replace(/[^A-Za-z0-9._-]/g, '_');
}

const nativeStorage = {
  async getItem(rawKey: string): Promise<string | null> {
    const key = safeKey(rawKey);
    const count = Number(await SecureStore.getItemAsync(countKey(key)));
    if (!count) return null;
    const parts: string[] = [];
    for (let i = 0; i < count; i += 1) {
      const part = await SecureStore.getItemAsync(chunkKey(key, i));
      if (part === null) return null;
      parts.push(part);
    }
    return parts.join('');
  },
  async setItem(rawKey: string, value: string): Promise<void> {
    const key = safeKey(rawKey);
    const previous = Number(await SecureStore.getItemAsync(countKey(key))) || 0;
    const chunks = Math.max(1, Math.ceil(value.length / CHUNK_SIZE));
    for (let i = 0; i < chunks; i += 1) {
      await SecureStore.setItemAsync(chunkKey(key, i), value.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE), {
        keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK,
      });
    }
    await SecureStore.setItemAsync(countKey(key), String(chunks));
    for (let i = chunks; i < previous; i += 1) await SecureStore.deleteItemAsync(chunkKey(key, i));
  },
  async removeItem(rawKey: string): Promise<void> {
    const key = safeKey(rawKey);
    const count = Number(await SecureStore.getItemAsync(countKey(key))) || 0;
    for (let i = 0; i < count; i += 1) await SecureStore.deleteItemAsync(chunkKey(key, i));
    await SecureStore.deleteItemAsync(countKey(key));
  },
};

const webStorage = {
  async getItem(key: string) {
    return typeof localStorage === 'undefined' ? null : localStorage.getItem(key);
  },
  async setItem(key: string, value: string) {
    if (typeof localStorage !== 'undefined') localStorage.setItem(key, value);
  },
  async removeItem(key: string) {
    if (typeof localStorage !== 'undefined') localStorage.removeItem(key);
  },
};

export const sessionStorage = Platform.OS === 'web' ? webStorage : nativeStorage;
