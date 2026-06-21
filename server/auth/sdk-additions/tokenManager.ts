// packages/sdk/src/auth/tokenManager.ts

import { ApiKeyRepository } from '../db/repositories';

const AUTH_BASE_URL = __DEV__
  ? (process.env.EXPO_PUBLIC_AUTH_URL ?? 'http://10.0.2.2:3001')
  : (process.env.EXPO_PUBLIC_AUTH_URL ?? '');

export class TokenManager {
  private apiKeyRepo: ApiKeyRepository;

  constructor() {
    this.apiKeyRepo = new ApiKeyRepository();
  }

  async authenticate(appId: string, appSecret: string): Promise<string> {
    if (!AUTH_BASE_URL) {
      throw new Error('EXPO_PUBLIC_AUTH_URL is required. Production apps must use a backend-for-frontend — never embed app_secret in the client.');
    }

    const response = await fetch(`${AUTH_BASE_URL}/sdk/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ app_id: appId, app_secret: appSecret }),
    });

    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      throw new Error(body.error || `Auth failed: ${response.status}`);
    }

    const data = await response.json();

    await this.apiKeyRepo.upsert({
      appId,
      jwt: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt: Date.now() + data.expires_in * 1000,
    });

    return data.access_token;
  }

  async getValidToken(appId: string): Promise<string> {
    const record = await this.apiKeyRepo.findByAppId(appId);

    if (!record || !record.jwtToken) {
      throw new Error('Not authenticated. Call authenticate() first.');
    }

    const fiveMinutes = 5 * 60 * 1000;
    if (record.jwtExpiresAt && record.jwtExpiresAt - Date.now() > fiveMinutes) {
      return record.jwtToken;
    }

    if (!record.refreshToken) {
      throw new Error('Refresh token missing. Call authenticate() again.');
    }

    return this.refresh(appId, record.refreshToken);
  }

  private async refresh(appId: string, refreshToken: string): Promise<string> {
    const response = await fetch(`${AUTH_BASE_URL}/sdk/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: refreshToken }),
    });

    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      throw new Error(body.error || `Refresh failed: ${response.status}`);
    }

    const data = await response.json();

    await this.apiKeyRepo.upsert({
      appId,
      jwt: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt: Date.now() + data.expires_in * 1000,
    });

    return data.access_token;
  }
}
