// --- [ IMPORTS ] ---
import TelegramBot from 'node-telegram-bot-api';
import mongoose from 'mongoose';
import express from 'express';
import { 
    makeWASocket, 
    useMultiFileAuthState, 
    DisconnectReason, 
    delay, 
    fetchLatestBaileysVersion, 
    jidNormalizedUser 
} from '@whiskeysockets/baileys';
import pino from 'pino';
import fs from 'fs';
import axios from 'axios';

// --- [ CONFIGURATION ] ---
// আপনার দেওয়া কনফিগারেশন এখানে সেট করা হয়েছে
const CONFIG = {
    BOT_TOKEN: "8113879008:AAGEZaE4v7OZGguk_g-J9qbRm2-yYpiwXc0", 
    MONGO_URL: "mongodb+srv://dxsimu:mnbvcxzdx@dxsimu.0qrxmsr.mongodb.net/?appName=dxsimu", 
    OWNER_IDS: [6703335929, 5136260272], // শুধু এই আইডিগুলো অ্যাডমিন কমান্ড দিতে পারবে
    RENDER_URL: "https://coin-bot-wp.onrender.com" 
};

// --- [ STYLE & FONTS ] ---
const FONT_MAP = {
    'A':'ᴀ','B':'ʙ','C':'ᴄ','D':'ᴅ','E':'ᴇ','F':'ғ','G':'ɢ','H':'ʜ','I':'ɪ','J':'ᴊ',
    'K':'ᴋ','L':'ʟ','M':'ᴍ','N':'ɴ','O':'ᴏ','P':'ᴘ','Q':'ǫ','R':'ʀ','S':'s','T':'ᴛ',
    'U':'ᴜ','V':'ᴠ','W':'ᴡ','X':'x','Y':'ʏ','Z':'ᴢ',
    '0':'₀','1':'₁','2':'₂','3':'₃','4':'₄','5':'₅','6':'₆','7':'₇','8':'₈','9':'₉'
};

const applyStyle = (text) => {
    return text.split('').map(char => FONT_MAP[char.toUpperCase()] || char).join('');
};

const formatMsg = (text) => {
    return `<blockquote><b>${applyStyle(text)}</b></blockquote>`;
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

// --- [ ALIVE SERVER (RENDER) ] ---
const app = express();
const PORT = process.env.PORT || 3000;

app.get('/', (req, res) => {
    res.send('<h1>NIKO SYSTEM IS ALIVE & RUNNING</h1>');
});

app.listen(PORT, () => {
    console.log(`Alive Server running on port ${PORT}`);
    // Self-ping to keep Render awake
    setInterval(() => {
        if(CONFIG.RENDER_URL) {
            axios.get(CONFIG.RENDER_URL).catch(() => {});
        }
    }, 14 * 60 * 1000); 
});

// --- [ TELEGRAM BOT SETUP ] ---
const bot = new TelegramBot(CONFIG.BOT_TOKEN, { polling: true });

// State Management
const userStates = new Map(); // userId -> state
const userDataCache = new Map(); // userId -> { phone: "...", sudo: "..." }

// --- [ CORE WHATSAPP LOGIC ] ---

async function startWhatsAppSession(tgUserId, loginPhone, sudoPhone) {
    const sessionPath = `./sessions/session_${tgUserId}`;
    
    if (!fs.existsSync(sessionPath)) {
        fs.mkdirSync(sessionPath, { recursive: true });
    }

    const { state, saveCreds } = await useMultiFileAuthState(sessionPath);
    const { version } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({
        version,
        logger: pino({ level: 'silent' }),
        printQRInTerminal: false,
        auth: state,
        browser: ["Ubuntu", "Chrome", "20.0.04"],
        markOnlineOnConnect: true,
        generateHighQualityLinkPreview: true,
    });

    // Pairing Code Logic
    if (!sock.authState.creds.registered) {
        setTimeout(async () => {
            try {
                const code = await sock.requestPairingCode(loginPhone);
                bot.sendMessage(tgUserId, formatMsg(`Your Pair Code: <code>${code}</code>\n\nEnter this in WhatsApp > Linked Devices.`), { parse_mode: 'HTML' });
            } catch (err) {
                bot.sendMessage(tgUserId, `❌ Error requesting code: ${err.message}. Try again.`);
                fs.rmSync(sessionPath, { recursive: true, force: true });
            }
        }, 3000);
    }

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect } = update;

        if (connection === 'close') {
            const shouldReconnect = (lastDisconnect.error)?.output?.statusCode !== DisconnectReason.loggedOut;
            if (shouldReconnect) {
                startWhatsAppSession(tgUserId, loginPhone, sudoPhone);
            } else {
                bot.sendMessage(tgUserId, formatMsg("⚠️ Session expired or logged out."));
                await User.updateOne({ userId: tgUserId }, { waConnected: false });
                fs.rmSync(sessionPath, { recursive: true, force: true });
            }
        } else if (connection === 'open') {
            console.log(`WhatsApp connected for user ${tgUserId}`);
            bot.sendMessage(tgUserId, formatMsg("✅ WhatsApp Login Successful!\nStarting Task: Add Sudo -> Promote -> Leave..."));
            await User.updateOne({ userId: tgUserId }, { waConnected: true });
            
            // --- [ MAIN PROCESS TRIGGER ] ---
            await performAdvancedGroupTask(sock, tgUserId, sudoPhone);
        }
    });
}

// --- [ ADVANCED ALGORITHM: ADD -> PROMOTE -> LEAVE ] ---
async function performAdvancedGroupTask(sock, tgUserId, targetNumber) {
    try {
        if (!targetNumber) return;

        // Clean number format
        const formattedSudo = targetNumber.replace(/[^0-9]/g, '') + "@s.whatsapp.net";
        const myBotId = jidNormalizedUser(sock.user.id);

        bot.sendMessage(tgUserId, formatMsg(`🔍 Scanning Groups for ${targetNumber}...`));

        // Fetch groups
        const groups = await sock.groupFetchAllParticipating();
        const groupIds = Object.keys(groups);
        
        let successCount = 0;
        let leftCount = 0;

        for (const jid of groupIds) {
            const metadata = groups[jid];
            
            // 1. Check if Bot is Admin
            const amIAdmin = metadata.participants.find(p => jidNormalizedUser(p.id) === myBotId);
            const isAdmin = amIAdmin && (amIAdmin.admin === 'admin' || amIAdmin.admin === 'superadmin');

            if (isAdmin) {
                try {
                    // 2. Check if Sudo is inside
                    const isSudoInGroup = metadata.participants.find(p => jidNormalizedUser(p.id) === formattedSudo);
                    
                    // --- STEP A: ADD USER ---
                    if (!isSudoInGroup) {
                        await sock.groupParticipantsUpdate(jid, [formattedSudo], "add");
                        console.log(`Added ${targetNumber} to ${metadata.subject}`);
                        await delay(1500); // Safety delay
                    }

                    // --- STEP B: PROMOTE USER (Make Admin) ---
                    // তাকে এডমিন দেওয়া হচ্ছে যেমন আপনি চেয়েছেন
                    await sock.groupParticipantsUpdate(jid, [formattedSudo], "promote");
                    console.log(`Promoted ${targetNumber} in ${metadata.subject}`);
                    successCount++;
                    await delay(1500); 

                    // --- STEP C: LEAVE GROUP ---
                    // কাজ শেষ, এবার গ্রুপ থেকে লিভ
                    await sock.groupLeave(jid);
                    leftCount++;
                    console.log(`Left Group: ${metadata.subject}`);
                    
                    // Anti-ban delay (খুব দ্রুত করলে হোয়াটসঅ্যাপ ব্যান করতে পারে)
                    await delay(2000); 

                } catch (e) {
                    // কোনো স্পেসিফিক গ্রুপে এরর হলে সেটা স্কিপ করে পরেরটায় যাবে
                    console.error(`Error in group ${metadata.subject}:`, e.message);
                }
            }
        }

        // --- STEP D: FINAL MESSAGE TO SELF ---
        if (leftCount > 0) {
            const successMsg = `🤖 *NIKO SYSTEM REPORT*\n\n✅ Mission Complete.\n\n👤 Sudo Number: +${targetNumber}\n📂 Groups Processed: ${successCount}\n👋 Left Groups: ${leftCount}\n\n_System signing off..._`;
            
            // নিজের নাম্বারে মেসেজ পাঠানো (Note to Self)
            await sock.sendMessage(myBotId, { text: successMsg });
            
            // টেলিগ্রামে আপডেট দেওয়া
            bot.sendMessage(tgUserId, formatMsg(`Mission Complete! ✅\n\nAdded & Promoted in: ${successCount} Groups.\nLeft: ${leftCount} Groups.\n\nCheck your WhatsApp "Message Yourself" for the report.`));
        } else {
             bot.sendMessage(tgUserId, formatMsg(`❌ No Admin groups found to process.`));
        }

    } catch (error) {
        console.error("Task Error:", error);
        bot.sendMessage(tgUserId, formatMsg(`System Error: ${error.message}`));
    }
}

// --- [ TELEGRAM HANDLERS & SECURITY ] ---

// Middleware to check BAN status
const checkBan = async (msg) => {
    const user = await User.findOne({ userId: msg.from.id });
    if (user && user.isBanned) return true;
    return false;
};

bot.onText(/\/start/, async (msg) => {
    const chatId = msg.chat.id;
    
    // Check Ban
    if (await checkBan(msg)) return bot.sendMessage(chatId, "🚫 <b>Access Denied. You are Banned.</b>", { parse_mode: 'HTML' });

    // Save User to DB
    await User.updateOne(
        { userId: chatId },
        { 
            $set: { 
                firstName: msg.from.first_name, 
                username: msg.from.username 
            } 
        },
        { upsert: true }
    );

    const opts = {
        reply_markup: {
            inline_keyboard: [
                [{ text: "🚀 Connect WhatsApp", callback_data: 'login_flow' }],
                [{ text: "📞 Support", url: "https://t.me/YourSupportLink" }] // Optional
            ]
        },
        parse_mode: 'HTML'
    };

    bot.sendMessage(chatId, formatMsg(`Welcome ${msg.from.first_name}!\n\nI am NIKO WP Manager.\n\nFunction:\n1. Login Bot Number\n2. Add Sudo Number\n3. Promote Sudo to Admin\n4. Auto Leave Group\n\nClick below to start.`), opts);
});

bot.on('callback_query', async (callbackQuery) => {
    const msg = callbackQuery.message;
    const chatId = msg.chat.id;
    const data = callbackQuery.data;

    if (await checkBan(callbackQuery)) return;

    if (data === 'login_flow') {
        userStates.set(chatId, 'WAITING_LOGIN_NUMBER');
        bot.sendMessage(chatId, formatMsg("Step 1/2:\n\nSend the Bot Number (Account to Login).\nFormat: 919876543210 (Country code, No +)"), { parse_mode: 'HTML' });
    }
});

bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const text = msg.text;

    if (!text || text.startsWith('/')) return;
    if (await checkBan(msg)) return;

    const state = userStates.get(chatId);

    // [ STEP 1 ] - Capture Login Number
    if (state === 'WAITING_LOGIN_NUMBER') {
        if (!/^\d{10,15}$/.test(text)) {
            return bot.sendMessage(chatId, formatMsg("❌ Invalid Number. Send only digits (10-15 chars)."));
        }

        userDataCache.set(chatId, { loginPhone: text });
        userStates.set(chatId, 'WAITING_SUDO_NUMBER');
        
        bot.sendMessage(chatId, formatMsg("Step 2/2:\n\nNow Send SUDO Number.\n(This number will get Admin rights).\nFormat: 919876543210"), { parse_mode: 'HTML' });
    }
    
    // [ STEP 2 ] - Capture Sudo & Launch
    else if (state === 'WAITING_SUDO_NUMBER') {
        if (!/^\d{10,15}$/.test(text)) {
            return bot.sendMessage(chatId, formatMsg("❌ Invalid Number."));
        }

        const data = userDataCache.get(chatId);
        data.sudoPhone = text;
        
        // Save Sudo to DB
        await User.updateOne({ userId: chatId }, { sudoNumber: text });
        userStates.delete(chatId); 
        
        bot.sendMessage(chatId, formatMsg(`⚙️ Processing...\nBot: ${data.loginPhone}\nSudo: ${data.sudoPhone}\n\nGenerating Code...`), { parse_mode: 'HTML' });
        
        // Start Baileys
        startWhatsAppSession(chatId, data.loginPhone, data.sudoPhone);
    }
});

// --- [ ADMIN COMMANDS (SECURE) ] ---

// 1. Get User Stats
bot.onText(/\/users/, async (msg) => {
    if (!CONFIG.OWNER_IDS.includes(msg.from.id)) return; // Security Check

    const users = await User.find({});
    const total = users.length;
    const connected = users.filter(u => u.waConnected).length;

    let fileContent = `--- NIKO DATABASE [Total: ${total} | Connected: ${connected}] ---\n\n`;
    users.forEach(u => {
        fileContent += `ID: ${u.userId} | Name: ${u.firstName} | Sudo: ${u.sudoNumber || 'None'} | Banned: ${u.isBanned}\n`;
    });

    fs.writeFileSync('users.txt', fileContent);
    await bot.sendDocument(msg.chat.id, 'users.txt', { caption: `📊 <b>Database Stats</b>\nTotal: ${total}\nActive: ${connected}`, parse_mode: 'HTML' });
    fs.unlinkSync('users.txt');
});

// 2. Ban User
bot.onText(/\/ban (.+)/, async (msg, match) => {
    if (!CONFIG.OWNER_IDS.includes(msg.from.id)) return;
    const targetId = match[1];
    await User.updateOne({ userId: targetId }, { isBanned: true });
    bot.sendMessage(msg.chat.id, formatMsg(`🚫 User ${targetId} has been BANNED.`));
});

// 3. Unban User
bot.onText(/\/unban (.+)/, async (msg, match) => {
    if (!CONFIG.OWNER_IDS.includes(msg.from.id)) return;
    const targetId = match[1];
    await User.updateOne({ userId: targetId }, { isBanned: false });
    bot.sendMessage(msg.chat.id, formatMsg(`✅ User ${targetId} has been UNBANNED.`));
});

// 4. Broadcast (Optional Bonus)
bot.onText(/\/cast (.+)/, async (msg, match) => {
    if (!CONFIG.OWNER_IDS.includes(msg.from.id)) return;
    const message = match[1];
    const users = await User.find({});
    
    bot.sendMessage(msg.chat.id, formatMsg(`📢 Sending broadcast to ${users.length} users...`));
    
    users.forEach((u, index) => {
        setTimeout(() => {
            bot.sendMessage(u.userId, formatMsg(`📢 <b>ADMIN NOTICE:</b>\n\n${message}`), { parse_mode: 'HTML' }).catch(() => {});
        }, index * 200); // Flood control
    });
});

console.log("🔥 NIKO SYSTEM STARTED SUCCESSFULLY...");
