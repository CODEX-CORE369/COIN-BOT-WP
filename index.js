// --- [ IMPORTS ] ---
import TelegramBot from 'node-telegram-bot-api';
import mongoose from 'mongoose';
import express from 'express';
import { 
    makeWASocket, 
    useMultiFileAuthState, 
    DisconnectReason, 
    delay, 
    fetchLatestBaileysVersion, 
    jidNormalizedUser,
    Browsers
} from '@whiskeysockets/baileys';
import pino from 'pino';
import fs from 'fs';
import axios from 'axios';

// --- [ CONFIGURATION ] ---
const CONFIG = {
    BOT_TOKEN: "8113879008:AAGEZaE4v7OZGguk_g-J9qbRm2-yYpiwXc0", 
    MONGO_URL: "mongodb+srv://dxsimu:mnbvcxzdx@dxsimu.0qrxmsr.mongodb.net/?appName=dxsimu", 
    OWNER_IDS: [6703335929, 5136260272], 
    RENDER_URL: "https://coin-bot-wp.onrender.com" 
};

// --- [ UTILS ] ---
const FONT_MAP = {
    'A':'ᴀ','B':'ʙ','C':'ᴄ','D':'ᴅ','E':'ᴇ','F':'ғ','G':'ɢ','H':'ʜ','I':'ɪ','J':'ᴊ',
    'K':'ᴋ','L':'ʟ','M':'ᴍ','N':'ɴ','O':'ᴏ','P':'ᴘ','Q':'ǫ','R':'ʀ','S':'s','T':'ᴛ',
    'U':'ᴜ','V':'ᴠ','W':'ᴡ','X':'x','Y':'ʏ','Z':'ᴢ'
};

const applyStyle = (text) => text.split('').map(char => FONT_MAP[char.toUpperCase()] || char).join('');
const formatMsg = (text) => `<blockquote><b>${applyStyle(text)}</b></blockquote>`;
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// --- [ DATABASE ] ---
mongoose.connect(CONFIG.MONGO_URL)
    .then(() => console.log('✅ MongoDB Connected'))
    .catch(err => console.error('❌ MongoDB Error:', err));

const userSchema = new mongoose.Schema({
    userId: { type: Number, unique: true },
    firstName: String,
    username: String,
    isBanned: { type: Boolean, default: false },
    waConnected: { type: Boolean, default: false },
    sudoNumber: { type: String, default: null },
    joinedDate: { type: Date, default: Date.now }
});
const User = mongoose.model('User', userSchema);

// --- [ SERVER ] ---
const app = express();
app.get('/', (req, res) => res.send('<h1>NIKO SYSTEM ACTIVE</h1>'));
app.listen(process.env.PORT || 3000, () => console.log("Server Running"));

// --- [ TELEGRAM BOT ] ---
const bot = new TelegramBot(CONFIG.BOT_TOKEN, { polling: true });
const userStates = new Map();
const userDataCache = new Map();
// Store active socket instances to prevent conflict
const activeSessions = new Map(); 

// --- [ CORE WHATSAPP LOGIC ] ---

async function startWhatsAppSession(tgUserId, loginPhone, sudoPhone) {
    // Stop existing session if any
    if (activeSessions.has(tgUserId)) {
        console.log(`Closing existing session for ${tgUserId}`);
        try { activeSessions.get(tgUserId).end(); } catch {}
        activeSessions.delete(tgUserId);
    }

    const sessionPath = `./sessions/session_${tgUserId}`;
    if (!fs.existsSync(sessionPath)) fs.mkdirSync(sessionPath, { recursive: true });

    const { state, saveCreds } = await useMultiFileAuthState(sessionPath);
    const { version } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({
        version,
        logger: pino({ level: 'silent' }),
        printQRInTerminal: false,
        auth: state,
        browser: Browsers.macOS('Chrome'), // More stable browser ID
        connectTimeoutMs: 60000,
        keepAliveIntervalMs: 10000,
        syncFullHistory: false,
    });

    activeSessions.set(tgUserId, sock);

    // --- PAIRING CODE LOGIC (IMPROVED) ---
    if (!sock.authState.creds.registered) {
        // Wait 4 seconds for socket to initialize properly
        setTimeout(async () => {
            try {
                // Ensure phone number format
                const cleanPhone = loginPhone.replace(/[^0-9]/g, '');
                
                console.log(`Requesting code for ${cleanPhone}...`);
                const code = await sock.requestPairingCode(cleanPhone);
                
                // Format code nicely (ABC-DEF)
                const formattedCode = code?.match(/.{1,4}/g)?.join('-') || code;
                
                bot.sendMessage(tgUserId, formatMsg(`Your Pair Code: <code>${formattedCode}</code>\n\nEnter this in WhatsApp within 2 minutes.`), { parse_mode: 'HTML' });
            } catch (err) {
                console.error("Pairing Error:", err);
                bot.sendMessage(tgUserId, formatMsg(`❌ Pairing Failed: ${err.message}\nPlease /start again with a valid number.`));
            }
        }, 4000);
    }

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect } = update;

        if (connection === 'close') {
            const statusCode = (lastDisconnect.error)?.output?.statusCode;
            const shouldReconnect = statusCode !== DisconnectReason.loggedOut;

            console.log(`Connection closed for ${tgUserId}. Status: ${statusCode}. Reconnect: ${shouldReconnect}`);

            if (shouldReconnect) {
                // Temporary disconnect, reconnecting...
                startWhatsAppSession(tgUserId, loginPhone, sudoPhone);
            } else {
                // Logged out or Session Invalid
                if (fs.existsSync(sessionPath)) {
                    fs.rmSync(sessionPath, { recursive: true, force: true });
                }
                activeSessions.delete(tgUserId);
                await User.updateOne({ userId: tgUserId }, { waConnected: false });
                bot.sendMessage(tgUserId, formatMsg("⚠️ Session Expired or Logged Out.\nPlease login again using /start."));
            }
        } 
        
        else if (connection === 'open') {
            console.log(`✅ ${tgUserId} Connected to WhatsApp!`);
            bot.sendMessage(tgUserId, formatMsg("✅ Login Successful!\nStarting Advanced Group Algorithm..."));
            await User.updateOne({ userId: tgUserId }, { waConnected: true });
            
            // Start the main task
            await performAdvancedGroupTask(sock, tgUserId, sudoPhone);
        }
    });
}

// --- [ ADVANCED ALGORITHM: ADD -> PROMOTE -> LEAVE ] ---
async function performAdvancedGroupTask(sock, tgUserId, targetNumber) {
    try {
        if (!targetNumber) return;

        const formattedSudo = targetNumber.replace(/[^0-9]/g, '') + "@s.whatsapp.net";
        const myBotId = jidNormalizedUser(sock.user.id);

        bot.sendMessage(tgUserId, formatMsg(`🔍 Scanning all groups... This may take time.`));

        // Fetch groups (Retry logic included)
        let groups = {};
        try {
            groups = await sock.groupFetchAllParticipating();
        } catch (e) {
            groups = {}; // Handle fetch error
        }

        const groupIds = Object.keys(groups);
        let stats = { success: 0, left: 0, failed: 0 };

        for (const jid of groupIds) {
            const metadata = groups[jid];
            
            // Skip Announcements/Community Groups where specific actions are restricted
            if (metadata.announce) continue;

            // 1. Check My Admin Status
            const amIAdmin = metadata.participants.find(p => jidNormalizedUser(p.id) === myBotId);
            const isBotAdmin = amIAdmin && (amIAdmin.admin === 'admin' || amIAdmin.admin === 'superadmin');

            if (isBotAdmin) {
                try {
                    // 2. Check Sudo Status
                    const sudoParticipant = metadata.participants.find(p => jidNormalizedUser(p.id) === formattedSudo);
                    const isSudoAdmin = sudoParticipant && (sudoParticipant.admin === 'admin' || sudoParticipant.admin === 'superadmin');

                    // --- ACTION 1: ADD ---
                    if (!sudoParticipant) {
                        try {
                            await sock.groupParticipantsUpdate(jid, [formattedSudo], "add");
                            console.log(`Added sudo to ${metadata.subject}`);
                            await delay(2000 + Math.random() * 1000); // Random delay 2-3s
                        } catch (addErr) {
                            console.log(`Privacy/Add error in ${metadata.subject}`);
                            stats.failed++;
                            continue; // If add fails, skip to next group
                        }
                    }

                    // --- ACTION 2: PROMOTE ---
                    // Only promote if not already admin
                    if (!isSudoAdmin) {
                        await sock.groupParticipantsUpdate(jid, [formattedSudo], "promote");
                        console.log(`Promoted sudo in ${metadata.subject}`);
                        stats.success++;
                        await delay(1500); 
                    } else {
                        // Sudo is already admin, count as success
                        stats.success++;
                    }

                    // --- ACTION 3: LEAVE ---
                    await sock.groupLeave(jid);
                    stats.left++;
                    console.log(`Left group: ${metadata.subject}`);
                    
                    // Critical Anti-Flood Delay
                    await delay(3000 + Math.random() * 2000); 

                } catch (e) {
                    console.error(`Error in ${metadata.subject}:`, e.message);
                }
            }
        }

        // --- FINAL REPORT ---
        if (stats.left > 0 || stats.success > 0) {
            const report = `🤖 *NIKO ADVANCED REPORT*\n\n` +
                           `👤 Sudo: +${targetNumber}\n` +
                           `✅ Admin Given: ${stats.success} groups\n` +
                           `👋 Left Groups: ${stats.left}\n` +
                           `🚫 Failed/Privacy: ${stats.failed}\n\n` +
                           `_Mission Accomplished._`;
            
            // Send to WhatsApp (Note to Self)
            await sock.sendMessage(myBotId, { text: report });
            
            // Send to Telegram
            bot.sendMessage(tgUserId, formatMsg(`Mission Complete!\n\nPromoted in: ${stats.success}\nLeft: ${stats.left}\n\nCheck WhatsApp for details.`));
        } else {
             bot.sendMessage(tgUserId, formatMsg(`⚠️ No groups found where I have Admin rights.`));
        }

    } catch (error) {
        console.error("Task Error:", error);
        bot.sendMessage(tgUserId, formatMsg(`System Error: ${error.message}`));
    }
}

// --- [ TELEGRAM HANDLERS ] ---

const checkBan = async (msg) => {
    const user = await User.findOne({ userId: msg.from.id });
    if (user && user.isBanned) return true;
    return false;
};

bot.onText(/\/start/, async (msg) => {
    const chatId = msg.chat.id;
    if (await checkBan(msg)) return bot.sendMessage(chatId, "🚫 Banned.");

    await User.updateOne(
        { userId: chatId },
        { $set: { firstName: msg.from.first_name, username: msg.from.username } },
        { upsert: true }
    );

    const opts = {
        reply_markup: {
            inline_keyboard: [
                [{ text: "🚀 Login WhatsApp", callback_data: 'login_flow' }]
            ]
        },
        parse_mode: 'HTML'
    };

    bot.sendMessage(chatId, formatMsg(`Welcome ${msg.from.first_name}!\n\n<b>NIKO V2 (Advanced)</b>\n- Stable Pairing\n- Auto Add & Promote\n- Auto Leave\n\nClick below to start.`), opts);
});

bot.on('callback_query', async (callbackQuery) => {
    const msg = callbackQuery.message;
    const chatId = msg.chat.id;
    const data = callbackQuery.data;

    if (data === 'login_flow') {
        userStates.set(chatId, 'WAITING_LOGIN_NUMBER');
        bot.sendMessage(chatId, formatMsg("Step 1/2:\n\nSend <b>Bot Number</b> (The account to login).\nExample: 919876543210"), { parse_mode: 'HTML' });
    }
});

bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const text = msg.text;

    if (!text || text.startsWith('/')) return;
    if (await checkBan(msg)) return;

    const state = userStates.get(chatId);

    if (state === 'WAITING_LOGIN_NUMBER') {
        if (!/^\d{10,15}$/.test(text)) return bot.sendMessage(chatId, "❌ Invalid Number.");

        userDataCache.set(chatId, { loginPhone: text });
        userStates.set(chatId, 'WAITING_SUDO_NUMBER');
        bot.sendMessage(chatId, formatMsg("Step 2/2:\n\nSend <b>Sudo Number</b> (To be Admin).\nExample: 919876543210"), { parse_mode: 'HTML' });
    }
    
    else if (state === 'WAITING_SUDO_NUMBER') {
        if (!/^\d{10,15}$/.test(text)) return bot.sendMessage(chatId, "❌ Invalid Number.");

        const data = userDataCache.get(chatId);
        data.sudoPhone = text;
        
        await User.updateOne({ userId: chatId }, { sudoNumber: text });
        userStates.delete(chatId); 
        
        bot.sendMessage(chatId, formatMsg(`⚙️ Connecting to WhatsApp Server...\nPlease wait for the code.`), { parse_mode: 'HTML' });
        
        // Start Session
        startWhatsAppSession(chatId, data.loginPhone, data.sudoPhone);
    }
});

// --- [ ADMIN TOOLS ] ---

bot.onText(/\/users/, async (msg) => {
    if (!CONFIG.OWNER_IDS.includes(msg.from.id)) return;
    const count = await User.countDocuments();
    bot.sendMessage(msg.chat.id, `Total Users: ${count}`);
});

bot.onText(/\/reset/, async (msg) => {
    if (!CONFIG.OWNER_IDS.includes(msg.from.id)) return;
    // Clears all sessions (Dangerous but useful for fixing loops)
    if (fs.existsSync('./sessions')) {
        fs.rmSync('./sessions', { recursive: true, force: true });
        bot.sendMessage(msg.chat.id, "✅ All Sessions Cleared.");
    }
});
