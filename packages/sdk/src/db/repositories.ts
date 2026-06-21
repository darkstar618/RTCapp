import { getDatabase } from './database';
import type { Database } from '@nozbe/watermelondb';
import {
  ChannelModel,
  ParticipantModel,
  SessionModel,
  ApiKeyModel,
} from '../models';

function sessionId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export class ChannelRepository {
  private db: Database;

  constructor() {
    this.db = getDatabase();
  }

  async findOrCreate(channelId: string): Promise<ChannelModel> {
    const collection = this.db.collections.get<ChannelModel>('channels');
    const rows = await collection.query().fetch();
    const existing = rows.find((r) => r.channelId === channelId);
    if (existing) return existing;

    const now = Date.now();
    return this.db.write(async () =>
      collection.create((record) => {
        record.channelId = channelId;
        record.status = 'active';
        record.createdAt = new Date(now);
      })
    );
  }

  async findById(id: string): Promise<ChannelModel | null> {
    try {
      return await this.db.collections.get<ChannelModel>('channels').find(id);
    } catch {
      return null;
    }
  }

  async all(): Promise<ChannelModel[]> {
    return this.db.collections.get<ChannelModel>('channels').query().fetch();
  }
}

type CreateSessionParams = {
  channelId: string;
  userId: string;
  mediaType?: string;
  projectId?: string;
};

export class SessionRepository {
  private db: Database;

  constructor() {
    this.db = getDatabase();
  }

  async create(params: CreateSessionParams): Promise<SessionModel> {
    const collection = this.db.collections.get<SessionModel>('sessions');
    const now = Date.now();
    return this.db.write(async () =>
      collection.create((record) => {
        record.sessionId = sessionId();
        record.channelId = params.channelId;
        record.userId = params.userId;
        record.projectId = params.projectId ?? null;
        record.mediaType = params.mediaType ?? 'voice';
        record.startedAt = new Date(now);
        record.synced = false;
        record.createdAt = new Date(now);
        record.bytesSent = 0;
        record.bytesReceived = 0;
      })
    );
  }

  async markEnded(id: string, endedAtMs: number): Promise<void> {
    const collection = this.db.collections.get<SessionModel>('sessions');
    const record = await collection.find(id);
    await this.db.write(async () =>
      record.update((r) => {
        r.endedAt = new Date(endedAtMs);
        r.durationSeconds = Math.round(
          (endedAtMs - r.startedAt.getTime()) / 1000
        );
      })
    );
  }

  async findById(id: string): Promise<SessionModel | null> {
    try {
      return await this.db.collections.get<SessionModel>('sessions').find(id);
    } catch {
      return null;
    }
  }

  async allForChannel(channelId: string): Promise<SessionModel[]> {
    const rows = await this.db.collections.get<SessionModel>('sessions').query().fetch();
    return rows.filter((r) => r.channelId === channelId);
  }
}

export class ParticipantRepository {
  private db: Database;

  constructor() {
    this.db = getDatabase();
  }

  async create(channelId: string, userId: string): Promise<ParticipantModel> {
    const collection = this.db.collections.get<ParticipantModel>('participants');
    return this.db.write(async () =>
      collection.create((record) => {
        record.channelId = channelId;
        record.userId = userId;
        record.joinedAt = new Date();
        record.connectionState = 'connected';
      })
    );
  }

  async markLeft(id: string): Promise<void> {
    const collection = this.db.collections.get<ParticipantModel>('participants');
    const record = await collection.find(id);
    await this.db.write(async () => {
      record.update((r) => {
        r.leftAt = new Date();
        r.connectionState = 'disconnected';
      });
    });
  }

  async allForChannel(channelId: string): Promise<ParticipantModel[]> {
    const rows = await this.db.collections.get<ParticipantModel>('participants').query().fetch();
    return rows.filter((r) => r.channelId === channelId);
  }
}

type UpsertApiKeyParams = {
  appId: string;
  jwt: string;
  refreshToken: string;
  expiresAt: number;
  projectId?: string;
};

export class ApiKeyRepository {
  private db: Database;

  constructor() {
    this.db = getDatabase();
  }

  async upsert(params: UpsertApiKeyParams): Promise<ApiKeyModel> {
    const existing = await this.findByAppId(params.appId);
    if (existing) {
      await this.db.write(async () =>
        existing.update((r) => {
          r.jwtToken = params.jwt;
          r.refreshToken = params.refreshToken;
          r.jwtExpiresAt = params.expiresAt;
          r.lastUsedAt = Date.now();
        })
      );
      return existing;
    }

    const collection = this.db.collections.get<ApiKeyModel>('api_keys');
    const now = Date.now();
    return this.db.write(async () =>
      collection.create((record) => {
        record.appId = params.appId;
        record.projectId = params.projectId ?? null;
        record.jwtToken = params.jwt;
        record.refreshToken = params.refreshToken;
        record.jwtExpiresAt = params.expiresAt;
        record.createdAt = new Date(now);
        record.lastUsedAt = now;
      })
    );
  }

  async findByAppId(appId: string): Promise<ApiKeyModel | null> {
    const all = await this.db.collections.get<ApiKeyModel>('api_keys').query().fetch();
    return all.find((r) => r.appId === appId) ?? null;
  }

  async updateJwt(id: string, jwt: string, refreshToken?: string, expiresAt?: number): Promise<void> {
    const record = await this.db.collections.get<ApiKeyModel>('api_keys').find(id);
    await this.db.write(async () =>
      record.update((r) => {
        r.jwtToken = jwt;
        if (refreshToken) r.refreshToken = refreshToken;
        if (expiresAt) r.jwtExpiresAt = expiresAt;
        r.lastUsedAt = Date.now();
      })
    );
  }
}
