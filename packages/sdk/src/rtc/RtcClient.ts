import { Platform } from 'react-native';
import { ChannelRepository, SessionRepository } from '../db/repositories';
import { RtcConnectionError, RtcTokenError } from '../errors';
import {
  Room,
  RoomEvent,
  Track,
  RemoteParticipant,
  LocalParticipant,
  ConnectionState,
  RoomOptions,
  VideoPresets,
  Participant,
} from '@livekit/react-native';

export interface RtcClientConfig {
  authServerUrl: string;
  appId: string;
  sdkToken: string;
  mode?: 'audio' | 'video';
}

export interface RtcSessionInfo {
  channelId: string;
  uid: string;
  startedAt: number;
}

export type RtcEventMap = {
  join: (session: RtcSessionInfo) => void;
  leave: (channelId: string) => void;
  remoteUserJoined: (uid: string) => void;
  remoteUserLeft: (uid: string) => void;
  activeSpeakersChanged: (uids: string[]) => void;
  connectionStateChanged: (state: string) => void;
  error: (err: Error) => void;
};

export class RtcClient {
  private room: Room;
  private config: RtcClientConfig;
  private session: RtcSessionInfo | null = null;
  private listeners: Map<string, Set<Function>> = new Map();
  private channelRepo: ChannelRepository;
  private sessionRepo: SessionRepository;

  private constructor(config: RtcClientConfig) {
    this.config = config;
    this.channelRepo = new ChannelRepository();
    this.sessionRepo = new SessionRepository();

    const options: RoomOptions = {
      adaptiveStream: true,
      dynacast: true,
      audioCaptureDefaults: { echoCancellation: true, noiseSuppression: true },
    };

    if (config.mode === 'video') {
      options.videoCaptureDefaults = { resolution: VideoPresets.h720.resolution };
    }

    this.room = new Room(options);
    this._bindRoomEvents();
  }

  static create(config: RtcClientConfig): RtcClient {
    if (Platform.OS !== 'android') {
      throw new RtcConnectionError('RtcClient is only supported on Android');
    }
    return new RtcClient(config);
  }

  async join(channelId: string, identity?: string): Promise<RtcSessionInfo> {
    const uid = identity ?? `user_${Date.now()}`;

    try {
      const { token, url } = await this._fetchLiveKitToken(channelId, uid);
      await this.room.connect(url, token);
      await this.room.localParticipant.setMicrophoneEnabled(true);

      if (this.config.mode === 'video') {
        await this.room.localParticipant.setCameraEnabled(true);
      }

      await this.channelRepo.findOrCreate(channelId);
      const startedAt = Date.now();

      await this.sessionRepo.create({
        channelId,
        userId: uid,
        mediaType: this.config.mode === 'video' ? 'video' : 'voice',
      });

      this.session = { channelId, uid, startedAt };
      this._emit('join', this.session);
      return this.session;
    } catch (err) {
      const wrapped = err instanceof RtcTokenError || err instanceof RtcConnectionError
        ? err
        : new RtcConnectionError(err instanceof Error ? err.message : 'Failed to join channel');
      this._emit('error', wrapped);
      throw wrapped;
    }
  }

  async leave(): Promise<void> {
    if (!this.session) return;

    try {
      await this.room.disconnect();

      const sessions = await this.sessionRepo.allForChannel(this.session.channelId);
      const active = sessions.find((s) => s.userId === this.session!.uid && !s.endedAt);
      if (active) {
        await this.sessionRepo.markEnded(active.id, Date.now());
      }

      const channelId = this.session.channelId;
      this.session = null;
      this._emit('leave', channelId);
    } catch (err) {
      const wrapped = new RtcConnectionError(err instanceof Error ? err.message : 'Failed to leave channel');
      this._emit('error', wrapped);
      throw wrapped;
    }
  }

  async destroy(): Promise<void> {
    try {
      await this.leave();
    } catch {
      // leave already emitted error
    } finally {
      this.listeners.clear();
    }
  }

  async setAudioMuted(muted: boolean): Promise<void> {
    try {
      await this.room.localParticipant.setMicrophoneEnabled(!muted);
    } catch (err) {
      throw new RtcConnectionError(err instanceof Error ? err.message : 'Failed to set audio mute');
    }
  }

  async toggleAudioMute(): Promise<boolean> {
    const mic = this.room.localParticipant.isMicrophoneEnabled;
    await this.setAudioMuted(mic);
    return mic;
  }

  get isMuted(): boolean {
    return !this.room.localParticipant.isMicrophoneEnabled;
  }

  async setCameraEnabled(enabled: boolean): Promise<void> {
    try {
      await this.room.localParticipant.setCameraEnabled(enabled);
    } catch (err) {
      throw new RtcConnectionError(err instanceof Error ? err.message : 'Failed to set camera');
    }
  }

  async toggleCamera(): Promise<boolean> {
    const cam = this.room.localParticipant.isCameraEnabled;
    await this.setCameraEnabled(!cam);
    return !cam;
  }

  get isCameraEnabled(): boolean {
    return this.room.localParticipant.isCameraEnabled;
  }

  get remoteParticipants(): RemoteParticipant[] {
    return Array.from(this.room.remoteParticipants.values());
  }

  get remoteUids(): string[] {
    return this.remoteParticipants.map((p) => p.identity);
  }

  get localParticipant(): LocalParticipant {
    return this.room.localParticipant;
  }

  get rawRoom(): Room {
    return this.room;
  }

  get currentSession(): RtcSessionInfo | null {
    return this.session;
  }

  get isConnected(): boolean {
    return this.room.state === ConnectionState.Connected;
  }

  on<K extends keyof RtcEventMap>(event: K, listener: RtcEventMap[K]): this {
    if (!this.listeners.has(event)) this.listeners.set(event, new Set());
    this.listeners.get(event)!.add(listener);
    return this;
  }

  off<K extends keyof RtcEventMap>(event: K, listener: RtcEventMap[K]): this {
    this.listeners.get(event)?.delete(listener);
    return this;
  }

  private _emit(event: string, ...args: any[]) {
    this.listeners.get(event)?.forEach((fn) => fn(...args));
  }

  private _bindRoomEvents() {
    this.room.on(RoomEvent.ParticipantConnected, (p: RemoteParticipant) => {
      this._emit('remoteUserJoined', p.identity);
    });

    this.room.on(RoomEvent.ParticipantDisconnected, (p: RemoteParticipant) => {
      this._emit('remoteUserLeft', p.identity);
    });

    this.room.on(RoomEvent.ActiveSpeakersChanged, (speakers: Participant[]) => {
      this._emit('activeSpeakersChanged', speakers.map((s) => s.identity));
    });

    this.room.on(RoomEvent.ConnectionStateChanged, (state: ConnectionState) => {
      this._emit('connectionStateChanged', state);
      if (state === ConnectionState.Disconnected && this.session) {
        this._emit('error', new RtcConnectionError('Room disconnected unexpectedly'));
      }
    });

    this.room.on(RoomEvent.Disconnected, () => {
      if (this.session) {
        this._emit('leave', this.session.channelId);
        this.session = null;
      }
    });
  }

  private async _fetchLiveKitToken(room: string, identity: string): Promise<{ token: string; url: string }> {
    const res = await fetch(`${this.config.authServerUrl}/sdk/livekit-token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.config.sdkToken}`,
      },
      body: JSON.stringify({ room, identity }),
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new RtcTokenError(body.error || `LiveKit token fetch failed: ${res.status}`, res.status);
    }

    const data = await res.json();
    if (!data.token || !data.url) {
      throw new RtcTokenError('Malformed LiveKit token response');
    }

    return data;
  }
}
