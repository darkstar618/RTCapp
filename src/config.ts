/**
 * Demo client configuration.
 *
 * NEVER embed app_secret in a production app bundle. Use a backend-for-frontend
 * that holds app_secret server-side and returns short-lived SDK tokens to clients.
 *
 * For local demo only, set EXPO_PUBLIC_DEMO_APP_SECRET in .env (gitignored).
 */
function requirePublicEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is required. Copy .env.example to .env and set all values.`);
  }
  return value;
}

export const AUTH_URL = requirePublicEnv('EXPO_PUBLIC_AUTH_URL');
export const RTC_URL = requirePublicEnv('EXPO_PUBLIC_RTC_URL');
export const APP_ID = process.env.EXPO_PUBLIC_APP_ID ?? '';
export const DEMO_APP_SECRET = process.env.EXPO_PUBLIC_DEMO_APP_SECRET ?? '';
