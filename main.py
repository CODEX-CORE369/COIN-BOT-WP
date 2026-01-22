import os
import sys
import time
import threading
import signal
from datetime import timedelta
from flask import Flask

# Database
from pymongo import MongoClient

# WhatsApp Library (Neonize)
from neonize.client import NewClient
from neonize.events import (
    ConnectedEv,
    MessageEv,
    PairStatusEv
)
from neonize.utils import log

# --- CONFIGURATION ---
MONGO_URL = "mongodb+srv://shadowur6_db_user:8AIIxZUjpanaQBjh@dx-codex.fmqcovu.mongodb.net/?retryWrites=true&w=majority&appName=Dx-codex"
DB_NAME = "DX-COINX"
OWNER_NUM = "919593291902"  # ⚠️ Owner Number ekhane dao (No +)
PREFIX = ">"
BOT_NAME = "ᴅx"

# --- DATABASE CONNECTION ---
try:
    mongo = MongoClient(MONGO_URL)
    db = mongo[DB_NAME]
    users_col = db["users"]
    print(f"✅ {BOT_NAME} ᴅᴀᴛᴀʙᴀsᴇ ᴄᴏɴɴᴇᴄᴛᴇᴅ")
except Exception as e:
    print(f"❌ ᴅᴀᴛᴀʙᴀsᴇ ᴇʀʀᴏʀ: {e}")
    sys.exit()

# --- WEB SERVER (Keep Alive) ---
app_flask = Flask(__name__)

@app_flask.route('/')
def home():
    return f"{BOT_NAME} sʏsᴛᴇᴍ ᴏɴʟɪɴᴇ"

def run_web():
    port = int(os.environ.get('PORT', 8080))
    app_flask.run(host='0.0.0.0', port=port)

# --- CLIENT INIT ---
client = NewClient("dx_session.sqlite")

# --- HELPERS ---

def get_sender(message):
    if message.Info.IsFromMe:
        return message.Info.Sender
    return message.Info.Sender

def get_pure_number(jid):
    return jid.split('@')[0]

def get_mention(jid):
    return f"@{get_pure_number(jid)}"

def check_sudo(jid):
    clean_num = get_pure_number(jid)
    if clean_num == OWNER_NUM:
        return True
    user = users_col.find_one({"user_id": clean_num})
    return user.get("is_sudo", 0) == 1 if user else False

def get_rank_info(coins):
    if coins >= 400: return ("💎", "💎💎💎", "ᴄᴏᴅᴇ ᴏᴡɴᴇʀ")
    elif coins >= 200: return ("🌟🌟🌟", "⭐⭐⭐", "ᴀᴅ/ʀᴜʟᴇʀ")
    elif coins >= 100: return ("🌟🌟", "⭐⭐", "ʜ-ᴄᴀᴘᴛᴀɪɴ")
    elif coins >= 50: return ("🌟", "⭐", "ᴅᴇs-ɴᴀᴍᴇ")
    return ("⚪️", "🌑", "ᴍᴇᴍʙᴇʀ")

def sync_data(jid, pushname):
    user_id = get_pure_number(jid)
    name = pushname if pushname else "Usᴇʀ"
    users_col.update_one(
        {"user_id": user_id},
        {
            "$set": {"full_name": name},
            "$setOnInsert": {"coins": 0, "vault": 0, "last_claim": 0, "is_sudo": 0, "is_banned": 0}
        },
        upsert=True
    )

def is_banned(jid):
    user_id = get_pure_number(jid)
    user = users_col.find_one({"user_id": user_id})
    return user.get("is_banned", 0) == 1 if user else False

# --- EVENTS ---

@client.event(ConnectedEv)
def on_connected(client, event):
    print(f"✅ {BOT_NAME} ᴄᴏɴɴᴇᴄᴛᴇᴅ")

@client.event(PairStatusEv)
def PairStatusMessage(client, message: PairStatusEv):
    print(f"🔗 ʟᴏɢɢᴇᴅ ɪɴ ᴀs: {message.ID.User}")

@client.event(MessageEv)
def on_message(client, message: MessageEv):
    # 1. Group Only
    if not message.Info.MessageSource.Chat.endswith("@g.us"):
        return 
    
    txt = message.Message.conversation or message.Message.extendedTextMessage.text
    if not txt:
        return
    
    sender_jid = message.Info.MessageSource.Sender
    pushname = message.Info.PushName
    
    # 2. Sync User
    sync_data(sender_jid, pushname)
    
    # 3. Ban Check
    if is_banned(sender_jid):
        if txt.startswith(PREFIX):
             client.reply_message(
                f"🚫 *ʙᴀɴɴᴇᴅ ᴜsᴇʀ*\n\nHey {get_mention(sender_jid)}, ʏᴏᴜ ᴀʀᴇ ʙᴀɴɴᴇᴅ ғʀᴏᴍ ᴜsɪɴɢ ᴛʜɪs ʙᴏᴛ!",
                message
            )
        return

    # 4. Commands
    if txt.startswith(PREFIX):
        cmd_parts = txt[len(PREFIX):].split()
        cmd = cmd_parts[0].lower()
        args = cmd_parts[1:]
        
        user_num = get_pure_number(sender_jid)
        m_tag = get_mention(sender_jid)

        # --- COMMAND: MENU ---
        if cmd == "menu":
            menu_text = (
                f"┏━━「 ✨ {BOT_NAME} ᴍᴇɴᴜ 」━━┓\n"
                f"┃ 👤 *ʜɪ:* {m_tag}\n"
                f"┣━━━━━━━━━━\n"
                f"┃ 📊 *{PREFIX}coin* • ᴄʜᴇᴄᴋ ᴄᴏɪɴ\n"
                f"┃ 🏆 *{PREFIX}ctop* • ʟᴇᴀᴅᴇʀʙᴏᴀʀᴅ\n"
                f"┃ 🌟 *{PREFIX}star* • sᴛᴀʀ ʟɪsᴛ\n"
                f"┃ 🎁 *{PREFIX}claim* • ᴅᴀɪʟʏ ᴄᴏɪɴ\n"
                f"┃ 💸 *{PREFIX}gift* • sᴇɴᴅ ᴄᴏɪɴ\n"
                f"┃ 🏦 *{PREFIX}vault* • sᴀᴠᴇ ᴄᴏɪɴ\n"
                f"┃ 📜 *{PREFIX}rules* • ʙᴏᴛ ʀᴜʟᴇs\n"
                f"┃ ⚡ *{PREFIX}sudo* • ᴀᴅᴍɪɴ ʟɪsᴛ\n"
                f"┗━━━━━━━━━━┛"
            )
            client.reply_message(menu_text, message)

        # --- COMMAND: COIN / MYCOIN ---
        elif cmd in ["coin", "mycoin"]:
            target_jid = sender_jid
            if message.Message.extendedTextMessage and message.Message.extendedTextMessage.contextInfo:
                if message.Message.extendedTextMessage.contextInfo.mentionedJid:
                    target_jid = message.Message.extendedTextMessage.contextInfo.mentionedJid[0]
                elif message.Message.extendedTextMessage.contextInfo.participant:
                    target_jid = message.Message.extendedTextMessage.contextInfo.participant
            
            t_num = get_pure_number(target_jid)
            user_doc = users_col.find_one({"user_id": t_num})
            if not user_doc: sync_data(target_jid, "Unknown"); user_doc = users_col.find_one({"user_id": t_num})

            badge, stars, rank_n = get_rank_info(user_doc['coins'])
            g_rank = users_col.count_documents({"coins": {"$gt": user_doc['coins']}}) + 1

            stats_text = (
                f"┏━━「 📊 ᴘʀᴏғɪʟᴇ 」━━┓\n"
                f"┃ 👤 *ɴᴀᴍᴇ:* {get_mention(target_jid)}\n"
                f"┃ 🆔 *ᴜɪᴅ:* ```{t_num}```\n"
                f"┣━━━━━━━━━━\n"
                f"┃ 💰 *ᴘᴏᴄᴋᴇᴛ:* ```{user_doc['coins']}```\n"
                f"┃ 🏦 *ᴠᴀᴜʟᴛ:* ```{user_doc.get('vault', 0)}```\n"
                f"┃ 🏆 *ʀᴀɴᴋ:* #{g_rank}\n"
                f"┃ 🎖️ *ʙᴀᴅɢᴇ:* {badge} ({rank_n})\n"
                f"┃ ⭐ *sᴛᴀʀs:* {stars}\n"
                f"┗━━━━━━━━━━┛"
            )
            client.reply_message(stats_text, message)
        
        # --- COMMAND: CTOP (Leaderboard) ---
        elif cmd == "ctop":
            rows = list(users_col.find().sort("coins", -1).limit(10))
            board = f"┏━━「 🏆 ᴛᴏᴘ ʀɪᴄʜᴇsᴛ 」━━┓\n"
            for i, row in enumerate(rows, 1):
                icon = "🥇" if i==1 else "🥈" if i==2 else "🥉" if i==3 else f"*{i}.*"
                badge, _, _ = get_rank_info(row.get('coins',0))
                u_name = row.get('full_name', 'User')[:12]
                board += f"┃ {icon} {get_mention(f'{row['user_id']}@s.whatsapp.net')}\n"
                board += f"┃ ╰╼ ID: ```{row['user_id']}``` • 💰 {row.get('coins',0)} {badge}\n"
            board += f"┗━━━━━━━━━━┛"
            client.reply_message(board, message)

        # --- COMMAND: CLAIM ---
        elif cmd == "claim":
            # Check for "Dark" in name (Case Insensitive)
            if "dark" not in pushname.lower():
                client.reply_message(
                    f"┏━━「 ❌ ᴀᴄᴄᴇss ᴅᴇɴɪᴇᴅ 」━━┓\n"
                    f"┃ 👤: {m_tag}\n"
                    f"┃ ⚠️: ʏᴏᴜ ᴀʀᴇ ɴᴏᴛ ᴀ *Dark* ᴜsᴇʀ!\n"
                    f"┃ 💡: ᴘʟᴇᴀsᴇ ᴀᴅᴅ 'ᴅᴀʀᴋ' ᴛᴏ ʏᴏᴜʀ ɴᴀᴍᴇ.\n"
                    f"┗━━━━━━━━━━┛",
                    message
                )
                return

            user_doc = users_col.find_one({"user_id": user_num})
            now = time.time()
            if now - user_doc.get("last_claim", 0) < 86400:
                rem = 86400 - (now - user_doc.get("last_claim", 0))
                client.reply_message(
                    f"┏━━「 ⏳ ᴄᴏᴏʟᴅᴏᴡɴ 」━━┓\n"
                    f"┃ 👤: {m_tag}\n"
                    f"┃ ⏳: ```{str(timedelta(seconds=int(rem)))}```\n"
                    f"┗━━━━━━━━━━┛", 
                    message
                )
                return
            
            users_col.update_one({"user_id": user_num}, {"$inc": {"coins": 1}, "$set": {"last_claim": now}})
            client.reply_message(
                f"┏━━「 ✅ sᴜᴄᴄᴇss 」━━┓\n"
                f"┃ 👤: {m_tag}\n"
                f"┃ 💰: *+1 ᴄᴏɪɴ* ᴀᴅᴅᴇᴅ!\n"
                f"┗━━━━━━━━━━┛",
                message
            )

        # --- COMMAND: ACOIN (Sudo Only) ---
        elif cmd == "acoin":
            if not check_sudo(sender_jid): return
            
            if len(args) < 1:
                client.reply_message(f"⚠️ ғᴏʀᴍᴀᴛ: `{PREFIX}acoin ᴀᴍᴏᴜɴᴛ @ᴛᴀɢ`", message)
                return

            try: amt = int(args[0])
            except: return

            target_jid = None
            if message.Message.extendedTextMessage and message.Message.extendedTextMessage.contextInfo:
                 if message.Message.extendedTextMessage.contextInfo.mentionedJid:
                     target_jid = message.Message.extendedTextMessage.contextInfo.mentionedJid[0]
            
            if not target_jid:
                client.reply_message("⚠️ ᴘʟᴇᴀsᴇ ᴛᴀɢ ᴀ ᴜsᴇʀ.", message)
                return

            t_num = get_pure_number(target_jid)
            sync_data(target_jid, None)
            
            users_col.update_one({"user_id": t_num}, {"$inc": {"coins": amt}})
            user_doc = users_col.find_one({"user_id": t_num})
            
            client.reply_message(
                f"┏━━「 ✅ ᴄᴏɪɴ ᴀᴅᴅᴇᴅ 」━━┓\n"
                f"┃ 👤 *ʙʏ:* {m_tag}\n"
                f"┃ 👤 *ᴛᴏ:* {get_mention(target_jid)}\n"
                f"┃ 💰 *ᴀᴅᴅᴇᴅ:* ```{amt}```\n"
                f"┃ 👜 *ᴛᴏᴛᴀʟ:* ```{user_doc['coins']}```\n"
                f"┗━━━━━━━━━━┛",
                message
            )

        # --- COMMAND: BAN / UNBAN ---
        elif cmd in ["ban", "unban"]:
            if not check_sudo(sender_jid): return
            
            target_jid = None
            if message.Message.extendedTextMessage and message.Message.extendedTextMessage.contextInfo:
                 if message.Message.extendedTextMessage.contextInfo.mentionedJid:
                     target_jid = message.Message.extendedTextMessage.contextInfo.mentionedJid[0]
            
            if not target_jid: return

            t_num = get_pure_number(target_jid)
            
            if cmd == "ban":
                users_col.update_one({"user_id": t_num}, {"$set": {"is_banned": 1}})
                client.reply_message(
                    f"┏━━「 🚫 ʙᴀɴɴᴇᴅ 」━━┓\n"
                    f"┃ 👤: {get_mention(target_jid)}\n"
                    f"┃ 👮: ʙᴀɴɴᴇᴅ ʙʏ ᴀᴅᴍɪɴ\n"
                    f"┗━━━━━━━━━━┛",
                    message
                )
            else:
                users_col.update_one({"user_id": t_num}, {"$set": {"is_banned": 0}})
                client.reply_message(
                    f"┏━━「 🟢 ᴜɴʙᴀɴɴᴇᴅ 」━━┓\n"
                    f"┃ 👤: {get_mention(target_jid)}\n"
                    f"┃ ✅: ᴀᴄᴄᴇss ʀᴇsᴛᴏʀᴇᴅ.\n"
                    f"┗━━━━━━━━━━┛",
                    message
                )

        # --- COMMAND: SUDO ---
        elif cmd == "sudo":
            if get_pure_number(sender_jid) != OWNER_NUM:
                sudos = list(users_col.find({"is_sudo": 1}))
                res = f"┏━━「 ✨ sᴜᴅᴏ ʟɪsᴛ 」━━┓\n"
                res += f"┃ 👑 *ᴏᴡɴᴇʀ:* ```{OWNER_NUM}```\n"
                for i, s in enumerate(sudos, 1):
                    res += f"┃ {i}. ```{s['user_id']}```\n"
                res += "┗━━━━━━━━━━┛"
                client.reply_message(res, message)
                return

            target_jid = None
            if message.Message.extendedTextMessage and message.Message.extendedTextMessage.contextInfo:
                 if message.Message.extendedTextMessage.contextInfo.mentionedJid:
                     target_jid = message.Message.extendedTextMessage.contextInfo.mentionedJid[0]
            
            if target_jid:
                t_num = get_pure_number(target_jid)
                users_col.update_one({"user_id": t_num}, {"$set": {"is_sudo": 1}})
                client.reply_message(f"✅ {get_mention(target_jid)} ɪs ɴᴏᴡ *sᴜᴅᴏ*!", message)

        # --- COMMAND: VAULT ---
        elif cmd == "vault":
            user_doc = users_col.find_one({"user_id": user_num})
            if len(args) == 0:
                client.reply_message(
                    f"┏━━「 🏦 ᴠᴀᴜʟᴛ 」━━┓\n"
                    f"┃ 👤 *ᴜsᴇʀ:* {m_tag}\n"
                    f"┃ 💰 *sᴀᴠᴇᴅ:* ```{user_doc.get('vault', 0)}```\n"
                    f"┗━━━━━━━━━━┛",
                    message
                )
                return
            
            try:
                action = args[0].lower()
                amount = int(args[1])
                
                if action in ["dep", "d"]:
                    if user_doc['coins'] >= amount:
                        users_col.update_one({"user_id": user_num}, {"$inc": {"coins": -amount, "vault": amount}})
                        client.reply_message(f"✅ {m_tag}, ᴅᴇᴘᴏsɪᴛᴇᴅ ```{amount}``` ᴄᴏɪɴs!", message)
                    else:
                        client.reply_message(f"❌ ɴᴏᴛ ᴇɴᴏᴜɢʜ ᴄᴏɪɴs!", message)
                
                elif action in ["wd", "w"]:
                    if user_doc.get('vault', 0) >= amount:
                        users_col.update_one({"user_id": user_num}, {"$inc": {"coins": amount, "vault": -amount}})
                        client.reply_message(f"✅ {m_tag}, ᴡɪᴛʜᴅʀᴇᴡ ```{amount}``` ᴄᴏɪɴs!", message)
                    else:
                        client.reply_message(f"❌ ɴᴏᴛ ᴇɴᴏᴜɢʜ ɪɴ ᴠᴀᴜʟᴛ!", message)
            except:
                client.reply_message(f"⚠️ ᴜsᴀɢᴇ: `{PREFIX}vault dep 10` ᴏʀ `{PREFIX}vault wd 10`", message)

        # --- COMMAND: GIFT ---
        elif cmd == "gift":
            if len(args) < 2:
                client.reply_message(f"⚠️ ᴜsᴀɢᴇ: `{PREFIX}gift ᴀᴍᴏᴜɴᴛ @ᴛᴀɢ`", message)
                return
            
            try: amt = int(args[0])
            except: return
            
            target_jid = None
            if message.Message.extendedTextMessage and message.Message.extendedTextMessage.contextInfo:
                 if message.Message.extendedTextMessage.contextInfo.mentionedJid:
                     target_jid = message.Message.extendedTextMessage.contextInfo.mentionedJid[0]
            
            if not target_jid or target_jid == sender_jid:
                client.reply_message("❌ ɪɴᴠᴀʟɪᴅ ᴜsᴇʀ.", message)
                return
            
            t_num = get_pure_number(target_jid)
            sender_doc = users_col.find_one({"user_id": user_num})
            
            if sender_doc['coins'] >= amt:
                users_col.update_one({"user_id": user_num}, {"$inc": {"coins": -amt}})
                sync_data(target_jid, "Unknown")
                users_col.update_one({"user_id": t_num}, {"$inc": {"coins": amt}})
                
                client.reply_message(
                    f"┏━━「 💸 ɢɪғᴛ sᴇɴᴛ 」━━┓\n"
                    f"┃ 👤 *ғʀᴏᴍ:* {m_tag}\n"
                    f"┃ 👤 *ᴛᴏ:* {get_mention(target_jid)}\n"
                    f"┃ 💰 *ᴀᴍᴛ:* ```{amt}```\n"
                    f"┗━━━━━━━━━━┛",
                    message
                )
            else:
                client.reply_message(f"❌ {m_tag}, ʏᴏᴜ ᴀʀᴇ ʙʀᴏᴋᴇ!", message)

        # --- COMMAND: RULES ---
        elif cmd in ["rules", "crules"]:
             client.reply_message(
                f"┏━━━「 📜 {BOT_NAME} ʀᴜʟᴇs 」━━━┓\n"
                f"┃ 👤: {m_tag}\n"
                f"┣━━━━━━━━━━━━━━━━━\n"
                f"┃ 🔸 ᴅᴀʀᴋ ɢᴀɴɢ ᴜ-ᴀᴅᴅ: 2 ᴄᴏɪɴ\n"
                f"┃ 🔹 ᴀᴅᴅᴀ ɢ-ʜᴀᴄᴋ(500+): 5 ᴄᴏɪɴ\n"
                f"┃ 🔹 ᴀᴅᴅᴀ ɢ-ʜᴀᴄᴋ(-500): 3 ᴄᴏɪɴ\n"
                f"┃ 🔸 ʜᴏᴛʟɪɴᴇ ɢ-ʜᴀᴄᴋ: 10 ᴄᴏɪɴ\n"
                f"┃ 🔹 -15 ʏ-ɢʀᴏᴜᴘ ʜᴀᴄᴋ: 12 ᴄᴏɪɴ\n"
                f"┣━━━━━ 🎖️ sᴛᴀʀs ━━━━━\n"
                f"┃ ⭐: 50+ (ᴅᴇs-ɴᴀᴍᴇ)\n"
                f"┃ ⭐⭐: 100+ (ʜ-ᴄᴀᴘᴛᴀɪɴ)\n"
                f"┃ ⭐⭐⭐: 200+ (ʀᴜʟᴇʀ)\n"
                f"┃ 💎: 400+ (ᴄᴏᴅᴇ ᴏᴡɴᴇʀ)\n"
                f"┗━━━━━━━━━━━━━━━━┛",
                message
             )

# --- LOGIN & STARTUP ---
def start_bot():
    if not os.path.exists("dx_session.sqlite"):
        print("\n" + "="*40)
        print(f"🔰 {BOT_NAME} ʟɪɴᴋ ᴅᴇᴠɪᴄᴇ sʏsᴛᴇᴍ 🔰")
        print("="*40)
        phone = input("📱 ᴇɴᴛᴇʀ ʏᴏᴜʀ ᴡʜᴀᴛsᴀᴘᴘ ɴᴜᴍʙᴇʀ (e.g. 919876543210): ").strip()
        print("⏳ ɢᴇɴᴇʀᴀᴛɪɴɢ ᴘᴀɪʀ ᴄᴏᴅᴇ...")
        
        # Manually triggering connection to prompt pair code
        # Note: Neonize will print the pair code automatically to stdout when requested
        try:
             client.connect()
        except Exception as e:
            print(f"Error: {e}")
    else:
        print("♻️ sᴇssɪᴏɴ ғᴏᴜɴᴅ. ᴄᴏɴɴᴇᴄᴛɪɴɢ...")
        client.connect()

if __name__ == "__main__":
    t = threading.Thread(target=run_web)
    t.start()
    start_bot()
