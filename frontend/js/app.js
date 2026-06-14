const app = document.getElementById('app');

let currentChatId = null;
let currentOtherUser = null;
let messagePolling = null;

// --- Page Renderers ---

function renderLogin() {
  app.innerHTML = `
    <div class="auth-container">
      <h1>TeleChat</h1>
      <p>Sign in to start messaging</p>
      <div class="error-msg" id="error"></div>
      <form id="loginForm">
        <div class="form-group">
          <label for="username">Username</label>
          <input type="text" id="username" placeholder="Enter username" required>
        </div>
        <div class="form-group">
          <label for="password">Password</label>
          <input type="password" id="password" placeholder="Enter password" required>
        </div>
        <button type="submit" class="btn">Sign In</button>
      </form>
      <div class="auth-link">
        Don't have an account? <a onclick="router.navigate('/signup')">Sign Up</a>
      </div>
    </div>
  `;

  document.getElementById('loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const username = document.getElementById('username').value.trim();
    const password = document.getElementById('password').value;
    const errorEl = document.getElementById('error');

    try {
      await api.login(username, password);
      router.navigate('/home');
    } catch (err) {
      errorEl.textContent = err.message;
      errorEl.style.display = 'block';
    }
  });
}

function renderSignup() {
  app.innerHTML = `
    <div class="auth-container">
      <h1>TeleChat</h1>
      <p>Create your account</p>
      <div class="error-msg" id="error"></div>
      <form id="signupForm">
        <div class="form-group">
          <label for="name">Full Name</label>
          <input type="text" id="name" placeholder="Enter your name" required>
        </div>
        <div class="form-group">
          <label for="username">Username</label>
          <input type="text" id="username" placeholder="Choose a username" required>
        </div>
        <div class="form-group">
          <label for="phone">Phone Number</label>
          <input type="tel" id="phone" placeholder="Enter phone number" required>
        </div>
        <div class="form-group">
          <label for="password">Password</label>
          <input type="password" id="password" placeholder="Create a password" required minlength="6">
        </div>
        <button type="submit" class="btn">Create Account</button>
      </form>
      <div class="auth-link">
        Already have an account? <a onclick="router.navigate('/login')">Sign In</a>
      </div>
    </div>
  `;

  document.getElementById('signupForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = document.getElementById('name').value.trim();
    const username = document.getElementById('username').value.trim();
    const phone = document.getElementById('phone').value.trim();
    const password = document.getElementById('password').value;
    const errorEl = document.getElementById('error');

    try {
      await api.signup(name, username, password, phone);
      router.navigate('/home');
    } catch (err) {
      errorEl.textContent = err.message;
      errorEl.style.display = 'block';
    }
  });
}

function renderHome() {
  const user = api.getUser();
  if (!user) {
    router.navigate('/login');
    return;
  }

  app.innerHTML = `
    <div class="home-container" id="homeContainer">
      <div class="sidebar">
        <div class="sidebar-header">
          <h2>TeleChat</h2>
          <button class="logout-btn" id="logoutBtn">Logout</button>
        </div>
        <div class="search-box">
          <input type="text" id="searchInput" placeholder="Search users...">
        </div>
        <div class="search-results" id="searchResults"></div>
        <div class="chat-list" id="chatList">
          <div style="padding:20px;text-align:center;color:#8a9bae;">Loading chats...</div>
        </div>
      </div>
      <div class="chat-area" id="chatArea">
        <div class="no-chat-selected">
          <span>Select a chat to start messaging</span>
        </div>
      </div>
    </div>
  `;

  // Logout
  document.getElementById('logoutBtn').addEventListener('click', () => {
    api.logout();
    stopPolling();
    router.navigate('/login');
  });

  // Search
  let searchTimeout;
  document.getElementById('searchInput').addEventListener('input', (e) => {
    clearTimeout(searchTimeout);
    const query = e.target.value.trim();
    if (!query) {
      document.getElementById('searchResults').innerHTML = '';
      return;
    }
    searchTimeout = setTimeout(() => searchUsers(query), 300);
  });

  loadChatList();
}

async function searchUsers(query) {
  try {
    const data = await api.searchUsers(query);
    const resultsEl = document.getElementById('searchResults');

    if (data.users.length === 0) {
      resultsEl.innerHTML = '<div style="padding:12px 16px;color:#8a9bae;font-size:13px;">No users found</div>';
      return;
    }

    resultsEl.innerHTML = data.users.map(user => `
      <div class="search-item" onclick="startChat('${user.id}', '${user.name}', '${user.username}')">
        <div class="avatar">${user.name.charAt(0).toUpperCase()}</div>
        <div class="chat-info">
          <div class="name">${user.name}</div>
          <div class="last-msg">@${user.username}</div>
        </div>
      </div>
    `).join('');
  } catch (err) {
    console.error('Search error:', err);
  }
}

async function startChat(otherUserId, name, username) {
  try {
    const data = await api.createOrGetChat(otherUserId);
    currentChatId = data.chatId;
    currentOtherUser = { id: otherUserId, name, username };

    document.getElementById('searchInput').value = '';
    document.getElementById('searchResults').innerHTML = '';

    await loadChatList();
    openChat(data.chatId, { id: otherUserId, name, username });
  } catch (err) {
    console.error('Start chat error:', err);
  }
}

async function loadChatList() {
  try {
    const data = await api.getChatList();
    const chatListEl = document.getElementById('chatList');

    if (data.chats.length === 0) {
      chatListEl.innerHTML = '<div style="padding:20px;text-align:center;color:#8a9bae;font-size:13px;">No chats yet. Search for users to start chatting.</div>';
      return;
    }

    chatListEl.innerHTML = data.chats.map(chat => {
      const other = chat.otherUser || { name: 'Unknown', username: 'unknown' };
      const lastMsg = chat.lastMessage || 'No messages yet';
      const time = chat.lastMessageAt ? formatTime(chat.lastMessageAt) : '';
      const isActive = chat.id === currentChatId ? 'active' : '';

      return `
        <div class="chat-item ${isActive}" onclick="openChat('${chat.id}', ${JSON.stringify(other).replace(/"/g, '&quot;')})">
          <div class="avatar">${other.name.charAt(0).toUpperCase()}</div>
          <div class="chat-info">
            <div class="name">${other.name} <span class="time">${time}</span></div>
            <div class="last-msg">${escapeHtml(lastMsg)}</div>
          </div>
        </div>
      `;
    }).join('');
  } catch (err) {
    console.error('Load chat list error:', err);
  }
}

async function openChat(chatId, otherUser) {
  currentChatId = chatId;
  currentOtherUser = otherUser;
  stopPolling();

  const chatArea = document.getElementById('chatArea');
  const homeContainer = document.getElementById('homeContainer');
  homeContainer.classList.add('chat-open');

  chatArea.innerHTML = `
    <div class="chat-header">
      <div class="avatar">${otherUser.name.charAt(0).toUpperCase()}</div>
      <div>
        <div class="name">${otherUser.name}</div>
        <div class="status">@${otherUser.username}</div>
      </div>
    </div>
    <div class="messages-area" id="messagesArea">
      <div style="text-align:center;color:#8a9bae;padding:20px;">Loading messages...</div>
    </div>
    <div class="chat-input">
      <label class="upload-btn" for="fileInput" title="Upload file">
        <svg viewBox="0 0 24 24" width="20" height="20" fill="#8a9bae"><path d="M16.5 6v11.5c0 2.21-1.79 4-4 4s-4-1.79-4-4V5a2.5 2.5 0 0 1 5 0v10.5c0 .55-.45 1-1 1s-1-.45-1-1V6h-1.5v9.5a2.5 2.5 0 0 0 5 0V5c0-2.21-1.79-4-4-4S7 2.79 7 5v12.5c0 3.04 2.46 5.5 5.5 5.5s5.5-2.46 5.5-5.5V6H16.5z"/></svg>
      </label>
      <input type="file" id="fileInput" style="display:none" onchange="handleFileUpload(this)">
      <input type="text" id="messageInput" placeholder="Type a message..." autocomplete="off">
      <button id="sendBtn" title="Send">
        <svg viewBox="0 0 24 24"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>
      </button>
    </div>
  `;

  // Send message
  document.getElementById('sendBtn').addEventListener('click', sendMessage);
  document.getElementById('messageInput').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') sendMessage();
  });

  await loadMessages(chatId);
  startPolling(chatId);
}

async function loadMessages(chatId) {
  try {
    const data = await api.getMessages(chatId);
    renderMessages(data.messages);
  } catch (err) {
    console.error('Load messages error:', err);
  }
}

function renderMessages(messages) {
  const messagesArea = document.getElementById('messagesArea');
  const user = api.getUser();

  if (messages.length === 0) {
    messagesArea.innerHTML = '<div style="text-align:center;color:#8a9bae;padding:20px;">No messages yet. Say hello!</div>';
    return;
  }

  messagesArea.innerHTML = messages.map(msg => {
    const isSent = msg.senderId === user.id;
    const cls = isSent ? 'sent' : 'received';
    let content = '';

    if (msg.type === 'image') {
      content = `<img src="${msg.mediaUrl}" class="media-img" alt="image"><br><span>${escapeHtml(msg.text)}</span>`;
    } else if (msg.type === 'file') {
      content = `<a href="${msg.mediaUrl}" target="_blank" class="file-link">📎 ${escapeHtml(msg.text)}</a>`;
    } else {
      content = escapeHtml(msg.text);
    }

    return `
      <div class="message ${cls}">
        ${content}
        <div class="msg-time">${formatTime(msg.timestamp)}</div>
      </div>
    `;
  }).join('');

  messagesArea.scrollTop = messagesArea.scrollHeight;
}

async function sendMessage() {
  const input = document.getElementById('messageInput');
  const text = input.value.trim();
  if (!text || !currentChatId) return;

  input.value = '';

  try {
    await api.sendMessage(currentChatId, text, currentOtherUser.id);
    await loadMessages(currentChatId);
    await loadChatList();
  } catch (err) {
    console.error('Send message error:', err);
  }
}

async function handleFileUpload(input) {
  const file = input.files[0];
  if (!file || !currentChatId) return;

  try {
    await api.uploadMedia(currentChatId, file, currentOtherUser.id);
    await loadMessages(currentChatId);
    await loadChatList();
  } catch (err) {
    console.error('Upload error:', err);
  }

  input.value = '';
}

// Polling for new messages (simple alternative to real-time)
function startPolling(chatId) {
  messagePolling = setInterval(async () => {
    if (currentChatId === chatId) {
      await loadMessages(chatId);
    }
  }, 3000);
}

function stopPolling() {
  if (messagePolling) {
    clearInterval(messagePolling);
    messagePolling = null;
  }
}

// --- Utilities ---

function formatTime(timestamp) {
  const date = new Date(timestamp);
  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();

  if (isToday) {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
  return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// --- Routes ---

router.add('/login', () => {
  stopPolling();
  renderLogin();
});

router.add('/signup', () => {
  stopPolling();
  renderSignup();
});

router.add('/home', () => {
  renderHome();
});

// Start
(function init() {
  const token = localStorage.getItem('token');
  if (token) {
    router.navigate('/home');
  } else {
    router.navigate('/login');
  }
  router.start();
})();
