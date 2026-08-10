const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const dotenv = require('dotenv');
const path = require('path');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const axios = require('axios');
const { v4: uuidv4 } = require('uuid');
const http = require('http');
const socketIo = require('socket.io');

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Create HTTP server with Socket.IO
const server = http.createServer(app);
const io = socketIo(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"],
        credentials: true
    },
    transports: ['websocket', 'polling']
});

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
app.use('/images', express.static(path.join(__dirname, 'images')));

mongoose.connect(process.env.MONGODB_URI)
    .then(() => console.log('✅ MongoDB connected'))
    .catch(err => console.error('❌ MongoDB error:', err));

// ==================== SCHEMAS ====================

// Shipment Schema
const shipmentSchema = new mongoose.Schema({
    trackingCode: { type: String, required: true, unique: true, uppercase: true },
    status: {
        type: String,
        enum: ['order_confirmed', 'picked', 'onway', 'customs', 'delivered'],
        default: 'order_confirmed'
    },
    statusText: { type: String },
    statusDesc: { type: String },
    lastUpdated: { type: String, required: true },
    createdAt: { type: String, required: true },
    sender: {
        name: { type: String, required: true },
        country: { type: String, required: true },
        address: { type: String, default: '' },
        phone: { type: String, default: 'N/A' }
    },
    receiver: {
        name: { type: String, required: true },
        country: { type: String, required: true },
        address: { type: String, default: '' },
        phone: { type: String, default: 'N/A' },
        email: { type: String, default: '' }
    },
    parcel: {
        weight: { type: String, default: 'N/A' },
        type: { type: String, default: 'N/A' },
        dutyFeesStatus: { type: String, enum: ['Paid', 'Pending'], default: 'Paid' },
        dutyFeesAmount: { type: String, default: 'N/A' },
        pickupDate: { type: String },
        expectedDelivery: { type: String, default: 'Pending' },
        trackingStatus: { type: String }
    },
    invoice: {
        orderId: { type: String },
        bookingMode: { type: String, enum: ['ToPay', 'Prepaid', 'Standard'], default: 'Standard' },
        shipmentCost: { type: String, default: 'N/A' },
        clearanceCost: { type: String, default: 'N/A' },
        totalAmount: { type: String, default: 'N/A' },
        paymentStatus: { type: String, enum: ['To Pay on Delivery', 'Paid', 'Pending'], default: 'Pending' }
    },
    timeline: [{
        date: { type: String },
        title: { type: String },
        desc: { type: String },
        completed: { type: Boolean, default: false },
        active: { type: Boolean, default: false }
    }],
    origin: { type: String },
    destination: { type: String },
    coordinates: { type: [Number], default: [25.2048, 55.2708] },
    emailSent: { type: Boolean, default: false },
    emailSentAt: { type: String },
    invoiceSent: { type: Boolean, default: false },
    invoiceSentAt: { type: String }
});

// Admin Schema
const adminSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true },
    passwordHash: { type: String, required: true },
    createdAt: { type: Date, default: Date.now },
    lastLogin: { type: Date }
});

// Email Log Schema
const emailLogSchema = new mongoose.Schema({
    trackingCode: { type: String, required: true },
    emailType: { type: String, enum: ['tracking', 'invoice'], required: true },
    recipient: { type: String, required: true },
    sentAt: { type: Date, default: Date.now },
    status: { type: String, enum: ['sent', 'failed'], default: 'sent' },
    error: { type: String }
});

// ==================== CHAT SUPPORT SCHEMAS ====================

// Chat Conversation Schema
const chatConversationSchema = new mongoose.Schema({
    conversationId: { type: String, required: true, unique: true },
    userEmail: { type: String, required: true },
    userName: { type: String, default: 'Guest' },
    subject: { type: String, default: 'General Inquiry' },
    status: { type: String, enum: ['open', 'in_progress', 'resolved', 'closed'], default: 'open' },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },
    unreadUser: { type: Boolean, default: false },
    unreadAdmin: { type: Boolean, default: false },
    lastMessageAt: { type: Date }
});

// Chat Message Schema
const chatMessageSchema = new mongoose.Schema({
    conversationId: { type: String, required: true },
    messageId: { type: String, required: true, unique: true },
    sender: { type: String, enum: ['user', 'admin'], required: true },
    senderName: { type: String, required: true },
    message: { type: String, required: true },
    timestamp: { type: Date, default: Date.now },
    read: { type: Boolean, default: false }
});

const Shipment = mongoose.model('Shipment', shipmentSchema);
const Admin = mongoose.model('Admin', adminSchema);
const EmailLog = mongoose.model('EmailLog', emailLogSchema);
const ChatConversation = mongoose.model('ChatConversation', chatConversationSchema);
const ChatMessage = mongoose.model('ChatMessage', chatMessageSchema);

// ==================== WEBSOCKET CHAT LOGIC ====================

let adminOnline = false;
let adminSocketId = null;

io.on('connection', (socket) => {
    console.log('🟢 Client connected:', socket.id);

    // Admin authentication via socket
    socket.on('admin-auth', (data) => {
        try {
            const { token } = data;
            const decoded = jwt.verify(token, process.env.JWT_SECRET);
            adminOnline = true;
            adminSocketId = socket.id;
            socket.join('admin-room');
            
            console.log(`👑 Admin ${decoded.username} is online`);
            io.emit('admin-status', { online: true, username: decoded.username });
            
            socket.emit('admin-auth-success', { success: true });
        } catch (error) {
            socket.emit('admin-auth-error', { error: 'Invalid token' });
        }
    });

    // Check admin status (for clients)
    socket.on('check-admin-status', () => {
        socket.emit('admin-status', { online: adminOnline });
    });

    // User sends message
    socket.on('user-message', async (data) => {
        try {
            const { conversationId, message, userEmail, userName } = data;
            
            const messageId = uuidv4();
            const chatMessage = new ChatMessage({
                conversationId,
                messageId,
                sender: 'user',
                senderName: userName || 'Guest',
                message,
                timestamp: new Date(),
                read: false
            });
            await chatMessage.save();
            
            await ChatConversation.findOneAndUpdate(
                { conversationId },
                { 
                    updatedAt: new Date(), 
                    unreadAdmin: true,
                    lastMessageAt: new Date()
                }
            );
            
            if (adminOnline && adminSocketId) {
                io.to('admin-room').emit('new-user-message', {
                    conversationId,
                    message: chatMessage,
                    userEmail,
                    userName: userName || 'Guest'
                });
            }
            
            socket.emit('message-sent', { success: true, messageId });
        } catch (error) {
            console.error('User message error:', error);
            socket.emit('message-error', { error: 'Failed to send' });
        }
    });

    // Admin sends message
    socket.on('admin-message', async (data) => {
        try {
            const { conversationId, message, senderName } = data;
            
            const messageId = uuidv4();
            const chatMessage = new ChatMessage({
                conversationId,
                messageId,
                sender: 'admin',
                senderName: senderName || 'Support Team',
                message,
                timestamp: new Date(),
                read: false
            });
            await chatMessage.save();
            
            await ChatConversation.findOneAndUpdate(
                { conversationId },
                { 
                    updatedAt: new Date(), 
                    unreadUser: true,
                    lastMessageAt: new Date()
                }
            );
            
            socket.emit('admin-message-sent', { success: true, messageId });
            
        } catch (error) {
            console.error('Admin message error:', error);
            socket.emit('admin-message-error', { error: 'Failed to send' });
        }
    });

    // Admin typing indicator
    socket.on('admin-typing', (data) => {
        const { conversationId, isTyping } = data;
        socket.to(`user-${conversationId}`).emit('admin-typing-status', { 
            isTyping, 
            conversationId 
        });
    });

    // Disconnect
    socket.on('disconnect', () => {
        console.log('🔴 Client disconnected:', socket.id);
        if (socket.id === adminSocketId) {
            adminOnline = false;
            adminSocketId = null;
            io.emit('admin-status', { online: false });
            console.log('👑 Admin is offline');
        }
    });
});

// ==================== CREATE ADMIN ====================
const createDefaultAdmin = async () => {
    try {
        const existing = await Admin.findOne({ username: process.env.ADMIN_USERNAME });
        if (!existing) {
            const hashed = await bcrypt.hash(process.env.ADMIN_PASSWORD, 10);
            const admin = new Admin({ username: process.env.ADMIN_USERNAME, passwordHash: hashed });
            await admin.save();
            console.log('✅ Admin created:', process.env.ADMIN_USERNAME);
        }
    } catch (error) {
        console.error('❌ Admin error:', error);
    }
};

// ==================== EMAIL SERVICE ====================
const sendEmail = async (to, subject, html) => {
    try {
        const url = process.env.NETLIFY_EMAIL_URL;
        if (!url) return { success: false, error: 'Netlify URL not configured' };
        const response = await axios.post(url, { to, subject, html }, {
            headers: { 'Content-Type': 'application/json' }
        });
        return response.data || { success: true };
    } catch (error) {
        console.error('Email error:', error.message);
        return { success: false, error: error.message };
    }
};

// ==================== EMAIL TEMPLATES ====================

// Email #1: Tracking Confirmation
const getTrackingEmailHTML = (shipment, userEmail, trackingLink) => {
    const { trackingCode, statusText, statusDesc, sender, receiver, parcel } = shipment;
    const statusColor = statusText === 'Delivered' ? '#4CAF50' :
                       statusText === 'Custom Hold' ? '#ff4444' :
                       statusText === 'On The Way' ? '#00f2fe' : '#ffa500';

    return `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><title>Tracking Update - SwiftLogix</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'Inter',-apple-system,sans-serif;background:#0a0a12;padding:40px 20px}
.wrapper{max-width:580px;margin:0 auto;background:#12121f;border-radius:24px;overflow:hidden;border:1px solid rgba(0,242,254,0.15);box-shadow:0 30px 80px rgba(0,0,0,0.6)}
.glow{height:4px;background:linear-gradient(90deg,#00f2fe,#00d4ff,#00f2fe);background-size:200% 100%;animation:s 3s ease-in-out infinite}
@keyframes s{0%{background-position:-200% 0}100%{background-position:200% 0}}
.header{padding:35px 40px 25px;text-align:center;border-bottom:1px solid rgba(255,255,255,0.05)}
.logo{font-size:30px;font-weight:800;background:linear-gradient(135deg,#fff,#00f2fe);-webkit-background-clip:text;-webkit-text-fill-color:transparent}
.logo span{-webkit-text-fill-color:#00f2fe}
.badge{display:inline-block;margin-top:10px;padding:4px 18px;background:rgba(0,242,254,0.12);border:1px solid rgba(0,242,254,0.2);border-radius:50px;font-size:11px;color:#00f2fe;letter-spacing:2px;text-transform:uppercase;font-weight:600}
.content{padding:35px 40px 30px}
.greeting{font-size:24px;font-weight:700;color:#fff;margin-bottom:6px}
.greeting-sub{color:#888;font-size:14px;margin-bottom:25px}
.status-box{background:rgba(0,242,254,0.08);border:1px solid rgba(0,242,254,0.2);border-radius:16px;padding:20px;text-align:center;margin-bottom:25px}
.status-box .status{font-size:20px;font-weight:700;color:${statusColor}}
.status-box .desc{color:#aaa;font-size:14px;margin-top:4px}
.info-grid{display:grid;gap:12px;margin-bottom:25px}
.info-row{display:flex;justify-content:space-between;padding:10px 0;border-bottom:1px solid rgba(255,255,255,0.05)}
.info-row .label{color:#888;font-size:13px}
.info-row .value{color:#fff;font-weight:500;font-size:13px}
.btn{display:block;text-align:center;padding:14px;background:linear-gradient(135deg,#00f2fe,#00d4ff);border-radius:60px;color:#0a0a12;font-weight:700;text-decoration:none;font-size:15px}
.footer{padding:25px 40px;text-align:center;border-top:1px solid rgba(255,255,255,0.05)}
.footer p{color:#666;font-size:12px;margin:4px 0}
.footer .brand{color:#00f2fe;font-weight:600;font-size:14px}
@media(max-width:480px){.header{padding:25px 20px}.content{padding:25px 20px}.footer{padding:20px}}
</style>
</head>
<body>
<div class="wrapper">
<div class="glow"></div>
<div class="header"><div class="logo">Swift<span>Logix</span></div><div class="badge">✦ Premium Logistics ✦</div></div>
<div class="content">
<div class="greeting">Tracking Update</div>
<div class="greeting-sub">Your package is on its way</div>
<div class="status-box"><div class="status">${statusText}</div><div class="desc">${statusDesc || 'Your shipment is being processed'}</div></div>
<div class="info-grid">
<div class="info-row"><span class="label">Tracking Number</span><span class="value">${trackingCode}</span></div>
<div class="info-row"><span class="label">Sender</span><span class="value">${sender.name} (${sender.country})</span></div>
<div class="info-row"><span class="label">Receiver</span><span class="value">${receiver.name} (${receiver.country})</span></div>
<div class="info-row"><span class="label">Weight</span><span class="value">${parcel.weight}</span></div>
<div class="info-row"><span class="label">Type</span><span class="value">${parcel.type}</span></div>
<div class="info-row"><span class="label">Expected Delivery</span><span class="value" style="color:#00f2fe">${parcel.expectedDelivery}</span></div>
</div>
<a href="${trackingLink}" class="btn">🔍 Track Your Package Live</a>
<p style="color:#666;font-size:13px;text-align:center;margin-top:20px">Sent to: <strong style="color:#aaa">${userEmail}</strong></p>
</div>
<div class="footer"><p class="brand">✦ SwiftLogix Logistics ✦</p><p>Global Logistics Intelligence</p><p>© 2026 SwiftLogix. All rights reserved.</p></div>
</div>
</body>
</html>`;
};

// Email #2: Full Invoice
const getInvoiceEmailHTML = (shipment) => {
    const { trackingCode, statusText, statusDesc, lastUpdated, sender, receiver, parcel, invoice, timeline, origin, destination } = shipment;
    const statusColor = statusText === 'Delivered' ? '#4CAF50' :
                       statusText === 'Custom Hold' ? '#ff4444' :
                       statusText === 'On The Way' ? '#00f2fe' : '#ffa500';

    let timelineHTML = timeline.map(item => {
        const icon = item.completed ? '✅' : item.active ? '🔄' : '⏳';
        return `<div style="display:flex;align-items:center;padding:10px 0;border-bottom:1px solid rgba(255,255,255,0.05);gap:12px">
            <span style="font-size:18px">${icon}</span>
            <div style="flex:1"><div style="color:#fff;font-weight:500;font-size:14px">${item.title}</div><div style="color:#888;font-size:12px">${item.desc}</div></div>
            <div style="color:#666;font-size:12px">${item.date}</div>
        </div>`;
    }).join('');

    return `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><title>Invoice - SwiftLogix</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'Inter',-apple-system,sans-serif;background:#0a0a12;padding:40px 20px}
.wrapper{max-width:680px;margin:0 auto;background:#12121f;border-radius:24px;overflow:hidden;border:1px solid rgba(0,242,254,0.15);box-shadow:0 30px 80px rgba(0,0,0,0.6)}
.glow{height:4px;background:linear-gradient(90deg,#00f2fe,#00d4ff,#00f2fe);background-size:200% 100%;animation:s 3s ease-in-out infinite}
@keyframes s{0%{background-position:-200% 0}100%{background-position:200% 0}}
.header{padding:35px 40px 25px;text-align:center;border-bottom:1px solid rgba(255,255,255,0.05)}
.logo{font-size:30px;font-weight:800;background:linear-gradient(135deg,#fff,#00f2fe);-webkit-background-clip:text;-webkit-text-fill-color:transparent}
.logo span{-webkit-text-fill-color:#00f2fe}
.badge{display:inline-block;margin-top:10px;padding:4px 18px;background:rgba(0,242,254,0.12);border:1px solid rgba(0,242,254,0.2);border-radius:50px;font-size:11px;color:#00f2fe;letter-spacing:2px;text-transform:uppercase;font-weight:600}
.content{padding:35px 40px 30px}
.invoice-title{text-align:center;font-size:28px;font-weight:700;color:#fff;margin-bottom:4px}
.invoice-sub{text-align:center;color:#888;font-size:14px;margin-bottom:25px}
.status-badge{display:inline-block;padding:6px 20px;border-radius:50px;font-weight:600;font-size:14px;color:${statusColor};border:1px solid ${statusColor};background:rgba(${statusColor === '#4CAF50' ? '76,175,80' : statusColor === '#00f2fe' ? '0,242,254' : statusColor === '#ff4444' ? '255,68,68' : '255,165,0'},0.1)}
.section{margin:25px 0}
.section-title{font-size:14px;font-weight:700;color:#00f2fe;text-transform:uppercase;letter-spacing:1px;margin-bottom:15px;padding-bottom:8px;border-bottom:1px solid rgba(0,242,254,0.15)}
.info-grid{display:grid;gap:10px}
.info-row{display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid rgba(255,255,255,0.05)}
.info-row .label{color:#888;font-size:13px}
.info-row .value{color:#fff;font-weight:500;font-size:13px}
.info-row .value.gold{color:#ffd700}
.stamp-box{text-align:center;padding:20px;background:rgba(255,215,0,0.08);border:2px solid #ffd700;border-radius:16px;margin:25px 0}
.stamp-box .stamp{font-size:18px;font-weight:700;color:#ffd700}
.stamp-box .sub{color:#aaa;font-size:13px;margin-top:4px}
.footer{padding:25px 40px;text-align:center;border-top:1px solid rgba(255,255,255,0.05)}
.footer p{color:#666;font-size:12px;margin:4px 0}
.footer .brand{color:#00f2fe;font-weight:600;font-size:14px}
@media(max-width:480px){.header{padding:25px 20px}.content{padding:25px 20px}.footer{padding:20px}.info-row{flex-direction:column;gap:2px;padding:10px 0}.info-row .value{text-align:left}}
</style>
</head>
<body>
<div class="wrapper">
<div class="glow"></div>
<div class="header"><div class="logo">Swift<span>Logix</span></div><div class="badge">✦ OFFICIAL INVOICE ✦</div></div>
<div class="content">
<div class="invoice-title">📄 Package Invoice</div>
<div class="invoice-sub"><span class="status-badge">${statusText}</span><span style="color:#666;margin-left:12px">${trackingCode}</span></div>
<div class="section"><div class="section-title">📋 Tracking Information</div>
<div class="info-grid">
<div class="info-row"><span class="label">Tracking Number</span><span class="value">${trackingCode}</span></div>
<div class="info-row"><span class="label">Status</span><span class="value" style="color:${statusColor}">${statusText}</span></div>
<div class="info-row"><span class="label">Status Description</span><span class="value">${statusDesc || 'N/A'}</span></div>
<div class="info-row"><span class="label">Last Updated</span><span class="value">${lastUpdated}</span></div>
<div class="info-row"><span class="label">Origin</span><span class="value">${origin}</span></div>
<div class="info-row"><span class="label">Destination</span><span class="value">${destination}</span></div>
</div></div>
<div class="section"><div class="section-title">👤 Sender Information</div>
<div class="info-grid">
<div class="info-row"><span class="label">Name</span><span class="value">${sender.name}</span></div>
<div class="info-row"><span class="label">Country</span><span class="value">${sender.country}</span></div>
<div class="info-row"><span class="label">Address</span><span class="value">${sender.address || sender.country}</span></div>
<div class="info-row"><span class="label">Phone</span><span class="value">${sender.phone}</span></div>
</div></div>
<div class="section"><div class="section-title">👤 Receiver Information</div>
<div class="info-grid">
<div class="info-row"><span class="label">Name</span><span class="value">${receiver.name}</span></div>
<div class="info-row"><span class="label">Country</span><span class="value">${receiver.country}</span></div>
<div class="info-row"><span class="label">Address</span><span class="value">${receiver.address || receiver.country}</span></div>
<div class="info-row"><span class="label">Phone</span><span class="value">${receiver.phone}</span></div>
<div class="info-row"><span class="label">Email</span><span class="value" style="color:#00f2fe">${receiver.email}</span></div>
</div></div>
<div class="section"><div class="section-title">📦 Parcel Details</div>
<div class="info-grid">
<div class="info-row"><span class="label">Weight</span><span class="value">${parcel.weight}</span></div>
<div class="info-row"><span class="label">Type</span><span class="value">${parcel.type}</span></div>
<div class="info-row"><span class="label">Duty Fees</span><span class="value" style="color:${parcel.dutyFeesStatus === 'Paid' ? '#4CAF50' : '#ffa500'}">${parcel.dutyFeesStatus} (${parcel.dutyFeesAmount})</span></div>
<div class="info-row"><span class="label">Pickup Date</span><span class="value">${parcel.pickupDate || 'N/A'}</span></div>
<div class="info-row"><span class="label">Expected Delivery</span><span class="value" style="color:#00f2fe">${parcel.expectedDelivery}</span></div>
</div></div>
<div class="section"><div class="section-title">💰 Invoice Details</div>
<div class="info-grid">
<div class="info-row"><span class="label">Order ID</span><span class="value">${invoice.orderId || 'N/A'}</span></div>
<div class="info-row"><span class="label">Booking Mode</span><span class="value">${invoice.bookingMode}</span></div>
<div class="info-row"><span class="label">Shipping Cost</span><span class="value">${invoice.shipmentCost}</span></div>
<div class="info-row"><span class="label">Clearance Cost</span><span class="value">${invoice.clearanceCost}</span></div>
<div class="info-row" style="border-bottom:2px solid rgba(255,215,0,0.3);padding-bottom:12px"><span class="label" style="font-weight:700;color:#ffd700">Total Amount</span><span class="value gold" style="font-weight:700;font-size:18px">${invoice.totalAmount}</span></div>
<div class="info-row"><span class="label">Payment Status</span><span class="value" style="color:${invoice.paymentStatus === 'Paid' ? '#4CAF50' : '#ffa500'}">${invoice.paymentStatus}</span></div>
</div></div>
<div class="section"><div class="section-title">📊 Tracking Timeline</div>${timelineHTML}</div>
<div class="stamp-box"><div class="stamp">✅ OFFICIAL STAMP</div><div class="sub">Verified & Approved • Digitally Signed</div></div>
<div style="text-align:center;padding:10px;background:rgba(0,242,254,0.05);border-radius:12px"><p style="color:#666;font-size:12px">Payment Methods: 💳 Credit Card • 🏦 Bank Transfer • ₿ Bitcoin • 🎁 Gift Cards</p></div>
</div>
<div class="footer"><p class="brand">✦ SwiftLogix Logistics ✦</p><p>Global Logistics Intelligence</p><p>© 2026 SwiftLogix. All rights reserved.</p></div>
</div>
</body>
</html>`;
};

// ==================== AUTH MIDDLEWARE ====================
const authMiddleware = async (req, res, next) => {
    try {
        const token = req.headers.authorization?.split(' ')[1];
        if (!token) return res.status(401).json({ error: 'No token' });
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const admin = await Admin.findOne({ username: decoded.username });
        if (!admin) return res.status(401).json({ error: 'Invalid token' });
        req.admin = admin;
        next();
    } catch (error) {
        return res.status(401).json({ error: 'Auth failed' });
    }
};

// ==================== ADMIN LOGIN ====================
app.post('/api/admin/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        const admin = await Admin.findOne({ username });
        if (!admin) return res.status(401).json({ error: 'Invalid credentials' });
        const valid = await bcrypt.compare(password, admin.passwordHash);
        if (!valid) return res.status(401).json({ error: 'Invalid credentials' });
        admin.lastLogin = new Date();
        await admin.save();
        const token = jwt.sign({ username: admin.username }, process.env.JWT_SECRET, { expiresIn: '7d' });
        res.json({ success: true, token, admin: { username: admin.username } });
    } catch (error) {
        res.status(500).json({ error: 'Login failed' });
    }
});

app.get('/api/admin/verify', authMiddleware, async (req, res) => {
    res.json({ success: true, admin: { username: req.admin.username } });
});

// ==================== SHIPMENT CRUD ====================

app.get('/api/admin/shipments', authMiddleware, async (req, res) => {
    try {
        const shipments = await Shipment.find().sort({ createdAt: -1 });
        res.json(shipments);
    } catch (error) {
        res.status(500).json({ error: 'Failed to get shipments' });
    }
});

app.get('/api/admin/shipments/:code', authMiddleware, async (req, res) => {
    try {
        const shipment = await Shipment.findOne({ trackingCode: req.params.code.toUpperCase() });
        if (!shipment) return res.status(404).json({ error: 'Not found' });
        res.json(shipment);
    } catch (error) {
        res.status(500).json({ error: 'Failed' });
    }
});

app.post('/api/admin/shipments', authMiddleware, async (req, res) => {
    try {
        const data = req.body;
        const trackingCode = data.trackingCode.toUpperCase();
        const existing = await Shipment.findOne({ trackingCode });
        if (existing) return res.status(409).json({ error: 'Tracking code exists' });

        const now = new Date().toISOString();
        const statusMap = {
            'order_confirmed': 'Order Confirmed',
            'picked': 'Picked by Courier',
            'onway': 'On The Way',
            'customs': 'Custom Hold',
            'delivered': 'Delivered'
        };

        const statusOrder = ['order_confirmed', 'picked', 'onway', 'delivered'];
        const currentIndex = statusOrder.indexOf(data.status) || 0;
        const timeline = statusOrder.map((s, index) => ({
            date: index <= currentIndex ? now : 'Pending',
            title: statusMap[s],
            desc: index <= currentIndex ? `${statusMap[s]} completed` : 'Pending',
            completed: index <= currentIndex,
            active: index === currentIndex
        }));

        if (data.status === 'customs') {
            timeline.splice(2, 0, {
                date: now,
                title: 'Custom Hold',
                desc: 'Shipment being held for customs clearance',
                completed: true,
                active: true
            });
        }

        const shipment = new Shipment({
            trackingCode,
            status: data.status,
            statusText: statusMap[data.status],
            statusDesc: data.statusDesc || `Your shipment is ${statusMap[data.status].toLowerCase()}`,
            lastUpdated: now,
            createdAt: now,
            sender: {
                name: data.sender?.name || 'N/A',
                country: data.sender?.country || 'Unknown',
                address: data.sender?.address || '',
                phone: data.sender?.phone || 'N/A'
            },
            receiver: {
                name: data.receiver?.name || 'N/A',
                country: data.receiver?.country || 'Unknown',
                address: data.receiver?.address || '',
                phone: data.receiver?.phone || 'N/A',
                email: data.receiver?.email || ''
            },
            parcel: {
                weight: data.parcel?.weight || 'N/A',
                type: data.parcel?.type || 'N/A',
                dutyFeesStatus: data.parcel?.dutyFeesStatus || 'Paid',
                dutyFeesAmount: data.parcel?.dutyFeesAmount || 'N/A',
                pickupDate: data.parcel?.pickupDate || now,
                expectedDelivery: data.parcel?.expectedDelivery || 'Pending',
                trackingStatus: statusMap[data.status]
            },
            invoice: {
                orderId: data.invoice?.orderId || Math.floor(Math.random() * 9000 + 1000).toString(),
                bookingMode: data.invoice?.bookingMode || 'Standard',
                shipmentCost: data.invoice?.shipmentCost || 'N/A',
                clearanceCost: data.invoice?.clearanceCost || 'N/A',
                totalAmount: data.invoice?.totalAmount || 'N/A',
                paymentStatus: data.invoice?.paymentStatus || 'Pending'
            },
            timeline,
            origin: data.sender?.country || 'Unknown',
            destination: data.receiver?.country || 'Unknown',
            coordinates: data.coordinates || [25.2048, 55.2708]
        });

        await shipment.save();
        res.json({ success: true, shipment });
    } catch (error) {
        console.error('Create error:', error);
        res.status(500).json({ error: 'Failed to create' });
    }
});

app.put('/api/admin/shipments/:code', authMiddleware, async (req, res) => {
    try {
        const trackingCode = req.params.code.toUpperCase();
        const data = req.body;
        const shipment = await Shipment.findOne({ trackingCode });
        if (!shipment) return res.status(404).json({ error: 'Not found' });

        const now = new Date().toISOString();
        const statusMap = {
            'order_confirmed': 'Order Confirmed',
            'picked': 'Picked by Courier',
            'onway': 'On The Way',
            'customs': 'Custom Hold',
            'delivered': 'Delivered'
        };

        if (data.status && data.status !== shipment.status) {
            shipment.status = data.status;
            shipment.statusText = statusMap[data.status];
            shipment.statusDesc = data.statusDesc || `Your shipment is ${statusMap[data.status].toLowerCase()}`;

            const statusOrder = ['order_confirmed', 'picked', 'onway', 'delivered'];
            const currentIndex = statusOrder.indexOf(data.status) || 0;
            shipment.timeline = statusOrder.map((s, index) => ({
                date: index <= currentIndex ? now : 'Pending',
                title: statusMap[s],
                desc: index <= currentIndex ? `${statusMap[s]} completed` : 'Pending',
                completed: index <= currentIndex,
                active: index === currentIndex
            }));

            if (data.status === 'customs') {
                shipment.timeline.splice(2, 0, {
                    date: now,
                    title: 'Custom Hold',
                    desc: 'Shipment being held for customs clearance',
                    completed: true,
                    active: true
                });
            }
        }

        if (data.sender) shipment.sender = { ...shipment.sender, ...data.sender };
        if (data.receiver) shipment.receiver = { ...shipment.receiver, ...data.receiver };
        if (data.parcel) shipment.parcel = { ...shipment.parcel, ...data.parcel };
        if (data.invoice) shipment.invoice = { ...shipment.invoice, ...data.invoice };
        if (data.coordinates) shipment.coordinates = data.coordinates;

        shipment.lastUpdated = now;
        shipment.origin = shipment.sender?.country || 'Unknown';
        shipment.destination = shipment.receiver?.country || 'Unknown';

        await shipment.save();
        res.json({ success: true, shipment });
    } catch (error) {
        res.status(500).json({ error: 'Failed to update' });
    }
});

app.delete('/api/admin/shipments/:code', authMiddleware, async (req, res) => {
    try {
        const result = await Shipment.deleteOne({ trackingCode: req.params.code.toUpperCase() });
        if (result.deletedCount === 0) return res.status(404).json({ error: 'Not found' });
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'Failed to delete' });
    }
});

// ==================== SEND INVOICE (ADMIN) ====================
app.post('/api/admin/shipments/:code/send-invoice', authMiddleware, async (req, res) => {
    try {
        const trackingCode = req.params.code.toUpperCase();
        const shipment = await Shipment.findOne({ trackingCode });
        if (!shipment) return res.status(404).json({ error: 'Not found' });
        if (!shipment.receiver?.email) return res.status(400).json({ error: 'Receiver email not set' });

        const html = getInvoiceEmailHTML(shipment);
        const result = await sendEmail(
            shipment.receiver.email,
            `📄 SwiftLogix Package Invoice - ${trackingCode}`,
            html
        );

        if (result.success) {
            shipment.invoiceSent = true;
            shipment.invoiceSentAt = new Date().toISOString();
            await shipment.save();
            const log = new EmailLog({ trackingCode, emailType: 'invoice', recipient: shipment.receiver.email, status: 'sent' });
            await log.save();
            res.json({ success: true, message: `Invoice sent to ${shipment.receiver.email}` });
        } else {
            res.status(500).json({ error: 'Failed to send email' });
        }
    } catch (error) {
        res.status(500).json({ error: 'Failed to send invoice' });
    }
});

// ==================== SEARCH SHIPMENTS ====================
app.get('/api/admin/search/:query', authMiddleware, async (req, res) => {
    try {
        const query = req.params.query.toUpperCase();
        const shipments = await Shipment.find({
            $or: [
                { trackingCode: { $regex: query, $options: 'i' } },
                { 'sender.name': { $regex: query, $options: 'i' } },
                { 'receiver.name': { $regex: query, $options: 'i' } }
            ]
        }).sort({ createdAt: -1 });
        res.json(shipments);
    } catch (error) {
        res.status(500).json({ error: 'Search failed' });
    }
});

// ==================== PUBLIC TRACKING ====================
app.post('/api/track', async (req, res) => {
    try {
        const { trackingCode, userEmail } = req.body;
        if (!trackingCode || !userEmail) {
            return res.status(400).json({ error: 'Tracking code and email are required' });
        }

        const shipment = await Shipment.findOne({ trackingCode: trackingCode.toUpperCase() });
        if (!shipment) {
            return res.status(404).json({ error: 'Tracking number not found' });
        }

        const trackingLink = `${process.env.BASE_URL || 'http://localhost:3000'}/tracking-result.html?code=${shipment.trackingCode}`;
        const email1HTML = getTrackingEmailHTML(shipment, userEmail, trackingLink);
        const email1Result = await sendEmail(
            userEmail,
            `📦 SwiftLogix Tracking Update - ${shipment.trackingCode}`,
            email1HTML
        );

        let email2Result = { success: false, error: 'No receiver email' };
        if (shipment.receiver?.email) {
            const email2HTML = getInvoiceEmailHTML(shipment);
            email2Result = await sendEmail(
                shipment.receiver.email,
                `📄 SwiftLogix Package Invoice - ${shipment.trackingCode}`,
                email2HTML
            );
            if (email2Result.success) {
                shipment.invoiceSent = true;
                shipment.invoiceSentAt = new Date().toISOString();
                await shipment.save();
            }
        }

        if (email1Result.success) {
            const log = new EmailLog({ trackingCode: shipment.trackingCode, emailType: 'tracking', recipient: userEmail, status: 'sent' });
            await log.save();
        }
        if (email2Result.success && shipment.receiver?.email) {
            const log = new EmailLog({ trackingCode: shipment.trackingCode, emailType: 'invoice', recipient: shipment.receiver.email, status: 'sent' });
            await log.save();
        }

        res.json({
            success: true,
            shipment: shipment.toObject(),
            emails: {
                toUser: { success: email1Result.success, recipient: userEmail, type: 'tracking_confirmation' },
                toReceiver: { success: email2Result.success, recipient: shipment.receiver?.email || 'No email set', type: 'full_invoice' }
            },
            message: '✅ Tracking details sent to your email. Full invoice sent to receiver.'
        });
    } catch (error) {
        console.error('Track error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// ==================== CHAT SUPPORT API ====================

// Start a new chat conversation
app.post('/api/chat/start', async (req, res) => {
    try {
        const { userEmail, userName, subject, message } = req.body;
        
        if (!userEmail || !message) {
            return res.status(400).json({ error: 'Email and message are required' });
        }

        // Check if user already has an open conversation
        let existingConversation = await ChatConversation.findOne({ 
            userEmail: userEmail,
            status: { $in: ['open', 'in_progress'] }
        });

        if (existingConversation) {
            // Add message to existing conversation
            const newMessage = new ChatMessage({
                conversationId: existingConversation.conversationId,
                messageId: uuidv4(),
                sender: 'user',
                senderName: userName || 'Guest',
                message: message,
                timestamp: new Date()
            });
            await newMessage.save();

            existingConversation.updatedAt = new Date();
            existingConversation.unreadAdmin = true;
            existingConversation.lastMessageAt = new Date();
            await existingConversation.save();

            // Notify admin via WebSocket if online
            if (adminOnline && adminSocketId) {
                io.to('admin-room').emit('new-user-message', {
                    conversationId: existingConversation.conversationId,
                    message: newMessage,
                    userEmail,
                    userName: userName || 'Guest'
                });
            }

            return res.json({
                success: true,
                conversationId: existingConversation.conversationId,
                isNew: false,
                message: 'Message sent successfully'
            });
        }

        // Create new conversation
        const conversationId = uuidv4();
        const conversation = new ChatConversation({
            conversationId,
            userEmail,
            userName: userName || 'Guest',
            subject: subject || 'General Inquiry',
            status: 'open',
            createdAt: new Date(),
            updatedAt: new Date(),
            unreadAdmin: true,
            lastMessageAt: new Date()
        });
        await conversation.save();

        // Create first message
        const messageId = uuidv4();
        const chatMessage = new ChatMessage({
            conversationId,
            messageId,
            sender: 'user',
            senderName: userName || 'Guest',
            message: message,
            timestamp: new Date(),
            read: false
        });
        await chatMessage.save();

        // Notify admin via WebSocket if online
        if (adminOnline && adminSocketId) {
            io.to('admin-room').emit('new-user-message', {
                conversationId,
                message: chatMessage,
                userEmail,
                userName: userName || 'Guest'
            });
        }

        res.json({
            success: true,
            conversationId,
            isNew: true,
            message: 'Conversation started successfully'
        });
    } catch (error) {
        console.error('Chat start error:', error);
        res.status(500).json({ error: 'Failed to start chat' });
    }
});

// Get messages for a conversation
app.get('/api/chat/:conversationId/messages', async (req, res) => {
    try {
        const { conversationId } = req.params;
        
        const conversation = await ChatConversation.findOne({ conversationId });
        if (!conversation) {
            return res.status(404).json({ error: 'Conversation not found' });
        }

        const messages = await ChatMessage.find({ conversationId }).sort({ timestamp: 1 });
        
        // Mark messages as read for admin
        if (req.query.admin === 'true') {
            await ChatMessage.updateMany(
                { conversationId, sender: 'user', read: false },
                { read: true }
            );
            conversation.unreadAdmin = false;
            await conversation.save();
        }

        res.json({
            success: true,
            conversation,
            messages
        });
    } catch (error) {
        console.error('Get messages error:', error);
        res.status(500).json({ error: 'Failed to get messages' });
    }
});

// Send message in chat
app.post('/api/chat/:conversationId/send', async (req, res) => {
    try {
        const { conversationId } = req.params;
        const { message, sender, senderName } = req.body;

        if (!message) {
            return res.status(400).json({ error: 'Message is required' });
        }

        const conversation = await ChatConversation.findOne({ conversationId });
        if (!conversation) {
            return res.status(404).json({ error: 'Conversation not found' });
        }

        const messageId = uuidv4();
        const chatMessage = new ChatMessage({
            conversationId,
            messageId,
            sender: sender || 'user',
            senderName: senderName || (sender === 'admin' ? 'Support Team' : 'Guest'),
            message,
            timestamp: new Date(),
            read: false
        });
        await chatMessage.save();

        conversation.updatedAt = new Date();
        conversation.lastMessageAt = new Date();
        if (sender === 'admin') {
            conversation.unreadUser = true;
            conversation.unreadAdmin = false;
            conversation.status = 'in_progress';
        } else {
            conversation.unreadAdmin = true;
            conversation.unreadUser = false;
        }
        await conversation.save();

        // If admin sent message, notify via WebSocket
        if (sender === 'admin' && adminOnline && adminSocketId) {
            io.to('admin-room').emit('admin-message-sent', {
                conversationId,
                message: chatMessage
            });
        }

        res.json({
            success: true,
            message: chatMessage
        });
    } catch (error) {
        console.error('Send message error:', error);
        res.status(500).json({ error: 'Failed to send message' });
    }
});

// Get all conversations (admin)
app.get('/api/admin/chats', authMiddleware, async (req, res) => {
    try {
        const conversations = await ChatConversation.find()
            .sort({ updatedAt: -1 });
        
        const conversationsWithLastMessage = await Promise.all(conversations.map(async (conv) => {
            const lastMessage = await ChatMessage.findOne({ 
                conversationId: conv.conversationId 
            }).sort({ timestamp: -1 });
            
            const unreadCount = await ChatMessage.countDocuments({
                conversationId: conv.conversationId,
                sender: 'user',
                read: false
            });

            // Get message count
            const messageCount = await ChatMessage.countDocuments({
                conversationId: conv.conversationId
            });

            return {
                ...conv.toObject(),
                lastMessage: lastMessage?.message || 'No messages',
                lastMessageTime: lastMessage?.timestamp || conv.createdAt,
                unreadCount,
                messageCount
            };
        }));

        res.json({
            success: true,
            conversations: conversationsWithLastMessage
        });
    } catch (error) {
        console.error('Get chats error:', error);
        res.status(500).json({ error: 'Failed to get conversations' });
    }
});

// Get unread count for admin
app.get('/api/admin/chats/unread', authMiddleware, async (req, res) => {
    try {
        const count = await ChatConversation.countDocuments({ 
            unreadAdmin: true,
            status: { $in: ['open', 'in_progress'] }
        });
        res.json({ success: true, unreadCount: count });
    } catch (error) {
        res.status(500).json({ error: 'Failed to get unread count' });
    }
});

// Mark conversation as resolved (admin)
app.put('/api/admin/chats/:conversationId/resolve', authMiddleware, async (req, res) => {
    try {
        const { conversationId } = req.params;
        const conversation = await ChatConversation.findOne({ conversationId });
        if (!conversation) {
            return res.status(404).json({ error: 'Conversation not found' });
        }

        conversation.status = 'resolved';
        conversation.updatedAt = new Date();
        await conversation.save();

        // Add system message
        const systemMessage = new ChatMessage({
            conversationId,
            messageId: uuidv4(),
            sender: 'admin',
            senderName: 'Support Team',
            message: '✅ This conversation has been resolved. Thank you for contacting us!',
            timestamp: new Date(),
            read: false
        });
        await systemMessage.save();

        res.json({
            success: true,
            message: 'Conversation resolved'
        });
    } catch (error) {
        console.error('Resolve chat error:', error);
        res.status(500).json({ error: 'Failed to resolve conversation' });
    }
});

// ==================== CHAT DELETE ENDPOINTS ====================

// DELETE individual message
app.delete('/api/admin/chat/message/:messageId', authMiddleware, async (req, res) => {
    try {
        const result = await ChatMessage.deleteOne({ messageId: req.params.messageId });
        if (result.deletedCount === 0) {
            return res.status(404).json({ error: 'Message not found' });
        }
        res.json({ success: true, message: 'Message deleted successfully' });
    } catch (error) {
        console.error('Delete message error:', error);
        res.status(500).json({ error: 'Failed to delete message' });
    }
});

// DELETE all messages in a conversation
app.delete('/api/admin/chat/:conversationId/messages', authMiddleware, async (req, res) => {
    try {
        const { conversationId } = req.params;
        
        const conversation = await ChatConversation.findOne({ conversationId });
        if (!conversation) {
            return res.status(404).json({ error: 'Conversation not found' });
        }

        const result = await ChatMessage.deleteMany({ conversationId });
        
        conversation.updatedAt = new Date();
        await conversation.save();

        res.json({ 
            success: true, 
            deletedCount: result.deletedCount,
            message: `Deleted ${result.deletedCount} messages`
        });
    } catch (error) {
        console.error('Delete all messages error:', error);
        res.status(500).json({ error: 'Failed to delete messages' });
    }
});

// ==================== SERVE PAGES ====================
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.get('/tracking', (req, res) => res.sendFile(path.join(__dirname, 'public', 'tracking.html')));
app.get('/tracking-result', (req, res) => res.sendFile(path.join(__dirname, 'public', 'tracking-result.html')));
app.get('/admin-login', (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin-login.html')));
app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin.html')));
app.get('/admin-chat', (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin-chat.html')));
app.get('/about', (req, res) => res.sendFile(path.join(__dirname, 'public', 'about.html')));
app.get('/contact', (req, res) => res.sendFile(path.join(__dirname, 'public', 'contact.html')));
app.get('/services', (req, res) => res.sendFile(path.join(__dirname, 'public', 'services.html')));
app.get('/blog', (req, res) => res.sendFile(path.join(__dirname, 'public', 'blog.html')));
app.get('/careers', (req, res) => res.sendFile(path.join(__dirname, 'public', 'careers.html')));
app.get('/air-freight', (req, res) => res.sendFile(path.join(__dirname, 'public', 'air-freight.html')));
app.get('/ocean-freight', (req, res) => res.sendFile(path.join(__dirname, 'public', 'ocean-freight.html')));
app.get('/road-transport', (req, res) => res.sendFile(path.join(__dirname, 'public', 'road-transport.html')));
app.get('/warehousing', (req, res) => res.sendFile(path.join(__dirname, 'public', 'warehousing.html')));
app.get('/packaging', (req, res) => res.sendFile(path.join(__dirname, 'public', 'packaging.html')));
app.get('/privacy', (req, res) => res.sendFile(path.join(__dirname, 'public', 'privacy.html')));
app.get('/terms', (req, res) => res.sendFile(path.join(__dirname, 'public', 'terms.html')));
app.get('/cookies', (req, res) => res.sendFile(path.join(__dirname, 'public', 'cookies.html')));
app.get('/gdpr', (req, res) => res.sendFile(path.join(__dirname, 'public', 'gdpr.html')));

// ==================== START SERVER ====================
createDefaultAdmin().then(() => {
    server.listen(PORT, '0.0.0.0', () => {
        console.log('\n' + '='.repeat(70));
        console.log('🚀 SwiftLogix Logistics Server');
        console.log('='.repeat(70));
        console.log(`📍 URL: http://localhost:${PORT}`);
        console.log(`👑 Admin: ${process.env.ADMIN_USERNAME} / ${process.env.ADMIN_PASSWORD}`);
        console.log(`📊 Database: MongoDB Connected`);
        console.log(`📧 Email: Netlify Function`);
        console.log(`💬 Chat Support: Enabled with WebSocket`);
        console.log(`🔌 WebSocket: Active on /socket.io/`);
        console.log('='.repeat(70) + '\n');
    });
});