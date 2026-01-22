import os
import sys
import time
import threading
import requests
from datetime import timedelta
from flask import Flask
from pymongo import MongoClient

# WhatsApp Library (Neonize)
from neonize.client import NewClient
from neonize.events import ConnectedEv, MessageEv, PairStatusEv

# --- CONFIGURATION ---
MONGO_URL = "mongodb+srv://shadowur6_db_user:8AIIxZUjpanaQBjh@dx-codex.fmqcovu.mongodb.net/?retryWrites=true&w=majority&appName=Dx-codex"
DB_NAME = "DX-COINX"
B = "ᴅx" 
PREFIX = ">"
OWNER_NUM = "919593291902" 
BOT_NUM = os.getenv("919593291902") 
APP_URL = os.getenv("https://coin-bot-wp.onrender.com") # Render-er public URL (e.g. https://your-app.onrender.com)

# --- DATABASE CONNECTION ---
try:
    mongo = MongoClient(MONGO_URL)
    db = mongo[DB_NAME]
    users_col = db["users"]
    print(f"✅ {B} ᴅᴀᴛᴀʙᴀsᴇ ᴄᴏɴɴᴇᴄᴛᴇᴅ")
except Exception as e:
    print(f"❌ ᴅᴀᴛᴀʙᴀsᴇ ᴇʀʀᴏʀ: {e}")
    sys.exit()

# --- WEB SERVER & ANTI-SLEEP (KEEP ALIVE) ---
app_flask = Flask('')
@app_flask.route('/')
def home(): return f"{B} sʏsᴛᴇᴍ ᴏɴʟɪɴᴇ"

def run_web():
    port = int(os.environ.get('PORT', 8080))
    app_flask.run(host='0.0.0.0', port=port)

def keep_alive_ping():
    """System to prevent Render from sleeping"""
    if not APP_URL:
        print("⚠️ ᴀᴘᴘ_ᴜʀʟ ɴᴏᴛ sᴇᴛ! sᴇʟғ-ᴘɪɴɢ ᴅɪsᴀʙʟᴇᴅ.")
        return
    while True:
        try:
            time.sleep(300) # Ping every 5 minutes
            requests.get(APP_URL)
            print(f"📡 {B} sᴇʟғ-ᴘɪɴɢ sᴜᴄᴄᴇssғᴜʟ")
        except:
            pass

# --- BOT CLIENT ---
client = NewClient("dx_session.sqlite")

# --- HELPERS ---
def get_pure_num(jid): return jid.split('@')[0]
def get_mention(jid): return f"@{get_pure_num(jid)}"

def check_sudo(jid):
    num = get_pure_num(jid)
    if num == OWNER_NUM: return True
    user = users_col.find_one({"user_id": num})
    return user.get("is_sudo", 0) == 1 if user else False

def get_rank_info(coins):
    if coins >= 400: return ("💎", "💎💎💎", "ᴄᴏᴅᴇ ᴏᴡɴᴇʀ")
    elif coins >= 200: return ("🌟🌟🌟", "⭐⭐⭐", "ᴀᴅ/ʀᴜʟᴇʀ")
    elif coins >= 100: return ("🌟🌟", "⭐⭐", "ʜ-ᴄᴀᴘᴛᴀɪɴ")
    elif coins >= 50: return ("🌟", "⭐", "ᴅᴇs-ɴᴀᴍᴇ")
    return ("⚪️", "🌑", "ᴍᴇᴍʙᴇʀ")

def sync_data(jid, pushname):
    num = get_pure_num(jid)
    users_col.update_one(
        {"user_id": num},
        {"$set": {"full_name": pushname or "Usᴇր"},
         "$setOnInsert": {"coins": 0, "vault": 0, "last_claim": 0, "is_sudo": 0, "is_banned": 0}},
        upsert=True
    )

def is_banned(jid):
    user = users_col.find_one({"user_id": get_pure_num(jid)})
    return user.get("is_banned", 0) == 1 if user else False

# --- COMMAND HANDLER ---
@client.event(MessageEv)
def on_message(client, message: MessageEv):
    if not message.Info.MessageSource.Chat.endswith("@g.us"): return
    
    txt = message.Message.conversation or message.Message.extendedTextMessage.text
    if not txt: return
    
    sender_jid = message.Info.MessageSource.Sender
    pushname = message.Info.PushName
    sync_data(sender_jid, pushname)
    
    if is_banned(sender_jid):
        if txt.startswith(PREFIX):
            client.reply_message(f"🚫 *ʙᴀɴɴᴇᴅ ᴜsᴇʀ*\n\nʜᴇʏ {get_mention(sender_jid)}, ʏᴏᴜ ᴀʀᴇ ʙᴀɴɴᴇᴅ!", message)
        return

    if txt.startswith(PREFIX):
        cmd_parts = txt[len(PREFIX):].strip().split()
        if not cmd_parts: return
        cmd = cmd_parts[0].lower()
        args = cmd_parts[1:]
        m = get_mention(sender_jid)
        u_num = get_pure_num(sender_jid)

        if cmd == "menu":
            client.reply_message(
                f"┏━━「 ✨ *{B} ᴍᴇɴᴜ* 」━━┓\n"
                f"┃ 👤 *ʜɪ:* {m}\n"
                f"┣━━━━━━━━━━\n"
                f"┃ 📊 *{PREFIX}ᴄᴏɪɴ* • ᴄʜᴇᴄᴋ ᴄᴏɪɴ\n"
                f"┃ 🏆 *{PREFIX}ᴄᴛᴏᴘ* • ʟᴇᴀᴅᴇʀʙᴏᴀʀᴅ\n"
                f"┃ 🌟 *{PREFIX}sᴛᴀʀ* • sᴛᴀʀ ʟɪsᴛ\n"
                f"┃ 🎁 *{PREFIX}ᴄʟᴀɪᴍ* • ᴅᴀɪʟʏ ᴄᴏɪɴ\n"
                f"┃ 💸 *{PREFIX}ɢɪғᴛ* • sᴇɴᴅ ᴄᴏɪɴ\n"
                f"┃ 🏦 *{PREFIX}ᴠᴀᴜʟᴛ* • sᴀᴠᴇ ᴄᴏɪɴ\n"
                f"┃ 📜 *{PREFIX}ᴄʀᴜʟᴇs* • ʙᴏᴛ ʀᴜʟᴇs\n"
                f"┃ ⚡ *{PREFIX}sᴜᴅᴏ* • ᴀᴅᴍɪɴ ʟɪsᴛ\n"
                f"┗━━━━━━━━━━┛", message
            )

        elif cmd in ["coin", "mycoin"]:
            target_jid = sender_jid
            if message.Message.extendedTextMessage and message.Message.extendedTextMessage.contextInfo:
                ctx = message.Message.extendedTextMessage.contextInfo
                if ctx.mentionedJid: target_jid = ctx.mentionedJid[0]
                elif ctx.participant: target_jid = ctx.participant
            user = users_col.find_one({"user_id": get_pure_num(target_jid)})
            badge, stars, rank_n = get_rank_info(user['coins'])
            g_rank = users_col.count_documents({"coins": {"$gt": user['coins']}}) + 1
            client.reply_message(
                f"┏━━「 📊 *ᴘʀᴏғɪʟᴇ* 」━━┓\n"
                f"┃ 👤 *ɴᴀᴍᴇ:* {get_mention(target_jid)}\n"
                f"┃ 🆔 *ᴜɪᴅ:* ```{get_pure_num(target_jid)}```\n"
                f"┣━━━━━━━━━━\n"
                f"┃ 💰 *ᴘᴏᴄᴋᴇᴛ:* ```{user['coins']}```\n"
                f"┃ 🏦 *ᴠᴀᴜʟᴛ:* ```{user.get('vault', 0)}```\n"
                f"┃ 🏆 *ʀᴀɴᴋ:* #{g_rank}\n"
                f"┃ 🎖️ *ʙᴀᴅɢᴇ:* {badge} ({rank_n})\n"
                f"┃ ⭐ *sᴛᴀʀs:* {stars}\n"
                f"┗━━━━━━━━━━┛", message
            )

        elif cmd == "ctop":
            rows = list(users_col.find().sort("coins", -1).limit(10))
            board = f"┏━━「 🏆 *ᴛᴏᴘ ʀɪᴄʜᴇsᴛ* 」━━┓\n"
            for i, row in enumerate(rows, 1):
                icon = "🥇" if i==1 else "🥈" if i==2 else "🥉" if i==3 else f"*{i}.*"
                badge, _, _ = get_rank_info(row.get('coins',0))
                board += f"┃ {icon} {get_mention(f'{row['user_id']}@s.whatsapp.net')}\n"
                board += f"┃ ╰╼ ɪᴅ: ```{row['user_id']}``` • 💰 {row.get('coins',0)} {badge}\n"
            board += f"┗━━━━━━━━━━┛"
            client.reply_message(board, message)

        elif cmd == "star":
            stars_list = users_col.find({"coins": {"$gte": 50}}).sort("coins", -1).limit(15)
            text = f"┏━━「 🌟 *sᴛᴀʀ ʜᴏʟᴅᴇʀs* 」━━┓\n"
            count = 0
            for u in stars_list:
                count += 1
                badge, s_icon, r_name = get_rank_info(u.get('coins', 0))
                text += f"┃ {count}. {get_mention(f'{u['user_id']}@s.whatsapp.net')}\n"
                text += f"┃ ╰╼ {badge} • {u['coins']} ({s_icon})\n"
            client.reply_message(text + f"┗━━━━━━━━━━┛", message)

        elif cmd == "claim":
            if "dark" not in pushname.lower():
                client.reply_message(f"┏━━「 ❌ *ᴀᴄᴄᴇss ᴅᴇɴɪᴇᴅ* 」━━┓\n┃ 👤: *{m}*\n┃ ⚠️: *ʏᴏᴜ ᴀʀᴇ ɴᴏᴛ ᴀ ᴅᴀʀᴋ ᴜsᴇʀ!*\n┗━━━━━━━━━━┛", message)
                return
            user = users_col.find_one({"user_id": u_num})
            now = time.time()
            if now - user.get("last_claim", 0) < 86400:
                rem = 86400 - (now - user.get("last_claim", 0))
                client.reply_message(f"┏━━「 ⏳ *ᴡᴀɪᴛ* 」━━┓\n┃ 👤: {m}\n┃ ⏳: ```{str(timedelta(seconds=int(rem)))}```\n┗━━━━━━━━━━┛", message)
                return
            users_col.update_one({"user_id": u_num}, {"$inc": {"coins": 1}, "$set": {"last_claim": now}})
            client.reply_message(f"┏━━「 ✅ *ᴅᴏɴᴇ* 」━━┓\n┃ 👤: {m}\n┃ 💰: *+1 ᴄᴏɪɴ!*\n┗━━━━━━━━━━┛", message)

        elif cmd == "gift":
            try:
                amt, target_jid = int(args[0]), message.Message.extendedTextMessage.contextInfo.mentionedJid[0]
                if get_pure_num(target_jid) == u_num: return
                sender = users_col.find_one({"user_id": u_num})
                if sender['coins'] >= amt:
                    users_col.update_one({"user_id": u_num}, {"$inc": {"coins": -amt}})
                    users_col.update_one({"user_id": get_pure_num(target_jid)}, {"$inc": {"coins": amt}})
                    client.reply_message(f"┏━━「 💸 *sᴇɴᴛ* 」━━┓\n┃ 👤 ғʀᴏᴍ: {m}\n┃ 👤 ᴛᴏ: {get_mention(target_jid)}\n┃ 💰 ᴀᴍᴛ: {amt}\n┗━━━━━━━━━━┛", message)
            except: pass

        elif cmd == "vault":
            user = users_col.find_one({"user_id": u_num})
            if len(args) == 0:
                client.reply_message(f"┏━━「 🏦 *ᴠᴀᴜʟᴛ* 」━━┓\n┃ 👤 ᴜsᴇր: {m}\n┃ 💰 sᴀᴠᴇᴅ: ```{user.get('vault', 0)}```\n┗━━━━━━━━━━┛", message)
            else:
                try:
                    act, amt = args[0].lower(), int(args[1])
                    if act in ["dep", "d"] and user['coins'] >= amt:
                        users_col.update_one({"user_id": u_num}, {"$inc": {"coins": -amt, "vault": amt}})
                        client.reply_message(f"✅ {m}, sᴀᴠᴇᴅ {amt} ᴄᴏɪɴs!", message)
                    elif act in ["wd", "w"] and user.get('vault', 0) >= amt:
                        users_col.update_one({"user_id": u_num}, {"$inc": {"coins": amt, "vault": -amt}})
                        client.reply_message(f"✅ {m}, ᴡɪᴛʜᴅʀᴇᴡ {amt} ᴄᴏɪɴs!", message)
                except: pass

        elif cmd == "crules":
            client.reply_message(
                f"┏━━━「 📜 *{B} ʀᴜʟᴇs* 」━━━┓\n┃ 👤: {m}\n┣━━━━━━━━━━━━━━━━━\n"
                f"┃ 🔸 ᴅᴀʀᴋ ɢᴀɴɢ ᴜ-ᴀᴅᴅ: 2 ᴄᴏɪɴ\n┃ 🔹 ᴀᴅᴅᴀ ɢ-ʜᴀᴄᴋ(500+): 5 ᴄᴏɪɴ\n"
                f"┃ 🔹 ᴀᴅᴅᴀ ɢ-ʜᴀᴄᴋ(-500): 3 ᴄᴏɪɴ\n┃ 🔸 ʜᴏᴛʟɪɴᴇ ɢ-ʜᴀᴄᴋ: 10 ᴄᴏɪɴ\n"
                f"┃ 🔹 -15 ʏ-ɢʀᴏᴜᴘ ʜᴀᴄᴋ: 12 ᴄᴏɪɴ\n┣━━━━━ 🎖️ *sᴛᴀʀs* ━━━━━\n"
                f"┃ ⭐: 50+ (ᴅᴇs-ɴᴀᴍᴇ)\n┃ ⭐⭐: 100+ (ʜ-ᴄᴀᴘᴛᴀɪɴ)\n"
                f"┃ ⭐⭐⭐: 200+ (ʀᴜʟᴇʀ)\n┃ 💎: 400+ (ᴄᴏᴅᴇ ᴏᴡɴᴇʀ)\n┗━━━━━━━━━━━━━━━━┛", message
            )

        elif cmd == "acoin":
            if not check_sudo(sender_jid): return
            try:
                amt, target_jid = int(args[0]), message.Message.extendedTextMessage.contextInfo.mentionedJid[0]
                users_col.update_one({"user_id": get_pure_num(target_jid)}, {"$inc": {"coins": amt}})
                new_c = users_col.find_one({"user_id": get_pure_num(target_jid)})['coins']
                client.reply_message(f"┏━━「 ✅ *ᴀᴅᴅ ᴄᴏɪɴ* 」━━┓\n┃ 👤 ʙʏ: {m}\n┃ 👤 ᴛᴏ: {get_mention(target_jid)}\n┃ 💰 ᴀᴍᴛ: {amt}\n┃ 👜 ᴛᴏᴛᴀʟ: {new_c}\n┗━━━━━━━━━━┛", message)
            except: pass

        elif cmd == "mcoin":
            if not check_sudo(sender_jid): return
            try:
                amt, target_jid = int(args[0]), message.Message.extendedTextMessage.contextInfo.mentionedJid[0]
                users_col.update_one({"user_id": get_pure_num(target_jid)}, {"$inc": {"coins": -amt}})
                new_c = users_col.find_one({"user_id": get_pure_num(target_jid)})['coins']
                client.reply_message(f"┏━━「 📉 *ᴍɪɴᴜs ᴄᴏɪɴ* 」━━┓\n┃ 👤 ʙʏ: {m}\n┃ 👤 ᴛᴏ: {get_mention(target_jid)}\n┃ 💰 ᴀᴍᴛ: -{amt}\n┃ 👜 ᴛᴏᴛᴀʟ: {new_c}\n┗━━━━━━━━━━┛", message)
            except: pass

        elif cmd == "sudo":
            if get_pure_num(sender_jid) != OWNER_NUM: return
            if message.Message.extendedTextMessage and message.Message.extendedTextMessage.contextInfo.mentionedJid:
                target_jid = message.Message.extendedTextMessage.contextInfo.mentionedJid[0]
                users_col.update_one({"user_id": get_pure_num(target_jid)}, {"$set": {"is_sudo": 1}})
                client.reply_message(f"┏━━「 🟢 *sᴜᴅᴏ* 」━━┓\n┃ 👤 ᴀᴅᴅᴇᴅ: {get_mention(target_jid)}\n┗━━━━━━━━━━┛", message)
            else:
                sudos = list(users_col.find({"is_sudo": 1}))
                res = f"┏━━「 ✨ *sᴜᴅᴏs* 」━━┓\n┃ 👑 *ᴏᴡɴᴇʀ:* ```{OWNER_NUM}```\n"
                for i, s in enumerate(sudos, 1): res += f"┃ {i}. {get_mention(f'{s['user_id']}@s.whatsapp.net')}\n"
                client.reply_message(res + "┗━━━━━━━━━━┛", message)

        elif cmd in ["ban", "unban"]:
            if not check_sudo(sender_jid): return
            try:
                target_jid = message.Message.extendedTextMessage.contextInfo.mentionedJid[0]
                status = 1 if cmd == "ban" else 0
                users_col.update_one({"user_id": get_pure_num(target_jid)}, {"$set": {"is_banned": status}})
                client.reply_message(f"┏━━「 🛠️ *{cmd.upper()}* 」━━┓\n┃ 👤: {get_mention(target_jid)}\n┃ ✅: sᴜᴄᴄᴇss\n┗━━━━━━━━━━┛", message)
            except: pass

# --- STARTUP ---
def start_bot():
    if not os.path.exists("dx_session.sqlite"):
        if not BOT_NUM: return
        print(f"⏳ ᴘᴀɪʀ ᴄᴏᴅᴇ ғᴏʀ: {BOT_NUM}")
        client.pair_code(BOT_NUM)
        client.connect()
    else:
        client.connect()

if __name__ == "__main__":
    threading.Thread(target=run_web, daemon=True).start()
    threading.Thread(target=keep_alive_ping, daemon=True).start()
    start_bot()
