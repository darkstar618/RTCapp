import { appSchema, tableSchema } from '@nozbe/watermelondb';

export const DB_SCHEMA_VERSION = 1;

export const schema = appSchema({
  version: DB_SCHEMA_VERSION,
  tables: [
    tableSchema({
      name: 'channels',
      columns: [
        { name: 'channel_id', type: 'string' },
        { name: 'project_id', type: 'string', isOptional: true },
        { name: 'name', type: 'string', isOptional: true },
        { name: 'type', type: 'string', isOptional: true },
        { name: 'status', type: 'string', isOptional: true },
        { name: 'created_at', type: 'number' },
        { name: 'ended_at', type: 'number', isOptional: true },
        { name: 'metadata', type: 'string', isOptional: true },
      ],
    }),

    tableSchema({
      name: 'participants',
      columns: [
        { name: 'channel_id', type: 'string' },
        { name: 'user_id', type: 'string' },
        { name: 'display_name', type: 'string', isOptional: true },
        { name: 'role', type: 'string', isOptional: true },
        { name: 'is_audio_muted', type: 'boolean', isOptional: true },
        { name: 'is_video_muted', type: 'boolean', isOptional: true },
        { name: 'connection_state', type: 'string', isOptional: true },
        { name: 'joined_at', type: 'number' },
        { name: 'left_at', type: 'number', isOptional: true },
      ],
    }),

    tableSchema({
      name: 'sessions',
      columns: [
        { name: 'session_id', type: 'string' },
        { name: 'channel_id', type: 'string' },
        { name: 'user_id', type: 'string' },
        { name: 'project_id', type: 'string', isOptional: true },
        { name: 'media_type', type: 'string', isOptional: true },
        { name: 'started_at', type: 'number' },
        { name: 'ended_at', type: 'number', isOptional: true },
        { name: 'duration_seconds', type: 'number', isOptional: true },
        { name: 'bytes_sent', type: 'number', isOptional: true },
        { name: 'bytes_received', type: 'number', isOptional: true },
        { name: 'region', type: 'string', isOptional: true },
        { name: 'synced', type: 'boolean' },
        { name: 'created_at', type: 'number' },
      ],
    }),

    tableSchema({
      name: 'api_keys',
      columns: [
        { name: 'app_id', type: 'string' },
        { name: 'project_id', type: 'string', isOptional: true },
        { name: 'api_key_encrypted', type: 'string', isOptional: true },
        { name: 'jwt_token', type: 'string', isOptional: true },
        { name: 'jwt_expires_at', type: 'number', isOptional: true },
        { name: 'refresh_token', type: 'string', isOptional: true },
        { name: 'created_at', type: 'number' },
        { name: 'last_used_at', type: 'number', isOptional: true },
      ],
    }),
  ],
});
