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
const PORT = process.env.PORT || 10000;

// ==================== LOGGING ====================
const log = {
    info: (msg) => console.log(`\x1b[36m[INFO]\x1b[0m ${msg}`),
    success: (msg) => console.log(`\x1b[32m[SUCCESS]\x1b[0m ${msg}`),
    error: (msg) => console.log(`\x1b[31m[ERROR]\x1b[0m ${msg}`),
    email: (msg) => console.log(`\x1b[36m[📧]\x1b[0m ${msg}`),
    separator: () => console.log('\n' + '='.repeat(70) + '\n')
};

// ==================== RESEND SETUP ====================
log.separator();
log.info('🔑 Initializing Resend...');

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const EMAIL_FROM = process.env.EMAIL_FROM || 'SwiftLogix Support <support@swiftlogix.biz>';
const BASE_URL = process.env.BASE_URL || 'https://swift-logix-7t9y.onrender.com';

if (!RESEND_API_KEY) {
    log.error('❌ RESEND_API_KEY missing!');
} else {
    log.success(`✅ API Key found (${RESEND_API_KEY.length} chars)`);
}

const resend = new Resend(RESEND_API_KEY);

// ==================== HTTP SERVER ====================
const server = http.createServer(app);
const io = new SocketIOServer(server, {
    cors: { origin: "*", methods: ["GET", "POST"], credentials: true },
    transports: ['websocket', 'polling']
});

// ==================== MIDDLEWARE ====================
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
app.use('/images', express.static(path.join(__dirname, 'images')));

// ==================== MONGODB ====================
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://mrdevvvvv_db_user:izQU53FKDab4pHVp@giftdata.bydbijx.mongodb.net/swiftlogix?retryWrites=true&w=majority';
mongoose.connect(MONGODB_URI)
    .then(() => log.success('✅ MongoDB connected'))
    .catch(err => log.error('❌ MongoDB error:', err.message));

// ==================== SCHEMAS ====================
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
        expectedDelivery: { type: String, default: 'Pending' }
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

const adminSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true },
    passwordHash: { type: String, required: true },
    createdAt: { type: Date, default: Date.now },
    lastLogin: { type: Date }
});

const emailLogSchema = new mongoose.Schema({
    trackingCode: { type: String, required: true },
    emailType: { type: String, enum: ['tracking', 'invoice', 'test'], required: true },
    recipient: { type: String, required: true },
    subject: { type: String },
    sentAt: { type: Date, default: Date.now },
    status: { type: String, enum: ['sent', 'failed'], default: 'sent' },
    error: { type: String },
    resendId: { type: String }
});

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

// ==================== EMAIL SERVICE ====================

const sendEmail = async (to, subject, html, type = 'tracking', trackingCode = '') => {
    try {
        if (!RESEND_API_KEY) {
            return { success: false, error: 'API key missing' };
        }

        log.email(`📧 Sending ${type} email to ${to}...`);
        
        const { data, error } = await resend.emails.send({
            from: EMAIL_FROM,
            to: [to],
            subject: subject,
            html: html,
        });

        if (error) {
            log.error(`❌ Resend error:`, error);
            await logEmailToDB(trackingCode, type, to, subject, 'failed', error.message);
            return { success: false, error: error.message };
        }

        log.success(`✅ ${type} email sent! ID: ${data?.id}`);
        await logEmailToDB(trackingCode, type, to, subject, 'sent', null, data?.id);
        return { success: true, resendId: data?.id };
    } catch (error) {
        log.error(`❌ Error:`, error.message);
        await logEmailToDB(trackingCode, type, to, subject, 'failed', error.message);
        return { success: false, error: error.message };
    }
};

const logEmailToDB = async (trackingCode, emailType, recipient, subject, status, error = null, resendId = null) => {
    try {
        await new EmailLog({ trackingCode, emailType, recipient, subject, status, error, resendId }).save();
    } catch (err) {
        log.error('❌ Failed to save log:', err.message);
    }
};

// ==================== TEST EMAIL ON STARTUP ====================

const sendTestEmail = async () => {
    log.separator();
    log.info('📧 Sending test email...');
    
    const testHTML = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Test Email</title>
</head>
<body style="margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;background:#f8fafc;padding:20px 0;">
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;padding:20px 0;">
        <tr>
            <td align="center">
                <table width="100%" cellpadding="0" cellspacing="0" style="max-width:580px;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.05);">
                    <tr>
                        <td style="padding:28px 30px 20px;text-align:center;border-bottom:1px solid #e2e8f0;">
                            <div style="font-size:22px;font-weight:700;color:#0f172a;letter-spacing:-0.5px;">
                                Swift<span style="color:#06b6d4;">Logix</span>
                            </div>
                            <div style="font-size:12px;color:#94a3b8;margin-top:2px;">System Test</div>
                        </td>
                    </tr>
                    <tr>
                        <td style="padding:30px;text-align:center;">
                            <div style="display:inline-block;padding:6px 18px;border-radius:50px;font-size:13px;font-weight:600;background:#22c55e15;color:#22c55e;border:1px solid #22c55e30;">✅ Connected</div>
                            <div style="font-size:20px;font-weight:600;color:#0f172a;margin-top:12px;">Email Service Working</div>
                            <div style="font-size:14px;color:#475569;margin-top:4px;max-width:400px;margin-left:auto;margin-right:auto;">
                                Resend is properly configured with your domain.
                            </div>
                            <div style="margin-top:16px;background:#f8fafc;border-radius:8px;padding:14px;text-align:left;font-size:13px;color:#475569;">
                                <div><span style="color:#94a3b8;">From:</span> ${EMAIL_FROM}</div>
                                <div style="margin-top:2px;"><span style="color:#94a3b8;">Status:</span> <span style="color:#22c55e;">✅ Verified</span></div>
                                <div style="margin-top:2px;"><span style="color:#94a3b8;">Sent:</span> ${new Date().toLocaleString()}</div>
                            </div>
                        </td>
                    </tr>
                    <tr>
                        <td style="padding:16px 30px;text-align:center;border-top:1px solid #e2e8f0;">
                            <div style="font-size:12px;color:#94a3b8;">© 2026 SwiftLogix Logistics</div>
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>
</body>
</html>`;

    const result = await sendEmail(
        'devvgift@gmail.com',
        'SwiftLogix System Test',
        testHTML,
        'test',
        'TEST'
    );

    if (result.success) {
        log.success('✅ Test email sent to devvgift@gmail.com!');
    } else {
        log.error(`❌ Test email failed: ${result.error}`);
    }
    log.separator();
};

// ==================== ADMIN ====================
const createDefaultAdmin = async () => {
    try {
        const adminUsername = process.env.ADMIN_USERNAME || 'igwe';
        const adminPassword = process.env.ADMIN_PASSWORD || 'dev';
        const existing = await Admin.findOne({ username: adminUsername });
        if (!existing) {
            const hashed = await bcrypt.hash(adminPassword, 10);
            await new Admin({ username: adminUsername, passwordHash: hashed }).save();
            log.success(`✅ Admin created: ${adminUsername}`);
        }
    } catch (error) {
        log.error('❌ Admin error:', error.message);
    }
};

// ==================== CLEAN EMAIL TEMPLATES ====================

const getTrackingEmailHTML = (shipment, userEmail, trackingLink) => {
    const { trackingCode, statusText, statusDesc, sender, receiver, parcel } = shipment;
    const statusColor = statusText === 'Delivered' ? '#22c55e' :
                       statusText === 'Custom Hold' ? '#ef4444' :
                       statusText === 'On The Way' ? '#06b6d4' : '#f59e0b';

    return `<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Tracking Update</title>
</head>
<body style="margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;background:#f8fafc;padding:20px 0;">
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;padding:20px 0;">
        <tr>
            <td align="center">
                <table width="100%" cellpadding="0" cellspacing="0" style="max-width:580px;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.05);">
                    <tr>
                        <td style="padding:28px 30px 20px;text-align:center;border-bottom:1px solid #e2e8f0;">
                            <div style="font-size:22px;font-weight:700;color:#0f172a;letter-spacing:-0.5px;">
                                Swift<span style="color:#06b6d4;">Logix</span>
                            </div>
                            <div style="font-size:12px;color:#94a3b8;margin-top:2px;">Premium Logistics</div>
                        </td>
                    </tr>
                    <tr>
                        <td style="padding:24px 30px 20px;text-align:center;">
                            <div style="display:inline-block;padding:6px 18px;border-radius:50px;font-size:13px;font-weight:600;background:${statusColor}15;color:${statusColor};border:1px solid ${statusColor}30;">
                                ${statusText || 'In Transit'}
                            </div>
                            <div style="font-size:20px;font-weight:600;color:#0f172a;margin-top:8px;letter-spacing:1px;">
                                ${trackingCode}
                            </div>
                            <div style="font-size:14px;color:#475569;margin-top:4px;">
                                ${statusDesc || 'Your shipment is being processed'}
                            </div>
                        </td>
                    </tr>
                    <tr>
                        <td style="padding:0 30px;">
                            <table width="100%" cellpadding="0" cellspacing="0">
                                <tr><td style="padding:10px 0;border-bottom:1px solid #f1f5f9;"><span style="color:#94a3b8;font-size:13px;">Sender</span><span style="float:right;font-size:13px;color:#0f172a;font-weight:500;">${sender.name}</span></td></tr>
                                <tr><td style="padding:10px 0;border-bottom:1px solid #f1f5f9;"><span style="color:#94a3b8;font-size:13px;">Receiver</span><span style="float:right;font-size:13px;color:#0f172a;font-weight:500;">${receiver.name}</span></td></tr>
                                <tr><td style="padding:10px 0;border-bottom:1px solid #f1f5f9;"><span style="color:#94a3b8;font-size:13px;">Weight</span><span style="float:right;font-size:13px;color:#0f172a;font-weight:500;">${parcel.weight}</span></td></tr>
                                <tr><td style="padding:10px 0;border-bottom:1px solid #f1f5f9;"><span style="color:#94a3b8;font-size:13px;">Type</span><span style="float:right;font-size:13px;color:#0f172a;font-weight:500;">${parcel.type}</span></td></tr>
                                <tr><td style="padding:10px 0;"><span style="color:#94a3b8;font-size:13px;">Expected Delivery</span><span style="float:right;font-size:13px;color:#06b6d4;font-weight:600;">${parcel.expectedDelivery}</span></td></tr>
                            </table>
                        </td>
                    </tr>
                    <tr>
                        <td style="padding:24px 30px 20px;text-align:center;">
                            <a href="${trackingLink}" style="display:inline-block;padding:12px 32px;background:#0f172a;color:#ffffff;font-size:14px;font-weight:600;border-radius:50px;text-decoration:none;">Track Package →</a>
                        </td>
                    </tr>
                    <tr>
                        <td style="padding:16px 30px;text-align:center;border-top:1px solid #e2e8f0;">
                            <div style="font-size:12px;color:#94a3b8;">© 2026 SwiftLogix Logistics</div>
                            <div style="font-size:11px;color:#cbd5e1;margin-top:2px;">Sent to ${userEmail}</div>
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>
</body>
</html>`;
};

const getInvoiceEmailHTML = (shipment) => {
    const { trackingCode, statusText, sender, receiver, invoice } = shipment;
    
    return `<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Shipment Invoice</title>
</head>
<body style="margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;background:#f8fafc;padding:20px 0;">
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;padding:20px 0;">
        <tr>
            <td align="center">
                <table width="100%" cellpadding="0" cellspacing="0" style="max-width:580px;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.05);">
                    <tr>
                        <td style="padding:28px 30px 20px;text-align:center;border-bottom:1px solid #e2e8f0;">
                            <div style="font-size:22px;font-weight:700;color:#0f172a;letter-spacing:-0.5px;">
                                Swift<span style="color:#06b6d4;">Logix</span>
                            </div>
                            <div style="font-size:12px;color:#94a3b8;margin-top:2px;">Package Invoice</div>
                        </td>
                    </tr>
                    <tr>
                        <td style="padding:20px 30px;">
                            <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;border-radius:8px;padding:12px 16px;">
                                <tr><td style="font-size:12px;color:#94a3b8;">Tracking Code</td><td style="text-align:right;font-size:14px;font-weight:600;color:#0f172a;letter-spacing:1px;">${trackingCode}</td></tr>
                                <tr><td style="font-size:12px;color:#94a3b8;padding-top:4px;">Status</td><td style="text-align:right;font-size:13px;font-weight:500;color:#06b6d4;padding-top:4px;">${statusText}</td></tr>
                            </table>
                        </td>
                    </tr>
                    <tr>
                        <td style="padding:0 30px;">
                            <table width="100%" cellpadding="0" cellspacing="0">
                                <tr>
                                    <td width="50%" style="vertical-align:top;padding-bottom:16px;">
                                        <div style="font-size:11px;font-weight:600;color:#94a3b8;text-transform:uppercase;letter-spacing:0.5px;">Sender</div>
                                        <div style="font-size:14px;color:#0f172a;font-weight:500;">${sender.name}</div>
                                        <div style="font-size:13px;color:#475569;">${sender.country}</div>
                                    </td>
                                    <td width="50%" style="vertical-align:top;padding-bottom:16px;">
                                        <div style="font-size:11px;font-weight:600;color:#94a3b8;text-transform:uppercase;letter-spacing:0.5px;">Receiver</div>
                                        <div style="font-size:14px;color:#0f172a;font-weight:500;">${receiver.name}</div>
                                        <div style="font-size:13px;color:#475569;">${receiver.country}</div>
                                    </td>
                                </tr>
                            </table>
                        </td>
                    </tr>
                    <tr>
                        <td style="padding:0 30px 16px;">
                            <div style="border-top:1px solid #e2e8f0;padding-top:16px;">
                                <table width="100%" cellpadding="0" cellspacing="0">
                                    <tr><td style="font-size:13px;color:#475569;">Shipping</td><td style="text-align:right;font-size:13px;color:#0f172a;">${invoice.shipmentCost}</td></tr>
                                    <tr><td style="font-size:13px;color:#475569;padding-top:4px;">Clearance</td><td style="text-align:right;font-size:13px;color:#0f172a;padding-top:4px;">${invoice.clearanceCost}</td></tr>
                                    <tr><td style="font-size:16px;font-weight:700;color:#0f172a;padding-top:8px;border-top:1px solid #e2e8f0;">Total</td><td style="text-align:right;font-size:18px;font-weight:700;color:#0f172a;padding-top:8px;border-top:1px solid #e2e8f0;">${invoice.totalAmount}</td></tr>
                                    <tr><td style="font-size:12px;color:#94a3b8;padding-top:6px;">Payment</td><td style="text-align:right;font-size:12px;font-weight:500;color:#22c55e;padding-top:6px;">${invoice.paymentStatus}</td></tr>
                                </table>
                            </div>
                        </td>
                    </tr>
                    <tr>
                        <td style="padding:16px 30px;text-align:center;border-top:1px solid #e2e8f0;">
                            <div style="font-size:12px;color:#94a3b8;">© 2026 SwiftLogix Logistics</div>
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>
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

// ==================== ADMIN ROUTES ====================
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
                expectedDelivery: data.parcel?.expectedDelivery || 'Pending'
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

app.post('/api/admin/shipments/:code/send-invoice', authMiddleware, async (req, res) => {
    try {
        const trackingCode = req.params.code.toUpperCase();
        const shipment = await Shipment.findOne({ trackingCode });
        if (!shipment) return res.status(404).json({ error: 'Not found' });
        if (!shipment.receiver?.email) return res.status(400).json({ error: 'Receiver email not set' });

        const html = getInvoiceEmailHTML(shipment);
        const result = await sendEmail(
            shipment.receiver.email,
            `SwiftLogix Invoice - ${trackingCode}`,
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

// ==================== PUBLIC TRACKING ENDPOINTS ====================

app.get('/api/track/:trackingCode', async (req, res) => {
    try {
        const trackingCode = req.params.trackingCode.toUpperCase();
        const shipment = await Shipment.findOne({ trackingCode });
        if (!shipment) return res.status(404).json({ error: 'Tracking number not found' });
        res.json(shipment);
    } catch (error) {
        res.status(500).json({ error: 'Failed to get shipment' });
    }
});

app.post('/api/track', async (req, res) => {
    try {
        const { trackingCode } = req.body;
        if (!trackingCode) return res.status(400).json({ error: 'Tracking code is required' });

        const shipment = await Shipment.findOne({ trackingCode: trackingCode.toUpperCase() });
        if (!shipment) return res.status(404).json({ error: 'Tracking number not found' });

        res.json({ success: true, shipment: shipment.toObject() });
    } catch (error) {
        res.status(500).json({ error: 'Internal server error' });
    }
});

// ✅ SEND EMAILS - Uses receiver email from database
app.post('/api/send-email', async (req, res) => {
    try {
        const { trackingCode } = req.body;
        
        // ✅ Get userEmail from request or use receiver.email from database
        let userEmail = req.body.userEmail;
        
        const shipment = await Shipment.findOne({ trackingCode: trackingCode.toUpperCase() });
        if (!shipment) {
            return res.status(404).json({ error: 'Tracking number not found' });
        }

        // ✅ If no email provided in request, use receiver.email from database
        if (!userEmail) {
            userEmail = shipment.receiver?.email;
            if (!userEmail) {
                return res.status(400).json({ error: 'No email found for this shipment' });
            }
            log.info(`📧 Using receiver email from database: ${userEmail}`);
        }

        // ✅ Clean subject - no emojis, no spam words
        const trackingLink = `${BASE_URL}/tracking-result.html?code=${shipment.trackingCode}`;
        
        // Email 1: Tracking Update
        const email1HTML = getTrackingEmailHTML(shipment, userEmail, trackingLink);
        const email1Result = await sendEmail(
            userEmail,
            `SwiftLogix Tracking - ${shipment.trackingCode}`,
            email1HTML,
            'tracking',
            shipment.trackingCode
        );

        // Email 2: Invoice
        const email2HTML = getInvoiceEmailHTML(shipment);
        const email2Result = await sendEmail(
            userEmail,
            `SwiftLogix Invoice - ${shipment.trackingCode}`,
            email2HTML,
            'invoice',
            shipment.trackingCode
        );

        res.json({
            success: true,
            shipment: shipment.toObject(),
            emails: {
                tracking: { success: email1Result.success, recipient: userEmail },
                invoice: { success: email2Result.success, recipient: userEmail }
            }
        });
    } catch (error) {
        console.error('Email error:', error);
        res.status(500).json({ error: 'Failed to send emails' });
    }
});

// ==================== CHAT ROUTES ====================
app.post('/api/chat/start', async (req, res) => {
    try {
        const { userEmail, userName, subject, message } = req.body;
        if (!userEmail || !message) return res.status(400).json({ error: 'Email and message are required' });

        let existing = await ChatConversation.findOne({ userEmail, status: { $in: ['open', 'in_progress'] } });
        if (existing) {
            const msg = new ChatMessage({
                conversationId: existing.conversationId,
                messageId: uuidv4(),
                sender: 'user',
                senderName: userName || 'Guest',
                message,
                timestamp: new Date()
            });
            await msg.save();
            existing.updatedAt = new Date();
            existing.unreadAdmin = true;
            existing.lastMessageAt = new Date();
            await existing.save();
            return res.json({ success: true, conversationId: existing.conversationId });
        }

        const conversationId = uuidv4();
        const conv = new ChatConversation({
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
        await conv.save();

        const msg = new ChatMessage({
            conversationId,
            messageId: uuidv4(),
            sender: 'user',
            senderName: userName || 'Guest',
            message,
            timestamp: new Date()
        });
        await msg.save();

        res.json({ success: true, conversationId, isNew: true });
    } catch (error) {
        console.error('Chat error:', error);
        res.status(500).json({ error: 'Failed to start chat' });
    }
});

app.get('/api/chat/:conversationId/messages', async (req, res) => {
    try {
        const { conversationId } = req.params;
        const conversation = await ChatConversation.findOne({ conversationId });
        if (!conversation) return res.status(404).json({ error: 'Conversation not found' });
        const messages = await ChatMessage.find({ conversationId }).sort({ timestamp: 1 });
        res.json({ success: true, conversation, messages });
    } catch (error) {
        res.status(500).json({ error: 'Failed to get messages' });
    }
});

app.post('/api/chat/:conversationId/send', async (req, res) => {
    try {
        const { conversationId } = req.params;
        const { message, sender, senderName } = req.body;
        if (!message) return res.status(400).json({ error: 'Message is required' });

        const conversation = await ChatConversation.findOne({ conversationId });
        if (!conversation) return res.status(404).json({ error: 'Conversation not found' });

        const msg = new ChatMessage({
            conversationId,
            messageId: uuidv4(),
            sender: sender || 'user',
            senderName: senderName || (sender === 'admin' ? 'Support Team' : 'Guest'),
            message,
            timestamp: new Date()
        });
        await msg.save();

        conversation.updatedAt = new Date();
        conversation.lastMessageAt = new Date();
        if (sender === 'admin') {
            conversation.unreadUser = true;
            conversation.status = 'in_progress';
        } else {
            conversation.unreadAdmin = true;
        }
        await conversation.save();

        res.json({ success: true, message: msg });
    } catch (error) {
        res.status(500).json({ error: 'Failed to send message' });
    }
});

app.get('/api/admin/chats', authMiddleware, async (req, res) => {
    try {
        const conversations = await ChatConversation.find().sort({ updatedAt: -1 });
        const result = await Promise.all(conversations.map(async (conv) => {
            const last = await ChatMessage.findOne({ conversationId: conv.conversationId }).sort({ timestamp: -1 });
            const unread = await ChatMessage.countDocuments({ conversationId: conv.conversationId, sender: 'user', read: false });
            return { ...conv.toObject(), lastMessage: last?.message || 'No messages', unreadCount: unread };
        }));
        res.json({ success: true, conversations: result });
    } catch (error) {
        res.status(500).json({ error: 'Failed to get conversations' });
    }
});

app.put('/api/admin/chats/:conversationId/resolve', authMiddleware, async (req, res) => {
    try {
        const { conversationId } = req.params;
        const conversation = await ChatConversation.findOne({ conversationId });
        if (!conversation) return res.status(404).json({ error: 'Conversation not found' });
        conversation.status = 'resolved';
        conversation.updatedAt = new Date();
        await conversation.save();
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'Failed to resolve' });
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
        console.log(`📍 URL: ${BASE_URL}`);
        console.log(`👑 Admin: ${process.env.ADMIN_USERNAME || 'igwe'} / ${process.env.ADMIN_PASSWORD || 'dev'}`);
        console.log(`📊 Database: MongoDB Connected`);
        console.log(`📧 Email: ${EMAIL_FROM}`);
        console.log(`🔑 API Key: ${RESEND_API_KEY ? '✅' : '❌'}`);
        console.log('='.repeat(70) + '\n');
        
        await sendTestEmail();
        console.log('\n✅ Server ready!');
    });
};

startServer().catch(error => {
    console.error('❌ Server startup error:', error.message);
});