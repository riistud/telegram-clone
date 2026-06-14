const express = require('express');
const router = express.Router();
const { db } = require('../config/firebase');
const authMiddleware = require('../middleware/auth');

// GET /api/users/search?username=
router.get('/search', authMiddleware, async (req, res) => {
  try {
    const { username } = req.query;

    if (!username) {
      return res.status(400).json({ error: 'Username query is required.' });
    }

    const usersSnapshot = await db.collection('users')
      .where('username', '>=', username)
      .where('username', '<=', username + '\uf8ff')
      .limit(10)
      .get();

    const users = [];
    usersSnapshot.forEach(doc => {
      const data = doc.data();
      // Don't return current user in search results
      if (data.id !== req.user.id) {
        users.push({ id: data.id, name: data.name, username: data.username });
      }
    });

    res.json({ users });
  } catch (err) {
    console.error('Search error:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// GET /api/users/profile/:id
router.get('/profile/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;

    const usersSnapshot = await db.collection('users')
      .where('id', '==', id)
      .get();

    if (usersSnapshot.empty) {
      return res.status(404).json({ error: 'User not found.' });
    }

    const userData = usersSnapshot.docs[0].data();
    res.json({ user: { id: userData.id, name: userData.name, username: userData.username } });
  } catch (err) {
    console.error('Profile error:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

module.exports = router;
