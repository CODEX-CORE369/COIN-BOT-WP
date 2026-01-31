import asyncio
import random
import httpx
from threading import Thread
from flask import Flask
from pyrogram import Client, filters, enums
from pyrogram.types import Message, InlineKeyboardMarkup, InlineKeyboardButton, CallbackQuery
from pyrogram.errors import FloodWait, UserNotParticipant

# --- CONFIGURATION (বটের পরিচয় ও এপিআই) ---
# ডেভেলপার: DX-CODEX | বটের নাম: NIKO
API_ID = 20579940
API_HASH = "6fc0ea1c8dacae05751591adedc177d7"
BOT_TOKEN = "7853734473:AAHdGjbtPFWD6wFlyu8KRWteRg_961WGRJk"
RENDER_URL = "https://coin-bot-wp.onrender.com" 

# --- ASSETS (আপনার সব ফন্ট ও ইমোজি সিস্টেম) ---
FONT_MAP = {
    'A':'ᴀ','B':'ʙ','C':'ᴄ','D':'ᴅ','E':'ᴇ','F':'ғ','G':'ɢ','H':'ʜ','I':'ɪ','J':'ᴊ',
    'K':'ᴋ','L':'ʟ','M':'ᴍ','N':'ɴ','O':'ᴏ','P':'ᴘ','Q':'ǫ','R':'ʀ','S':'s','T':'ᴛ',
    'U':'ᴜ','V':'ᴠ','W':'ᴡ','X':'x','Y':'ʏ','Z':'ᴢ'
}

EMOJIS = [
    "💎", "🚀", "⚡", "🔥", "✨", "👑", "🎯", "🛡️", "🔮", "🌀", 
    "🤖", "👾", "🌟", "💥", "🌊", "🌋", "🌌", "🌍", "💰", "⚔️",
    "🎭", "🎨", "🎬", "🎤", "🎧", "🎷", "🎸", "🎻", "🎹", "🥁",
    "🦁", "🐯", "🦅", "🐺", "🦊", "🐉", "🐍", "🦖", "🦄", "🐼",
    "🛸", "🛰️", "🚀", "☄️", "🪐", "⭐", "🌙", "☀️", "☁️", "⚡",
    "🍀", "🍁", "🌸", "🌹", "🌺", "🌻", "🌴", "🌵", "🍷", "🍹",
    "🥇", "🏆", "🎖️", "🎗️", "🧿", "🎁", "🎈", "🎊", "🎉", "🎐"
]

def stylish(text):
    """টেক্সটকে স্টাইলিশ ফন্টে রূপান্তর করার আপনার অরিজিনাল ফাংশন"""
    return "".join(FONT_MAP.get(c.upper(), c) for c in text)

# --- CLIENT SETUP ---
app = Client("NikoBot_Final", api_id=API_ID, api_hash=API_HASH, bot_token=BOT_TOKEN, parse_mode=enums.ParseMode.HTML)
web_app = Flask(__name__)

# --- WEB SERVER (বট অনলাইনে রাখার সিস্টেম) ---
@web_app.route('/')
def home():
    return "NIKO BOT IS ONLINE & PROTECTED"

def run_web():
    web_app.run(host="0.0.0.0", port=8080)

# --- KEEP ALIVE SYSTEM ---
async def keep_alive_ping():
    async with httpx.AsyncClient() as client:
        while True:
            try:
                if RENDER_URL:
                    await client.get(RENDER_URL, timeout=10)
            except Exception:
                pass
            await asyncio.sleep(300) 

# --- GLOBAL VARS ---
tagging_processes = {}

# --- HELPER FUNCTIONS (অ্যাডমিন চেক করার সঠিক লজিক) ---
async def is_admin(client, chat_id, user_id):
    """এটি চেক করবে ইউজার গ্রুপের মালিক বা অ্যাডমিন কি না"""
    try:
        member = await client.get_chat_member(chat_id, user_id)
        # মেম্বার যদি অ্যাডমিন বা ওনার হয় তবেই True রিটার্ন করবে
        return member.status in [enums.ChatMemberStatus.ADMINISTRATOR, enums.ChatMemberStatus.OWNER]
    except Exception:
        return False

# --- MAIN COMMANDS ---

# ১. ADVANCED TAGALL (অ্যাডমিন ছাড়া কেউ কাজ করতে পারবে না)
@app.on_message(filters.command(["tagall", "all"]) & filters.group)
async def tag_all_handler(client, message: Message):
    chat_id = message.chat.id
    user_id = message.from_user.id
    
    # অ্যাডমিন চেক (অ্যাডমিন না হলে মেসেজ দিয়ে থামিয়ে দিবে)
    if not await is_admin(client, chat_id, user_id):
        return await message.reply(f"🚫 <b>{stylish('Only Admins Can Use This!')}</b>")

    # যদি ওই গ্রুপে অলরেডি ট্যাগ চলতে থাকে
    if tagging_processes.get(chat_id):
        return await message.reply(f"⚠️ <b>{stylish('Tagging is already running...')}</b>")

    tagging_processes[chat_id] = True
    input_text = message.text.split(None, 1)[1] if len(message.command) > 1 else "Hᴇʟʟᴏ Eᴠᴇʀʏᴏɴᴇ"
    
    # মেম্বারদের স্ক্যান করার মেসেজ
    status_msg = await message.reply(f"🔄 <b>{stylish('Processing Members...')}</b>")
    
    members_list = []
    # গ্রুপের মেম্বারদের লিস্টে নিচ্ছে (বট ছাড়া)
    async for member in client.get_chat_members(chat_id):
        if not member.user.is_bot and not member.user.is_deleted:
            members_list.append(member.user)
    
    # আপনার অরিজিনাল র্যান্ডম শাফল সিস্টেম
    random.shuffle(members_list)
    
    await status_msg.edit(f"✅ <b>{stylish(f'Found {len(members_list)} Members. Starting...')}</b>")
    
    # ব্যাচ ট্যাগিং এবং স্টপ বাটন
    batch_size = 5
    stop_btn = InlineKeyboardMarkup([[InlineKeyboardButton("🛑 STOP TAGGING", callback_data="stop_tagging")]])

    for i in range(0, len(members_list), batch_size):
        if not tagging_processes.get(chat_id):
            break
            
        batch = members_list[i:i + batch_size]
        
        # আপনার অরিজিনাল সুন্দর ডিজাইন লজিক
        msg_content = f"<b>┏━━「 {stylish(input_text)} 」━━┓</b>\n"
        
        for user in batch:
            emoji = random.choice(EMOJIS) # আপনার ইমোজি লিস্ট থেকে র্যান্ডম ইমোজি
            msg_content += f"<b>┃ {emoji} <a href='tg://user?id={user.id}'>{user.first_name}</a></b>\n"
            
        msg_content += f"<b>┗━━━━━━━━━━━━━━┛</b>\n"
        msg_content += f"<blockquote>👾 {stylish('Dev-By: Dx-Codex')} | 🤖 {stylish('Name: Niko')}</blockquote>"

        try:
            await client.send_message(chat_id, msg_content, reply_markup=stop_btn)
            await asyncio.sleep(2) # ফ্লাডওয়েট থেকে বাঁচার জন্য ২ সেকেন্ড গ্যাপ
        except FloodWait as e:
            await asyncio.sleep(e.value + 2)
        except Exception:
            pass

    tagging_processes[chat_id] = False
    await message.reply(f"✅ <b>{stylish('Tagging Finished!')}</b>")

# ২. STOP SYSTEM (কলব্যাক বাটন শুধুমাত্র অ্যাডমিনের জন্য)
@app.on_callback_query(filters.regex("stop_tagging"))
async def stop_tagging(client, callback: CallbackQuery):
    chat_id = callback.message.chat.id
    # কলব্যাক বাটন যে চেপেছে সে অ্যাডমিন কি না চেক
    if await is_admin(client, chat_id, callback.from_user.id):
        tagging_processes[chat_id] = False
        await callback.answer("🛑 Stopping...", show_alert=False)
        await callback.message.edit_reply_markup(None)
        await callback.message.reply(f"🛑 <b>{stylish('Tagging Stopped Successfully!')}</b>")
    else:
        await callback.answer("❌ Admin Only!", show_alert=True)

# ৩. SMART VC FILTER (অরিজিনাল লজিক অক্ষুণ্ণ)
@app.on_message(filters.group & filters.bot)
async def vc_link_checker(client, message: Message):
    if not message.text: return
    
    if "http" in message.text.lower() or "t.me" in message.text.lower():
        try:
            chat = await client.get_chat(message.chat.id)
            if not chat.video_chat: # যদি ভয়েস চ্যাট অন না থাকে
                await message.delete()
                alert = await message.reply(
                    f"🔇 <b>{stylish('VC is OFF. Music Links are not allowed!')}</b>"
                )
                await asyncio.sleep(5)
                await alert.delete()
        except Exception:
            pass

# ৪. SERVICE MSG REMOVER (অরিজিনাল লজিক)
@app.on_message(filters.service)
async def clean_service(client, message):
    try:
        await message.delete()
    except:
        pass

# --- STARTUP ---
async def start_bot():
    print("💎 NIKO BOT V3 (ADVANCED) STARTED")
    asyncio.create_task(keep_alive_ping())
    await app.start()
    from pyrogram import idle
    await idle()
    await app.stop()

if __name__ == "__main__":
    # ওয়েব সার্ভার আলাদা থ্রেডে চালানো হচ্ছে
    Thread(target=run_web, daemon=True).start()
    asyncio.run(start_bot())
