import { Model } from '@nozbe/watermelondb';
import { field, date, readonly } from '@nozbe/watermelondb/decorators';

export class ChannelModel extends Model {
  static table = 'channels';

  @readonly @field('channel_id') channelId!: string;
  @field('project_id') projectId!: string | null;
  @field('name') name!: string | null;
  @field('type') type!: string | null;
  @field('status') status!: string | null;
  @readonly @date('created_at') createdAt!: Date;
  @date('ended_at') endedAt!: Date | null;
  @field('metadata') metadata!: string | null;
}

export class ParticipantModel extends Model {
  static table = 'participants';

  @field('channel_id') channelId!: string;
  @field('user_id') userId!: string;
  @field('display_name') displayName!: string | null;
  @field('role') role!: string | null;
  @field('is_audio_muted') isAudioMuted!: boolean | null;
  @field('is_video_muted') isVideoMuted!: boolean | null;
  @field('connection_state') connectionState!: string | null;
  @date('joined_at') joinedAt!: Date;
  @date('left_at') leftAt!: Date | null;
}

export class SessionModel extends Model {
  static table = 'sessions';

  @readonly @field('session_id') sessionId!: string;
  @field('channel_id') channelId!: string;
  @field('user_id') userId!: string;
  @field('project_id') projectId!: string | null;
  @field('media_type') mediaType!: string | null;
  @date('started_at') startedAt!: Date;
  @date('ended_at') endedAt!: Date | null;
  @field('duration_seconds') durationSeconds!: number | null;
  @field('bytes_sent') bytesSent!: number | null;
  @field('bytes_received') bytesReceived!: number | null;
  @field('region') region!: string | null;
  @field('synced') synced!: boolean;
  @readonly @date('created_at') createdAt!: Date;
}

export class ApiKeyModel extends Model {
  static table = 'api_keys';

  @readonly @field('app_id') appId!: string;
  @field('project_id') projectId!: string | null;
  @field('api_key_encrypted') apiKeyEncrypted!: string | null;
  @field('jwt_token') jwtToken!: string | null;
  @field('jwt_expires_at') jwtExpiresAt!: number | null;
  @field('refresh_token') refreshToken!: string | null;
  @readonly @date('created_at') createdAt!: Date;
  @field('last_used_at') lastUsedAt!: number | null;
}
