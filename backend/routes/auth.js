const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { db } = require('../config/firebase');
require('dotenv').config();

// POST /api/auth/signup
router.post('/signup', async (req, res) => {
  try {
    const { name, username, password, phone } = req.body;

    if (!name || !username || !password || !phone) {
      return res.status(400).json({ error: 'All fields are required.' });
    }

    // Check if username already exists
    const userSnapshot = await db.collection('users')
      .where('username', '==', username)
      .get();

    if (!userSnapshot.empty) {
      return res.status(400).json({ error: 'Username already taken.' });
    }

    // Hash password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // Create user document
    const userRef = db.collection('users').doc();
    const userData = {
      id: userRef.id,
      name,
      username,
      password: hashedPassword,
      phone,
      createdAt: new Date().toISOString()
    };

    await userRef.set(userData);

    // Generate JWT
    const token = jwt.sign(
      { id: userRef.id, username },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.status(201).json({
      message: 'User created successfully.',
      token,
      user: { id: userRef.id, name, username, phone }
    });
  } catch (err) {
    console.error('Signup error:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required.' });
    }

    // Find user by username
    const userSnapshot = await db.collection('users')
      .where('username', '==', username)
      .get();

    if (userSnapshot.empty) {
      return res.status(401).json({ error: 'Invalid credentials.' });
    }

    const userDoc = userSnapshot.docs[0];
    const userData = userDoc.data();

    // Compare password
    const isMatch = await bcrypt.compare(password, userData.password);
    if (!isMatch) {
      return res.status(401).json({ error: 'Invalid credentials.' });
    }

    // Generate JWT
    const token = jwt.sign(
      { id: userData.id, username: userData.username },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({
      message: 'Login successful.',
      token,
      user: { id: userData.id, name: userData.name, username: userData.username, phone: userData.phone }
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

module.exports = router;
