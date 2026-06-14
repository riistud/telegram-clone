const API_BASE = '/api';

class Api {
  constructor() {
    this.token = localStorage.getItem('token');
  }

  setToken(token) {
    this.token = token;
    localStorage.setItem('token', token);
  }

  clearToken() {
    this.token = null;
    localStorage.removeItem('token');
    localStorage.removeItem('user');
  }

  getUser() {
    const user = localStorage.getItem('user');
    return user ? JSON.parse(user) : null;
  }

  setUser(user) {
    localStorage.setItem('user', JSON.stringify(user));
  }

  async request(endpoint, options = {}) {
    const headers = { 'Content-Type': 'application/json' };
    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }

    const config = {
      headers,
      ...options
    };

    try {
      const response = await fetch(`${API_BASE}${endpoint}`, config);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Request failed');
      }

      return data;
    } catch (err) {
      throw err;
    }
  }

  // Auth
  async signup(name, username, password, phone) {
    const data = await this.request('/auth/signup', {
      method: 'POST',
      body: JSON.stringify({ name, username, password, phone })
    });
    this.setToken(data.token);
    this.setUser(data.user);
    return data;
  }

  async login(username, password) {
    const data = await this.request('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password })
    });
    this.setToken(data.token);
    this.setUser(data.user);
    return data;
  }

  logout() {
    this.clearToken();
  }

  // Users
  async searchUsers(username) {
    return await this.request(`/users/search?username=${encodeURIComponent(username)}`);
  }

  // Chat
  async createOrGetChat(otherUserId) {
    return await this.request('/chat/create-or-get', {
      method: 'POST',
      body: JSON.stringify({ otherUserId })
    });
  }

  async getChatList() {
    return await this.request('/chat/list');
  }

  async getMessages(chatId) {
    return await this.request(`/chat/${chatId}/messages`);
  }

  async sendMessage(chatId, text, receiverId) {
    return await this.request(`/chat/${chatId}/message`, {
      method: 'POST',
      body: JSON.stringify({ text, receiverId })
    });
  }

  async uploadMedia(chatId, file, receiverId) {
    const formData = new FormData();
    formData.append('file', file);
    if (receiverId) formData.append('receiverId', receiverId);

    const response = await fetch(`${API_BASE}/chat/${chatId}/upload`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.token}`
      },
      body: formData
    });

    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Upload failed');
    return data;
  }
}

const api = new Api();
