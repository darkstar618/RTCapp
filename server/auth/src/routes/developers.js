const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const { DeveloperRepo } = require('../db/repositories');
const { JWT_SECRET } = require('../config');
const logger = require('../utils/logger');

const router = express.Router();
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

router.post('/register', async (req, res) => {
  const { email, password, name } = req.body;
  if (!email || !password || !name) {
    return res.status(400).json({ error: 'email, password and name are required' });
  }
  if (!EMAIL_PATTERN.test(email)) {
    return res.status(400).json({ error: 'Invalid email format' });
  }
  if (password.length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters' });
  }
  try {
    const existing = await DeveloperRepo.findByEmail(email);
    if (existing) {
      return res.status(409).json({ error: 'Email already registered' });
    }
    const now = Date.now();
    const id = uuidv4();
    const passwordHash = await bcrypt.hash(password, 12);
    await DeveloperRepo.create({ id, email, passwordHash, name, now });
    const token = jwt.sign(
      { sub: id, email, type: 'developer_dashboard' },
      JWT_SECRET,
      { expiresIn: '7d' }
    );
    res.status(201).json({ message: 'Account created', developer_id: id, token });
  } catch (err) {
    logger.error({ err }, 'register error');
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'email and password are required' });
  }
  try {
    const developer = await DeveloperRepo.findByEmail(email);
    if (!developer) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    const valid = await bcrypt.compare(password, developer.password_hash);
    if (!valid) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    const token = jwt.sign(
      { sub: developer.id, email: developer.email, type: 'developer_dashboard' },
      JWT_SECRET,
      { expiresIn: '7d' }
    );
    res.json({ message: 'Login successful', developer_id: developer.id, name: developer.name, token });
  } catch (err) {
    logger.error({ err }, 'login error');
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
