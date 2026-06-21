const router = require('express').Router();
const jwt = require('jsonwebtoken');
const { AccessToken } = require('livekit-server-sdk');
const authenticateSdk = require('../middleware/auth');
const rateLimit = require('../middleware/rateLimit');
const {
  SDK_SESSION_JWT_SECRET,
  LIVEKIT_URL,
  LIVEKIT_API_KEY,
  LIVEKIT_API_SECRET,
} = require('../config');

const MAX_TTL_SECONDS = 3600;
const ROOM_IDENTITY_PATTERN = /^[a-zA-Z0-9_-]{1,128}$/;

function sanitizeIdentity(raw, appId) {
  const base = String(raw || appId).slice(0, 64);
  const safe = base.replace(/[^a-zA-Z0-9_-]/g, '_');
  return `${appId}:${safe}`;
}

// POST /v1/tokens
// Body: { room, identity, ttl_seconds? }
router.post('/', authenticateSdk, rateLimit, async (req, res, next) => {
  try {
    const { room, identity, ttl_seconds = 3600 } = req.body;
    if (!room || !identity) return res.status(400).json({ error: 'room and identity are required' });
    if (!ROOM_IDENTITY_PATTERN.test(room) || !ROOM_IDENTITY_PATTERN.test(String(identity))) {
      return res.status(400).json({ error: 'room and identity must be 1-128 alphanumeric characters' });
    }

    const ttl = Math.min(Math.max(1, Number(ttl_seconds) || 3600), MAX_TTL_SECONDS);
    const boundIdentity = sanitizeIdentity(identity, req.sdk.app_id);

    const sdk_token = jwt.sign(
      { app_id: req.sdk.app_id, identity: boundIdentity, room, type: 'rtc_session' },
      SDK_SESSION_JWT_SECRET,
      { expiresIn: ttl }
    );

    const at = new AccessToken(LIVEKIT_API_KEY, LIVEKIT_API_SECRET, {
      identity: boundIdentity,
      ttl,
    });
    at.addGrant({ roomJoin: true, room, canPublish: true, canSubscribe: true });
    const livekit_token = await at.toJwt();

    res.json({
      sdk_token,
      livekit_token,
      livekit_url: LIVEKIT_URL,
      expires_at: Date.now() + ttl * 1000,
    });
  } catch (err) { next(err); }
});

module.exports = router;
