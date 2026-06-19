export class RtcError extends Error {
  public readonly code: string;
  constructor(message: string, code: string) {
    super(message);
    this.name = 'RtcError';
    this.code = code;
  }
}
export class RtcPermissionError extends RtcError {
  constructor(media: 'audio' | 'camera') {
    super(media === 'audio' ? 'Microphone permission denied. Request RECORD_AUDIO before calling join().' : 'Camera permission denied. Request CAMERA permission before calling join().', 'PERMISSION_DENIED');
    this.name = 'RtcPermissionError';
  }
}
export class RtcTokenError extends RtcError {
  public readonly statusCode?: number;
  constructor(message: string, statusCode?: number) {
    super(message, 'TOKEN_ERROR');
    this.name = 'RtcTokenError';
    this.statusCode = statusCode;
  }
}
export class RtcConnectionError extends RtcError {
  constructor(message: string) {
    super(message, 'CONNECTION_ERROR');
    this.name = 'RtcConnectionError';
  }
}