// src/routes/livekitTokens.js
// POST /sdk/livekit-token

const express = require('express');
const { AccessToken } = require('livekit-server-sdk');
const { authenticate } = require('../middleware/authenticate');
const { LIVEKIT_API_KEY, LIVEKIT_API_SECRET, LIVEKIT_URL } = require('../config');

const router = express.Router();
const ROOM_IDENTITY_PATTERN = /^[a-zA-Z0-9_-]{1,128}$/;

function bindIdentity(rawIdentity, appId) {
  const base = String(rawIdentity || appId).slice(0, 64);
  const safe = base.replace(/[^a-zA-Z0-9_-]/g, '_');
  return `${appId}:${safe}`;
}

router.post('/livekit-token', authenticate, async (req, res) => {
  const { room, identity } = req.body;

  if (!room || !identity) {
    return res.status(400).json({ error: 'room and identity are required' });
  }
  if (!ROOM_IDENTITY_PATTERN.test(room) || !ROOM_IDENTITY_PATTERN.test(String(identity))) {
    return res.status(400).json({ error: 'room and identity must be 1-128 alphanumeric characters' });
  }

  const boundIdentity = bindIdentity(identity, req.auth.app_id);

  try {
    const at = new AccessToken(LIVEKIT_API_KEY, LIVEKIT_API_SECRET, {
      identity: boundIdentity,
      ttl: '1h',
    });

    at.addGrant({
      roomJoin: true,
      room,
      canPublish: true,
      canSubscribe: true,
    });

    const token = await at.toJwt();
    res.json({ token, url: LIVEKIT_URL });
  } catch (err) {
    console.error('LiveKit token error:', err.message);
    res.status(500).json({ error: 'Failed to generate LiveKit token' });
  }
});

module.exports = router;
