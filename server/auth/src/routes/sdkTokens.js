const express = require('express');
const bcrypt = require('bcryptjs');
const { ApiKeyRepo } = require('../db/repositories');
const { issueTokenPair, rotateRefreshToken } = require('../auth/tokens');
const logger = require('../utils/logger');

const router = express.Router();

router.post('/token', async (req, res) => {
  const { app_id, app_secret } = req.body;
  if (!app_id || !app_secret) {
    return res.status(400).json({ error: 'app_id and app_secret are required' });
  }
  try {
    const apiKey = await ApiKeyRepo.findByAppId(app_id);
    if (!apiKey) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    const valid = await bcrypt.compare(app_secret, apiKey.app_secret);
    if (!valid) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    const tokens = await issueTokenPair(apiKey);
    res.json(tokens);
  } catch (err) {
    logger.error({ err }, 'sdk token error');
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/refresh', async (req, res) => {
  const { refresh_token } = req.body;
  if (!refresh_token) {
    return res.status(400).json({ error: 'refresh_token is required' });
  }
  try {
    const tokens = await rotateRefreshToken(refresh_token);
    res.json(tokens);
  } catch (err) {
    if (err.message === 'Invalid or expired refresh token') {
      return res.status(401).json({ error: err.message, code: 'REFRESH_INVALID' });
    }
    if (err.message === 'API key no longer active') {
      return res.status(401).json({ error: err.message, code: 'KEY_REVOKED' });
    }
    logger.error({ err }, 'sdk refresh error');
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
