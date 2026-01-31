import asyncio
import random
import httpx
from threading import Thread
from flask import Flask
from pyrogram import Client, filters, enums
from pyrogram.types import Message, InlineKeyboardMarkup, InlineKeyboardButton, CallbackQuery
from pyrogram.errors import FloodWait, UserNotParticipant

# --- CONFIGURATION ---
API_ID = 20579940
API_HASH = "6fc0ea1c8dacae05751591adedc177d7"
BOT_TOKEN = "7853734473:AAHdGjbtPFWD6wFlyu8KRWteRg_961WGRJk"
RENDER_URL = "https://coin-bot-wp.onrender.com" # তোমার রেন্ডার লিংক

# --- ASSETS (OLD FEATURES RESTORED) ---
FONT_MAP = {
    'A':'ᴀ','B':'ʙ','C':'ᴄ','D':'ᴅ','E':'ᴇ','F':'ғ','G':'ɢ','H':'ʜ','I':'ɪ','J':'ᴊ',
    'K':'ᴋ','L':'ʟ','M':'ᴍ','N':'ɴ','O':'ᴏ','P':'ᴘ','Q':'ǫ','R':'ʀ','S':'s','T':'ᴛ',
    'U':'ᴜ','V':'ᴠ','W':'ᴡ','X':'x','Y':'ʏ','Z':'ᴢ'
}

# পুরানো কোডের ইমোজি লিস্ট ফিরিয়ে আনা হয়েছে
EMOJIS = [
    "💎", "🚀", "⚡", "🔥", "✨", "👑", "🎯", "🛡️", "🔮", "🌀", 
    "🤖", "👾", "🌟", "💥", "🌊", "🌋", "🌌", "🌍", "💰", "⚔️"
]

def stylish(text):
    return "".join(FONT_MAP.get(c.upper(), c) for c in text)

# --- CLIENT SETUP ---
app = Client("NikoBot_Final", api_id=API_ID, api_hash=API_HASH, bot_token=BOT_TOKEN, parse_mode=enums.ParseMode.HTML)
web_app = Flask(__name__)

# --- WEB SERVER ---
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
            await asyncio.sleep(300) # 5 Minutes

# --- GLOBAL VARS ---
tagging_processes = {}

# --- HELPER FUNCTIONS ---
async def is_admin(client, chat_id, user_id):
    try:
        member = await client.get_chat_member(chat_id, user_id)
        return member.status in [enums.ChatMemberStatus.ADMINISTRATOR, enums.ChatMemberStatus.OWNER]
    except Exception:
        return False

# --- MAIN COMMANDS ---

# 1. ADVANCED TAGALL (Old Style + New Tech)
@app.on_message(filters.command(["tagall", "all"]) & filters.group)
async def tag_all_handler(client, message: Message):
    chat_id = message.chat.id
    
    # 1. Admin Check (Fixed Error)
    if not await is_admin(client, chat_id, message.from_user.id):
        return await message.reply(f"🚫 <b>{stylish('Only Admins Can Use This!')}</b>")

    if tagging_processes.get(chat_id):
        return await message.reply(f"⚠️ <b>{stylish('Tagging is already running...')}</b>")

    tagging_processes[chat_id] = True
    input_text = message.text.split(None, 1)[1] if len(message.command) > 1 else "Hᴇʟʟᴏ Eᴠᴇʀʏᴏɴᴇ"
    
    # 2. Scanning Members
    status_msg = await message.reply(f"🔄 <b>{stylish('Processing Members...')}</b>")
    
    members_list = []
    async for member in client.get_chat_members(chat_id):
        if not member.user.is_bot and not member.user.is_deleted:
            members_list.append(member.user)
    
    # Shuffle for randomness
    random.shuffle(members_list)
    
    await status_msg.edit(f"✅ <b>{stylish(f'Found {len(members_list)} Members. Starting...')}</b>")
    
    # 3. Batch Tagging
    batch_size = 5
    stop_btn = InlineKeyboardMarkup([[InlineKeyboardButton("🛑 STOP TAGGING", callback_data="stop_tagging")]])

    for i in range(0, len(members_list), batch_size):
        if not tagging_processes.get(chat_id):
            break
            
        batch = members_list[i:i + batch_size]
        
        # সুন্দর ডিজাইন (Old + New Mix)
        msg_content = f"<b>┏━━「 {stylish(input_text)} 」━━┓</b>\n"
        
        for user in batch:
            emoji = random.choice(EMOJIS) # Random Emoji Restored
            msg_content += f"<b>┃ {emoji} <a href='tg://user?id={user.id}'>{user.first_name}</a></b>\n"
            
        msg_content += f"<b>┗━━━━━━━━━━━━━━┛</b>\n"
        msg_content += f"<blockquote>👾 {stylish('Dev-By: Dx-Codex')}</blockquote>"

        try:
            await client.send_message(chat_id, msg_content, reply_markup=stop_btn)
            await asyncio.sleep(2) # FloodWait Protection
        except FloodWait as e:
            await asyncio.sleep(e.value + 2)
        except Exception:
            pass

    tagging_processes[chat_id] = False
    await message.reply(f"✅ <b>{stylish('Tagging Finished!')}</b>")

# 2. STOP SYSTEM (Callback)
@app.on_callback_query(filters.regex("stop_tagging"))
async def stop_tagging(client, callback: CallbackQuery):
    chat_id = callback.message.chat.id
    if await is_admin(client, chat_id, callback.from_user.id):
        tagging_processes[chat_id] = False
        await callback.answer("🛑 Stopping...", show_alert=False)
        await callback.message.edit_reply_markup(None)
        await callback.message.reply(f"🛑 <b>{stylish('Tagging Stopped Successfully!')}</b>")
    else:
        await callback.answer("❌ Admin Only!", show_alert=True)

# 3. SMART VC FILTER (Old Feature Improved)
@app.on_message(filters.group & filters.bot)
async def vc_link_checker(client, message: Message):
    if not message.text: return
    
    # লিংক থাকলে চেক করবে
    if "http" in message.text.lower() or "t.me" in message.text.lower():
        try:
            chat = await client.get_chat(message.chat.id)
            # যদি ভিডিও চ্যাট (VC) বন্ধ থাকে
            if not chat.video_chat:
                await message.delete()
                alert = await message.reply(
                    f"🔇 <b>{stylish('VC is OFF. Music Links are not allowed!')}</b>"
                )
                await asyncio.sleep(5)
                await alert.delete()
        except Exception:
            pass

# 4. SERVICE MSG REMOVER
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
    Thread(target=run_web, daemon=True).start()
    asyncio.run(start_bot())
