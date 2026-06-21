import {
  RtcError,
  RtcPermissionError,
  RtcTokenError,
  RtcConnectionError,
} from '../errors';

describe('SDK error classes', () => {
  it('RtcPermissionError uses PERMISSION_DENIED code', () => {
    const err = new RtcPermissionError('audio');
    expect(err).toBeInstanceOf(RtcError);
    expect(err.code).toBe('PERMISSION_DENIED');
    expect(err.message).toContain('Microphone');
  });

  it('RtcTokenError stores status code', () => {
    const err = new RtcTokenError('Unauthorized', 401);
    expect(err.code).toBe('TOKEN_ERROR');
    expect(err.statusCode).toBe(401);
  });

  it('RtcConnectionError uses CONNECTION_ERROR code', () => {
    const err = new RtcConnectionError('Room failed');
    expect(err.code).toBe('CONNECTION_ERROR');
    expect(err.name).toBe('RtcConnectionError');
  });
});
