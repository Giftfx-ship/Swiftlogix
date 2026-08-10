// ==================== LOADING ANIMATION - TRUCK ====================
window.addEventListener('load', () => {
    const loader = document.getElementById('loader');
    if (loader) {
        // Show loader for minimum 2.5 seconds for the truck animation to complete
        setTimeout(() => {
            loader.classList.add('hidden');
        }, 2800);
    }
});

// ==================== NAVBAR SCROLL EFFECT ====================
window.addEventListener('scroll', () => {
    const navbar = document.querySelector('.navbar');
    if (navbar) {
        if (window.scrollY > 50) {
            navbar.classList.add('scrolled');
        } else {
            navbar.classList.remove('scrolled');
        }
    }
});

// ==================== MOBILE MENU TOGGLE ====================
document.addEventListener('DOMContentLoaded', () => {
    const menuToggle = document.querySelector('.menu-toggle');
    const navLinks = document.querySelector('.nav-links');

    if (menuToggle && navLinks) {
        menuToggle.addEventListener('click', () => {
            navLinks.classList.toggle('active');
        });

        document.querySelectorAll('.nav-links a').forEach(link => {
            link.addEventListener('click', () => {
                navLinks.classList.remove('active');
            });
        });
    }
});

// ==================== SMOOTH SCROLL ====================
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function(e) {
        const target = document.querySelector(this.getAttribute('href'));
        if (target) {
            e.preventDefault();
            target.scrollIntoView({
                behavior: 'smooth',
                block: 'start'
            });
        }
    });
});

// ==================== COUNT UP ANIMATION ====================
function animateCounters() {
    const counters = document.querySelectorAll('.counter');

    counters.forEach(counter => {
        const target = parseInt(counter.dataset.target);
        const duration = 2000;
        const step = Math.max(1, Math.floor(target / 60));
        let current = 0;

        const updateCounter = () => {
            current += step;
            if (current >= target) {
                counter.textContent = target.toLocaleString();
                return;
            }
            counter.textContent = current.toLocaleString();
            requestAnimationFrame(updateCounter);
        };

        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    updateCounter();
                    observer.unobserve(entry.target);
                }
            });
        }, { threshold: 0.5 });

        observer.observe(counter);
    });
}

document.addEventListener('DOMContentLoaded', animateCounters);

// ==================== CHAT WIDGET ====================
class ChatWidget {
    constructor() {
        this.conversationId = null;
        this.userEmail = null;
        this.userName = null;
        this.isOpen = false;
        this.isNewConversation = true;
        this.init();
    }

    init() {
        this.createWidget();
        const saved = localStorage.getItem('swiftlogix_chat');
        if (saved) {
            try {
                const data = JSON.parse(saved);
                if (data.conversationId && data.userEmail) {
                    this.conversationId = data.conversationId;
                    this.userEmail = data.userEmail;
                    this.userName = data.userName || 'Guest';
                    this.isNewConversation = false;
                }
            } catch (e) {}
        }
    }

    createWidget() {
        const widgetHTML = `
            <div class="chat-widget" id="chatWidget">
                <button class="chat-toggle" id="chatToggle" onclick="window.chat.toggle()">
                    <i class="fas fa-comment-dots"></i>
                    <span class="badge" id="chatBadge" style="display:none;">0</span>
                </button>
                <div class="chat-window" id="chatWindow">
                    <div class="chat-header">
                        <h4><i class="fas fa-headset"></i> Live Support</h4>
                        <button class="close-chat" onclick="window.chat.close()">
                            <i class="fas fa-times"></i>
                        </button>
                    </div>
                    <div class="chat-body" id="chatBody">
                        <div style="text-align:center;color:var(--text-muted);padding:20px 0;">
                            <i class="fas fa-comment" style="font-size:32px;display:block;margin-bottom:10px;"></i>
                            <p>Welcome to SwiftLogix Support</p>
                            <p style="font-size:12px;">Start a conversation with our team</p>
                        </div>
                    </div>
                    <div class="chat-footer">
                        <input type="text" id="chatInput" placeholder="Type your message..." onkeypress="if(event.key==='Enter') window.chat.sendMessage()">
                        <button class="send-btn" onclick="window.chat.sendMessage()">
                            <i class="fas fa-paper-plane"></i>
                        </button>
                    </div>
                </div>
            </div>
        `;

        document.body.insertAdjacentHTML('beforeend', widgetHTML);
    }

    toggle() {
        this.isOpen = !this.isOpen;
        const window = document.getElementById('chatWindow');
        const toggle = document.getElementById('chatToggle');

        if (this.isOpen) {
            window.classList.add('open');
            toggle.innerHTML = '<i class="fas fa-times"></i>';
            this.loadMessages();
            if (this.isNewConversation) {
                this.showEmailPrompt();
            }
        } else {
            window.classList.remove('open');
            toggle.innerHTML = '<i class="fas fa-comment-dots"></i>';
        }
    }

    close() {
        this.isOpen = false;
        document.getElementById('chatWindow').classList.remove('open');
        document.getElementById('chatToggle').innerHTML = '<i class="fas fa-comment-dots"></i>';
    }

    showEmailPrompt() {
        const body = document.getElementById('chatBody');
        body.innerHTML = `
            <div style="padding:20px;">
                <p style="color:#fff;margin-bottom:15px;text-align:center;">Please enter your email to start a chat</p>
                <input type="email" id="chatEmail" placeholder="Your email address" style="width:100%;padding:10px 16px;background:rgba(255,255,255,0.05);border:1px solid var(--border);border-radius:60px;color:#fff;margin-bottom:10px;">
                <input type="text" id="chatName" placeholder="Your name (optional)" style="width:100%;padding:10px 16px;background:rgba(255,255,255,0.05);border:1px solid var(--border);border-radius:60px;color:#fff;margin-bottom:10px;">
                <textarea id="chatInitialMessage" placeholder="How can we help you?" rows="2" style="width:100%;padding:10px 16px;background:rgba(255,255,255,0.05);border:1px solid var(--border);border-radius:16px;color:#fff;resize:vertical;margin-bottom:10px;font-family:inherit;"></textarea>
                <button onclick="window.chat.startConversation()" style="width:100%;padding:12px;background:linear-gradient(135deg,var(--primary),var(--primary-dark));border:none;border-radius:60px;color:var(--secondary);font-weight:700;cursor:pointer;">
                    <i class="fas fa-paper-plane"></i> Start Chat
                </button>
            </div>
        `;
    }

    async startConversation() {
        const email = document.getElementById('chatEmail').value.trim();
        const name = document.getElementById('chatName').value.trim() || 'Guest';
        const message = document.getElementById('chatInitialMessage').value.trim();

        if (!email) {
            alert('Please enter your email');
            return;
        }

        if (!message) {
            alert('Please enter a message');
            return;
        }

        this.userEmail = email;
        this.userName = name;

        try {
            const response = await fetch('/api/chat/start', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    userEmail: email,
                    userName: name,
                    subject: 'General Inquiry',
                    message: message
                })
            });

            const data = await response.json();

            if (data.success) {
                this.conversationId = data.conversationId;
                this.isNewConversation = false;
                localStorage.setItem('swiftlogix_chat', JSON.stringify({
                    conversationId: this.conversationId,
                    userEmail: this.userEmail,
                    userName: this.userName
                }));
                this.loadMessages();
            } else {
                alert('Failed to start chat. Please try again.');
            }
        } catch (error) {
            console.error('Chat start error:', error);
            alert('Network error. Please try again.');
        }
    }

    async loadMessages() {
        if (!this.conversationId) {
            this.showEmailPrompt();
            return;
        }

        try {
            const response = await fetch(`/api/chat/${this.conversationId}/messages`);
            const data = await response.json();

            if (data.success) {
                this.renderMessages(data.messages);
            }
        } catch (error) {
            console.error('Load messages error:', error);
        }
    }

    renderMessages(messages) {
        const body = document.getElementById('chatBody');

        if (!messages || messages.length === 0) {
            body.innerHTML = `
                <div style="text-align:center;color:var(--text-muted);padding:20px 0;">
                    <i class="fas fa-comment" style="font-size:32px;display:block;margin-bottom:10px;"></i>
                    <p>No messages yet</p>
                    <p style="font-size:12px;">Send a message to start the conversation</p>
                </div>
            `;
            return;
        }

        body.innerHTML = messages.map(msg => {
            const isUser = msg.sender === 'user';
            return `
                <div class="message ${isUser ? 'user' : 'admin'}">
                    <div class="bubble">
                        <strong style="font-size:12px;display:block;margin-bottom:4px;">${isUser ? this.userName || 'You' : 'Support Team'}</strong>
                        ${msg.message}
                        <span class="time">${new Date(msg.timestamp).toLocaleTimeString()}</span>
                    </div>
                </div>
            `;
        }).join('');

        body.scrollTop = body.scrollHeight;
    }

    async sendMessage() {
        const input = document.getElementById('chatInput');
        const message = input.value.trim();

        if (!message) return;

        if (!this.conversationId) {
            alert('Please start a chat first');
            return;
        }

        input.value = '';

        try {
            const response = await fetch(`/api/chat/${this.conversationId}/send`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    message: message,
                    sender: 'user',
                    senderName: this.userName || 'Guest'
                })
            });

            const data = await response.json();

            if (data.success) {
                const body = document.getElementById('chatBody');
                const msgDiv = document.createElement('div');
                msgDiv.className = 'message user';
                msgDiv.innerHTML = `
                    <div class="bubble">
                        <strong style="font-size:12px;display:block;margin-bottom:4px;">${this.userName || 'You'}</strong>
                        ${message}
                        <span class="time">${new Date().toLocaleTimeString()}</span>
                    </div>
                `;
                body.appendChild(msgDiv);
                body.scrollTop = body.scrollHeight;
            }
        } catch (error) {
            console.error('Send message error:', error);
            alert('Failed to send message');
        }
    }

    checkUnread() {
        setInterval(async () => {
            if (this.conversationId) {
                try {
                    const response = await fetch(`/api/chat/${this.conversationId}/messages`);
                    const data = await response.json();
                    if (data.success && data.conversation) {
                        const unread = data.messages.filter(m => m.sender === 'admin' && !m.read).length;
                        const badge = document.getElementById('chatBadge');
                        if (unread > 0 && !this.isOpen) {
                            badge.style.display = 'flex';
                            badge.textContent = unread;
                        } else {
                            badge.style.display = 'none';
                        }
                    }
                } catch (e) {}
            }
        }, 10000);
    }
}

// ==================== API HELPER ====================
const API = {
    baseURL: window.location.origin,

    async request(endpoint, options = {}) {
        const url = `${this.baseURL}${endpoint}`;
        const headers = {
            'Content-Type': 'application/json',
            ...options.headers
        };

        const token = localStorage.getItem('adminToken');
        if (token) {
            headers['Authorization'] = `Bearer ${token}`;
        }

        const config = {
            ...options,
            headers,
            body: options.body ? JSON.stringify(options.body) : undefined
        };

        try {
            const response = await fetch(url, config);
            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || 'Request failed');
            }

            return data;
        } catch (error) {
            console.error('API Error:', error);
            throw error;
        }
    },

    get(endpoint) {
        return this.request(endpoint, { method: 'GET' });
    },

    post(endpoint, body) {
        return this.request(endpoint, { method: 'POST', body });
    },

    put(endpoint, body) {
        return this.request(endpoint, { method: 'PUT', body });
    },

    delete(endpoint) {
        return this.request(endpoint, { method: 'DELETE' });
    }
};

// ==================== INIT ====================
document.addEventListener('DOMContentLoaded', () => {
    window.API = API;
    window.chat = new ChatWidget();
    window.chat.checkUnread();
});

console.log('🚀 SwiftLogix - Loaded successfully!');
