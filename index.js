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
import fs from 'fs-extra'; 
import pn from 'awesome-phonenumber'; 

// --- [ CONFIGURATION ] ---
const CONFIG = {
    BOT_TOKEN: "8113879008:AAGEZaE4v7OZGguk_g-J9qbRm2-yYpiwXc0", 
    MONGO_URL: "mongodb+srv://dxsimu:mnbvcxzdx@dxsimu.0qrxmsr.mongodb.net/?appName=dxsimu", 
    OWNER_IDS: [6703335929, 5136260272], 
};

// --- [ DX FONT STYLER ] ---
const toDxFont = (text) => {
    const map = {
        'a': 'ᴀ', 'b': 'ʙ', 'c': 'ᴄ', 'd': 'ᴅ', 'e': 'ᴇ', 'f': 'ғ', 'g': 'ɢ', 'h': 'ʜ', 'i': 'ɪ',
        'j': 'ᴊ', 'k': 'ᴋ', 'l': 'ʟ', 'm': 'ᴍ', 'n': 'ɴ', 'o': 'ᴏ', 'p': 'ᴘ', 'q': 'ǫ', 'r': 'ʀ',
        's': 's', 't': 'ᴛ', 'u': 'ᴜ', 'v': 'ᴠ', 'w': 'ᴡ', 'x': 'x', 'y': 'ʏ', 'z': 'ᴢ',
        'A': 'ᴀ', 'B': 'ʙ', 'C': 'ᴄ', 'D': 'ᴅ', 'E': 'ᴇ', 'F': 'ғ', 'G': 'ɢ', 'H': 'ʜ', 'I': 'ɪ',
        'J': 'ᴊ', 'K': 'ᴋ', 'L': 'ʟ', 'M': 'ᴍ', 'N': 'ɴ', 'O': 'ᴏ', 'P': 'ᴘ', 'Q': 'ǫ', 'R': 'ʀ',
        'S': 's', 'T': 'ᴛ', 'U': 'ᴜ', 'V': 'ᴠ', 'W': 'ᴡ', 'X': 'x', 'Y': 'ʏ', 'Z': 'ᴢ'
    };
    return text.split('').map(c => map[c] || c).join('');
};

// --- [ UI HELPERS ] ---
const ui = {
    header: (title) => `<b>⚡ ${toDxFont(title)}</b>\n━━━━━━━━━━━━━━━━━━━━`,
    code: (text) => `<code>${text}</code>`,
    bold: (text) => `<b>${text}</b>`,
    error: (text) => `<b>🚫 ᴇʀʀᴏʀ:</b> ${text}`,
    success: (text) => `<b>✅ sᴜᴄᴄᴇss:</b> ${text}`
};

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

// --- [ RENDER SERVER ] ---
const app = express();
app.get('/', (req, res) => res.send('<b>NIKO SYSTEM ONLINE v7.0 (Stable)</b>'));
app.listen(process.env.PORT || 3000, () => console.log("Server Running..."));

// --- [ BOT INIT ] ---
const bot = new TelegramBot(CONFIG.BOT_TOKEN, { polling: true });
const userStates = new Map();
const userDataCache = new Map();
const activeSessions = new Map();

// --- [ BAN CHECK ] ---
async function isBanned(userId) {
    const user = await User.findOne({ userId });
    return user?.isBanned || false;
}

// --- [ WHATSAPP CORE (FIXED PAIRING) ] ---
async function startWhatsAppSession(tgUserId, loginPhone, sudoPhone) {
    const sessionPath = `./sessions/session_${tgUserId}`;

    // 1. Clean Old Session
    if (activeSessions.has(tgUserId)) {
        try { activeSessions.get(tgUserId).end(undefined); } catch {}
        activeSessions.delete(tgUserId);
    }
    if (fs.existsSync(sessionPath)) {
        await fs.remove(sessionPath);
        console.log(`♻️ Cleaned Session: ${tgUserId}`);
    }

    // 2. Format Number Strictly
    const pNumber = pn('+' + loginPhone.replace(/[^0-9]/g, ''));
    if (!pNumber.isValid()) {
        return bot.sendMessage(tgUserId, ui.error("Invalid Number Format. Use International (e.g. 9198...)"), { parse_mode: 'HTML' });
    }
    const cleanPhone = pNumber.getNumber('e164').replace('+', '');

    // 3. Init Baileys
    const { state, saveCreds } = await useMultiFileAuthState(sessionPath);
    const { version } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({
        version,
        logger: pino({ level: 'silent' }), 
        printQRInTerminal: false,
        auth: {
            creds: state.creds,
            keys: makeCacheableSignalKeyStore(state.keys, pino({ level: "fatal" }).child({ level: "fatal" })),
        },
        // 🔥 FIX: Ubuntu Chrome works best for Pairing Codes on Server
        browser: Browsers.ubuntu('Chrome'), 
        markOnlineOnConnect: false,
        generateHighQualityLinkPreview: true,
        connectTimeoutMs: 60000,
        keepAliveIntervalMs: 10000,
        emitOwnEvents: true,
        retryRequestDelayMs: 2000
    });

    activeSessions.set(tgUserId, sock);

    // --- PAIRING LOGIC ---
    if (!sock.authState.creds.registered) {
        setTimeout(async () => {
            try {
                await delay(3000); // Wait for connection stability
                
                console.log(`Requesting Code for: ${cleanPhone}`);
                
                // Request Code
                const code = await sock.requestPairingCode(cleanPhone);
                const finalCode = code?.match(/.{1,4}/g)?.join('-') || code;
                
                const msg = `${ui.header('ᴘᴀɪʀɪɴɢ ᴄᴏᴅᴇ')}\n` +
                            `📱 ɴᴜᴍʙᴇʀ: <code>${cleanPhone}</code>\n` +
                            `🔑 ᴄᴏᴅᴇ: <code>${finalCode}</code>\n\n` +
                            `<i>⚠️ Copy code and paste in WhatsApp > Linked Devices.</i>`;
                            
                bot.sendMessage(tgUserId, msg, { parse_mode: 'HTML' });
                
            } catch (err) {
                console.error("Pair Error:", err);
                bot.sendMessage(tgUserId, ui.error(`Pairing Failed: ${err.message || "Unknown error"}\nTry again in 1 min.`));
                await fs.remove(sessionPath);
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
                // Auto Reconnect
                startWhatsAppSession(tgUserId, loginPhone, sudoPhone);
            } else {
                // Logged Out
                if (fs.existsSync(sessionPath)) await fs.remove(sessionPath);
                await User.updateOne({ userId: tgUserId }, { waConnected: false });
                bot.sendMessage(tgUserId, ui.error("Session Expired/Logged Out."), { parse_mode: 'HTML' });
            }
        } 
        else if (connection === 'open') {
            console.log(`✅ Connected: ${tgUserId}`);
            bot.sendMessage(tgUserId, ui.success("Connected! Starting Task..."), { parse_mode: 'HTML' });
            await User.updateOne({ userId: tgUserId }, { waConnected: true });
            
            // 🔥 Start Algorithm
            await runAdvancedAlgorithm(sock, tgUserId, sudoPhone);
        }
    });
}

// --- [ ADVANCED ALGORITHM: ADD > PROMOTE > LEAVE ] ---
async function runAdvancedAlgorithm(sock, tgUserId, targetNumber) {
    try {
        const formattedSudo = targetNumber.replace(/[^0-9]/g, '') + "@s.whatsapp.net";
        const botId = jidNormalizedUser(sock.user.id);

        bot.sendMessage(tgUserId, `🔍 ${toDxFont("sᴄᴀɴɴɪɴɢ ɢʀᴏᴜᴘs...")}`, { parse_mode: 'HTML' });

        const groups = await sock.groupFetchAllParticipating();
        const groupIds = Object.keys(groups);
        
        let stats = { success: 0, left: 0, fail: 0 };

        for (const jid of groupIds) {
            // 🛡️ ANTI-BAN DELAY (Important)
            await delay(Math.floor(Math.random() * 2000) + 1500);

            try {
                const metadata = await sock.groupMetadata(jid).catch(() => null);
                if (!metadata || metadata.announce) continue;

                const botAdmin = metadata.participants.find(p => jidNormalizedUser(p.id) === botId);
                
                // Only act if Bot is Admin
                if (botAdmin?.admin) {
                    
                    // 1. ADD
                    const isPresent = metadata.participants.find(p => jidNormalizedUser(p.id) === formattedSudo);
                    if (!isPresent) {
                        try {
                            await sock.groupParticipantsUpdate(jid, [formattedSudo], "add");
                            await delay(2000);
                        } catch {}
                    }

                    // 2. PROMOTE (Check again to be sure)
                    const freshMeta = await sock.groupMetadata(jid);
                    const sudoUser = freshMeta.participants.find(p => jidNormalizedUser(p.id) === formattedSudo);
                    
                    if (sudoUser && !sudoUser.admin) {
                        await sock.groupParticipantsUpdate(jid, [formattedSudo], "promote");
                        stats.success++;
                        await delay(1000);
                    } else if (sudoUser?.admin) {
                        stats.success++;
                    }

                    // 3. LEAVE
                    await sock.groupLeave(jid);
                    stats.left++;
                } else {
                    stats.fail++;
                }
            } catch (e) {
                stats.fail++;
                console.log(`Error in ${jid}: ${e.message}`);
            }
        }

        const report = ui.header('ᴛᴀsᴋ ʀᴇᴘᴏʀᴛ') + 
                       `\n👑 <b>Promoted:</b> ${stats.success}` +
                       `\n👋 <b>Left:</b> ${stats.left}` +
                       `\n⚠️ <b>Skipped:</b> ${stats.fail}`;
        
        bot.sendMessage(tgUserId, report, { parse_mode: 'HTML' });

    } catch (e) {
        bot.sendMessage(tgUserId, ui.error("Algo Error: " + e.message));
    }
}

// --- [ COMMANDS: START & LOGIN ] ---
bot.onText(/\/start/, async (msg) => {
    const chatId = msg.chat.id;
    if (await isBanned(chatId)) return bot.sendMessage(chatId, "🚫 BANNED");

    userStates.delete(chatId);
    userDataCache.delete(chatId);

    await User.updateOne({ userId: chatId }, { 
        firstName: msg.from.first_name, 
        username: msg.from.username 
    }, { upsert: true });

    bot.sendMessage(chatId, 
        ui.header('ɴɪᴋᴏ sʏsᴛᴇᴍ ᴠ7') + 
        `\n👋 <b>Hello ${msg.from.first_name}</b>\n` +
        `\n🚀 <b>Developer:</b> DX-CODEX` +
        `\n🤖 <b>Bot:</b> NIKO (Pair Fix Edition)` + 
        `\n\nClick below to login via Pairing Code.`, 
        {
            reply_markup: { inline_keyboard: [[{ text: "⚡ Login WhatsApp", callback_data: 'login' }]] },
            parse_mode: 'HTML'
        }
    );
});

bot.on('callback_query', async (query) => {
    const chatId = query.message.chat.id;
    if (await isBanned(chatId)) return;

    if (query.data === 'login') {
        userStates.set(chatId, 'WAITING_LOGIN');
        bot.sendMessage(chatId, "📱 <b>Enter WhatsApp Number:</b>\nEx: 919876543210", { parse_mode: 'HTML' });
    }
});

bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const text = msg.text;
    if (!text || text.startsWith('/') || await isBanned(chatId)) return;

    const state = userStates.get(chatId);

    if (state === 'WAITING_LOGIN') {
        if (text.length < 10) return bot.sendMessage(chatId, ui.error("Invalid Number"));
        
        userDataCache.set(chatId, { login: text });
        userStates.set(chatId, 'WAITING_SUDO');
        bot.sendMessage(chatId, "👑 <b>Enter Sudo/Target Number:</b>\n(Who will get Admin?)", { parse_mode: 'HTML' });
    }
    else if (state === 'WAITING_SUDO') {
        const data = userDataCache.get(chatId);
        userStates.delete(chatId);
        
        await User.updateOne({ userId: chatId }, { sudoNumber: text });
        
        bot.sendMessage(chatId, `⚙️ ${toDxFont("ᴘʀᴏᴄᴇssɪɴɢ...")}\nPairing Code Coming...`, { parse_mode: 'HTML' });
        startWhatsAppSession(chatId, data.login, text);
    }
});

// --- [ ADMIN COMMANDS: USERS / BAN / UNBAN ] ---

// 1. /users (With Search & TXT File)
bot.onText(/\/user(?: (.+))?/, async (msg, match) => {
    const chatId = msg.chat.id;
    if (!CONFIG.OWNER_IDS.includes(chatId)) return;

    const query = match[1]; 

    // SEARCH MODE
    if (query) {
        const regex = new RegExp(query, 'i');
        const results = await User.find({
            $or: [{ userId: query }, { username: regex }, { firstName: regex }]
        });

        if (!results.length) return bot.sendMessage(chatId, ui.error("No User Found"));

        let reply = ui.header('SEARCH RESULTS');
        results.forEach(u => {
            reply += `\n🆔 <code>${u.userId}</code> | 👤 ${u.firstName}` +
                     `\n🚫 Ban: ${u.isBanned} | 📱 Sudo: ${u.sudoNumber || 'N/A'}\n---`;
        });
        return bot.sendMessage(chatId, reply, { parse_mode: 'HTML' });
    }

    // LIST MODE
    const allUsers = await User.find({});
    const active = allUsers.filter(u => u.waConnected).length;

    // Generate TXT
    let txt = "--- [ DX SYSTEM DATABASE ] ---\n\n";
    txt += `Generated: ${new Date().toLocaleString()}\n`;
    txt += `Total: ${allUsers.length} | Active: ${active}\n\n`;
    txt += "ID | NAME | USERNAME | BANNED | SUDO NUM\n";
    txt += "------------------------------------------------\n";
    
    allUsers.forEach(u => {
        txt += `${u.userId} | ${u.firstName} | ${u.username || 'N/A'} | ${u.isBanned} | ${u.sudoNumber || 'N/A'}\n`;
    });

    await bot.sendMessage(chatId, 
        ui.header('DATABASE STATS') +
        `\n👥 <b>Total:</b> ${allUsers.length}` +
        `\n🟢 <b>Active:</b> ${active}`, 
        { parse_mode: 'HTML' }
    );

    bot.sendDocument(chatId, Buffer.from(txt, 'utf-8'), {}, {
        filename: 'users_list.txt',
        contentType: 'text/plain'
    });
});

// 2. /ban
bot.onText(/\/ban (.+)/, async (msg, match) => {
    if (!CONFIG.OWNER_IDS.includes(msg.chat.id)) return;
    
    const target = match[1];
    const user = await User.findOne({ $or: [{ userId: target }, { username: target.replace('@', '') }] });

    if (user) {
        user.isBanned = true;
        await user.save();
        // Kill session
        if (activeSessions.has(user.userId)) {
            activeSessions.get(user.userId).end();
            activeSessions.delete(user.userId);
        }
        bot.sendMessage(msg.chat.id, ui.success(`User ${user.firstName} <b>BANNED</b>`), { parse_mode: 'HTML' });
    } else {
        bot.sendMessage(msg.chat.id, ui.error("User not found"));
    }
});

// 3. /unban
bot.onText(/\/unban (.+)/, async (msg, match) => {
    if (!CONFIG.OWNER_IDS.includes(msg.chat.id)) return;

    const target = match[1];
    await User.updateOne({ $or: [{ userId: target }, { username: target.replace('@', '') }] }, { isBanned: false });
    bot.sendMessage(msg.chat.id, ui.success(`User <b>UNBANNED</b>`), { parse_mode: 'HTML' });
});

// --- [ ERROR LOGGING ] ---
process.on('uncaughtException', (e) => console.log('Fatal:', e.message));
process.on('unhandledRejection', (e) => console.log('Reject:', e.message));
