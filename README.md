# TeleChat - MVP Chat Application

A production-minded MVP web chat application similar to Telegram, built with Node.js, Express.js, and Firebase.

## Tech Stack

- **Backend:** Node.js + Express.js
- **Database:** Firebase Firestore
- **Storage:** Firebase Storage (media uploads)
- **Frontend:** Vanilla JS (SPA with hash routing)
- **Auth:** JWT-based authentication

## Folder Structure

```
telegram-clone/
├── backend/
│   ├── config/
│   │   ├── firebase.js          # Firebase Admin SDK initialization
│   │   └── serviceAccountKey.json # (you provide this)
│   ├── middleware/
│   │   └── auth.js              # JWT auth middleware
│   ├── routes/
│   │   ├── auth.js              # Signup & Login endpoints
│   │   ├── users.js             # User search & profile
│   │   └── chat.js              # Chat CRUD & messaging
│   ├── server.js                # Express entry point
│   ├── package.json
│   └── .env.example
├── frontend/
│   ├── css/
│   │   └── style.css            # Telegram-like dark UI
│   ├── js/
│   │   ├── api.js               # API client class
│   │   ├── router.js            # Simple hash router
│   │   └── app.js               # Main app logic & rendering
│   └── index.html
├── firestore.rules.json
├── storage.rules.json
└── README.md
```

## Architecture

### How Express Connects to Firebase
- The backend uses `firebase-admin` SDK with a service account key
- `config/firebase.js` initializes Firestore (`db`) and Storage (`bucket`)
- All routes import and use these instances for database operations

### How Realtime Messaging Works
- MVP uses **polling** (every 3 seconds) to fetch new messages
- Messages are stored in Firestore `messages` collection
- For true real-time, you can upgrade to Firestore snapshot listeners via WebSocket (future enhancement)

### How Chat Rooms Are Generated
- Chat room ID is **deterministic**: both user IDs are sorted alphabetically and joined with `_`
- Example: `userId_ABC` + `userId_XYZ` → `ABC_XYZ`
- This ensures the same room is always found regardless of who initiates

### How Media Upload Works
1. User selects a file from the chat input
2. File is sent via `multipart/form-data` to `/api/chat/:chatId/upload`
3. Backend uploads to Firebase Storage under `chat-media/{chatId}/`
4. Public URL is generated and stored in the message document
5. Frontend renders images inline or files as download links

## Setup Instructions

### 1. Firebase Setup

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Create a new project
3. Enable **Firestore Database** (start in test mode)
4. Enable **Firebase Storage**
5. Go to Project Settings → Service Accounts → Generate New Private Key
6. Save the JSON file as `backend/config/serviceAccountKey.json`

### 2. Backend Setup

```bash
cd telegram-clone/backend

# Copy env file and configure
cp .env.example .env

# Edit .env with your values:
# PORT=3000
# JWT_SECRET=your_strong_secret_here
# FIREBASE_STORAGE_BUCKET=your-project-id.appspot.com

# Install dependencies
npm install

# Start server
npm start

# Or for development with auto-reload:
npm run dev
```

### 3. Access the App

Open `http://localhost:3000` in your browser.

## API Endpoints

### Auth

**POST /api/auth/signup**
```json
// Request
{
  "name": "John Doe",
  "username": "johndoe",
  "password": "secret123",
  "phone": "+1234567890"
}

// Response 201
{
  "message": "User created successfully.",
  "token": "eyJhbGciOiJI...",
  "user": { "id": "abc123", "name": "John Doe", "username": "johndoe", "phone": "+1234567890" }
}
```

**POST /api/auth/login**
```json
// Request
{ "username": "johndoe", "password": "secret123" }

// Response 200
{
  "message": "Login successful.",
  "token": "eyJhbGciOiJI...",
  "user": { "id": "abc123", "name": "John Doe", "username": "johndoe", "phone": "+1234567890" }
}
```

### Users

**GET /api/users/search?username=john**
```json
// Response 200 (requires Bearer token)
{
  "users": [
    { "id": "abc123", "name": "John Doe", "username": "johndoe" }
  ]
}
```

### Chat

**POST /api/chat/create-or-get**
```json
// Request (requires Bearer token)
{ "otherUserId": "xyz789" }

// Response 200/201
{
  "chatId": "abc123_xyz789",
  "chat": { "id": "abc123_xyz789", "participants": ["abc123", "xyz789"], "createdAt": "...", "lastMessage": null }
}
```

**GET /api/chat/list**
```json
// Response 200
{
  "chats": [
    { "id": "abc123_xyz789", "participants": [...], "lastMessage": "Hello!", "otherUser": { "id": "xyz789", "name": "Jane", "username": "jane" } }
  ]
}
```

**GET /api/chat/:chatId/messages**
```json
// Response 200
{
  "messages": [
    { "id": "msg1", "chatId": "abc123_xyz789", "senderId": "abc123", "text": "Hello!", "type": "text", "timestamp": "..." }
  ]
}
```

**POST /api/chat/:chatId/message**
```json
// Request
{ "text": "Hello!", "receiverId": "xyz789" }

// Response 201
{ "message": { "id": "msg1", "chatId": "abc123_xyz789", "senderId": "abc123", "text": "Hello!", "type": "text", "timestamp": "..." } }
```

**POST /api/chat/:chatId/upload**
```
// multipart/form-data: file + receiverId
// Response 201
{ "message": { "id": "msg2", "type": "image", "mediaUrl": "https://storage.googleapis.com/...", ... } }
```

## Deployment on VPS (Ubuntu)

### 1. Server Preparation

```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install Node.js 18+
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt install -y nodejs

# Install PM2 for process management
sudo npm install -g pm2

# Install Nginx
sudo apt install -y nginx
```

### 2. Deploy Application

```bash
# Clone or upload project
cd /var/www
git clone <your-repo-url> telegram-clone

# Setup backend
cd telegram-clone/backend
cp .env.example .env
nano .env  # Configure your values

# Place your Firebase service account key
nano config/serviceAccountKey.json

# Install dependencies
npm install --production

# Start with PM2
pm2 start server.js --name telechat
pm2 startup
pm2 save
```

### 3. Nginx Reverse Proxy

```bash
sudo nano /etc/nginx/sites-available/telechat
```

```nginx
server {
    listen 80;
    server_name your-domain.com;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_cache_bypass $http_upgrade;
    }
}
```

```bash
sudo ln -s /etc/nginx/sites-available/telechat /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

### 4. SSL (Optional but Recommended)

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d your-domain.com
```

## Firestore Indexes

Create composite index for messages query:
- Collection: `messages`
- Fields: `chatId` (Ascending) + `timestamp` (Ascending)

Create composite index for chats query:
- Collection: `chats`
- Fields: `participants` (Array contains) + `lastMessageAt` (Descending)

You can create these in the Firebase Console under Firestore → Indexes.

## Future Enhancements

- [ ] WebSocket/Firestore real-time listeners for instant messaging
- [ ] Read receipts (message seen status)
- [ ] Typing indicators
- [ ] Group chats
- [ ] Push notifications
- [ ] Message encryption (E2E)
- [ ] Online/offline status
- [ ] Message deletion & editing

## License

MIT
