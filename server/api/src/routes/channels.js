const router = require('express').Router();
const authenticate = require('../middleware/auth');
const rateLimit = require('../middleware/rateLimit');
const store = require('../store/channels');
const { fire } = require('../services/webhooks');
const db = require('../db/database');
const logger = require('../utils/logger');

router.post('/', authenticate, rateLimit, (req, res) => {
  try {
    const ch = db.transaction(() => store.createChannel(req.sdk.app_id))();
    fire(req.sdk.app_id, 'channel.created', { channel_id: ch.id });
    res.status(201).json(store.serializeChannel(ch));
  } catch(e) {
    logger.error({ err: e }, 'channel create error');
    res.status(500).json({ error: 'Failed to create channel' });
  }
});

router.get('/:id', authenticate, rateLimit, (req, res) => {
  const ch = store.getChannel(req.params.id);
  if (!ch) return res.status(404).json({ error: 'Channel not found' });
  if (ch.app_id !== req.sdk.app_id) return res.status(403).json({ error: 'Forbidden' });
  res.json(store.serializeChannel(ch));
});

router.delete('/:id', authenticate, rateLimit, (req, res) => {
  const ch = store.getChannel(req.params.id);
  if (!ch) return res.status(404).json({ error: 'Channel not found' });
  if (ch.app_id !== req.sdk.app_id) return res.status(403).json({ error: 'Forbidden' });
  store.closeChannel(req.params.id);
  fire(req.sdk.app_id, 'channel.closed', { channel_id: req.params.id });
  res.status(204).send();
});

const ROOM_IDENTITY_PATTERN = /^[a-zA-Z0-9_-]{1,128}$/;

router.post('/:id/participants', authenticate, rateLimit, (req, res) => {
  const ch = store.getChannel(req.params.id);
  if (!ch) return res.status(404).json({ error: 'Channel not found' });
  if (ch.app_id !== req.sdk.app_id) return res.status(403).json({ error: 'Forbidden' });
  const { identity, room } = req.body;
  if (!identity || !room) return res.status(400).json({ error: 'identity and room required' });
  if (!ROOM_IDENTITY_PATTERN.test(String(identity)) || !ROOM_IDENTITY_PATTERN.test(String(room))) {
    return res.status(400).json({ error: 'identity and room must be 1-128 alphanumeric characters' });
  }
  const participant = store.addParticipant(req.params.id, identity, room, req.sdk.app_id);
  fire(req.sdk.app_id, 'participant.joined', { channel_id: req.params.id, identity });
  res.status(201).json(participant);
});

router.get('/:id/participants', authenticate, rateLimit, (req, res) => {
  const ch = store.getChannel(req.params.id);
  if (!ch) return res.status(404).json({ error: 'Channel not found' });
  if (ch.app_id !== req.sdk.app_id) return res.status(403).json({ error: 'Forbidden' });
  res.json(store.listParticipants(req.params.id));
});

router.delete('/:id/participants/:uid', authenticate, rateLimit, (req, res) => {
  const ch = store.getChannel(req.params.id);
  if (!ch) return res.status(404).json({ error: 'Channel not found' });
  if (ch.app_id !== req.sdk.app_id) return res.status(403).json({ error: 'Forbidden' });
  const result = store.removeParticipant(req.params.id, req.params.uid);
  if (!result) return res.status(404).json({ error: 'Participant not found' });
  fire(req.sdk.app_id, 'participant.left', { channel_id: req.params.id, identity: req.params.uid });
  res.status(204).send();
});

module.exports = router;