const express = require('express');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const { ApiKeyRepo, ProjectRepo, RefreshTokenRepo } = require('../db/repositories');
const { authenticate } = require('../middleware/authenticate');
const logger = require('../utils/logger');

const router = express.Router({ mergeParams: true });
router.use(authenticate);

router.post('/', async (req, res) => {
  const { projectId } = req.params;
  try {
    const project = await ProjectRepo.findById(projectId);
    if (!project || project.developer_id !== req.auth.sub) {
      return res.status(404).json({ error: 'Project not found' });
    }
    const now = Date.now();
    const id = uuidv4();
    const appId = 'ap_' + crypto.randomBytes(12).toString('hex');
    const rawSecret = 'sk_' + crypto.randomBytes(24).toString('hex');
    const hashedSecret = await bcrypt.hash(rawSecret, 12);
    await ApiKeyRepo.create({
      id,
      projectId,
      appId,
      appSecret: hashedSecret,
      now,
    });
    logger.info({ projectId, appId, developerId: req.auth.sub }, 'api key created');
    res.status(201).json({
      message: 'API key created. Store the app_secret — it will not be shown again.',
      api_key: {
        id,
        app_id: appId,
        app_secret: rawSecret,
        created_at: now,
      },
    });
  } catch (err) {
    logger.error({ err, projectId }, 'create api key error');
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/', async (req, res) => {
  const { projectId } = req.params;
  try {
    const project = await ProjectRepo.findById(projectId);
    if (!project || project.developer_id !== req.auth.sub) {
      return res.status(404).json({ error: 'Project not found' });
    }
    const keys = (await ApiKeyRepo.findByProject(projectId)).map((k) => ({
      id: k.id,
      app_id: k.app_id,
      is_active: !!k.is_active,
      created_at: k.created_at,
    }));
    res.json({ api_keys: keys });
  } catch (err) {
    logger.error({ err, projectId }, 'list api keys error');
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.delete('/:id', async (req, res) => {
  const { projectId, id } = req.params;
  try {
    const project = await ProjectRepo.findById(projectId);
    if (!project || project.developer_id !== req.auth.sub) {
      return res.status(404).json({ error: 'Project not found' });
    }
    await RefreshTokenRepo.revokeAllForApiKey(id);
    await ApiKeyRepo.revoke(id, Date.now());
    logger.info({ projectId, keyId: id }, 'api key revoked');
    res.json({ message: 'API key revoked' });
  } catch (err) {
    logger.error({ err, projectId, keyId: id }, 'revoke api key error');
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
