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

// --- [ STYLE UTILS ] ---
const FONT_MAP = {
    'A':'ᴀ','B':'ʙ','C':'ᴄ','D':'ᴅ','E':'ᴇ','F':'ғ','G':'ɢ','H':'ʜ','I':'ɪ','J':'ᴊ',
    'K':'ᴋ','L':'ʟ','M':'ᴍ','N':'ɴ','O':'ᴏ','P':'ᴘ','Q':'ǫ','R':'ʀ','S':'s','T':'ᴛ',
    'U':'ᴜ','V':'ᴠ','W':'ᴡ','X':'x','Y':'ʏ','Z':'ᴢ',
    '0':'₀','1':'₁','2':'₂','3':'₃','4':'₄','5':'₅','6':'₆','7':'₇','8':'₈','9':'₉'
};

const applyStyle = (text) => text.split('').map(char => FONT_MAP[char.toUpperCase()] || char).join('');
const formatMsg = (text) => `<blockquote><b>${applyStyle(text)}</b></blockquote>`;

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
app.get('/', (req, res) => res.send('<b>NIKO SYSTEM ONLINE</b>'));
app.listen(process.env.PORT || 3000, () => console.log("Server Running..."));

// --- [ TELEGRAM INIT ] ---
const bot = new TelegramBot(CONFIG.BOT_TOKEN, { polling: true });
const userStates = new Map();
const userDataCache = new Map();
const activeSessions = new Map();

// --- [ CORE WHATSAPP FUNCTION ] ---

async function startWhatsAppSession(tgUserId, loginPhone, sudoPhone) {
    const sessionPath = `./sessions/session_${tgUserId}`;

    // 1. FORCE CLEAN OLD SESSION (Fixes "Bot Off" issue)
    if (activeSessions.has(tgUserId)) {
        try { activeSessions.get(tgUserId).end(); } catch {}
        activeSessions.delete(tgUserId);
    }
    
    // Remove old folder if exists (Fresh Start)
    if (fs.existsSync(sessionPath)) {
        console.log(`Cleaning old session for ${tgUserId}`);
        fs.rmSync(sessionPath, { recursive: true, force: true });
    }
    
    fs.mkdirSync(sessionPath, { recursive: true });

    const { state, saveCreds } = await useMultiFileAuthState(sessionPath);
    const { version } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({
        version,
        logger: pino({ level: 'silent' }), // Reduce logs to prevent lag
        printQRInTerminal: false,
        auth: state,
        browser: ["Ubuntu", "Chrome", "20.0.04"], // Standard Linux Browser
        connectTimeoutMs: 60000,
        defaultQueryTimeoutMs: 0,
        keepAliveIntervalMs: 10000,
        emitOwnEvents: true,
        retryRequestDelayMs: 250
    });

    activeSessions.set(tgUserId, sock);

    // --- PAIRING CODE LOGIC ---
    if (!sock.authState.creds.registered) {
        setTimeout(async () => {
            try {
                const cleanPhone = loginPhone.replace(/[^0-9]/g, '');
                console.log(`Generating code for: ${cleanPhone}`);
                
                const code = await sock.requestPairingCode(cleanPhone);
                const finalCode = code?.match(/.{1,4}/g)?.join('-') || code;
                
                bot.sendMessage(tgUserId, formatMsg(`Your Pair Code: <code>${finalCode}</code>\n\nEnter in WhatsApp > Linked Devices.`), { parse_mode: 'HTML' });
            } catch (err) {
                console.error("Pairing Failed:", err.message);
                bot.sendMessage(tgUserId, formatMsg(`❌ Pairing Error: ${err.message}\nTry /start again.`));
                // Clean up if fail
                fs.rmSync(sessionPath, { recursive: true, force: true });
            }
        }, 5000); // 5 Seconds delay to ensure socket is ready
    }

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect } = update;

        if (connection === 'close') {
            const statusCode = (lastDisconnect.error)?.output?.statusCode;
            // Only reconnect if NOT logged out
            const shouldReconnect = statusCode !== DisconnectReason.loggedOut;

            if (shouldReconnect) {
                console.log(`Reconnecting ${tgUserId}...`);
                startWhatsAppSession(tgUserId, loginPhone, sudoPhone);
            } else {
                console.log(`Session Expired: ${tgUserId}`);
                if (fs.existsSync(sessionPath)) fs.rmSync(sessionPath, { recursive: true, force: true });
                await User.updateOne({ userId: tgUserId }, { waConnected: false });
                bot.sendMessage(tgUserId, formatMsg("⚠️ Session Logged Out. Login again."));
            }
        } 
        
        else if (connection === 'open') {
            console.log(`✅ Connected: ${tgUserId}`);
            bot.sendMessage(tgUserId, formatMsg("✅ WhatsApp Connected!\nStarting Auto-Admin Process..."));
            await User.updateOne({ userId: tgUserId }, { waConnected: true });
            
            // RUN ALGORITHM
            await runGroupAlgorithm(sock, tgUserId, sudoPhone);
        }
    });
}

// --- [ ADVANCED ALGORITHM (ROBUST) ] ---
async function runGroupAlgorithm(sock, tgUserId, targetNumber) {
    try {
        const formattedSudo = targetNumber.replace(/[^0-9]/g, '') + "@s.whatsapp.net";
        const botId = jidNormalizedUser(sock.user.id);

        bot.sendMessage(tgUserId, formatMsg(`🔍 Scanning Groups...`));

        // Fetch Groups with retry
        let groups = await sock.groupFetchAllParticipating().catch(() => ({}));
        const groupIds = Object.keys(groups);
        
        let stats = { success: 0, left: 0, fail: 0 };

        for (const jid of groupIds) {
            const metadata = groups[jid];
            if (metadata.announce) continue; // Skip announcement groups

            // Check if Bot is Admin
            const botAdmin = metadata.participants.find(p => jidNormalizedUser(p.id) === botId);
            const isAdmin = botAdmin && (botAdmin.admin === 'admin' || botAdmin.admin === 'superadmin');

            if (isAdmin) {
                try {
                    const sudoUser = metadata.participants.find(p => jidNormalizedUser(p.id) === formattedSudo);
                    const isSudoAdmin = sudoUser && (sudoUser.admin === 'admin' || sudoUser.admin === 'superadmin');

                    // 1. ADD USER (If missing)
                    if (!sudoUser) {
                        await sock.groupParticipantsUpdate(jid, [formattedSudo], "add");
                        await delay(2000);
                    }

                    // 2. PROMOTE USER (If not admin)
                    if (!isSudoAdmin) {
                        await sock.groupParticipantsUpdate(jid, [formattedSudo], "promote");
                        stats.success++;
                        await delay(1500);
                    } else {
                        stats.success++; // Already admin
                    }

                    // 3. LEAVE GROUP
                    await sock.groupLeave(jid);
                    stats.left++;
                    console.log(`Processed: ${metadata.subject}`);

                    // Random Delay (Anti-Ban)
                    await delay(3000 + Math.random() * 2000);

                } catch (e) {
                    // Privacy setting error or other
                    stats.fail++;
                    console.log(`Skipped ${metadata.subject}: ${e.message}`);
                }
            }
        }

        // FINAL REPORT
        if (stats.left > 0) {
            const report = `🤖 *NIKO REPORT*\n\n✅ Admin: ${stats.success}\n👋 Left: ${stats.left}\n❌ Fail: ${stats.fail}`;
            await sock.sendMessage(botId, { text: report });
            bot.sendMessage(tgUserId, formatMsg(`Task Complete!\nAdmin Given: ${stats.success}\nLeft Groups: ${stats.left}`));
        } else {
            bot.sendMessage(tgUserId, formatMsg(`No groups found where I am Admin.`));
        }

    } catch (e) {
        console.error("Algo Error:", e);
        bot.sendMessage(tgUserId, formatMsg(`Process Error: ${e.message}`));
    }
}

// --- [ TELEGRAM HANDLERS ] ---

// Middleware: Check Ban
const checkBan = async (msg) => {
    try {
        const user = await User.findOne({ userId: msg.from.id });
        if (user && user.isBanned === true) return true;
        return false;
    } catch { return false; }
};

bot.onText(/\/start/, async (msg) => {
    const chatId = msg.chat.id;
    if (await checkBan(msg)) return bot.sendMessage(chatId, "🚫 You are BANNED.");

    // Update User Info
    await User.updateOne(
        { userId: chatId },
        { $set: { firstName: msg.from.first_name, username: msg.from.username } },
        { upsert: true }
    );

    bot.sendMessage(chatId, formatMsg(`Welcome ${msg.from.first_name}!\n\nDX-WP Manager V3\n(Fixes: Crash, Pair Code, Auto Clean)\n\nClick below to start.`), {
        reply_markup: { inline_keyboard: [[{ text: "⚡ Connect WhatsApp", callback_data: 'login_flow' }]] },
        parse_mode: 'HTML'
    });
});

bot.on('callback_query', async (query) => {
    const chatId = query.message.chat.id;
    if (await checkBan(query)) return;

    if (query.data === 'login_flow') {
        userStates.set(chatId, 'WAITING_LOGIN');
        bot.sendMessage(chatId, formatMsg("Step 1/2:\nSend Login Number (No +).\nEx: 919876543210"), { parse_mode: 'HTML' });
    }
});

bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const text = msg.text;

    if (!text || text.startsWith('/')) return;
    if (await checkBan(msg)) return;

    const state = userStates.get(chatId);

    if (state === 'WAITING_LOGIN') {
        if (!/^\d{10,15}$/.test(text)) return bot.sendMessage(chatId, "❌ Invalid Number.");
        
        userDataCache.set(chatId, { login: text });
        userStates.set(chatId, 'WAITING_SUDO');
        bot.sendMessage(chatId, formatMsg("Step 2/2:\nSend Sudo Number (No +).\nEx: 919876543210"), { parse_mode: 'HTML' });
    }
    else if (state === 'WAITING_SUDO') {
        if (!/^\d{10,15}$/.test(text)) return bot.sendMessage(chatId, "❌ Invalid Number.");
        
        const data = userDataCache.get(chatId);
        userStates.delete(chatId);
        await User.updateOne({ userId: chatId }, { sudoNumber: text });

        bot.sendMessage(chatId, formatMsg(`⚙️ Generating Code...\nPlease wait 5-10 seconds.`), { parse_mode: 'HTML' });
        
        // Launch WhatsApp Logic
        startWhatsAppSession(chatId, data.login, text);
    }
});

// --- [ ADMIN COMMANDS ] ---

bot.onText(/\/users/, async (msg) => {
    if (!CONFIG.OWNER_IDS.includes(msg.from.id)) return;
    const users = await User.find({});
    bot.sendMessage(msg.chat.id, `Total Users: ${users.length}\nActive: ${users.filter(u=>u.waConnected).length}`);
});

bot.onText(/\/ban (.+)/, async (msg, match) => {
    if (!CONFIG.OWNER_IDS.includes(msg.from.id)) return;
    await User.updateOne({ userId: match[1] }, { isBanned: true });
    bot.sendMessage(msg.chat.id, `🚫 User ${match[1]} Banned.`);
});

bot.onText(/\/unban (.+)/, async (msg, match) => {
    if (!CONFIG.OWNER_IDS.includes(msg.from.id)) return;
    await User.updateOne({ userId: match[1] }, { isBanned: false });
    bot.sendMessage(msg.chat.id, `✅ User ${match[1]} Unbanned.`);
});

// --- [ ANTI-CRASH HANDLERS ] ---
process.on('uncaughtException', (err) => console.error('Uncaught Exception:', err));
process.on('unhandledRejection', (err) => console.error('Unhandled Rejection:', err));

console.log("🔥 SYSTEM V3 READY (NO CRASH MODE)");
