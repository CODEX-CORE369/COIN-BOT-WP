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
    BOT_TOKEN: "8113879008:AAGEZaE4v7OZGguk_g-J9qbRm2-yYpiwXc0", // তোমার টোকেন
    MONGO_URL: "mongodb+srv://dxsimu:mnbvcxzdx@dxsimu.0qrxmsr.mongodb.net/?appName=dxsimu", // তোমার মঙ্গো ইউআরএল
    OWNER_IDS: [6703335929, 5136260272], // মালিকের আইডি
    RENDER_URL: "https://coin-bot-wp.onrender.com" // তোমার রেন্ডার লিংক
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
    header: (title) => `<b>⚡ ${toDxFont(title)}</b>\n` + "━━━━━━━━━━━━━━━━━━━━",
    code: (text) => `<code>${text}</code>`,
    bold: (text) => `<b>${text}</b>`,
    error: (text) => `<b>🚫 ᴇʀʀᴏʀ:</b> ${text}`,
    success: (text) => `<b>✅ sᴜᴄᴄᴇss:</b> ${text}`
};

// --- [ DATABASE CONNECTION ] ---
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

// --- [ SERVER FOR RENDER ] ---
const app = express();
app.get('/', (req, res) => res.send('<b>NIKO SYSTEM ONLINE v5.0</b>'));
app.listen(process.env.PORT || 3000, () => console.log("Server Running..."));

// --- [ TELEGRAM BOT INIT ] ---
const bot = new TelegramBot(CONFIG.BOT_TOKEN, { polling: true });
const userStates = new Map();
const userDataCache = new Map();
const activeSessions = new Map();

// --- [ HELPER: BAN CHECK ] ---
async function isBanned(userId) {
    const user = await User.findOne({ userId });
    return user?.isBanned || false;
}

// --- [ WHATSAPP CORE ] ---
async function startWhatsAppSession(tgUserId, loginPhone, sudoPhone) {
    const sessionPath = `./sessions/session_${tgUserId}`;

    // Cleanup logic
    if (activeSessions.has(tgUserId)) {
        try { activeSessions.get(tgUserId).end(undefined); } catch {}
        activeSessions.delete(tgUserId);
    }
    if (fs.existsSync(sessionPath)) fs.rmSync(sessionPath, { recursive: true, force: true });

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
        browser: Browsers.macOS("Safari"), // Stable for Pairing
        connectTimeoutMs: 60000,
        keepAliveIntervalMs: 10000,
        emitOwnEvents: true,
        retryRequestDelayMs: 500
    });

    activeSessions.set(tgUserId, sock);

    // --- PAIRING CODE LOGIC ---
    if (!sock.authState.creds.registered) {
        setTimeout(async () => {
            try {
                const cleanPhone = loginPhone.replace(/[^0-9]/g, '');
                await delay(3000); // Wait for socket init
                
                const code = await sock.requestPairingCode(cleanPhone);
                const finalCode = code?.match(/.{1,4}/g)?.join('-') || code;
                
                bot.sendMessage(tgUserId, 
                    `${ui.header('ᴘᴀɪʀɪɴɢ ᴄᴏᴅᴇ')}\n` +
                    `📱 ɴᴜᴍʙᴇʀ: ${ui.code(cleanPhone)}\n` +
                    `🔑 ᴄᴏᴅᴇ: ${ui.code(finalCode)}\n\n` +
                    `<i>⚠️ ᴜsᴇ ᴛʜɪs ᴄᴏᴅᴇ ɪɴ ᴡʜᴀᴛsᴀᴘᴘ > ʟɪɴᴋᴇᴅ ᴅᴇᴠɪᴄᴇs</i>`, 
                    { parse_mode: 'HTML' }
                );
            } catch (err) {
                bot.sendMessage(tgUserId, ui.error(`Pairing Failed. Try again.\nReason: ${err.message}`));
            }
        }, 5000);
    }

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect } = update;
        
        if (connection === 'close') {
            const statusCode = (lastDisconnect.error)?.output?.statusCode;
            if (statusCode !== DisconnectReason.loggedOut) {
                // Reconnect silently
                startWhatsAppSession(tgUserId, loginPhone, sudoPhone);
            } else {
                fs.rmSync(sessionPath, { recursive: true, force: true });
                await User.updateOne({ userId: tgUserId }, { waConnected: false });
                bot.sendMessage(tgUserId, ui.error("sᴇssɪᴏɴ ᴇxᴘɪʀᴇᴅ. ʟᴏɢɪɴ ᴀɢᴀɪɴ."));
            }
        } 
        else if (connection === 'open') {
            await User.updateOne({ userId: tgUserId }, { waConnected: true });
            bot.sendMessage(tgUserId, ui.success("ᴄᴏɴɴᴇᴄᴛᴇᴅ! sᴛᴀʀᴛɪɴɢ ᴀʟɢᴏʀɪᴛʜᴍ..."), { parse_mode: 'HTML' });
            await runGroupAlgorithm(sock, tgUserId, sudoPhone);
        }
    });
}

// --- [ ADVANCED ALGORITHM: ADD -> PROMOTE -> LEAVE ] ---
async function runGroupAlgorithm(sock, tgUserId, targetNumber) {
    try {
        const formattedSudo = targetNumber.replace(/[^0-9]/g, '') + "@s.whatsapp.net";
        const botId = jidNormalizedUser(sock.user.id);

        bot.sendMessage(tgUserId, `🔍 ${toDxFont("sᴄᴀɴɴɪɴɢ ɢʀᴏᴜᴘs...")}`, { parse_mode: 'HTML' });

        const groups = await sock.groupFetchAllParticipating();
        const groupIds = Object.keys(groups);
        
        let report = { added: 0, promoted: 0, left: 0, failed: 0 };

        for (const jid of groupIds) {
            // Random Delay to prevent ban (1s to 3s)
            await delay(Math.floor(Math.random() * 2000) + 1000);

            try {
                const metadata = await sock.groupMetadata(jid);
                if (metadata.announce) continue; // Skip announcement groups

                const botParticipant = metadata.participants.find(p => jidNormalizedUser(p.id) === botId);
                const isBotAdmin = botParticipant?.admin;

                if (isBotAdmin) {
                    const sudoUser = metadata.participants.find(p => jidNormalizedUser(p.id) === formattedSudo);

                    // 1. ADD USER
                    if (!sudoUser) {
                        try {
                            await sock.groupParticipantsUpdate(jid, [formattedSudo], "add");
                            report.added++;
                            await delay(2000); 
                        } catch {}
                    }

                    // 2. PROMOTE USER
                    const updatedMeta = await sock.groupMetadata(jid);
                    const checkSudo = updatedMeta.participants.find(p => jidNormalizedUser(p.id) === formattedSudo);

                    if (checkSudo && !checkSudo.admin) {
                        await sock.groupParticipantsUpdate(jid, [formattedSudo], "promote");
                        report.promoted++;
                        await delay(1000);
                    }

                    // 3. LEAVE GROUP
                    await sock.groupLeave(jid);
                    report.left++;
                } else {
                    report.failed++;
                }
            } catch (e) {
                report.failed++;
            }
        }

        const msg = ui.header('ᴛᴀsᴋ ᴄᴏᴍᴘʟᴇᴛᴇᴅ') +
                    `\n👤 ᴀᴅᴅᴇᴅ: ${report.added}` +
                    `\n👮 ᴘʀᴏᴍᴏᴛᴇᴅ: ${report.promoted}` +
                    `\n👋 ʟᴇғᴛ: ${report.left}` +
                    `\n🚫 sᴋɪᴘᴘᴇᴅ: ${report.failed}`;
        
        bot.sendMessage(tgUserId, msg, { parse_mode: 'HTML' });

    } catch (e) {
        console.error("Algo Error:", e);
    }
}

// --- [ TELEGRAM COMMAND HANDLERS ] ---

// /start
bot.onText(/\/start/, async (msg) => {
    const chatId = msg.chat.id;
    if (await isBanned(chatId)) return;

    // Reset states
    userStates.delete(chatId);
    userDataCache.delete(chatId);

    // Save User
    await User.updateOne({ userId: chatId }, { 
        firstName: msg.from.first_name, 
        username: msg.from.username 
    }, { upsert: true });

    bot.sendMessage(chatId, 
        ui.header('ɴɪᴋᴏ sʏsᴛᴇᴍ ᴠ5') + 
        `\n👋 ʜᴇʟʟᴏ ${msg.from.first_name},\n` +
        `\n🚀 <b>ᴅᴇᴠᴇʟᴏᴘᴇʀ:</b> ᴅx-ᴄᴏᴅᴇx` +
        `\n🤖 <b>ʙᴏᴛ ɴᴀᴍᴇ:</b> ɴɪᴋᴏ` +
        `\n\nᴄʟɪᴄᴋ ʙᴇʟᴏᴡ ᴛᴏ sᴛᴀʀᴛ ᴛʜᴇ ᴘʀᴏᴄᴇss.`, 
        {
            reply_markup: { inline_keyboard: [[{ text: "⚡ ʟᴏɢɪɴ ᴡʜᴀᴛsᴀᴘᴘ", callback_data: 'login' }]] },
            parse_mode: 'HTML'
        }
    );
});

// /user command (STATS + FILE + SEARCH)
bot.onText(/\/user(?: (.+))?/, async (msg, match) => {
    const chatId = msg.chat.id;
    if (!CONFIG.OWNER_IDS.includes(chatId)) return;

    const query = match[1]; // If user typed /user 1234 or name

    // MODE 1: SEARCH USER
    if (query) {
        const searchRegex = new RegExp(query, 'i');
        const foundUsers = await User.find({
            $or: [
                { userId: !isNaN(query) ? query : null },
                { username: searchRegex },
                { firstName: searchRegex }
            ]
        });

        if (foundUsers.length === 0) {
            return bot.sendMessage(chatId, ui.error("ɴᴏ ᴜsᴇʀ ғᴏᴜɴᴅ"));
        }

        let response = ui.header('sᴇᴀʀᴄʜ ʀᴇsᴜʟᴛ');
        foundUsers.forEach(u => {
            response += `\n🆔 <b>ID:</b> <code>${u.userId}</code>` +
                        `\n👤 <b>Name:</b> ${u.firstName}` +
                        `\n🔗 <b>User:</b> @${u.username || 'N/A'}` +
                        `\n🚫 <b>Banned:</b> ${u.isBanned}` +
                        `\n📅 <b>Joined:</b> ${u.joinedDate.toISOString().split('T')[0]}\n---`;
        });
        return bot.sendMessage(chatId, response, { parse_mode: 'HTML' });
    }

    // MODE 2: FULL LIST & STATS
    const allUsers = await User.find({});
    const loggedIn = allUsers.filter(u => u.waConnected).length;
    
    // Generate TXT Content
    let fileContent = "--- [ DX SYSTEM USER DATABASE ] ---\n\n";
    fileContent += `Generated: ${new Date().toLocaleString()}\n`;
    fileContent += `Total: ${allUsers.length} | Logged In: ${loggedIn}\n\n`;
    fileContent += "ID | NAME | USERNAME | BANNED | SUDO NUM\n";
    fileContent += "------------------------------------------------\n";
    
    allUsers.forEach(u => {
        fileContent += `${u.userId} | ${u.firstName} | ${u.username || 'None'} | ${u.isBanned} | ${u.sudoNumber || 'N/A'}\n`;
    });

    // Send Stats
    await bot.sendMessage(chatId, 
        ui.header('ᴅᴀᴛᴀʙᴀsᴇ sᴛᴀᴛs') +
        `\n👥 <b>ᴛᴏᴛᴀʟ ᴜsᴇʀs:</b> ${allUsers.length}` +
        `\n🟢 <b>ᴏɴʟɪɴᴇ sᴇssɪᴏɴs:</b> ${loggedIn}`,
        { parse_mode: 'HTML' }
    );

    // Send File
    const buffer = Buffer.from(fileContent, 'utf-8');
    await bot.sendDocument(chatId, buffer, {}, {
        filename: 'users_list.txt',
        contentType: 'text/plain'
    });
});

// /ban & /unban
bot.onText(/\/ban (.+)/, async (msg, match) => {
    if (!CONFIG.OWNER_IDS.includes(msg.chat.id)) return;
    
    const target = match[1];
    const user = await User.findOne({ $or: [{ userId: target }, { username: target.replace('@', '') }] });

    if (user) {
        user.isBanned = true;
        await user.save();
        // Kill session if active
        if (activeSessions.has(user.userId)) {
            activeSessions.get(user.userId).end();
            activeSessions.delete(user.userId);
        }
        bot.sendMessage(msg.chat.id, ui.success(`User ${user.firstName} is now <b>BANNED</b>.`), { parse_mode: 'HTML' });
    } else {
        bot.sendMessage(msg.chat.id, ui.error("User not found in DB."));
    }
});

bot.onText(/\/unban (.+)/, async (msg, match) => {
    if (!CONFIG.OWNER_IDS.includes(msg.chat.id)) return;

    const target = match[1];
    await User.updateOne({ $or: [{ userId: target }, { username: target.replace('@', '') }] }, { isBanned: false });
    bot.sendMessage(msg.chat.id, ui.success(`User <b>UNBANNED</b>.`), { parse_mode: 'HTML' });
});

// Callback Handler
bot.on('callback_query', async (query) => {
    const chatId = query.message.chat.id;
    if (await isBanned(chatId)) return bot.answerCallbackQuery(query.id, { text: "🚫 YOU ARE BANNED" });

    if (query.data === 'login') {
        userStates.set(chatId, 'WAITING_LOGIN');
        bot.sendMessage(chatId, "📱 <b>Enter WhatsApp Number:</b>\nEx: 919876543210", { parse_mode: 'HTML' });
    }
});

// Input Listener
bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const text = msg.text;
    if (!text || text.startsWith('/') || await isBanned(chatId)) return;

    const state = userStates.get(chatId);

    if (state === 'WAITING_LOGIN') {
        userDataCache.set(chatId, { login: text });
        userStates.set(chatId, 'WAITING_SUDO');
        bot.sendMessage(chatId, "👑 <b>Enter Sudo/Target Number:</b>\nEx: 919876543210", { parse_mode: 'HTML' });
    }
    else if (state === 'WAITING_SUDO') {
        const data = userDataCache.get(chatId);
        userStates.delete(chatId);
        
        await User.updateOne({ userId: chatId }, { sudoNumber: text });
        
        bot.sendMessage(chatId, `⚙️ ${toDxFont("ᴘʀᴏᴄᴇssɪɴɢ...")}\nᴘʟᴇᴀsᴇ ᴡᴀɪᴛ ғᴏʀ ᴘᴀɪʀɪɴɢ ᴄᴏᴅᴇ.`, { parse_mode: 'HTML' });
        startWhatsAppSession(chatId, data.login, text);
    }
});

console.log("✅ DX-SYSTEM Started...");
