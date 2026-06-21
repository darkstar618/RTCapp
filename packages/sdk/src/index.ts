// @yourplatform/sdk - Public API
// -- Database --
export { getDatabase } from './db/database';
export { schema, DB_SCHEMA_VERSION } from './db/schema';
export { migrations } from '../migrations';
export { ChannelRepository, ParticipantRepository, SessionRepository, ApiKeyRepository } from './db/repositories';
export { ChannelModel, ParticipantModel, SessionModel, ApiKeyModel } from './models';
// -- Types --
export type { Channel, Participant, Session, ApiKey, ChannelType, ChannelStatus, ParticipantRole, ConnectionState, MediaType } from './types';
// -- RTC Core --
export { RtcClient } from './rtc/RtcClient';
export type { RtcClientConfig, RtcSessionInfo, RtcEventMap } from './rtc/RtcClient';
export { useRtcClient } from './rtc/useRtcClient';
export type { UseRtcClientResult } from './rtc/useRtcClient';
// -- Errors --
export { RtcError, RtcPermissionError, RtcTokenError, RtcConnectionError } from './errors';
export { requestAudioPermissions, requireAudioPermissions, checkAudioPermissions } from './rtc/permissions';