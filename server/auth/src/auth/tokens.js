// src/auth/tokens.js
// JWT + refresh token logic

const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const { RefreshTokenRepo, ApiKeyRepo } = require('../db/repositories');
const { JWT_SECRET } = require('../config');

const JWT_EXPIRES_IN = '1h';
const REFRESH_EXPIRES_DAYS = 30;

async function issueTokenPair(apiKey) {
  const now = Date.now();

  const accessToken = jwt.sign(
    {
      sub: apiKey.id,
      app_id: apiKey.app_id,
      project_id: apiKey.project_id,
      type: 'sdk_access',
    },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
  );

  const tokenId = uuidv4();
  const secretPart = crypto.randomBytes(32).toString('hex');
  const rawRefresh = `${tokenId}.${secretPart}`;
  const tokenHash = await bcrypt.hash(secretPart, 10);
  const expiresAt = now + REFRESH_EXPIRES_DAYS * 24 * 60 * 60 * 1000;

  await RefreshTokenRepo.create({
    id: tokenId,
    apiKeyId: apiKey.id,
    tokenHash,
    expiresAt,
    now,
  });

  return {
    access_token: accessToken,
    refresh_token: rawRefresh,
    expires_in: 3600,
    token_type: 'Bearer',
  };
}

function verifyAccessToken(token) {
  const payload = jwt.verify(token, JWT_SECRET);
  if (payload.type !== 'sdk_access') {
    throw new Error('Invalid token type');
  }
  return payload;
}

async function rotateRefreshToken(rawRefreshToken) {
  const now = Date.now();
  const dotIdx = rawRefreshToken.indexOf('.');
  if (dotIdx === -1) {
    throw new Error('Invalid or expired refresh token');
  }

  const tokenId = rawRefreshToken.slice(0, dotIdx);
  const secretPart = rawRefreshToken.slice(dotIdx + 1);
  const row = await RefreshTokenRepo.findActiveById(tokenId, now);

  if (!row) {
    throw new Error('Invalid or expired refresh token');
  }

  const ok = await bcrypt.compare(secretPart, row.token_hash);
  if (!ok) {
    throw new Error('Invalid or expired refresh token');
  }

  await RefreshTokenRepo.revoke(row.id);

  const { db } = require('../db/database');
  const key = await db('api_keys').where({ id: row.api_key_id, is_active: 1 }).first();
  if (!key) {
    throw new Error('API key no longer active');
  }

  return issueTokenPair(key);
}

module.exports = { issueTokenPair, verifyAccessToken, rotateRefreshToken };
