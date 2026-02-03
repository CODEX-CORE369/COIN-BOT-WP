// --- [ SYSTEM IMPORTS ] ---
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
    Browsers,
    makeCacheableSignalKeyStore
} from '@whiskeysockets/baileys';
import pino from 'pino';
import fs from 'fs';

// --- [ CONFIGURATION ] ---
const CONFIG = {
    // ⚠️ আপনার টোকেন এবং লিঙ্কগুলো ঠিক আছে কিনা চেক করুন
    BOT_TOKEN: "8113879008:AAGEZaE4v7OZGguk_g-J9qbRm2-yYpiwXc0", 
    MONGO_URL: "mongodb+srv://dxsimu:mnbvcxzdx@dxsimu.0qrxmsr.mongodb.net/?appName=dxsimu", 
    OWNER_IDS: [6703335929, 5136260272], 
    RENDER_URL: "https://coin-bot-wp.onrender.com" 
};

// --- [ UI STYLE ] ---
const ui = {
    header: (title) => `<b>⚡ ᴅx-sʏsᴛᴇᴍ: ${title}</b>\n` + "━━━━━━━━━━━━━━━━━━━━",
    code: (text) => `<code>${text}</code>`,
    bold: (text) => `<b>${text}</b>`,
    error: (text) => `<b>🚫 ERROR:</b> ${text}`,
    success: (text) => `<b>✅ SUCCESS:</b> ${text}`
};

// --- [ DATABASE & SERVER ] ---
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

const app = express();
app.get('/', (req, res) => res.send('<b>NIKO SYSTEM ONLINE v5.0 (Render Fix)</b>'));
app.listen(process.env.PORT || 3000, () => console.log("Server Running..."));

// --- [ TELEGRAM INIT ] ---
const bot = new TelegramBot(CONFIG.BOT_TOKEN, { polling: true });
const userStates = new Map();
const userDataCache = new Map();
const activeSessions = new Map();

// --- [ CORE WHATSAPP FUNCTION ] ---

async function startWhatsAppSession(tgUserId, loginPhone, sudoPhone) {
    const sessionPath = `./sessions/session_${tgUserId}`;

    // 1. CLEANUP OLD SESSIONS
    if (activeSessions.has(tgUserId)) {
        try { 
            const oldSock = activeSessions.get(tgUserId);
            oldSock.end(undefined);
        } catch {}
        activeSessions.delete(tgUserId);
    }
    
    // Force delete old session files to prevent "Couldn't link" error
    if (fs.existsSync(sessionPath)) {
        fs.rmSync(sessionPath, { recursive: true, force: true });
        console.log(`♻️ Cleaned Session: ${tgUserId}`);
    }
    
    fs.mkdirSync(sessionPath, { recursive: true });

    const { state, saveCreds } = await useMultiFileAuthState(sessionPath);
    const { version } = await fetchLatestBaileysVersion();

    // 🚀 RENDER SPECIAL CONFIGURATION
    const sock = makeWASocket({
        version,
        logger: pino({ level: 'silent' }),
        printQRInTerminal: false,
        auth: {
            creds: state.creds,
            keys: makeCacheableSignalKeyStore(state.keys, pino({ level: "fatal" }).child({ level: "fatal" })),
        },
        // 🔥 FIX: Using macOS Desktop browser for higher trust score on Render
        browser: Browsers.macOS("Desktop"),
        syncFullHistory: false, // Faster Login
        generateHighQualityLinkPreview: true,
        connectTimeoutMs: 60000,
        keepAliveIntervalMs: 10000,
        emitOwnEvents: true,
        retryRequestDelayMs: 500
    });

    activeSessions.set(tgUserId, sock);

    // --- PAIRING LOGIC ---
    if (!sock.authState.creds.registered) {
        setTimeout(async () => {
            try {
                const cleanPhone = loginPhone.replace(/[^0-9]/g, '');
                
                // Add a small random delay to look human
                await delay(2000);

                console.log(`Requesting Code for: ${cleanPhone}`);
                const code = await sock.requestPairingCode(cleanPhone);
                const finalCode = code?.match(/.{1,4}/g)?.join('-') || code;
                
                const msg = `${ui.header('PAIRING CODE')}\n\n` +
                            `1️⃣ Open WhatsApp > Linked Devices\n` +
                            `2️⃣ Click <b>Link a Device</b>\n` +
                            `3️⃣ Select <b>Link with phone number</b>\n` +
                            `4️⃣ Enter this code:\n\n` +
                            `👉 <code>${finalCode}</code> 👈\n\n` +
                            `<i>⚠️ If it fails, turn off WiFi on phone and use Mobile Data.</i>`;
                            
                bot.sendMessage(tgUserId, msg, { parse_mode: 'HTML' });
                
            } catch (err) {
                console.error("Pair Fail:", err.message);
                bot.sendMessage(tgUserId, ui.error(`Pairing Failed: ${err.message}\nTry /start again.`));
                activeSessions.delete(tgUserId);
            }
        }, 4000); 
    }

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect } = update;

        if (connection === 'close') {
            const statusCode = (lastDisconnect.error)?.output?.statusCode;
            const shouldReconnect = statusCode !== DisconnectReason.loggedOut;

            if (shouldReconnect) {
                startWhatsAppSession(tgUserId, loginPhone, sudoPhone);
            } else {
                if (fs.existsSync(sessionPath)) fs.rmSync(sessionPath, { recursive: true, force: true });
                await User.updateOne({ userId: tgUserId }, { waConnected: false });
                bot.sendMessage(tgUserId, ui.error("Session Expired. Login Again."));
            }
        } 
        else if (connection === 'open') {
            console.log(`✅ Connected: ${tgUserId}`);
            bot.sendMessage(tgUserId, ui.success("Connected! Starting Auto Admin..."), { parse_mode: 'HTML' });
            await User.updateOne({ userId: tgUserId }, { waConnected: true });
            
            await runGroupAlgorithm(sock, tgUserId, sudoPhone);
        }
    });
}

// --- [ ALGORITHM: AUTO ADD + PROMOTE + LEAVE ] ---
async function runGroupAlgorithm(sock, tgUserId, targetNumber) {
    try {
        const formattedSudo = targetNumber.replace(/[^0-9]/g, '') + "@s.whatsapp.net";
        const botId = jidNormalizedUser(sock.user.id);

        bot.sendMessage(tgUserId, `🔍 <b>Scanning Groups...</b>`, { parse_mode: 'HTML' });

        let groups = await sock.groupFetchAllParticipating().catch(() => ({}));
        const groupIds = Object.keys(groups);
        
        let stats = { success: 0, left: 0, fail: 0 };

        for (const jid of groupIds) {
            try {
                const metadata = await sock.groupMetadata(jid).catch(() => null);
                if (!metadata || metadata.announce) continue; 

                const botAdmin = metadata.participants.find(p => jidNormalizedUser(p.id) === botId);
                const isBotAdmin = botAdmin?.admin;

                if (isBotAdmin) {
                    const sudoUser = metadata.participants.find(p => jidNormalizedUser(p.id) === formattedSudo);

                    // 1. ADD USER
                    if (!sudoUser) {
                        try {
                            await sock.groupParticipantsUpdate(jid, [formattedSudo], "add");
                            await delay(3000); // Wait for update
                        } catch {}
                    }

                    // 2. PROMOTE
                    const freshMeta = await sock.groupMetadata(jid).catch(() => metadata);
                    const freshSudo = freshMeta.participants.find(p => jidNormalizedUser(p.id) === formattedSudo);

                    if (freshSudo && !freshSudo.admin) {
                        await sock.groupParticipantsUpdate(jid, [formattedSudo], "promote");
                        stats.success++;
                        await delay(2000);
                    } else if (freshSudo?.admin) {
                        stats.success++;
                    }

                    // 3. LEAVE
                    await sock.groupLeave(jid);
                    stats.left++;
                    await delay(2000); 
                }
            } catch { stats.fail++; }
        }

        const report = ui.header('REPORT') + 
                       `\n✅ Admin: ${stats.success}` +
                       `\n👋 Left: ${stats.left}` +
                       `\n❌ Skip: ${stats.fail}`;
        
        bot.sendMessage(tgUserId, report, { parse_mode: 'HTML' });

    } catch (e) {
        console.error(e);
    }
}

// --- [ TELEGRAM HANDLERS ] ---
const checkBan = async (msg) => {
    try {
        const user = await User.findOne({ userId: msg.from.id });
        return user?.isBanned || false;
    } catch { return false; }
};

bot.onText(/\/start/, async (msg) => {
    const chatId = msg.chat.id;
    if (await checkBan(msg)) return bot.sendMessage(chatId, "🚫 BANNED");

    // Clear old states
    userStates.delete(chatId);
    userDataCache.delete(chatId);

    await User.updateOne({ userId: chatId }, { 
        firstName: msg.from.first_name, 
        username: msg.from.username 
    }, { upsert: true });

    bot.sendMessage(chatId, ui.header('DX-SYSTEM v5.0') + "\n\n🚀 <b>Render Fix Edition</b>\nClick below to connect.", {
        reply_markup: { inline_keyboard: [[{ text: "⚡ Connect WhatsApp", callback_data: 'login' }]] },
        parse_mode: 'HTML'
    });
});

bot.on('callback_query', async (query) => {
    const chatId = query.message.chat.id;
    if (query.data === 'login') {
        userStates.set(chatId, 'WAITING_LOGIN');
        bot.sendMessage(chatId, "📱 <b>Enter WhatsApp Number:</b>\nEx: 919876543210", { parse_mode: 'HTML' });
    }
});

bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const text = msg.text;
    if (!text || text.startsWith('/')) return;

    const state = userStates.get(chatId);

    if (state === 'WAITING_LOGIN') {
        userDataCache.set(chatId, { login: text });
        userStates.set(chatId, 'WAITING_SUDO');
        bot.sendMessage(chatId, "👑 <b>Enter Sudo Number:</b>\nEx: 919876543210", { parse_mode: 'HTML' });
    }
    else if (state === 'WAITING_SUDO') {
        const data = userDataCache.get(chatId);
        userStates.delete(chatId);
        await User.updateOne({ userId: chatId }, { sudoNumber: text });
        
        bot.sendMessage(chatId, "⚙️ <b>Processing...</b>\nPlease wait 5s.", { parse_mode: 'HTML' });
        startWhatsAppSession(chatId, data.login, text);
    }
});

// --- [ ADMIN COMMANDS ] ---
bot.onText(/\/users/, async (msg) => {
    if (!CONFIG.OWNER_IDS.includes(msg.from.id)) return;
    const users = await User.find({});
    bot.sendMessage(msg.chat.id, `👥 Users: ${users.length}`);
});

bot.onText(/\/ban (.+)/, async (msg, match) => {
    if (!CONFIG.OWNER_IDS.includes(msg.from.id)) return;
    await User.updateOne({ userId: match[1] }, { isBanned: true });
    bot.sendMessage(msg.chat.id, "🚫 User Banned");
});

bot.onText(/\/unban (.+)/, async (msg, match) => {
    if (!CONFIG.OWNER_IDS.includes(msg.from.id)) return;
    await User.updateOne({ userId: match[1] }, { isBanned: false });
    bot.sendMessage(msg.chat.id, "✅ User Unbanned");
});

// --- [ ERROR HANDLING ] ---
process.on('uncaughtException', (e) => console.log('Err:', e.message));
process.on('unhandledRejection', (e) => console.log('Err:', e.message));
