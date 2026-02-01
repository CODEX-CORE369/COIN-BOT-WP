import asyncio
import logging
import random
import threading
import time
import requests
from flask import Flask
from pyrogram import Client, filters, enums
from pyrogram.types import Message, InlineKeyboardMarkup, InlineKeyboardButton, CallbackQuery
from pyrogram.errors import FloodWait

# --- [ CONFIGURATION ] ---
API_ID = 20579940
API_HASH = "6fc0ea1c8dacae05751591adedc177d7"
BOT_TOKEN = "7853734473:AAHdGjbtPFWD6wFlyu8KRWteRg_961WGRJk"
RENDER_URL = "https://coin-bot-wp.onrender.com"
OWNER_ID = 6703335929

# --- [ LOGGING ] ---
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

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
# --- [ GLOBAL VARIABLES ] ---
tagging_status = {} 
app = Client("my_bot", api_id=API_ID, api_hash=API_HASH, bot_token=BOT_TOKEN)
flask_app = Flask(__name__)

# --- [ WEB SERVER FOR RENDER ] ---
@flask_app.route('/')
def home():
    return "🔥 Bot is Running High Performance Mode!"

def run_web_server():
    flask_app.run(host="0.0.0.0", port=8080)

def keep_alive():
    """Smart Pinger to keep Render Active"""
    while True:
        time.sleep(300) # 5 Minutes
        try:
            requests.get(RENDER_URL)
            logger.info(f"Pinged: {RENDER_URL}")
        except Exception as e:
            logger.error(f"Ping Failed: {e}")

# --- [ HELPER FUNCTIONS ] ---
def stylish(text):
    """Converts text to Small-Caps"""
    if not text: return ""
    return "".join(FONT_MAP.get(c.upper(), c) for c in text)

async def is_admin_or_owner(client, chat_id, user_id):
    if user_id == OWNER_ID: return True
    try:
        member = await client.get_chat_member(chat_id, user_id)
        return member.status in [enums.ChatMemberStatus.ADMINISTRATOR, enums.ChatMemberStatus.OWNER]
    except:
        return False

# --- [ 1. ADVANCED TAGALL SYSTEM ] ---
@app.on_message(filters.command(["tagall", "all", "mention"]) & filters.group)
async def tag_all_users(client, message: Message):
    chat_id = message.chat.id
    
    # Permission Check
    if not await is_admin_or_owner(client, chat_id, message.from_user.id):
        return await message.reply_text(f"<b>❌ {stylish('Access Denied! Admins Only.')}</b>")

    if tagging_status.get(chat_id):
        return await message.reply_text(f"<b>⚠️ {stylish('Already a process running!')} Use /tstop</b>")

    # Input Handling
    if len(message.command) > 1:
        input_text = message.text.split(None, 1)[1]
    else:
        input_text = "Attention Everyone" 

    members = []
    async for member in client.get_chat_members(chat_id):
        if not member.user.is_bot and not member.user.is_deleted:
            members.append(member.user)
    
    if not members:
        return await message.reply_text("<b>❌ No members found.</b>")

    # Control Panel
    tagging_status[chat_id] = True
    control_msg = await message.reply_text(
        f"<b>🚀 Starting Tagall...</b>\n"
        f"<b>👥 Users:</b> {len(members)}\n"
        f"<b>💬 Reason:</b> {input_text}",
        reply_markup=InlineKeyboardMarkup([
            [InlineKeyboardButton("❌ Stop Tagging", callback_data="stop_tag")]
        ])
    )

    # Batch Processing
    batch_size = 5
    for i in range(0, len(members), batch_size):
        if not tagging_status.get(chat_id):
            break
            
        batch = members[i:i + batch_size]
        
        # HTML Design
        output = f"<b>┏━━━「 🍒 {stylish('DARK-BOT')} 」━━━┓</b>\n"
        output += f"<b>┃ 🔔 {stylish(input_text)}</b>\n"
        for user in batch:
            emoji = random.choice(EMOJIS)
            output += f"<b>┃ {emoji} <a href='tg://user?id={user.id}'>{user.first_name}</a></b>\n"
        output += f"<b>┃</b>\n"
        output += f"<b>┗━━━━「 🤖 {stylish('DX-CODEX')} 」━━━┛</b>"
        
        try:
            await client.send_message(chat_id, output)
            await asyncio.sleep(2.5) 
        except FloodWait as e:
            await asyncio.sleep(e.value)
        except Exception as e:
            print(f"Error: {e}")
            continue

    tagging_status[chat_id] = False
    await control_msg.edit_text(f"<b>✅ Tagging Completed!</b>\nTagged {len(members)} users.")

# --- [ 2. STOP BUTTON LOGIC ] ---
@app.on_callback_query(filters.regex("stop_tag"))
async def stop_callback(client, callback_query: CallbackQuery):
    chat_id = callback_query.message.chat.id
    user_id = callback_query.from_user.id
    
    if not await is_admin_or_owner(client, chat_id, user_id):
        return await callback_query.answer("❌ You are not an admin!", show_alert=True)
    
    if tagging_status.get(chat_id):
        tagging_status[chat_id] = False
        await callback_query.message.edit_text(f"<b>🛑 Tagging Stopped by {callback_query.from_user.first_name}!</b>")
    else:
        await callback_query.answer("⚠️ No process running.", show_alert=True)

@app.on_message(filters.command("tstop") & filters.group)
async def stop_command(client, message: Message):
    chat_id = message.chat.id
    if not await is_admin_or_owner(client, chat_id, message.from_user.id):
        return
    
    if tagging_status.get(chat_id):
        tagging_status[chat_id] = False
        await message.reply_text(f"<b>🛑 {stylish('Force Stopped!')}</b>")
    else:
        await message.reply_text("<b>💤 Nothing to stop.</b>")

# --- [ 3. AUTOMATIC VC END MONITOR (NEW) ] ---
@app.on_message(filters.video_chat_ended & filters.group)
async def vc_ended_handler(client, message: Message):
    """
    Detects when Voice Chat Ends and sends a System Alert.
    """
    try:
        # Stylish HTML Border Message
        alert_text = (
            f"<b>┏━━━「 ⚠️ {stylish('SYSTEM ALERT')} 」━━━┓</b>\n"
            f"<b>┃</b>\n"
            f"<b>┃ 🎙️ Voice Chat: ENDED</b>\n"
            f"<b>┃ 🛡️ Anti-Link Mode: [ACTIVE]</b>\n"
            f"<b>┃ 🚫 No Links Allowed Now!</b>\n"
            f"<b>┃</b>\n"
            f"<b>┗━━━━━━━━━━━━━━━━━━━━━━━┛</b>"
        )
        await message.reply_text(alert_text)
    except Exception as e:
        logger.error(f"VC End Alert Error: {e}")

# --- [ 4. ADVANCED LINK GUARD ] ---
@app.on_message(filters.regex(r"(https?://|www\.|t\.me/)") & filters.group)
async def link_monitor(client, message: Message):
    chat_id = message.chat.id
    user_id = message.from_user.id
    
    if user_id == OWNER_ID: return

    try:
        member = await client.get_chat_member(chat_id, user_id)
        is_admin = member.status in [enums.ChatMemberStatus.ADMINISTRATOR, enums.ChatMemberStatus.OWNER]
        
        should_delete = False
        
        if is_admin:
            # Check VC Status for Admins/Music Bots
            chat = await client.get_chat(chat_id)
            if not chat.is_video_chat_active:
                should_delete = True
        else:
            # Always delete for normal members
            should_delete = True

        if should_delete:
            await message.delete()
            
            # Temporary Warning Message (HTML Format)
            warning_msg = await message.reply_text(
                f"<b>❌ {stylish('Link Removed!')}</b>\n"
                f"<b>⚠️  {stylish('Voice Chat is OFF. Links are restricted!')}</b>"
            )
            await asyncio.sleep(5)
            await warning_msg.delete()
            
    except Exception as e:
        logger.error(f"Link Logic Error: {e}")

# --- [ MAIN EXECUTION ] ---
if __name__ == "__main__":
    print("🔥 DX-BOT Started with Advanced Algorithms!")
    
    threading.Thread(target=run_web_server, daemon=True).start()
    threading.Thread(target=keep_alive, daemon=True).start()
    
    app.run()
