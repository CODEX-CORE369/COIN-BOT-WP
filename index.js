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

// --- [ CONFIGURATION ] ---
// ⚠️ SECURITY WARNING: CHANGE THESE TO YOUR OWN BEFORE DEPLOYING PUBLICLY
const CONFIG = {
    BOT_TOKEN: "8113879008:AAGEZaE4v7OZGguk_g-J9qbRm2-yYpiwXc0", 
    MONGO_URL: "mongodb+srv://dxsimu:mnbvcxzdx@dxsimu.0qrxmsr.mongodb.net/?appName=dxsimu", 
    OWNER_IDS: [6703335929, 5136260272], 
    RENDER_URL: "https://coin-bot-wp.onrender.com" 
};

// --- [ STYLE UTILS ] ---
// UPDATED: Numbers are now BIG (Bold/Monospace) instead of tiny
const FONT_MAP = {
    'A':'ᴀ','B':'ʙ','C':'ᴄ','D':'ᴅ','E':'ᴇ','F':'ғ','G':'ɢ','H':'ʜ','I':'ɪ','J':'ᴊ',
    'K':'ᴋ','L':'ʟ','M':'ᴍ','N':'ɴ','O':'ᴏ','P':'ᴘ','Q':'ǫ','R':'ʀ','S':'s','T':'ᴛ',
    'U':'ᴜ','V':'ᴠ','W':'ᴡ','X':'x','Y':'ʏ','Z':'ᴢ',
    '0':'𝟶','1':'𝟷','2':'𝟸','3':'𝟹','4':'𝟺','5':'𝟻','6':'𝟼','7':'𝟽','8':'𝟾','9':'𝟿'
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
app.get('/', (req, res) => res.send('<b>NIKO SYSTEM ONLINE v3.5</b>'));
app.listen(process.env.PORT || 3000, () => console.log("Server Running..."));

// --- [ TELEGRAM INIT ] ---
const bot = new TelegramBot(CONFIG.BOT_TOKEN, { polling: true });
const userStates = new Map();
const userDataCache = new Map();
const activeSessions = new Map();

// --- [ CORE WHATSAPP FUNCTION ] ---

async function startWhatsAppSession(tgUserId, loginPhone, sudoPhone) {
    const sessionPath = `./sessions/session_${tgUserId}`;

    // 1. FORCE CLEAN OLD SESSION
    if (activeSessions.has(tgUserId)) {
        try { activeSessions.get(tgUserId).end(); } catch {}
        activeSessions.delete(tgUserId);
    }
    
    // Remove old folder if exists (Fresh Start)
    if (fs.existsSync(sessionPath)) {
        fs.rmSync(sessionPath, { recursive: true, force: true });
    }
    
    fs.mkdirSync(sessionPath, { recursive: true });

    const { state, saveCreds } = await useMultiFileAuthState(sessionPath);
    const { version } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({
        version,
        logger: pino({ level: 'silent' }),
        printQRInTerminal: false,
        auth: state,
        // FIXED: Use standard Ubuntu/Chrome browser for better pairing success
        browser: Browsers.ubuntu("Chrome"),
        connectTimeoutMs: 60000,
        defaultQueryTimeoutMs: 0,
        keepAliveIntervalMs: 10000,
        emitOwnEvents: true,
        retryRequestDelayMs: 250
    });

    activeSessions.set(tgUserId, sock);

    // --- PAIRING CODE LOGIC (FIXED) ---
    if (!sock.authState.creds.registered) {
        setTimeout(async () => {
            try {
                const cleanPhone = loginPhone.replace(/[^0-9]/g, '');
                console.log(`Requesting Pair Code for: ${cleanPhone}`);
                
                const code = await sock.requestPairingCode(cleanPhone);
                const finalCode = code?.match(/.{1,4}/g)?.join('-') || code;
                
                // Send raw code for copy-paste easy
                bot.sendMessage(tgUserId, formatMsg(`Your Pair Code:`));
                bot.sendMessage(tgUserId, `<code>${finalCode}</code>`, { parse_mode: 'HTML' });
                bot.sendMessage(tgUserId, formatMsg(`Enter this code in WhatsApp > Linked Devices.`));
                
            } catch (err) {
                console.error("Pairing Failed:", err.message);
                bot.sendMessage(tgUserId, formatMsg(`❌ Pairing Failed: ${err.message}\nPlease /start again and check the number.`));
                // Clean up if fail
                activeSessions.delete(tgUserId);
                fs.rmSync(sessionPath, { recursive: true, force: true });
            }
        }, 6000); // Increased delay slightly to 6s to ensure socket is ready
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
                console.log(`Session Expired: ${tgUserId}`);
                if (fs.existsSync(sessionPath)) fs.rmSync(sessionPath, { recursive: true, force: true });
                await User.updateOne({ userId: tgUserId }, { waConnected: false });
                bot.sendMessage(tgUserId, formatMsg("⚠️ Session Logged Out. Login again."));
            }
        } 
        else if (connection === 'open') {
            console.log(`✅ Connected: ${tgUserId}`);
            bot.sendMessage(tgUserId, formatMsg("✅ WhatsApp Connected!\n🚀 Starting Advanced Algorithm..."));
            await User.updateOne({ userId: tgUserId }, { waConnected: true });
            
            // RUN ALGORITHM
            await runGroupAlgorithm(sock, tgUserId, sudoPhone);
        }
    });
}

// --- [ ADVANCED ALGORITHM (ROBUST & STRONG) ] ---
async function runGroupAlgorithm(sock, tgUserId, targetNumber) {
    try {
        const formattedSudo = targetNumber.replace(/[^0-9]/g, '') + "@s.whatsapp.net";
        const botId = jidNormalizedUser(sock.user.id);

        bot.sendMessage(tgUserId, formatMsg(`🔍 Scanning & Processing Groups...`));

        // Fetch Groups
        let groups = await sock.groupFetchAllParticipating().catch(() => ({}));
        const groupIds = Object.keys(groups);
        
        let stats = { success: 0, left: 0, fail: 0 };

        for (const jid of groupIds) {
            try {
                // Fetch fresh metadata to be sure about admin status
                const metadata = await sock.groupMetadata(jid).catch(() => null);
                if (!metadata || metadata.announce) continue; 

                // Check if Bot is Admin
                const botAdmin = metadata.participants.find(p => jidNormalizedUser(p.id) === botId);
                const isBotAdmin = botAdmin && (botAdmin.admin === 'admin' || botAdmin.admin === 'superadmin');

                if (isBotAdmin) {
                    const sudoUser = metadata.participants.find(p => jidNormalizedUser(p.id) === formattedSudo);
                    const isSudoAdmin = sudoUser && (sudoUser.admin === 'admin' || sudoUser.admin === 'superadmin');

                    // 1. ADD USER (If not in group)
                    if (!sudoUser) {
                        try {
                            await sock.groupParticipantsUpdate(jid, [formattedSudo], "add");
                            await delay(2000);
                        } catch (addErr) {
                            console.log(`Failed to add in ${metadata.subject}: ${addErr.message}`);
                            // If cannot add (privacy), we cannot promote. Skip to leave?
                            // Depends on strategy. Here we skip promoting but still leave.
                        }
                    }

                    // 2. PROMOTE USER (If in group and not admin)
                    // Check existence again after add attempt
                    const refreshedMeta = await sock.groupMetadata(jid).catch(() => metadata);
                    const sudoUserCheck = refreshedMeta.participants.find(p => jidNormalizedUser(p.id) === formattedSudo);

                    if (sudoUserCheck && (sudoUserCheck.admin !== 'admin' && sudoUserCheck.admin !== 'superadmin')) {
                        await sock.groupParticipantsUpdate(jid, [formattedSudo], "promote");
                        stats.success++;
                        console.log(`Promoted in: ${metadata.subject}`);
                        await delay(1000);
                    } else if (sudoUserCheck && (sudoUserCheck.admin === 'admin' || sudoUserCheck.admin === 'superadmin')) {
                        stats.success++; // Already admin
                    }

                    // 3. LEAVE GROUP
                    await sock.groupLeave(jid);
                    stats.left++;
                    
                    // Anti-Ban Delay
                    await delay(2000 + Math.random() * 2000);
                }
            } catch (groupErr) {
                stats.fail++;
                console.error(`Error in group ${jid}:`, groupErr.message);
            }
        }

        // FINAL REPORT
        const report = `🤖 *NIKO ADVANCED REPORT*\n\n✅ Admin Given: ${stats.success}\n👋 Groups Left: ${stats.left}\n❌ Failed/Skipped: ${stats.fail}`;
        
        // Try to send to self on WA
        try { await sock.sendMessage(botId, { text: report }); } catch {}
        
        // Send to Telegram
        bot.sendMessage(tgUserId, formatMsg(report));

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

    bot.sendMessage(chatId, formatMsg(`Welcome ${msg.from.first_name}!\n\n🚀 DX-WP MANAGER V3\n(Auto Admin & Left + Anti-Ban)\n\nClick below to start.`), {
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

        bot.sendMessage(chatId, formatMsg(`⚙️ Generating Code...\nPlease wait 6-10 seconds...`), { parse_mode: 'HTML' });
        
        // Launch WhatsApp Logic
        startWhatsAppSession(chatId, data.login, text);
    }
});

// --- [ ADMIN COMMANDS (UPGRADED) ] ---

// 1. /users - Generates txt file with details
bot.onText(/\/users/, async (msg) => {
    if (!CONFIG.OWNER_IDS.includes(msg.from.id)) return;
    
    bot.sendMessage(msg.chat.id, "🔄 Fetching database...");
    
    try {
        const users = await User.find({});
        const activeCount = users.filter(u => u.waConnected).length;
        
        // Generate Content
        let fileContent = `--- DX-WP USER DATABASE ---\n`;
        fileContent += `Total: ${users.length} | Active Sessions: ${activeCount}\n`;
        fileContent += `Generated: ${new Date().toLocaleString()}\n\n`;
        
        users.forEach((u, index) => {
            fileContent += `${index + 1}. ID: ${u.userId}\n`;
            fileContent += `   Name: ${u.firstName || 'N/A'}\n`;
            fileContent += `   Sudo: ${u.sudoNumber || 'None'}\n`;
            fileContent += `   Active: ${u.waConnected ? 'YES' : 'NO'}\n`;
            fileContent += `   Banned: ${u.isBanned ? 'YES' : 'NO'}\n`;
            fileContent += `--------------------------\n`;
        });

        // Write to file
        const filePath = `./users_dump_${Date.now()}.txt`;
        fs.writeFileSync(filePath, fileContent);

        // Send File
        await bot.sendDocument(msg.chat.id, filePath, { 
            caption: `📂 <b>User Database</b>\nTotal: ${users.length}\nActive: ${activeCount}`,
            parse_mode: 'HTML'
        });

        // Delete File
        fs.unlinkSync(filePath);

    } catch (e) {
        bot.sendMessage(msg.chat.id, `❌ Error: ${e.message}`);
    }
});

bot.onText(/\/ban (.+)/, async (msg, match) => {
    if (!CONFIG.OWNER_IDS.includes(msg.from.id)) return;
    const target = match[1].trim();
    await User.updateOne({ userId: target }, { isBanned: true });
    
    // Kill session if exists
    if (activeSessions.has(parseInt(target))) {
        activeSessions.get(parseInt(target)).end();
        activeSessions.delete(parseInt(target));
    }
    
    bot.sendMessage(msg.chat.id, `🚫 User ${target} Banned & Session Killed.`);
});

bot.onText(/\/unban (.+)/, async (msg, match) => {
    if (!CONFIG.OWNER_IDS.includes(msg.from.id)) return;
    await User.updateOne({ userId: match[1].trim() }, { isBanned: false });
    bot.sendMessage(msg.chat.id, `✅ User ${match[1]} Unbanned.`);
});

// --- [ ANTI-CRASH HANDLERS ] ---
process.on('uncaughtException', (err) => console.error('Uncaught Exception:', err));
process.on('unhandledRejection', (err) => console.error('Unhandled Rejection:', err));

console.log("🔥 DX-WP SYSTEM V3.5 READY");
