import asyncio
import logging
import random
import re
import threading
import time
import io
import requests
from flask import Flask
from pyrogram import Client, filters, enums
from pyrogram.types import Message, InlineKeyboardMarkup, InlineKeyboardButton, CallbackQuery
from pyrogram.errors import FloodWait, InputUserDeactivated, UserIsBlocked, PeerIdInvalid
from motor.motor_asyncio import AsyncIOMotorClient
from collections import defaultdict
import datetime

# --- [ CONFIGURATION ] ---
API_ID = 20579940
API_HASH = "6fc0ea1c8dacae05751591adedc177d7"
BOT_TOKEN = "7853734473:AAHdGjbtPFWD6wFlyu8KRWteRg_961WGRJk"
RENDER_URL = "https://coin-bot-wp.onrender.com"

# Multiple Owners
OWNER_IDS = [6703335929, 5136260272] 
MONGO_DB_URI = "mongodb+srv://dxsimu:mnbvcxzdx@dxsimu.0qrxmsr.mongodb.net/?appName=dxsimu"

# --- [ LOGGING ] ---
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# --- [ ASSETS & STYLING ] ---
FONT_MAP = {
    'A':'ᴀ','B':'ʙ','C':'ᴄ','D':'ᴅ','E':'ᴇ','F':'ғ','G':'ɢ','H':'ʜ','I':'ɪ','J':'ᴊ',
    'K':'ᴋ','L':'ʟ','M':'ᴍ','N':'ɴ','O':'ᴏ','P':'ᴘ','Q':'ǫ','R':'ʀ','S':'s','T':'ᴛ',
    'U':'ᴜ','V':'ᴠ','W':'ᴡ','X':'x','Y':'ʏ','Z':'ᴢ',
    '0':'₀','1':'₁','2':'₂','3':'₃','4':'₄','5':'₅','6':'₆','7':'₇','8':'₈','9':'₉'
}

EMOJIS = ["💎", "🚀", "⚡", "🔥", "✨", "👑", "🎯", "🛡️", "🔮", "🌀"]

def stylish(text):
    """Converts text to small caps stylish font"""
    if not text: return ""
    return "".join(FONT_MAP.get(c.upper(), c) for c in text)

def parse_time(time_str):
    if not time_str: return None
    unit = time_str[-1].lower()
    try:
        val = int(time_str[:-1])
        if unit == "m": return datetime.timedelta(minutes=val)
        if unit == "h": return datetime.timedelta(hours=val)
        if unit == "d": return datetime.timedelta(days=val)
    except: return None
    return None

# --- [ ADVANCED DATABASE ] ---
class Database:
    def __init__(self, uri, database_name):
        self._client = AsyncIOMotorClient(uri)
        self.db = self._client[database_name]
        self.users = self.db.users
        self.groups = self.db.groups
        self.warns = self.db.warns
        self.blocked_words = self.db.blocked_words
        self.word_violations = self.db.word_violations
        self.locks = self.db.locks
        self.welcome_settings = self.db.welcome_settings

    async def add_user(self, user):
        if not await self.users.find_one({"user_id": user.id}):
            await self.users.insert_one({
                "user_id": user.id,
                "first_name": user.first_name,
                "username": user.username if user.username else "None"
            })
        else:
            await self.users.update_one(
                {"user_id": user.id},
                {"$set": {"first_name": user.first_name, "username": user.username}}
            )

    async def add_group(self, chat):
        if not await self.groups.find_one({"chat_id": chat.id}):
            await self.groups.insert_one({
                "chat_id": chat.id,
                "title": chat.title
            })

    async def get_all_users(self):
        return self.users.find({})

    async def get_all_groups(self):
        return self.groups.find({})
    
    async def count_users(self):
        return await self.users.count_documents({})

    async def count_groups(self):
        return await self.groups.count_documents({})

db = Database(MONGO_DB_URI, "DX-SIMU")

# --- [ GLOBAL VARIABLES ] ---
tagging_status = {} 
flood_data = defaultdict(list)
app = Client("my_bot", api_id=API_ID, api_hash=API_HASH, bot_token=BOT_TOKEN)
flask_app = Flask(__name__)

# --- [ WEB SERVER ] ---
@flask_app.route('/')
def home(): return "🔥 Bot is Running High Performance Mode!"

def run_web_server(): flask_app.run(host="0.0.0.0", port=8080)
def keep_alive():
    while True:
        try:
            # এটি বটকে সচল রাখতে আপনার লিঙ্কে প্রতি ৫ মিনিট অন্তর হিট করবে
            requests.get(RENDER_URL)
        except Exception:
            pass
        time.sleep(300) # ৩০০ সেকেন্ড বা ৫ মিনিট পর পর চলবে
# --- [ HELPER FUNCTIONS ] ---
async def is_owner(user_id):
    return user_id in OWNER_IDS

async def is_admin(client, chat_id, user_id):
    if user_id in OWNER_IDS: return True
    try:
        member = await client.get_chat_member(chat_id, user_id)
        return member.status in [enums.ChatMemberStatus.ADMINISTRATOR, enums.ChatMemberStatus.OWNER]
    except: return False

def parse_buttons(text):
    if not text: return None, None
    pattern = r"\[([^\]]+?)\|([^\]]+?)\]"
    matches = re.findall(pattern, text)
    if not matches: return text, None
    clean_text = re.sub(pattern, "", text).strip()
    buttons = []
    row = []
    for name, url in matches:
        row.append(InlineKeyboardButton(name.strip(), url=url.strip()))
        if len(row) == 2:
            buttons.append(row)
            row = []
    if row: buttons.append(row)
    return clean_text, InlineKeyboardMarkup(buttons)

async def get_target_user(client, message: Message):
    user_id = None
    reason = "N/A"
    
    if message.reply_to_message:
        user_id = message.reply_to_message.from_user.id
        if len(message.command) > 1:
            reason = message.text.split(None, 1)[1]
            
    elif len(message.command) > 1:
        input_str = message.command[1]
        try:
            if input_str.startswith("@"):
                user = await client.get_users(input_str)
                user_id = user.id
            else:
                user_id = int(input_str)
            
            if len(message.command) > 2:
                reason = message.text.split(None, 2)[2]
        except Exception as e:
            logger.error(f"Error finding user: {e}")
            return None, None
            
    return user_id, reason

# --- [ 1. ADVANCED START & WELCOME SYSTEM ] ---
@app.on_message(filters.command("start") & filters.private)
async def start_handler(client, message: Message):
    user = message.from_user
    await db.add_user(user) 
    
    bot_username = (await client.get_me()).username
    add_link = f"https://t.me/{bot_username}?startgroup=true&admin=change_info+delete_messages+restrict_members+invite_users+pin_messages+manage_video_chats+promote_members"
    mention = f"<a href='tg://user?id={user.id}'>{user.first_name}</a>"

    text = f"""
<b>┏━━━「 {stylish('bot dashboard')} 」━━━┓</b>
<b>┃ ┏─「 {stylish('user profile')} 」</b>
<b>┃ ┃ 👤 {stylish('name')}: {mention}</b>
<b>┃ ┃ 🆔 {stylish('id')}: <code>{user.id}</code></b>
<b>┃ ┗───────────╼</b>
<b>┃ ┏─「 {stylish('active features')} 」</b>
<b>┃ ┃ 🛡️ {stylish('anti-flood system')}</b>
<b>┃ ┃ 🚫 {stylish('word filter & block')}</b>
<b>┃ ┃ 🔐 {stylish('advanced group locks')}</b>
<b>┃ ┃ ⚠️ {stylish('smart warn & mute')}</b>
<b>┃ ┃ 👋 {stylish('custom welcome media')}</b>
<b>┃ ┃ 🍒 {stylish('admin reporting')}</b>
<b>┃ ┗───────────╼</b>
<b>┃ ┏─「 {stylish('system status')} 」</b>
<b>┃ ┃ 👨‍💻 {stylish('dev')}: {stylish('dx-codex')}</b>
<b>┃ ┃ ⚡ {stylish('speed')}: {stylish('ultra fast')}</b>
<b>┃ ┃ 🔋 {stylish('uptime')}: {stylish('24/7 active')}</b>
<b>┃ ┗───────────╼</b>
<b>┗━━━━━━━━━━━━━━━━━━┛</b>
"""
    await message.reply_text(
        text,
        quote=True,
        reply_markup=InlineKeyboardMarkup([
            [InlineKeyboardButton(f"➕ {stylish('add me to group')}", url=add_link)],
            [InlineKeyboardButton(f"📡 {stylish('updates')}", url="https://t.me/CodexCentury")]
        ])
    )

@app.on_message(filters.new_chat_members)
async def welcome_handler(client, message: Message):
    for member in message.new_chat_members:
        if member.id == (await client.get_me()).id:
            await db.add_group(message.chat)
            text = f"""
<b>┏━━「 {stylish('system active')} 」━━┓</b>
<b>┃ ┏─「 {stylish('group info')} 」</b>
<b>┃ ┃ 📛 {stylish('title')}: {message.chat.title}</b>
<b>┃ ┃ 🆔 {stylish('id')}: <code>{message.chat.id}</code></b>
<b>┃ ┗───────────╼</b>
<b>┃</b>
<b>┃ ⚡ {stylish('thanks for adding me!')}</b>
<b>┃ 🛡️ {stylish('security system online.')}</b>
<b>┗━━━━━━━━━━┛</b>
            """
            await message.reply_text(text)

# --- [ 2. ADMIN STATS & EXPORT (.txt) ] ---
@app.on_message(filters.command("users") & filters.private)
async def stats_handler(client, message: Message):
    if not await is_owner(message.from_user.id): return

    msg = await message.reply_text(f"<b>🔄 {stylish('fetching data...')}</b>")
    
    users_count = await db.count_users()
    groups_count = await db.count_groups()
    
    stats_text = f"""
<b>┏━━「 {stylish('database stats')} 」━━┓</b>
<b>┃ ┏─「 {stylish('overview')} 」</b>
<b>┃ ┃ 👤 {stylish('users')}: {users_count}</b>
<b>┃ ┃ 👥 {stylish('groups')}: {groups_count}</b>
<b>┃ ┗───────────╼</b>
<b>┗━━━━━━━━━━┛</b>
<b>📂 {stylish('generating file...')}</b>
    """
    await msg.edit_text(stats_text)

    output = "--- DX-BOT DATABASE EXPORT ---\n\n"
    output += f"Total Users: {users_count}\n"
    output += f"Total Groups: {groups_count}\n\n"
    
    output += "--- USERS LIST ---\n"
    async for user in await db.get_all_users():
        output += f"ID: {user['user_id']} | Name: {user.get('first_name','N/A')} | User: @{user.get('username','None')}\n"
    
    output += "\n--- GROUPS LIST ---\n"
    async for group in await db.get_all_groups():
        output += f"ID: {group['chat_id']} | Title: {group.get('title','N/A')}\n"

    file = io.BytesIO(output.encode('utf-8'))
    file.name = "database_dump.txt"
    
    await message.reply_document(
        document=file,
        caption=f"<b>✅ {stylish('full database export')}</b>"
    )

# --- [ 3. ADVANCED TAGALL SYSTEM ] ---
@app.on_message(filters.command(["tagall", "all"]) & filters.group)
async def tag_all(client, message: Message):
    chat_id = message.chat.id
    if not await is_admin(client, chat_id, message.from_user.id):
        return await message.reply_text(f"<b>❌ {stylish('admin only!')}</b>")

    if tagging_status.get(chat_id):
        return await message.reply_text(f"<b>⚠️ {stylish('already running!')}</b>")

    input_text = message.text.split(None, 1)[1] if len(message.command) > 1 else "Attention"
    
    members = []
    async for member in client.get_chat_members(chat_id):
        if not member.user.is_bot and not member.user.is_deleted:
            members.append(member.user)
    
    if not members: return await message.reply_text("<b>❌ No Members.</b>")

    tagging_status[chat_id] = True
    await message.reply_text(f"<b>🚀 {stylish('tagging started...')}</b>")

    batch_size = 5
    for i in range(0, len(members), batch_size):
        if not tagging_status.get(chat_id): break
        batch = members[i:i + batch_size]
        
        text = f"<b>┏━━「 {stylish('notification')} 」━━┓</b>\n"
        text += f"<b>┃ 🔔 {stylish(input_text)}</b>\n"
        text += f"<b>┃</b>\n"
        for user in batch:
            text += f"<b>┃ {random.choice(EMOJIS)} <a href='tg://user?id={user.id}'>{user.first_name}</a></b>\n"
        text += f"<b>┗━━━━━━━━━━┛</b>"
        
        try:
            await client.send_message(chat_id, text)
            await asyncio.sleep(2)
        except FloodWait as e:
            await asyncio.sleep(e.value)
        except Exception:
            continue

    tagging_status[chat_id] = False

@app.on_message(filters.command("tstop") & filters.group)
async def stop_tag(client, message: Message):
    if await is_admin(client, message.chat.id, message.from_user.id):
        tagging_status[message.chat.id] = False
        await message.reply_text(f"<b>🛑 {stylish('stopped!')}</b>")

# --- [ 4. ADVANCED LINK REMOVER ] ---
@app.on_message(filters.regex(r"(https?://|www\.|t\.me/|@)") & filters.group)
async def link_guard(client, message: Message):
    chat_id = message.chat.id
    user_id = message.from_user.id
    
    if user_id in OWNER_IDS: return 
    try:
        if await is_admin(client, chat_id, user_id): return
        
        await message.delete()
        warning = await message.reply_text(
            f"<b>┏━━「 ⚠️ {stylish('warning')} 」━━┓</b>\n"
            f"<b>┃ 🚫 {stylish('link removed!')}</b>\n"
            f"<b>┃ 👤 {stylish('user')}: {message.from_user.mention}</b>\n"
            f"<b>┗━━━━━━━━━━┛</b>"
        )
        await asyncio.sleep(5)
        await warning.delete()
    except: pass

# --- [ WELCOME HELPERS ] ---
def parse_welcome_buttons(text):
    if not text: return None, None
    lines = text.split('\n')
    keyboard = []
    clean_text_lines = []
    
    pattern = r"\[([^\]]+?)\|([^\]]+?)\]"
    
    for line in lines:
        matches = re.findall(pattern, line)
        if matches:
            row = []
            for name, url in matches:
                row.append(InlineKeyboardButton(name.strip(), url=url.strip()))
            keyboard.append(row)
        else:
            clean_text_lines.append(line)
            
    clean_text = "\n".join(clean_text_lines).strip()
    return clean_text, (InlineKeyboardMarkup(keyboard) if keyboard else None)

async def get_welcome_settings(chat_id):
    settings = await db.welcome_settings.find_one({"chat_id": chat_id})
    if not settings:
        return {"status": False, "clean": False, "msg": None, "media": None, "type": "text"}
    return settings

async def update_welcome_settings(chat_id, data):
    await db.welcome_settings.update_one(
        {"chat_id": chat_id}, {"$set": data}, upsert=True
    )
    
@app.on_message(filters.command("welcome") & filters.group)
async def welcome_menu(client, message: Message):
    if not await is_admin(client, message.chat.id, message.from_user.id): return
    
    text = f"""
<b>┏━━「 {stylish('welcome setup')} 」━━┓</b>
<b>┃ ┏─「 {stylish('commands')} 」</b>
<b>┃ ┃ ✅ <code>/welcome on</code> - {stylish('enable')}</b>
<b>┃ ┃ ❌ <code>/welcome off</code> - {stylish('disable')}</b>
<b>┃ ┃ 📝 <code>/setwelcome</code> - {stylish('set message')}</b>
<b>┃ ┃ 🧹 <code>/cleanwelcome</code> - {stylish('auto delete')}</b>
<b>┃ ┗───────────╼</b>
<b>┃ ┏─「 {stylish('placeholders')} 」</b>
<b>┃ ┃ 👤 {{mention}} - {stylish('user tag')}</b>
<b>┃ ┃ 📛 {{full_name}} - {stylish('full name')}</b>
<b>┃ ┃ 📧 {{username}} - {stylish('username')}</b>
<b>┃ ┗───────────╼</b>
<b>┗━━━━━━━━━━┛</b>
"""
    await message.reply_text(text, quote=True)

@app.on_message(filters.command(["welcome on", "welcome off"]) & filters.group)
async def toggle_welcome(client, message: Message):
    if not await is_admin(client, message.chat.id, message.from_user.id): return
    status = True if "on" in message.text else False
    await update_welcome_settings(message.chat.id, {"status": status})
    await message.reply_text(f"<b>✅ {stylish('welcome')} {'enabled' if status else 'disabled'}!</b>")

@app.on_message(filters.command("cleanwelcome") & filters.group)
async def toggle_clean(client, message: Message):
    if not await is_admin(client, message.chat.id, message.from_user.id): return
    current = await get_welcome_settings(message.chat.id)
    new_status = not current.get("clean", False)
    await update_welcome_settings(message.chat.id, {"clean": new_status})
    await message.reply_text(f"<b>🧹 {stylish('clean welcome')}: {'active' if new_status else 'inactive'}</b>")

@app.on_message(filters.command("setwelcome") & filters.group)
async def set_welcome(client, message: Message):
    if not await is_admin(client, message.chat.id, message.from_user.id): return
    
    target = message.reply_to_message if message.reply_to_message else message
    msg_text = target.caption or target.text
    
    if not msg_text or "/setwelcome" in msg_text and not message.reply_to_message:
        msg_text = msg_text.replace("/setwelcome", "").strip()
        if not msg_text:
            return await message.reply_text(f"<b>❌ {stylish('please provide text or reply to a message!')}</b>")

    media = None
    m_type = "text"
    
    if target.photo:
        media = target.photo.file_id
        m_type = "photo"
    elif target.video:
        media = target.video.file_id
        m_type = "video"

    await update_welcome_settings(message.chat.id, {
        "msg": msg_text.replace("/setwelcome", "").strip(),
        "media": media,
        "type": m_type
    })
    await message.reply_text(f"<b>✅ {stylish('new welcome message saved!')}</b>")

@app.on_message(filters.new_chat_members)
async def on_new_member(client, message: Message):
    chat_id = message.chat.id
    settings = await get_welcome_settings(chat_id)
    
    if not settings.get("status"): return

    for member in message.new_chat_members:
        if member.id == (await client.get_me()).id:
            return
            
        mention = f"<a href='tg://user?id={member.id}'>{member.first_name}</a>"
        full_name = f"{member.first_name} {member.last_name or ''}".strip()
        username = f"@{member.username}" if member.username else full_name
        
        raw_msg = settings.get("msg") or "Welcome {mention}!"
        clean_text, markup = parse_welcome_buttons(raw_msg)
        
        final_text = clean_text.replace("{mention}", mention).replace("{full_name}", full_name).replace("{username}", username)
        
        if settings.get("clean") and "last_msg_id" in settings:
            try: await client.delete_messages(chat_id, settings["last_msg_id"])
            except: pass

        try:
            m_type = settings.get("type", "text")
            media = settings.get("media")
            
            if m_type == "photo" and media:
                sent = await client.send_photo(chat_id, media, caption=final_text, reply_markup=markup)
            elif m_type == "video" and media:
                sent = await client.send_video(chat_id, media, caption=final_text, reply_markup=markup)
            else:
                sent = await client.send_message(chat_id, final_text, reply_markup=markup)
            
            await update_welcome_settings(chat_id, {"last_msg_id": sent.id})
            
        except Exception as e:
            logger.error(f"Welcome Error: {e}")

# --- [ MODERATION: MUTE & UNMUTE ] ---
@app.on_message(filters.command("mute") & filters.group)
async def mute_user(client, message: Message):
    if not await is_admin(client, message.chat.id, message.from_user.id): return
    
    user_id, reason = await get_target_user(client, message)
    if not user_id: 
        return await message.reply_text(f"<b>❌ {stylish('invalid target!')}</b>")
    
    if await is_admin(client, message.chat.id, user_id):
        return await message.reply_text(f"<b>🛡️ {stylish('safety: cannot mute an admin!')}</b>")

    try:
        await client.restrict_chat_member(message.chat.id, user_id, enums.ChatPermissions())
        user = await client.get_users(user_id)
        mention = f"<a href='tg://user?id={user.id}'>{user.first_name}</a>"

        text = f"""
<b>┏━━━「 {stylish('user muted')} 」━━━┓</b>
<b>┃ 👤 {stylish('target')}: {mention}</b>
<b>┃ 🆔 {stylish('id')}: <code>{user.id}</code></b>
<b>┃ 📝 {stylish('reason')}: {stylish(reason)}</b>
<b>┃ 🛡️ {stylish('admin')}: {message.from_user.first_name}</b>
<b>┗━━━━━━━━━━━━━━━━━━┛</b>
"""
        await message.reply_text(
            text,
            reply_markup=InlineKeyboardMarkup([
                [InlineKeyboardButton(f"🔊 {stylish('unmute user')}", callback_data=f"unmute_{user_id}")]
            ])
        )
    except Exception as e:
        await message.reply_text(f"<b>❌ {stylish('error')}:</b> <code>{e}</code>")

@app.on_message(filters.command("unmute") & filters.group)
async def unmute_command(client, message: Message):
    if not await is_admin(client, message.chat.id, message.from_user.id): return
    
    user_id, _ = await get_target_user(client, message)
    if not user_id: return
    
    try:
        await client.unban_chat_member(message.chat.id, user_id)
        user = await client.get_users(user_id)
        await message.reply_text(f"<b>🔊 {stylish('restored access for')} <a href='tg://user?id={user.id}'>{user.first_name}</a>!</b>")
    except Exception as e:
        await message.reply_text(f"<b>❌ {stylish('failed')}:</b> <code>{e}</code>")

@app.on_callback_query(filters.regex(r"unmute_(\d+)"))
async def unmute_btn_cb(client, cb: CallbackQuery):
    user_id = int(cb.data.split("_")[1])
    if not await is_admin(client, cb.message.chat.id, cb.from_user.id):
        return await cb.answer("❌ You don't have permission to unmute!", show_alert=True)
    
    try:
        await client.unban_chat_member(cb.message.chat.id, user_id)
        await cb.message.edit_text(f"<b>✅ {stylish('user unmuted successfully!')}</b>")
    except Exception as e:
        await cb.answer(f"Error: {e}", show_alert=True)

# --- [ MODERATION: PROMOTE & DEMOTE ] ---
@app.on_message(filters.command("promote") & filters.group)
async def promote_user(client, message: Message):
    if not await is_admin(client, message.chat.id, message.from_user.id): return
    
    user_id, _ = await get_target_user(client, message)
    if not user_id: return
    
    try:
        await client.promote_chat_member(
            message.chat.id, user_id,
            privileges=enums.ChatPrivileges(
                can_manage_chat=True,
                can_delete_messages=True,
                can_manage_video_chats=True,
                can_restrict_members=True,
                can_promote_members=False,
                can_change_info=True,
                can_invite_users=True,
                can_pin_messages=True
            )
        )
        user = await client.get_users(user_id)
        text = f"""
<b>┏━━━「 {stylish('promoted')} 」━━━┓</b>
<b>┃ 👤 {stylish('user')}: <a href='tg://user?id={user.id}'>{user.first_name}</a></b>
<b>┃ 🆔 {stylish('id')}: <code>{user.id}</code></b>
<b>┃ ⚡ {stylish('rank')}: {stylish('new administrator')}</b>
<b>┃ 🛡️ {stylish('by')}: {message.from_user.first_name}</b>
<b>┗━━━━━━━━━━━━━━━━━━┛</b>
"""
        await message.reply_text(text)
    except Exception as e:
        await message.reply_text(f"<b>❌ {stylish('promote failed')}:</b> <code>{e}</code>")

@app.on_message(filters.command("demote") & filters.group)
async def demote_user(client, message: Message):
    if not await is_admin(client, message.chat.id, message.from_user.id): return
    
    user_id, _ = await get_target_user(client, message)
    if not user_id: return
    
    if user_id in OWNER_IDS:
        return await message.reply_text(f"<b>🚫 {stylish('cannot demote my owner!')}</b>")

    try:
        await client.promote_chat_member(
            message.chat.id, user_id,
            privileges=enums.ChatPrivileges(
                can_manage_chat=False,
                can_delete_messages=False,
                can_manage_video_chats=False,
                can_restrict_members=False,
                can_promote_members=False,
                can_change_info=False,
                can_invite_users=False,
                can_pin_messages=False
            )
        )
        user = await client.get_users(user_id)
        text = f"""
<b>┏━━━「 {stylish('demoted')} 」━━━┓</b>
<b>┃ 👤 {stylish('user')}: <a href='tg://user?id={user.id}'>{user.first_name}</a></b>
<b>┃ 📉 {stylish('status')}: {stylish('rights removed')}</b>
<b>┃ 🛡️ {stylish('by')}: {message.from_user.first_name}</b>
<b>┗━━━━━━━━━━━━━━━━━━┛</b>
"""
        await message.reply_text(text)
    except Exception as e:
        await message.reply_text(f"<b>❌ {stylish('demote failed')}:</b> <code>{e}</code>")

# --- [ ADVANCED ACTIONS ] ---
@app.on_message(filters.command("rwarn") & filters.group)
async def reset_warn(client, message: Message):
    if not await is_admin(client, message.chat.id, message.from_user.id): return
    user_id, _ = await get_target_user(client, message)
    if not user_id: return
    
    await db.warns.delete_one({"chat_id": message.chat.id, "user_id": user_id})
    user = await client.get_users(user_id)
    text = f"<b>┏━━「 {stylish('warn reset')} 」━━┓</b>\n<b>┃ 👤 {stylish('user')}: <a href='tg://user?id={user.id}'>{user.first_name}</a></b>\n<b>┃ ✨ {stylish('status')}: {stylish('all warns removed')}</b>\n<b>┗━━━━━━━━━━┛</b>"
    await message.reply_text(text)

@app.on_message(filters.command("tmute") & filters.group)
async def temp_mute(client, message: Message):
    if not await is_admin(client, message.chat.id, message.from_user.id): return
    
    args = message.command
    time_val = "1m"
    reason = "N/A"
    
    if len(args) > 1 and (args[1][-1] in ['m','h','d']):
        time_val = args[1]
    
    user_id, res = await get_target_user(client, message)
    if not user_id: return
    if res != "N/A": reason = res

    duration = parse_time(time_val)
    if not duration: return await message.reply_text("<b>❌ Invalid time format! Use 1m, 1h, 1d</b>")
    until_date = datetime.datetime.now() + duration
    
    await client.restrict_chat_member(message.chat.id, user_id, enums.ChatPermissions(), until_date=until_date)
    user = await client.get_users(user_id)
    text = f"<b>┏━━「 {stylish('temp mute')} 」━━┓</b>\n<b>┃ 👤 {stylish('user')}: <a href='tg://user?id={user.id}'>{user.first_name}</a></b>\n<b>┃ ⏳ {stylish('time')}: {time_val}</b>\n<b>┃ 📝 {stylish('reason')}: {stylish(reason)}</b>\n<b>┗━━━━━━━━━━┛</b>"
    await message.reply_text(text)

@app.on_message(filters.command("ban") & filters.group)
async def ban_user(client, message: Message):
    if not await is_admin(client, message.chat.id, message.from_user.id): return
    user_id, reason = await get_target_user(client, message)
    if not user_id: return
    
    await client.ban_chat_member(message.chat.id, user_id)
    user = await client.get_users(user_id)
    text = f"<b>┏━━「 {stylish('banned')} 」━━┓</b>\n<b>┃ 👤 {stylish('user')}: <a href='tg://user?id={user.id}'>{user.first_name}</a></b>\n<b>┃ 📝 {stylish('reason')}: {stylish(reason)}</b>\n<b>┃ 🚫 {stylish('status')}: {stylish('removed from group')}</b>\n<b>┗━━━━━━━━━━┛</b>"
    await message.reply_text(text)

@app.on_message(filters.command("akick") & filters.group)
async def admin_kick(client, message: Message):
    if not await is_admin(client, message.chat.id, message.from_user.id): return
    user_id, reason = await get_target_user(client, message)
    if not user_id: return
    
    await client.ban_chat_member(message.chat.id, user_id)
    await client.unban_chat_member(message.chat.id, user_id) 
    user = await client.get_users(user_id)
    text = f"<b>┏━━「 {stylish('kicked')} 」━━┓</b>\n<b>┃ 👤 {stylish('user')}: <a href='tg://user?id={user.id}'>{user.first_name}</a></b>\n<b>┃ 📝 {stylish('reason')}: {stylish(reason)}</b>\n<b>┗━━━━━━━━━━┛</b>"
    await message.reply_text(text)

# --- [ WORD BLOCK & FILTER ] ---
@app.on_message(filters.command("word") & filters.group)
async def block_word(client, message: Message):
    if not await is_admin(client, message.chat.id, message.from_user.id): return
    if len(message.command) < 2: return
    word = message.text.split(None, 1)[1].lower()
    await db.blocked_words.update_one({"chat_id": message.chat.id}, {"$addToSet": {"words": word}}, upsert=True)
    await message.reply_text(f"<b>✅ {stylish('word blocked')}: {word}</b>")

@app.on_message(filters.command("words") & filters.group)
async def list_words(client, message: Message):
    data = await db.blocked_words.find_one({"chat_id": message.chat.id})
    words = data.get("words", []) if data else []
    if not words: return await message.reply_text(f"<b>📂 {stylish('no blocked words')}</b>")
    await message.reply_text(f"<b>🚫 {stylish('blocked words')}:</b>\n<code>{', '.join(words)}</code>")

@app.on_message(filters.group & ~filters.service, group=1)
async def word_filter(client, message: Message):
    if not message.text or await is_admin(client, message.chat.id, message.from_user.id): return
    data = await db.blocked_words.find_one({"chat_id": message.chat.id})
    if not data: return
    
    if any(word in message.text.lower() for word in data.get("words", [])):
        await message.delete()
        user_id = message.from_user.id
        
        v_data = await db.word_violations.find_one_and_update(
            {"chat_id": message.chat.id, "user_id": user_id},
            {"$inc": {"count": 1}}, upsert=True, return_document=True
        )
        count = v_data["count"]
        mention = f"<a href='tg://user?id={user_id}'>{message.from_user.first_name}</a>"
        
        if count == 10:
            await client.restrict_chat_member(message.chat.id, user_id, enums.ChatPermissions(), until_date=datetime.datetime.now() + datetime.timedelta(hours=1))
            await message.reply_text(f"<b>┏━━「 {stylish('violation')} 」━━┓\n┃ 👤 {mention}\n┃ 🚫 {stylish('action')}: 1ʜ {stylish('mute')}\n┃ 📝 {stylish('reason')}: {stylish('word limit reached')}\n┗━━━━━━━━━━┛</b>")
        elif count >= 13:
            await client.ban_chat_member(message.chat.id, user_id)
            await db.word_violations.delete_one({"chat_id": message.chat.id, "user_id": user_id})
            await message.reply_text(f"<b>┏━━「 {stylish('violation')} 」━━┓\n┃ 👤 {mention}\n┃ 🚫 {stylish('action')}: {stylish('removed')}\n┃ 📝 {stylish('reason')}: {stylish('repeated violations')}\n┗━━━━━━━━━━┛</b>")

# --- [ ANTI-FLOOD & REPORTING (Active Features) ] ---
@app.on_message(filters.group & ~filters.service & ~filters.me, group=3)
async def anti_flood_handler(client, message: Message):
    if not message.from_user or await is_admin(client, message.chat.id, message.from_user.id): return
    chat_id = message.chat.id
    user_id = message.from_user.id
    now = time.time()

    flood_data[user_id].append(now)
    flood_data[user_id] = [t for t in flood_data[user_id] if now - t < 3]

    if len(flood_data[user_id]) > 5: 
        try:
            until_date = datetime.datetime.now() + datetime.timedelta(hours=1)
            await client.restrict_chat_member(chat_id, user_id, enums.ChatPermissions(), until_date=until_date)
            flood_data[user_id] = []
            mention = f"<a href='tg://user?id={user_id}'>{message.from_user.first_name}</a>"
            text = f"""
<b>┏━━「 {stylish('anti flood')} 」━━┓</b>
<b>┃ 👤 {stylish('user')}: {mention}</b>
<b>┃ 🆔 {stylish('id')}: <code>{user_id}</code></b>
<b>┃ 🚫 {stylish('action')}: 1ʜ {stylish('mute')}</b>
<b>┃ 📝 {stylish('reason')}: {stylish('spamming detected')}</b>
<b>┗━━━━━━━━━━┛</b>
"""
            await message.reply_text(text)
            await message.delete()
        except Exception as e: logger.error(f"Anti-Flood Error: {e}")

@app.on_message(filters.regex(r"(?i)@admin") | filters.command("report") & filters.group)
async def report_handler(client, message: Message):
    chat_id = message.chat.id
    reporter = message.from_user
    reported_msg = message.reply_to_message
    
    admins = []
    async for m in client.get_chat_members(chat_id, filter=enums.ChatMembersFilter.ADMINISTRATORS):
        if not m.user.is_bot: admins.append(m.user.id)
    if not admins: return

    msg_link = f"https://t.me/c/{str(chat_id)[4:]}/{reported_msg.id}" if reported_msg else "N/A"
    text = f"""
<b>┏━━「 {stylish('admin alert')} 」━━┓</b>
<b>┃ ┏─「 {stylish('report info')} 」</b>
<b>┃ ┃ 👤 {stylish('by')}: {reporter.mention}</b>
<b>┃ ┃ 🆔 {stylish('id')}: <code>{reporter.id}</code></b>
<b>┃ ┗───────────╼</b>
<b>┃ 🚩 {stylish('reported message below')}</b>
<b>┃ 🔗 <a href='{msg_link}'>{stylish('click to view')}</a></b>
<b>┗━━━━━━━━━━┛</b>
"""
    mention_text = " ".join([f"[\u2063](tg://user?id={admin_id})" for admin_id in admins[:5]])
    await message.reply_text(f"{text}{mention_text}", disable_web_page_preview=True)

# --- [ LOCK SYSTEM (Complete) ] ---
LOCK_TYPES = ["url", "sticker", "gif", "photo", "forward", "botlink", "videomessage", "botcommand", "bot"]

@app.on_message(filters.command("lock") & filters.group)
async def lock_cmd(client, message: Message):
    if not await is_admin(client, message.chat.id, message.from_user.id): return
    if len(message.command) < 2: return
    l_type = message.command[1].lower()
    if l_type not in LOCK_TYPES: return
    
    await db.locks.update_one({"chat_id": message.chat.id}, {"$set": {f"locks.{l_type}": True}}, upsert=True)
    await message.reply_text(f"<b>🔒 {stylish(l_type)} {stylish('is now locked')}</b>")

@app.on_message(filters.command("unlock") & filters.group)
async def unlock_menu(client, message: Message):
    if not await is_admin(client, message.chat.id, message.from_user.id): return
    data = await db.locks.find_one({"chat_id": message.chat.id})
    locks = data.get("locks", {}) if data else {}
    
    buttons = []
    for l_type, val in locks.items():
        if val: buttons.append([InlineKeyboardButton(f"🔓 {stylish('unlock')} {l_type}", callback_data=f"unlck_{l_type}")])
    buttons.append([InlineKeyboardButton(f"❌ {stylish('cancel')}", callback_data="close_lock")])
    
    await message.reply_text(f"<b>🛠️ {stylish('select what to unlock')}:</b>", reply_markup=InlineKeyboardMarkup(buttons))

@app.on_callback_query(filters.regex(r"unlck_(.*)"))
async def unlck_cb(client, cb: CallbackQuery):
    if not await is_admin(client, cb.message.chat.id, cb.from_user.id): return
    l_type = cb.data.split("_")[1]
    await db.locks.update_one({"chat_id": cb.message.chat.id}, {"$set": {f"locks.{l_type}": False}})
    await cb.message.edit_text(f"<b>🔓 {stylish(l_type)} {stylish('unlocked!')}</b>")

@app.on_callback_query(filters.regex("close_lock"))
async def close_lock_cb(client, cb: CallbackQuery):
    if not await is_admin(client, cb.message.chat.id, cb.from_user.id): return
    await cb.message.delete()

@app.on_message(filters.command("locks") & filters.group)
async def show_locks(client, message: Message):
    data = await db.locks.find_one({"chat_id": message.chat.id})
    locks = data.get("locks", {}) if data else {}
    active = [k for k, v in locks.items() if v]
    text = f"<b>┏━━「 {stylish('active locks')} 」━━┓\n┃ " + ("\n┃ ".join([f"✅ {stylish(x)}" for x in active]) if active else stylish('none')) + "\n┗━━━━━━━━━━┛</b>"
    await message.reply_text(text)

@app.on_message(filters.group & ~filters.service, group=2)
async def lock_guardian(client, message: Message):
    if await is_admin(client, message.chat.id, message.from_user.id): return
    data = await db.locks.find_one({"chat_id": message.chat.id})
    if not data: return
    locks = data.get("locks", {})

    should_del = False
    if locks.get("url") and (message.entities or message.caption_entities):
        for ent in (message.entities or message.caption_entities):
            if ent.type in [enums.MessageEntityType.URL, enums.MessageEntityType.TEXT_LINK]: should_del = True
    elif locks.get("sticker") and message.sticker: should_del = True
    elif locks.get("gif") and message.animation: should_del = True
    elif locks.get("photo") and message.photo: should_del = True
    elif locks.get("forward") and message.forward_from_chat: should_del = True
    elif locks.get("videomessage") and message.video_note: should_del = True
    elif locks.get("botcommand") and message.text and message.text.startswith("/"): should_del = True
    elif locks.get("botlink") and message.text and "@" in message.text: should_del = True

    if should_del: await message.delete()

@app.on_message(filters.new_chat_members)
async def lock_bot_check(client, message: Message):
    data = await db.locks.find_one({"chat_id": message.chat.id})
    if data and data.get("locks", {}).get("bot"):
        for member in message.new_chat_members:
            if member.is_bot: await client.ban_chat_member(message.chat.id, member.id)

# --- [ HELP MENU ] ---
@app.on_message(filters.command("help") & filters.group)
async def admin_help(client, message: Message):
    if not await is_admin(client, message.chat.id, message.from_user.id):
        return await message.reply_text(f"<b>❌ {stylish('error')}: {stylish('this command is only for admins!')}</b>")

    help_text = f"""
<b>┏━━━「 {stylish('admin help menu')} 」━━━┓</b>
<b>┃ ┏─「 {stylish('welcome system')} 」</b>
<b>┃ ┃ ✅ <code>/welcome on | off</code></b>
<b>┃ ┃ 📝 <code>/setwelcome</code> (reply to msg)</b>
<b>┃ ┃ 🧹 <code>/cleanwelcome</code> (auto del)</b>
<b>┃ ┗───────────╼</b>
<b>┃ ┏─「 {stylish('moderation')} 」</b>
<b>┃ ┃ ⚠️ <code>/warn</code> | <code>/rwarn</code> (3 warn = mute)</b>
<b>┃ ┃ 🔇 <code>/mute</code> | <code>/unmute</code></b>
<b>┃ ┃ ⏳ <code>/tmute</code> (ex: /tmute 10m)</b>
<b>┃ ┃ 🚫 <code>/ban</code> | <code>/akick</code></b>
<b>┃ ┗───────────╼</b>
<b>┃ ┏─「 {stylish('security guard')} 」</b>
<b>┃ ┃ 🔐 <code>/lock</code> | <code>/unlock</code> (locks menu)</b>
<b>┃ ┃ 📂 <code>/locks</code> (check active locks)</b>
<b>┃ ┃ 🚫 <code>/word [text]</code> (block word)</b>
<b>┃ ┃ 🗑️ <code>/words</code> (blocked list)</b>
<b>┃ ┗───────────╼</b>
<b>┃ ┏─「 {stylish('staff & systems')} 」</b>
<b>┃ ┃ ⚡ <code>/promote</code> | <code>/demote</code></b>
<b>┃ ┃ 🛡️ {stylish('anti-flood')}: {stylish('active')}</b>
<b>┃ ┃ 🚩 {stylish('reporting')}: {stylish('@admin or /report')}</b>
<b>┃ ┗───────────╼</b>
<b>┃ ┏─「 {stylish('placeholders')} 」</b>
<b>┃ ┃ {{mention}}, {{full_name}}, {{username}}</b>
<b>┃ ┃ {stylish('use [ btn | url ] for buttons')}</b>
<b>┃ ┗───────────╼</b>
<b>┗━━━━━━━━━━━━━━━━━━┛</b>
"""
    await message.reply_text(
        help_text,
        reply_markup=InlineKeyboardMarkup([
            [InlineKeyboardButton(f"🛡️ {stylish('close menu')}", callback_data="close_help")]
        ])
    )

@app.on_callback_query(filters.regex("close_help"))
async def close_help_cb(client, cb: CallbackQuery):
    if not await is_admin(client, cb.message.chat.id, cb.from_user.id):
        return await cb.answer("❌ Admin Only!", show_alert=True)
    await cb.message.delete()

# --- [ EXECUTION ] ---
if __name__ == "__main__":
    t = threading.Thread(target=run_web_server)
    t.daemon = True
    t.start()
    
    t2 = threading.Thread(target=keep_alive)
    t2.daemon = True
    t2.start()
    
    print("🚀 BOT STARTED SUCCESSFULLY!")
    app.run()
