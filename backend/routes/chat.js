const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const { db, bucket } = require('../config/firebase');
const authMiddleware = require('../middleware/auth');

// Multer config for file upload
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB max
});

// Generate deterministic chat room ID from two user IDs
function getChatRoomId(userId1, userId2) {
  const sorted = [userId1, userId2].sort();
  return `${sorted[0]}_${sorted[1]}`;
}

// POST /api/chat/create-or-get
router.post('/create-or-get', authMiddleware, async (req, res) => {
  try {
    const { otherUserId } = req.body;
    const currentUserId = req.user.id;

    if (!otherUserId) {
      return res.status(400).json({ error: 'otherUserId is required.' });
    }

    if (otherUserId === currentUserId) {
      return res.status(400).json({ error: 'Cannot chat with yourself.' });
    }

    const chatRoomId = getChatRoomId(currentUserId, otherUserId);

    // Check if chat room already exists
    const chatDoc = await db.collection('chats').doc(chatRoomId).get();

    if (chatDoc.exists) {
      return res.json({ chatId: chatRoomId, chat: chatDoc.data() });
    }

    // Create new chat room
    const chatData = {
      id: chatRoomId,
      participants: [currentUserId, otherUserId],
      createdAt: new Date().toISOString(),
      lastMessage: null,
      lastMessageAt: null
    };

    await db.collection('chats').doc(chatRoomId).set(chatData);

    res.status(201).json({ chatId: chatRoomId, chat: chatData });
  } catch (err) {
    console.error('Create/get chat error:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// GET /api/chat/list - Get all chats for current user
router.get('/list', authMiddleware, async (req, res) => {
  try {
    const currentUserId = req.user.id;

    const chatsSnapshot = await db.collection('chats')
      .where('participants', 'array-contains', currentUserId)
      .orderBy('lastMessageAt', 'desc')
      .get();

    const chats = [];
    for (const doc of chatsSnapshot.docs) {
      const chatData = doc.data();
      // Get other participant info
      const otherUserId = chatData.participants.find(id => id !== currentUserId);
      const userSnapshot = await db.collection('users').where('id', '==', otherUserId).get();
      let otherUser = null;
      if (!userSnapshot.empty) {
        const userData = userSnapshot.docs[0].data();
        otherUser = { id: userData.id, name: userData.name, username: userData.username };
      }
      chats.push({ ...chatData, otherUser });
    }

    res.json({ chats });
  } catch (err) {
    console.error('Chat list error:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// GET /api/chat/:chatId/messages
router.get('/:chatId/messages', authMiddleware, async (req, res) => {
  try {
    const { chatId } = req.params;
    const currentUserId = req.user.id;

    // Verify user is participant
    const chatDoc = await db.collection('chats').doc(chatId).get();
    if (!chatDoc.exists) {
      return res.status(404).json({ error: 'Chat not found.' });
    }
    if (!chatDoc.data().participants.includes(currentUserId)) {
      return res.status(403).json({ error: 'Access denied.' });
    }

    const messagesSnapshot = await db.collection('messages')
      .where('chatId', '==', chatId)
      .orderBy('timestamp', 'asc')
      .limit(100)
      .get();

    const messages = [];
    messagesSnapshot.forEach(doc => {
      messages.push(doc.data());
    });

    res.json({ messages });
  } catch (err) {
    console.error('Get messages error:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// POST /api/chat/:chatId/message - Send text message
router.post('/:chatId/message', authMiddleware, async (req, res) => {
  try {
    const { chatId } = req.params;
    const { text, receiverId } = req.body;
    const currentUserId = req.user.id;

    // Verify user is participant
    const chatDoc = await db.collection('chats').doc(chatId).get();
    if (!chatDoc.exists) {
      return res.status(404).json({ error: 'Chat not found.' });
    }
    if (!chatDoc.data().participants.includes(currentUserId)) {
      return res.status(403).json({ error: 'Access denied.' });
    }

    if (!text) {
      return res.status(400).json({ error: 'Message text is required.' });
    }

    const messageRef = db.collection('messages').doc();
    const messageData = {
      id: messageRef.id,
      chatId,
      senderId: currentUserId,
      receiverId: receiverId || null,
      text,
      type: 'text',
      mediaUrl: null,
      timestamp: new Date().toISOString()
    };

    await messageRef.set(messageData);

    // Update chat's last message
    await db.collection('chats').doc(chatId).update({
      lastMessage: text,
      lastMessageAt: messageData.timestamp
    });

    res.status(201).json({ message: messageData });
  } catch (err) {
    console.error('Send message error:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// POST /api/chat/:chatId/upload - Upload media message
router.post('/:chatId/upload', authMiddleware, upload.single('file'), async (req, res) => {
  try {
    const { chatId } = req.params;
    const { receiverId } = req.body;
    const currentUserId = req.user.id;

    // Verify user is participant
    const chatDoc = await db.collection('chats').doc(chatId).get();
    if (!chatDoc.exists) {
      return res.status(404).json({ error: 'Chat not found.' });
    }
    if (!chatDoc.data().participants.includes(currentUserId)) {
      return res.status(403).json({ error: 'Access denied.' });
    }

    if (!req.file) {
      return res.status(400).json({ error: 'File is required.' });
    }

    // Upload to Firebase Storage
    const fileName = `chat-media/${chatId}/${Date.now()}_${req.file.originalname}`;
    const file = bucket.file(fileName);

    await file.save(req.file.buffer, {
      metadata: { contentType: req.file.mimetype }
    });

    // Make file publicly accessible
    await file.makePublic();
    const mediaUrl = `https://storage.googleapis.com/${bucket.name}/${fileName}`;

    // Determine message type
    const isImage = req.file.mimetype.startsWith('image/');
    const messageType = isImage ? 'image' : 'file';

    const messageRef = db.collection('messages').doc();
    const messageData = {
      id: messageRef.id,
      chatId,
      senderId: currentUserId,
      receiverId: receiverId || null,
      text: req.file.originalname,
      type: messageType,
      mediaUrl,
      timestamp: new Date().toISOString()
    };

    await messageRef.set(messageData);

    // Update chat's last message
    await db.collection('chats').doc(chatId).update({
      lastMessage: `[${messageType}] ${req.file.originalname}`,
      lastMessageAt: messageData.timestamp
    });

    res.status(201).json({ message: messageData });
  } catch (err) {
    console.error('Upload error:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

module.exports = router;
