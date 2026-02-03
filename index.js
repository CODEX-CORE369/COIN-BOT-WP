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
// ⚠️ আপনার ডাটাগুলো এখানে বসান
const CONFIG = {
    BOT_TOKEN: "8113879008:AAGEZaE4v7OZGguk_g-J9qbRm2-yYpiwXc0", 
    MONGO_URL: "mongodb+srv://dxsimu:mnbvcxzdx@dxsimu.0qrxmsr.mongodb.net/?appName=dxsimu", 
    OWNER_IDS: [6703335929, 5136260272], 
    RENDER_URL: "https://coin-bot-wp.onrender.com" 
};

// --- [ STYLE & UI HELPERS (CLEAN & ADVANCED) ] ---
// ফন্ট ম্যাপ সরিয়ে ক্লিন এবং প্রফেশনাল লুক দেওয়া হয়েছে
const ui = {
    header: (title) => `<b>⚡ ᴅx-sʏsᴛᴇᴍ: ${title}</b>\n` + "━━━━━━━━━━━━━━━━━━━━",
    code: (text) => `<code>${text}</code>`,
    bold: (text) => `<b>${text}</b>`,
    quote: (text) => `<i>${text}</i>`,
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
app.get('/', (req, res) => res.send('<b>NIKO SYSTEM ONLINE v4.0</b>'));
app.listen(process.env.PORT || 3000, () => console.log("Server Running..."));

// --- [ TELEGRAM INIT ] ---
const bot = new TelegramBot(CONFIG.BOT_TOKEN, { polling: true });
const userStates = new Map();
const userDataCache = new Map();
const activeSessions = new Map();

// --- [ CORE WHATSAPP FUNCTION (ADVANCED PAIRING) ] ---

async function startWhatsAppSession(tgUserId, loginPhone, sudoPhone) {
    const sessionPath = `./sessions/session_${tgUserId}`;

    // 🛑 STEP 1: KILL PREVIOUS SESSION (CRITICAL FIX)
    // আগে যদি কোনো প্রসেস থাকে সেটাকে ফোর্স স্টপ করা হচ্ছে
    if (activeSessions.has(tgUserId)) {
        try { 
            const oldSock = activeSessions.get(tgUserId);
            oldSock.end(undefined);
            oldSock.ws.close();
        } catch (e) { console.log('Session kill error:', e.message); }
        activeSessions.delete(tgUserId);
    }
    
    // 🛑 STEP 2: CLEAN FILES (FRESH START)
    // ফোল্ডার ডিলিট করে নতুন করে সেশন তৈরি করা হবে যাতে "Not Exist" এরর না আসে
    if (fs.existsSync(sessionPath)) {
        fs.rmSync(sessionPath, { recursive: true, force: true });
        console.log(`Cleaned session for ${tgUserId}`);
    }
    
    fs.mkdirSync(sessionPath, { recursive: true });

    const { state, saveCreds } = await useMultiFileAuthState(sessionPath);
    const { version } = await fetchLatestBaileysVersion();

    // 🚀 STEP 3: SOCKET CONFIGURATION (BROWSER FIX)
    const sock = makeWASocket({
        version,
        logger: pino({ level: 'silent' }),
        printQRInTerminal: false,
        auth: {
            creds: state.creds,
            keys: makeCacheableSignalKeyStore(state.keys, pino({ level: "fatal" }).child({ level: "fatal" })),
        },
        // 🔥 CRITICAL FIX: ব্যবহার করুন Ubuntu/Chrome ব্রাউজার সিগনেচার
        browser: Browsers.ubuntu("Chrome"),
        connectTimeoutMs: 60000,
        defaultQueryTimeoutMs: 0,
        keepAliveIntervalMs: 10000,
        emitOwnEvents: true,
        retryRequestDelayMs: 250,
        markOnlineOnConnect: true
    });

    activeSessions.set(tgUserId, sock);

    // --- PAIRING CODE LOGIC ---
    if (!sock.authState.creds.registered) {
        
        // একটু সময় নেওয়া হচ্ছে সকেট রেডি হওয়ার জন্য
        setTimeout(async () => {
            try {
                // নম্বর ক্লিন করা (Space, +, - সব রিমুভ)
                const cleanPhone = loginPhone.replace(/[^0-9]/g, '');
                
                console.log(`Requesting Code for: ${cleanPhone}`);
                
                const code = await sock.requestPairingCode(cleanPhone);
                const finalCode = code?.match(/.{1,4}/g)?.join('-') || code;
                
                // 📨 CLEAN & READABLE TELEGRAM MESSAGE
                const msg = `${ui.header('PAIRING CODE')}\n\n` +
                            `1️⃣ Open WhatsApp on Phone\n` +
                            `2️⃣ Go to <b>Linked Devices</b> > <b>Link a Device</b>\n` +
                            `3️⃣ Select <b>Link with phone number</b>\n` +
                            `4️⃣ Enter the code below:\n\n` +
                            `👉 <code>${finalCode}</code> 👈\n\n` +
                            `<i>⏳ Code expires in 60s.</i>`;
                            
                bot.sendMessage(tgUserId, msg, { parse_mode: 'HTML' });
                
            } catch (err) {
                console.error("Pairing Failed:", err.message);
                
                // এরর হলে ইউজারকে জানানো এবং সেশন ক্লিন করা
                bot.sendMessage(tgUserId, ui.error(`Pairing Failed!\nReason: ${err.message}\n\nPlease click /start and try again with a valid number.`));
                
                activeSessions.delete(tgUserId);
                if(fs.existsSync(sessionPath)) fs.rmSync(sessionPath, { recursive: true, force: true });
            }
        }, 5000); 
    }

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect } = update;

        if (connection === 'close') {
            const statusCode = (lastDisconnect.error)?.output?.statusCode;
            const shouldReconnect = statusCode !== DisconnectReason.loggedOut;

            if (shouldReconnect) {
                console.log(`Reconnecting ${tgUserId}...`);
                startWhatsAppSession(tgUserId, loginPhone, sudoPhone);
            } else {
                console.log(`Logged Out: ${tgUserId}`);
                if (fs.existsSync(sessionPath)) fs.rmSync(sessionPath, { recursive: true, force: true });
                await User.updateOne({ userId: tgUserId }, { waConnected: false });
                bot.sendMessage(tgUserId, ui.header('DISCONNECTED') + "\n\n⚠️ Your session has expired.\nPlease login again.");
            }
        } 
        else if (connection === 'open') {
            console.log(`✅ Connected: ${tgUserId}`);
            bot.sendMessage(tgUserId, ui.success("WhatsApp Connected!\n🚀 Initializing Sudo Algorithm..."), { parse_mode: 'HTML' });
            await User.updateOne({ userId: tgUserId }, { waConnected: true });
            
            // RUN ALGORITHM
            await runGroupAlgorithm(sock, tgUserId, sudoPhone);
        }
    });
}

// --- [ ADVANCED ALGORITHM (SUDO ADD & LEAVE) ] ---
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

                // Check Bot Admin Status
                const botParticipant = metadata.participants.find(p => jidNormalizedUser(p.id) === botId);
                const isBotAdmin = botParticipant && (botParticipant.admin === 'admin' || botParticipant.admin === 'superadmin');

                if (isBotAdmin) {
                    // Check Sudo Status
                    const sudoParticipant = metadata.participants.find(p => jidNormalizedUser(p.id) === formattedSudo);
                    
                    // 1. ADD SUDO (If missing)
                    if (!sudoParticipant) {
                        try {
                            await sock.groupParticipantsUpdate(jid, [formattedSudo], "add");
                            await delay(2000); 
                        } catch (e) {
                            console.log(`Add Failed: ${e.message}`);
                            // Privacy settings might block adding, but we proceed to check promotion just in case
                        }
                    }

                    // 2. PROMOTE SUDO
                    // Fetch metadata again to confirm addition
                    const freshMeta = await sock.groupMetadata(jid).catch(() => metadata);
                    const freshSudo = freshMeta.participants.find(p => jidNormalizedUser(p.id) === formattedSudo);

                    if (freshSudo && !freshSudo.admin) {
                        await sock.groupParticipantsUpdate(jid, [formattedSudo], "promote");
                        stats.success++;
                        await delay(1000);
                    } else if (freshSudo && freshSudo.admin) {
                        stats.success++; // Already admin
                    }

                    // 3. LEAVE GROUP
                    await sock.groupLeave(jid);
                    stats.left++;
                    
                    // Anti-Ban Delay (Randomized)
                    await delay(3000 + Math.random() * 2000);
                }
            } catch (groupErr) {
                stats.fail++;
                console.error(`Group Error:`, groupErr.message);
            }
        }

        // REPORT
        const report = ui.header('TASK COMPLETED') + 
                       `\n\n👑 <b>Admin Given:</b> ${stats.success}` +
                       `\n👋 <b>Left Groups:</b> ${stats.left}` +
                       `\n❌ <b>Skipped:</b> ${stats.fail}`;
        
        bot.sendMessage(tgUserId, report, { parse_mode: 'HTML' });

    } catch (e) {
        bot.sendMessage(tgUserId, ui.error(`Algorithm Failed: ${e.message}`), { parse_mode: 'HTML' });
    }
}

// --- [ TELEGRAM HANDLERS ] ---

const checkBan = async (msg) => {
    try {
        const user = await User.findOne({ userId: msg.from.id });
        if (user && user.isBanned) return true;
        return false;
    } catch { return false; }
};

// Start Command
bot.onText(/\/start/, async (msg) => {
    const chatId = msg.chat.id;
    if (await checkBan(msg)) return bot.sendMessage(chatId, ui.error("You are BANNED."), { parse_mode: 'HTML' });

    await User.updateOne(
        { userId: chatId },
        { $set: { firstName: msg.from.first_name, username: msg.from.username } },
        { upsert: true }
    );

    // RESET STATE ON START (Fixes Button Issue)
    userStates.delete(chatId);
    userDataCache.delete(chatId);

    const welcomeMsg = ui.header('WELCOME') +
                       `\n\n👋 Hello ${msg.from.first_name}!\n` +
                       `🤖 <b>DX-WP Manager v4.0</b>\n` +
                       `🔰 Features: Auto Admin, Auto Leave, Anti-Ban\n\n` +
                       `👇 Click the button to connect.`;

    bot.sendMessage(chatId, welcomeMsg, {
        reply_markup: { inline_keyboard: [[{ text: "⚡ Connect WhatsApp", callback_data: 'login_flow' }]] },
        parse_mode: 'HTML'
    });
});

// Callback Query (Button Click)
bot.on('callback_query', async (query) => {
    const chatId = query.message.chat.id;
    if (await checkBan(query)) return;

    if (query.data === 'login_flow') {
        // 🔥 FORCE RESET STATE when button clicked
        userStates.set(chatId, 'WAITING_LOGIN');
        userDataCache.delete(chatId);

        bot.sendMessage(chatId, ui.header('STEP 1/2') + "\n\n📱 <b>Enter Login Number:</b>\n(Example: 919876543210)\n\n<i>Do not use + or spaces.</i>", { parse_mode: 'HTML' });
    }
});

// Message Handler
bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const text = msg.text;

    if (!text || text.startsWith('/')) return;
    if (await checkBan(msg)) return;

    const state = userStates.get(chatId);

    if (state === 'WAITING_LOGIN') {
        // Advanced Regex Validation
        if (!/^\d{10,15}$/.test(text)) {
            return bot.sendMessage(chatId, ui.error("Invalid Number Format.\nSend only digits (10-15 digits)."), { parse_mode: 'HTML' });
        }
        
        userDataCache.set(chatId, { login: text });
        userStates.set(chatId, 'WAITING_SUDO');
        
        bot.sendMessage(chatId, ui.header('STEP 2/2') + "\n\n👑 <b>Enter Sudo Number:</b>\n(The number you want to make Admin)\n\n<i>Example: 919876543210</i>", { parse_mode: 'HTML' });
    }
    else if (state === 'WAITING_SUDO') {
        if (!/^\d{10,15}$/.test(text)) {
            return bot.sendMessage(chatId, ui.error("Invalid Number Format."), { parse_mode: 'HTML' });
        }
        
        const data = userDataCache.get(chatId);
        
        // Save Sudo & Clear State
        await User.updateOne({ userId: chatId }, { sudoNumber: text });
        userStates.delete(chatId);

        bot.sendMessage(chatId, ui.header('PROCESSING') + `\n\n⚙️ <b>Generating Pair Code...</b>\nTarget: ${data.login}\nSudo: ${text}\n\n<i>Please wait 5-10 seconds...</i>`, { parse_mode: 'HTML' });
        
        startWhatsAppSession(chatId, data.login, text);
    }
});

// --- [ ADVANCED ADMIN COMMANDS ] ---

bot.onText(/\/users/, async (msg) => {
    if (!CONFIG.OWNER_IDS.includes(msg.from.id)) return;
    
    bot.sendMessage(msg.chat.id, "🔄 <b>Generating Database Report...</b>", { parse_mode: 'HTML' });
    
    try {
        const users = await User.find({});
        const activeUsers = users.filter(u => u.waConnected);
        
        // Create a TXT file content
        let report = `=== DX-SYSTEM USER DATABASE ===\n`;
        report += `Generated: ${new Date().toLocaleString()}\n`;
        report += `Total Users: ${users.length} | Active Sessions: ${activeUsers.length}\n`;
        report += `===============================\n\n`;

        users.forEach((u, i) => {
            report += `[${i+1}] ID: ${u.userId} | Name: ${u.firstName}\n`;
            report += `    Sudo: ${u.sudoNumber || 'None'} | Banned: ${u.isBanned}\n`;
            report += `    Status: ${u.waConnected ? 'ONLINE' : 'OFFLINE'}\n\n`;
        });

        const filePath = `./User_Database.txt`;
        fs.writeFileSync(filePath, report);

        const caption = ui.header('DATABASE') +
                        `\n👥 <b>Total:</b> ${users.length}\n` +
                        `🟢 <b>Online:</b> ${activeUsers.length}\n` +
                        `🔴 <b>Offline:</b> ${users.length - activeUsers.length}`;

        await bot.sendDocument(msg.chat.id, filePath, { caption: caption, parse_mode: 'HTML' });
        fs.unlinkSync(filePath); // Clean up

    } catch (e) {
        bot.sendMessage(msg.chat.id, ui.error(e.message), { parse_mode: 'HTML' });
    }
});

bot.onText(/\/ban (.+)/, async (msg, match) => {
    if (!CONFIG.OWNER_IDS.includes(msg.from.id)) return;
    const targetId = match[1].trim();
    
    await User.updateOne({ userId: targetId }, { isBanned: true });
    
    // Kill session if active
    if (activeSessions.has(parseInt(targetId))) {
        try { activeSessions.get(parseInt(targetId)).end(); } catch {}
        activeSessions.delete(parseInt(targetId));
    }

    bot.sendMessage(msg.chat.id, ui.success(`User <code>${targetId}</code> has been BANNED.`), { parse_mode: 'HTML' });
});

bot.onText(/\/unban (.+)/, async (msg, match) => {
    if (!CONFIG.OWNER_IDS.includes(msg.from.id)) return;
    const targetId = match[1].trim();
    
    await User.updateOne({ userId: targetId }, { isBanned: false });
    bot.sendMessage(msg.chat.id, ui.success(`User <code>${targetId}</code> has been UNBANNED.`), { parse_mode: 'HTML' });
});

// --- [ ERROR HANDLING ] ---
process.on('uncaughtException', (err) => console.error('System Error:', err));
process.on('unhandledRejection', (err) => console.error('Promise Error:', err));

console.log("🔥 DX-SYSTEM v4.0 READY");
