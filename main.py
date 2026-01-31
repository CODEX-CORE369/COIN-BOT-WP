import asyncio
import random
import httpx # requests এর বদলে httpx ব্যবহার করা হয়েছে (Non-blocking)
from flask import Flask
from threading import Thread
from pyrogram import Client, filters, enums
from pyrogram.types import Message
from pyrogram.errors import FloodWait, ChatAdminRequired

# --- CONFIGURATION ---
API_ID = 20579940
API_HASH = "6fc0ea1c8dacae05751591adedc177d7"
BOT_TOKEN = "7853734473:AAHdGjbtPFWD6wFlyu8KRWteRg_961WGRJk"
RENDER_URL = "https://coin-bot-wp.onrender.com" 

# --- FONT & TOOLS ---
FONT_MAP = {'A':'ᴀ','B':'ʙ','C':'ᴄ','D':'ᴅ','E':'ᴇ','F':'ғ','G':'ɢ','H':'ʜ','I':'ɪ','J':'ᴊ','K':'ᴋ','L':'ʟ','M':'ᴍ','N':'ɴ','O':'ᴏ','P':'ᴘ','Q':'ǫ','R':'ʀ','S':'s','T':'ᴛ','U':'ᴜ','V':'ᴠ','W':'ᴡ','X':'x','Y':'ʏ','Z':'ᴢ'}

def to_small_caps(text):
    return "".join(FONT_MAP.get(c.upper(), c) for c in text)

app = Client("NikoBot", api_id=API_ID, api_hash=API_HASH, bot_token=BOT_TOKEN, parse_mode=enums.ParseMode.HTML)
web_app = Flask(__name__)

# --- KEEP ALIVE ---
@web_app.route('/')
def home():
    return "NIKO IS ALIVE - POWERED BY DX-CODEX"

def run_web():
    web_app.run(host="0.0.0.0", port=8080)

async def keep_alive_ping():
    async with httpx.AsyncClient() as client:
        while True:
            try:
                # অসিঙ্ক্রোনাসলি রেন্ডার ইউআরএল পিং করা হচ্ছে
                await client.get(RENDER_URL, timeout=10)
            except Exception:
                pass
            await asyncio.sleep(300) # প্রতি ৫ মিনিটে একবার

# --- ADVANCED LOGIC ---
tagging_active = {}
emojis = [
    "💎", "🚀", "⚡", "🔥", "✨", "👑", "🎯", "🛡️", "🔮", "🌀", 
    "🤖", "👾", "🌟", "💥", "🌊", "🌋", "🌌", "🌍", "💰", "⚔️"
]

# 1. ADVANCED TAGALL ALGORITHM (সব মেম্বারকে ট্যাগ করবে)
@app.on_message(filters.command("tagall") & filters.group)
async def tag_all_members(client, message: Message):
    chat_id = message.chat.id
    
    # অ্যাডমিন চেক
    try:
        user_status = await client.get_chat_member(chat_id, message.from_user.id)
        if user_status.status not in [enums.ChatMemberStatus.ADMINISTRATOR, enums.ChatMemberStatus.OWNER]:
            return await message.reply(to_small_caps("ᴀᴅᴍɪɴ ᴏɴʟʏ ᴄᴏᴍᴍᴀɴᴅ!"))
    except Exception:
        return

    tagging_active[chat_id] = True
    input_text = message.text.split(None, 1)[1] if len(message.command) > 1 else "ᴛᴀɢɢɪɴɢ ᴍᴇᴍʙᴇʀs"
    header = to_small_caps(input_text)
    dev_tag = to_small_caps("ᴅᴇᴠ-ʙʏ: ᴅx-ᴄᴏᴅᴇx")

    # মেম্বার লিস্ট সংগ্রহ
    all_members = []
    async for member in client.get_chat_members(chat_id):
        if not member.user.is_bot and not member.user.is_deleted:
            all_members.append(member.user)

    await message.reply(f"<blockquote><b>{to_small_caps('ᴘʀᴏᴄᴇssɪɴɢ')}:</b> {len(all_members)} ᴍᴇᴍʙᴇʀs</blockquote>")

    # ৫ জন করে ব্যাচ আকারে ট্যাগিং
    for i in range(0, len(all_members), 5):
        if not tagging_active.get(chat_id): 
            break
        
        batch = all_members[i:i+5]
        msg_content = f"<b>┏━━「 {header} 」━━┓</b>\n"
        
        for user in batch:
            emoji = random.choice(emojis)
            mention = f"<a href='tg://user?id={user.id}'>{user.first_name}</a>"
            msg_content += f"<b>┃ {emoji}: {mention}</b>\n"
        
        msg_content += f"<blockquote>{dev_tag}</blockquote>\n"
        msg_content += "<b>┗━━━━━━━━━━━━━━┛</b>"
        
        try:
            await client.send_message(chat_id, msg_content)
            await asyncio.sleep(1.5) # FloodWait এড়াতে ১.৫ সেকেন্ড বিরতি
        except FloodWait as e:
            await asyncio.sleep(e.value)
        except Exception: 
            break

@app.on_message(filters.command("tstop") & filters.group)
async def stop_tagging(client, message: Message):
    tagging_active[message.chat.id] = False
    await message.reply(f"<b>🛑 {to_small_caps('ᴛᴀɢɢɪɴɢ sᴛᴏᴘᴘᴇᴅ')}</b>")

# 2. SERVICE REMOVER (Join/Leave Messages)
@app.on_message(filters.service)
async def auto_delete_service(client, message: Message):
    try:
        await message.delete()
    except Exception:
        pass

# 3. SMART MUSIC BOT FILTER + AUTO ALERT
@app.on_message(filters.group & filters.bot)
async def smart_link_filter(client, message: Message):
    # বট মেসেজে লিংক থাকলে এবং ভি সি অফ থাকলে ডিলিট করবে
    if message.text and ("http" in message.text.lower() or "t.me/" in message.text.lower()):
        try:
            chat_details = await client.get_chat(message.chat.id)
            if not chat_details.video_chat:
                await message.delete()
                
                # ৫ সেকেন্ড পর ডিলিট হবে এমন অ্যালার্ট
                alert_text = to_small_caps("ᴠᴏɪᴄᴇ ᴄʜᴀᴛ ᴏғғ. ᴍᴜsɪᴄ ʟɪɴᴋ ʀᴇᴍᴏᴠᴇᴅ!")
                alert = await client.send_message(
                    message.chat.id, 
                    f"<b>⚠️ {alert_text}</b>\n<blockquote>{to_small_caps('ᴘᴏᴡᴇʀᴇᴅ ʙʏ ᴅx-ᴄᴏᴅᴇx')}</blockquote>"
                )
                await asyncio.sleep(5)
                await alert.delete()
        except Exception:
            pass

# --- STARTUP ---
async def start_niko():
    # Keep alive টাস্ক শুরু করা
    asyncio.create_task(keep_alive_ping())
    await app.start()
    print("NIKO BOT IS ONLINE!")
    from pyrogram import idle
    await idle()

if __name__ == "__main__":
    # Flask সার্ভার থ্রেডে চালানো
    Thread(target=run_web, daemon=True).start()
    # মেইন বট অসিঙ্ক্রোনাসলি চালানো
    asyncio.run(start_niko())
