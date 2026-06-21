function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} environment variable is required`);
  }
  return value;
}

const JWT_SECRET = requireEnv('JWT_SECRET');
const LIVEKIT_API_KEY = requireEnv('LIVEKIT_API_KEY');
const LIVEKIT_API_SECRET = requireEnv('LIVEKIT_API_SECRET');
const LIVEKIT_URL = requireEnv('LIVEKIT_URL');

module.exports = {
  JWT_SECRET,
  LIVEKIT_API_KEY,
  LIVEKIT_API_SECRET,
  LIVEKIT_URL,
};
