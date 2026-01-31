import asyncio
import random
import httpx
from threading import Thread
from flask import Flask
from pyrogram import Client, filters, enums
from pyrogram.types import Message, InlineKeyboardMarkup, InlineKeyboardButton, CallbackQuery
from pyrogram.errors import FloodWait, UserNotParticipant

# --- [ CONFIGURATION & IDENTITY ] ---
# AI Name: NIKO | Dev: DX-CODEX
API_ID = 20579940
API_HASH = "6fc0ea1c8dacae05751591adedc177d7"
BOT_TOKEN = "7853734473:AAHdGjbtPFWD6wFlyu8KRWteRg_961WGRJk"
RENDER_URL = "https://coin-bot-wp.onrender.com" 

# Special Access: Ekhon theke ei ID-r user admin na thakleo bot full control korte parbe
OWNER_ID = 6703335929 

# --- [ ASSETS & STYLING ] ---
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
    """Text to Small-Caps Conversion Algorithm"""
    return "".join(FONT_MAP.get(c.upper(), c) for c in text)

# --- [ INITIALIZING CLIENTS ] ---
app = Client("NikoBot_Pro", api_id=API_ID, api_hash=API_HASH, bot_token=BOT_TOKEN, parse_mode=enums.ParseMode.HTML)
web_app = Flask(__name__)

# --- [ WEB INFRASTRUCTURE ] ---
@web_app.route('/')
def home():
    return "NIKO BOT V3 IS ACTIVE | POWERED BY DX-CODEX"

def run_web():
    web_app.run(host="0.0.0.0", port=8080)

async def keep_alive_ping():
    """Anti-Sleep Algorithm for Render Deployment"""
    async with httpx.AsyncClient() as client:
        while True:
            try:
                if RENDER_URL:
                    await client.get(RENDER_URL, timeout=15)
            except Exception: pass
            await asyncio.sleep(300) 

# --- [ ADVANCED LOGIC & FILTERS ] ---
tagging_processes = {}

async def has_permission(client, chat_id, user_id):
    """
    Algorithm: Multi-layer Permission Check
    1. Check if user is the Hardcoded OWNER_ID.
    2. Check if user is the Group Creator (Owner).
    3. Check if user is an Administrator.
    """
    if user_id == OWNER_ID:
        return True
    try:
        member = await client.get_chat_member(chat_id, user_id)
        return member.status in [enums.ChatMemberStatus.ADMINISTRATOR, enums.ChatMemberStatus.OWNER]
    except Exception:
        return False

# --- [ CORE FEATURES ] ---

# 1. ENHANCED TAGALL (Only for Admin & Owner)
@app.on_message(filters.command(["tagall", "all"]) & filters.group)
async def tag_all_handler(client, message: Message):
    chat_id = message.chat.id
    user_id = message.from_user.id if message.from_user else None
    
    if not user_id or not await has_permission(client, chat_id, user_id):
        return await message.reply(f"🚫 <b>{stylish('Unauthorized Access!')}</b>\n<blockquote>Only Admins or NIKO Owner can use this.</blockquote>")

    if tagging_processes.get(chat_id):
        return await message.reply(f"⚠️ <b>{stylish('A process is already running in this group.')}</b>")

    input_text = message.text.split(None, 1)[1] if len(message.command) > 1 else "Attention Everyone!"
    tagging_processes[chat_id] = True
    
    status_msg = await message.reply(f"🔍 <b>{stylish('Indexing members... Please wait.')}</b>")
    
    # Algorithm: High-speed member scraping
    members = []
    async for member in client.get_chat_members(chat_id):
        if not member.user.is_bot and not member.user.is_deleted:
            members.append(member.user)
    
    random.shuffle(members)
    await status_msg.edit(f"🚀 <b>{stylish(f'Total {len(members)} members found. Tagging started...')}</b>")
    
    stop_btn = InlineKeyboardMarkup([[InlineKeyboardButton("🛑 STOP TAGGING", callback_data="stop_tagging")]])

    # Algorithm: Batch Processing (5 tags per message for stability)
    for i in range(0, len(members), 5):
        if not tagging_processes.get(chat_id):
            break
            
        batch = members[i:i + 5]
        output = f"<b>┏━━「 {stylish(input_text)} 」━━┓</b>\n"
        for user in batch:
            emoji = random.choice(EMOJIS)
            output += f"<b>┃ {emoji} <a href='tg://user?id={user.id}'>{user.first_name}</a></b>\n"
        output += f"<b>┗━━━━━━━━━━━━━━┛</b>\n"
        output += f"<blockquote>🤖 {stylish('DEV-BY: DX-CODEX')} | 👑 {stylish('Dev: Dx-Codex')}</blockquote>"

        try:
            await client.send_message(chat_id, output, reply_markup=stop_btn)
            await asyncio.sleep(2.5) # Dynamic Sleep for Flood protection
        except FloodWait as e:
            await asyncio.sleep(e.value + 5)
        except Exception: pass

    tagging_processes[chat_id] = False
    await message.reply(f"✅ <b>{stylish('Tagging mission successful!')}</b>")

# 2. ADVANCED CALLBACK (Admin & Owner Restricted)
@app.on_callback_query(filters.regex("stop_tagging"))
async def stop_tagging_callback(client, callback: CallbackQuery):
    if await has_permission(client, callback.message.chat.id, callback.from_user.id):
        tagging_processes[callback.message.chat.id] = False
        await callback.answer("Stopping process...", show_alert=False)
        await callback.message.edit_reply_markup(None)
        await callback.message.reply(f"🛑 <b>{stylish('Tagging stopped by Authority.')}</b>")
    else:
        await callback.answer("🚫 You don't have permission to stop this!", show_alert=True)

# 3. PRO VC FILTER (Auto-Delete Music Links if VC is off)
@app.on_message(filters.group & ~filters.service)
async def smart_filter(client, message: Message):
    if not message.text: return
    trigger_words = ["http", "t.me", "youtube", "spotify"]
    
    if any(word in message.text.lower() for word in trigger_words):
        try:
            chat_info = await client.get_chat(message.chat.id)
            if not chat_info.video_chat:
                await message.delete()
                warning = await message.reply(f"⚠️ <b>{stylish('Music links not allowed when VC is closed!')}</b>")
                await asyncio.sleep(5)
                await warning.delete()
        except Exception: pass

# 4. UNIVERSAL SERVICE CLEANER
@app.on_message(filters.service)
async def service_cleaner(client, message: Message):
    """Removes all join/leave/pin/photo-change service alerts"""
    try:
        await message.delete()
    except: pass

# --- [ EXECUTION ] ---
async def boot_niko():
    print("---------------------------------------")
    print("💎 NIKO BOT V3 PRO BY DX-CODEX IS BOOTING")
    print("---------------------------------------")
    asyncio.create_task(keep_alive_ping())
    await app.start()
    from pyrogram import idle
    await idle()
    await app.stop()

if __name__ == "__main__":
    Thread(target=run_web, daemon=True).start()
    asyncio.run(boot_niko())
