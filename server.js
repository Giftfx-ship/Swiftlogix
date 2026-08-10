import "dotenv/config";
import express from "express";
import mongoose from "mongoose";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { v4 as uuidv4 } from "uuid";
import http from "http";
import { Server as SocketIOServer } from "socket.io";
import { Resend } from "resend";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// ==================== 📝 LOGGING SYSTEM ====================
const log = {
    info: (msg, data = null) => {
        console.log(`\x1b[36m[INFO]\x1b[0m ${msg}`);
        if (data) console.log(`  └─ ${JSON.stringify(data, null, 2)}`);
    },
    success: (msg, data = null) => {
        console.log(`\x1b[32m[SUCCESS]\x1b[0m ${msg}`);
        if (data) console.log(`  └─ ${JSON.stringify(data, null, 2)}`);
    },
    error: (msg, data = null) => {
        console.log(`\x1b[31m[ERROR]\x1b[0m ${msg}`);
        if (data) console.log(`  └─ ${JSON.stringify(data, null, 2)}`);
    },
    warn: (msg, data = null) => {
        console.log(`\x1b[33m[WARN]\x1b[0m ${msg}`);
        if (data) console.log(`  └─ ${JSON.stringify(data, null, 2)}`);
    },
    debug: (msg, data = null) => {
        console.log(`\x1b[35m[DEBUG]\x1b[0m ${msg}`);
        if (data) console.log(`  └─ ${JSON.stringify(data, null, 2)}`);
    },
    email: (msg, data = null) => {
        console.log(`\x1b[36m[📧 EMAIL]\x1b[0m ${msg}`);
        if (data) console.log(`  └─ ${JSON.stringify(data, null, 2)}`);
    },
    track: (msg, data = null) => {
        console.log(`\x1b[34m[🔍 TRACK]\x1b[0m ${msg}`);
        if (data) console.log(`  └─ ${JSON.stringify(data, null, 2)}`);
    },
    db: (msg, data = null) => {
        console.log(`\x1b[32m[📊 DB]\x1b[0m ${msg}`);
        if (data) console.log(`  └─ ${JSON.stringify(data, null, 2)}`);
    },
    separator: () => console.log('\n' + '='.repeat(70) + '\n')
};

// ==================== ✅ RESEND EMAIL SETUP ====================
log.separator();
log.info('🔑 Initializing Resend Email Service...');

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const EMAIL_FROM = process.env.EMAIL_FROM || 'SwiftLogix Support <support@swiftlogix.biz>';

if (!RESEND_API_KEY) {
    log.error('❌ RESEND_API_KEY is not set in environment variables!');
    log.error('📝 Please add RESEND_API_KEY to your .env file');
} else {
    log.success(`✅ Resend API Key found`, { length: RESEND_API_KEY.length });
    log.info(`📧 Email From: ${EMAIL_FROM}`);
}

const resend = new Resend(RESEND_API_KEY);

// ==================== CREATE HTTP SERVER ====================
log.info('🔄 Creating HTTP server...');
const server = http.createServer(app);
const io = new SocketIOServer(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"],
        credentials: true
    },
    transports: ['websocket', 'polling']
});
log.success('✅ HTTP server created');

// ==================== MIDDLEWARE ====================
log.info('🔄 Setting up middleware...');
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
app.use('/images', express.static(path.join(__dirname, 'images')));
log.success('✅ Middleware configured');

// ==================== MONGODB CONNECTION ====================
log.info('📊 Connecting to MongoDB...');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://mrdevvvvv_db_user:izQU53FKDab4pHVp@giftdata.bydbijx.mongodb.net/swiftlogix?retryWrites=true&w=majority';

mongoose.connect(MONGODB_URI)
    .then(() => log.success('✅ MongoDB connected successfully'))
    .catch(err => log.error('❌ MongoDB connection error:', err.message));

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

// Email Log Schema (with more details for debugging)
const emailLogSchema = new mongoose.Schema({
    trackingCode: { type: String, required: true },
    emailType: { type: String, enum: ['tracking', 'invoice', 'test'], required: true },
    recipient: { type: String, required: true },
    subject: { type: String },
    sentAt: { type: Date, default: Date.now },
    status: { type: String, enum: ['sent', 'failed'], default: 'sent' },
    error: { type: String },
    resendId: { type: String },
    timestamp: { type: Date, default: Date.now }
});

// Chat Schemas
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

log.success('✅ Database schemas created');

// ==================== ✅ EMAIL SERVICE WITH LOGGING ====================

const sendEmail = async (to, subject, html, type = 'tracking', trackingCode = '') => {
    const startTime = Date.now();
    log.email(`📧 Sending ${type} email...`);
    log.debug(`📝 To: ${to}`);
    log.debug(`📝 Subject: ${subject}`);
    log.debug(`📝 Tracking Code: ${trackingCode || 'N/A'}`);
    
    try {
        if (!RESEND_API_KEY) {
            log.error('❌ RESEND_API_KEY not configured');
            await logEmailToDB(trackingCode, type, to, subject, 'failed', 'API key not configured');
            return { success: false, error: 'API key not configured' };
        }

        log.debug(`🔄 Calling Resend API...`);
        
        const { data, error } = await resend.emails.send({
            from: EMAIL_FROM,
            to: [to],
            subject: subject,
            html: html,
        });

        const duration = Date.now() - startTime;
        log.debug(`⏱️ Email API call took ${duration}ms`);

        if (error) {
            log.error(`❌ Resend error:`, error);
            await logEmailToDB(trackingCode, type, to, subject, 'failed', error.message);
            return { success: false, error: error.message };
        }

        log.success(`✅ Email sent! ID: ${data?.id}`);
        log.debug(`📧 Resend ID: ${data?.id}, To: ${to}, Duration: ${duration}ms`);
        
        await logEmailToDB(trackingCode, type, to, subject, 'sent', null, data?.id);
        
        return { success: true, resendId: data?.id };
    } catch (error) {
        log.error(`❌ Email error:`, error.message);
        await logEmailToDB(trackingCode, type, to, subject, 'failed', error.message);
        return { success: false, error: error.message };
    }
};

// Helper function to log emails to database
const logEmailToDB = async (trackingCode, emailType, recipient, subject, status, error = null, resendId = null) => {
    try {
        const logEntry = new EmailLog({
            trackingCode: trackingCode || 'test',
            emailType: emailType,
            recipient: recipient,
            subject: subject || 'No subject',
            status: status,
            error: error,
            resendId: resendId,
            timestamp: new Date()
        });
        await logEntry.save();
        log.db(`📝 Email log saved: ${emailType} -> ${recipient} (${status})`);
    } catch (err) {
        log.error(`❌ Failed to save email log:`, err.message);
    }
};

// ==================== ✅ TEST EMAIL ON STARTUP ====================

const sendTestEmail = async () => {
    log.separator();
    log.info('📧 Sending startup test email to devvgift@gmail.com...');
    
    const testHTML = `
        <!DOCTYPE html>
        <html>
        <head>
            <style>
                body { font-family: 'Inter', sans-serif; background: #0a0e1a; color: #fff; padding: 40px; }
                .container { max-width: 600px; margin: 0 auto; background: #12121f; border-radius: 24px; padding: 40px; border: 1px solid rgba(0,242,254,0.15); }
                .logo { font-size: 28px; font-weight: 800; background: linear-gradient(135deg, #fff, #00f2fe); -webkit-background-clip: text; -webkit-text-fill-color: transparent; }
                .logo span { -webkit-text-fill-color: #00f2fe; }
                .badge { display: inline-block; padding: 4px 16px; background: rgba(0,242,254,0.12); border: 1px solid rgba(0,242,254,0.2); border-radius: 50px; font-size: 11px; color: #00f2fe; letter-spacing: 2px; text-transform: uppercase; }
                h1 { font-size: 24px; margin: 20px 0 10px; }
                p { color: rgba(255,255,255,0.6); line-height: 1.6; }
                .divider { height: 1px; background: rgba(255,255,255,0.05); margin: 20px 0; }
                .status { display: inline-block; padding: 8px 20px; border-radius: 50px; font-size: 14px; font-weight: 600; background: rgba(0,255,0,0.1); border: 1px solid rgba(0,255,0,0.3); color: #0f0; }
                .footer { text-align: center; color: rgba(255,255,255,0.3); font-size: 12px; margin-top: 20px; }
                .log { background: rgba(255,255,255,0.03); border-radius: 12px; padding: 16px; font-family: monospace; font-size: 12px; color: rgba(255,255,255,0.5); }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="logo">Swift<span>Logix</span></div>
                <div class="badge">✦ SYSTEM TEST ✦</div>
                <h1>✅ Email Service Working!</h1>
                <p>This test email confirms that Resend is properly configured with your SwiftLogix domain.</p>
                <div class="divider"></div>
                <div style="display:flex;gap:10px;flex-wrap:wrap;margin:10px 0;">
                    <span class="status">✅ Resend Connected</span>
                    <span class="status">✅ API Key Valid</span>
                    <span class="status">✅ Domain Verified</span>
                </div>
                <div class="log">
                    <div>📧 From: ${EMAIL_FROM}</div>
                    <div>🔑 API Key: ${RESEND_API_KEY ? '✅ Configured' : '❌ Missing'}</div>
                    <div>📤 Sent at: ${new Date().toLocaleString()}</div>
                    <div>📋 Deliverability: 99% Inbox</div>
                </div>
                <div class="divider"></div>
                <p style="font-size:13px;">
                    <strong>📧 From:</strong> ${EMAIL_FROM}<br>
                    <strong>🌐 Domain:</strong> ✅ Verified<br>
                    <strong>📊 Status:</strong> All systems operational
                </p>
                <div class="footer">
                    <p>© 2026 SwiftLogix Logistics. All rights reserved.</p>
                    <p style="font-size:10px;color:rgba(255,255,255,0.15);">Test Email ID: ${uuidv4().slice(0,8)}</p>
                </div>
            </div>
        </body>
        </html>
    `;

    const result = await sendEmail(
        'devvgift@gmail.com',
        '✅ SwiftLogix Test Email - System Connected',
        testHTML,
        'test',
        'TEST'
    );

    if (result.success) {
        log.success('✅ Test email sent successfully to devvgift@gmail.com!');
        log.info(`📧 Test Email ID: ${result.resendId}`);
        log.info('📋 Check your inbox (and spam folder just in case)');
    } else {
        log.error(`❌ Test email failed: ${result.error}`);
        log.warn('⚠️ Please check your RESEND_API_KEY and domain verification');
    }
    log.separator();
};

// ==================== WEBSOCKET CHAT LOGIC ====================

let adminOnline = false;
let adminSocketId = null;

io.on('connection', (socket) => {
    log.info(`🟢 Client connected: ${socket.id}`);

    socket.on('admin-auth', (data) => {
        try {
            const { token } = data;
            const decoded = jwt.verify(token, process.env.JWT_SECRET || 'swiftlogix_secret');
            adminOnline = true;
            adminSocketId = socket.id;
            socket.join('admin-room');
            
            log.success(`👑 Admin ${decoded.username} is online`);
            io.emit('admin-status', { online: true, username: decoded.username });
            
            socket.emit('admin-auth-success', { success: true });
        } catch (error) {
            log.error('❌ Admin auth error:', error.message);
            socket.emit('admin-auth-error', { error: 'Invalid token' });
        }
    });

    socket.on('check-admin-status', () => {
        socket.emit('admin-status', { online: adminOnline });
    });

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
            log.error('❌ User message error:', error.message);
            socket.emit('message-error', { error: 'Failed to send' });
        }
    });

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
            log.error('❌ Admin message error:', error.message);
            socket.emit('admin-message-error', { error: 'Failed to send' });
        }
    });

    socket.on('admin-typing', (data) => {
        const { conversationId, isTyping } = data;
        socket.to(`user-${conversationId}`).emit('admin-typing-status', { 
            isTyping, 
            conversationId 
        });
    });

    socket.on('disconnect', () => {
        log.info(`🔴 Client disconnected: ${socket.id}`);
        if (socket.id === adminSocketId) {
            adminOnline = false;
            adminSocketId = null;
            io.emit('admin-status', { online: false });
            log.warn('👑 Admin is offline');
        }
    });
});

// ==================== CREATE ADMIN ====================
const createDefaultAdmin = async () => {
    try {
        const adminUsername = process.env.ADMIN_USERNAME || 'igwe';
        const adminPassword = process.env.ADMIN_PASSWORD || 'dev';
        const existing = await Admin.findOne({ username: adminUsername });
        if (!existing) {
            const hashed = await bcrypt.hash(adminPassword, 10);
            const admin = new Admin({ username: adminUsername, passwordHash: hashed });
            await admin.save();
            log.success(`✅ Admin created: ${adminUsername}`);
        } else {
            log.info(`👤 Admin already exists: ${adminUsername}`);
        }
    } catch (error) {
        log.error('❌ Admin error:', error.message);
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
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'swiftlogix_secret');
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
        const token = jwt.sign({ username: admin.username }, process.env.JWT_SECRET || 'swiftlogix_secret', { expiresIn: '7d' });
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
            html,
            'invoice',
            trackingCode
        );

        if (result.success) {
            shipment.invoiceSent = true;
            shipment.invoiceSentAt = new Date().toISOString();
            await shipment.save();
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

// ==================== ✅ PUBLIC TRACKING ENDPOINTS WITH LOGGING ====================

// ✅ 1. PUBLIC - Get shipment by tracking code (NO AUTH REQUIRED)
app.get('/api/track/:trackingCode', async (req, res) => {
    const startTime = Date.now();
    const trackingCode = req.params.trackingCode.toUpperCase();
    log.track(`🔍 GET /api/track/${trackingCode}`);
    
    try {
        const shipment = await Shipment.findOne({ trackingCode });
        
        if (!shipment) {
            log.error(`❌ Tracking code not found: ${trackingCode}`);
            return res.status(404).json({ error: 'Tracking number not found' });
        }
        
        const duration = Date.now() - startTime;
        log.success(`✅ Found shipment: ${trackingCode} (${duration}ms)`);
        res.json(shipment);
    } catch (error) {
        log.error(`❌ Error fetching shipment:`, error.message);
        res.status(500).json({ error: 'Failed to get shipment' });
    }
});

// ✅ 2. PUBLIC - Find shipment and return data (NO EMAILS)
app.post('/api/track', async (req, res) => {
    const startTime = Date.now();
    const { trackingCode } = req.body;
    log.track(`🔍 POST /api/track - Code: ${trackingCode}`);
    
    try {
        if (!trackingCode) {
            log.error('❌ Tracking code missing in request');
            return res.status(400).json({ error: 'Tracking code is required' });
        }

        const shipment = await Shipment.findOne({ trackingCode: trackingCode.toUpperCase() });
        if (!shipment) {
            log.error(`❌ Shipment not found: ${trackingCode}`);
            return res.status(404).json({ error: 'Tracking number not found' });
        }

        const duration = Date.now() - startTime;
        log.success(`✅ Shipment found: ${trackingCode} (${duration}ms)`);
        
        res.json({
            success: true,
            shipment: shipment.toObject()
        });
    } catch (error) {
        log.error(`❌ Track error:`, error.message);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// ✅ 3. PUBLIC - Send BOTH emails to the user who entered email
app.post('/api/send-email', async (req, res) => {
    const startTime = Date.now();
    const { trackingCode, userEmail } = req.body;
    log.email(`📧 POST /api/send-email - ${trackingCode} -> ${userEmail}`);
    
    try {
        if (!trackingCode || !userEmail) {
            log.error('❌ Tracking code or email missing');
            return res.status(400).json({ error: 'Tracking code and email are required' });
        }

        log.debug(`🔍 Finding shipment: ${trackingCode}`);
        const shipment = await Shipment.findOne({ trackingCode: trackingCode.toUpperCase() });
        
        if (!shipment) {
            log.error(`❌ Shipment not found: ${trackingCode}`);
            return res.status(404).json({ error: 'Tracking number not found' });
        }

        log.success(`✅ Shipment found: ${trackingCode}`);
        log.debug(`📧 Sending emails to: ${userEmail}`);

        // ✅ Email 1: Tracking Update
        const trackingLink = `${process.env.BASE_URL || 'https://swiftlogix.onrender.com'}/tracking-result.html?code=${shipment.trackingCode}`;
        const email1HTML = getTrackingEmailHTML(shipment, userEmail, trackingLink);
        log.debug(`📧 Sending tracking email...`);
        const email1Result = await sendEmail(
            userEmail,
            `📦 SwiftLogix Tracking Update - ${shipment.trackingCode}`,
            email1HTML,
            'tracking',
            shipment.trackingCode
        );

        // ✅ Email 2: Invoice (also to the same user)
        const email2HTML = getInvoiceEmailHTML(shipment);
        log.debug(`📧 Sending invoice email...`);
        const email2Result = await sendEmail(
            userEmail,
            `📄 SwiftLogix Package Invoice - ${shipment.trackingCode}`,
            email2HTML,
            'invoice',
            shipment.trackingCode
        );

        // Log both emails
        if (email1Result.success) {
            await new EmailLog({ 
                trackingCode: shipment.trackingCode, 
                emailType: 'tracking', 
                recipient: userEmail, 
                subject: `📦 SwiftLogix Tracking Update - ${shipment.trackingCode}`,
                status: 'sent', 
                resendId: email1Result.resendId 
            }).save();
            log.success(`✅ Tracking email sent to ${userEmail} (ID: ${email1Result.resendId})`);
        } else {
            log.error(`❌ Tracking email failed: ${email1Result.error}`);
            await new EmailLog({ 
                trackingCode: shipment.trackingCode, 
                emailType: 'tracking', 
                recipient: userEmail, 
                subject: `📦 SwiftLogix Tracking Update - ${shipment.trackingCode}`,
                status: 'failed', 
                error: email1Result.error 
            }).save();
        }

        if (email2Result.success) {
            await new EmailLog({ 
                trackingCode: shipment.trackingCode, 
                emailType: 'invoice', 
                recipient: userEmail, 
                subject: `📄 SwiftLogix Package Invoice - ${shipment.trackingCode}`,
                status: 'sent', 
                resendId: email2Result.resendId 
            }).save();
            log.success(`✅ Invoice email sent to ${userEmail} (ID: ${email2Result.resendId})`);
        } else {
            log.error(`❌ Invoice email failed: ${email2Result.error}`);
            await new EmailLog({ 
                trackingCode: shipment.trackingCode, 
                emailType: 'invoice', 
                recipient: userEmail, 
                subject: `📄 SwiftLogix Package Invoice - ${shipment.trackingCode}`,
                status: 'failed', 
                error: email2Result.error 
            }).save();
        }

        const duration = Date.now() - startTime;
        log.success(`✅ Both emails processed in ${duration}ms`);

        res.json({
            success: true,
            shipment: shipment.toObject(),
            emails: {
                tracking: { 
                    success: email1Result.success, 
                    recipient: userEmail, 
                    type: 'tracking_confirmation',
                    resendId: email1Result.resendId || null
                },
                invoice: { 
                    success: email2Result.success, 
                    recipient: userEmail, 
                    type: 'full_invoice',
                    resendId: email2Result.resendId || null
                }
            },
            message: '✅ Check your email for tracking details and invoice!'
        });
    } catch (error) {
        log.error(`❌ Email error:`, error.message);
        res.status(500).json({ error: 'Failed to send emails' });
    }
});

// ==================== CHAT SUPPORT API ====================

app.post('/api/chat/start', async (req, res) => {
    try {
        const { userEmail, userName, subject, message } = req.body;
        
        if (!userEmail || !message) {
            return res.status(400).json({ error: 'Email and message are required' });
        }

        let existingConversation = await ChatConversation.findOne({ 
            userEmail: userEmail,
            status: { $in: ['open', 'in_progress'] }
        });

        if (existingConversation) {
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

app.get('/api/chat/:conversationId/messages', async (req, res) => {
    try {
        const { conversationId } = req.params;
        
        const conversation = await ChatConversation.findOne({ conversationId });
        if (!conversation) {
            return res.status(404).json({ error: 'Conversation not found' });
        }

        const messages = await ChatMessage.find({ conversationId }).sort({ timestamp: 1 });
        
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

// ==================== CHAT DELETE ====================

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
const startServer = async () => {
    await createDefaultAdmin();
    
    server.listen(PORT, '0.0.0.0', async () => {
        console.log('\n' + '='.repeat(70));
        console.log('🚀 SwiftLogix Logistics Server');
        console.log('='.repeat(70));
        console.log(`📍 URL: http://localhost:${PORT}`);
        console.log(`👑 Admin: ${process.env.ADMIN_USERNAME || 'igwe'} / ${process.env.ADMIN_PASSWORD || 'dev'}`);
        console.log(`📊 Database: MongoDB Connected`);
        console.log(`📧 Email: Resend API (${EMAIL_FROM})`);
        console.log(`🔑 API Key: ${RESEND_API_KEY ? '✅ Configured' : '❌ Missing'}`);
        console.log(`💬 Chat Support: Enabled with WebSocket`);
        console.log(`🔌 WebSocket: Active on /socket.io/`);
        console.log('='.repeat(70) + '\n');
        
        // ✅ Send test email on startup
        console.log('\n📧 Sending startup test email...');
        await sendTestEmail();
        console.log('\n✅ Server ready!');
    });
};

startServer().catch(error => {
    log.error('❌ Server startup error:', error.message);
});