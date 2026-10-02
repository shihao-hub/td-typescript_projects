"""
Chrome Native Messaging Host for Gemini Launcher
Reads messages from Chrome extension via stdin, reads the actual Gemini hotkey
from Chrome's Local State (falling back to Alt+G), simulates it via Windows
SendInput API, and responds via stdout. Designed to stay alive across multiple
messages (long-lived port).
"""
import sys
import os
import struct
import json
import time
import ctypes
from ctypes import wintypes
from datetime import datetime

user32 = ctypes.windll.user32

INPUT_KEYBOARD = 1
KEYEVENTF_KEYUP = 0x0002
KEYEVENTF_EXTENDEDKEY = 0x0001
MAPVK_VK_TO_VSC = 0

VK_SHIFT = 0x10
VK_CONTROL = 0x11
VK_MENU = 0x12       # Alt key
VK_LWIN = 0x5B       # Win key
VK_G = 0x47          # 'G' key（回退默认热键的主键）

# Chrome 把 Gemini 快捷键存在浏览器级 Local State 的 glic 节点里
LOCAL_STATE_PATH = os.path.expandvars(
    r"%LOCALAPPDATA%\Google\Chrome\User Data\Local State"
)

# Chromium accelerator 记法中的修饰键名 → VK 码
MODIFIER_VKS = {
    "ALT": VK_MENU,
    "CONTROL": VK_CONTROL,
    "CTRL": VK_CONTROL,
    "SHIFT": VK_SHIFT,
    "META": VK_LWIN,
    "WINDOWS": VK_LWIN,
    "WIN": VK_LWIN,
}

# Local State 读取缓存：避免每次点击重新解析多 MB 的 JSON
_glic_cache = {"mtime": None, "config": None}

# 读取/解析任一环节失败时回退的热键（与旧版硬编码行为一致）
FALLBACK_MODIFIERS = [VK_MENU]
FALLBACK_KEY = VK_G

if getattr(sys, 'frozen', False):
    BASE_DIR = os.path.dirname(os.path.abspath(sys.executable))
else:
    BASE_DIR = os.path.dirname(os.path.abspath(__file__))

LOG_FILE = os.path.join(BASE_DIR, "host.log")

def log(msg):
    try:
        with open(LOG_FILE, "a", encoding="utf-8") as f:
            f.write(f"[{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}] {msg}\n")
    except Exception:
        pass

class KEYBDINPUT(ctypes.Structure):
    _fields_ = [
        ("wVk", wintypes.WORD),
        ("wScan", wintypes.WORD),
        ("dwFlags", wintypes.DWORD),
        ("time", wintypes.DWORD),
        ("dwExtraInfo", ctypes.c_ulonglong if ctypes.sizeof(ctypes.c_void_p) == 8 else ctypes.c_ulong)
    ]

class HARDWAREINPUT(ctypes.Structure):
    _fields_ = [
        ("uMsg", wintypes.DWORD),
        ("wParamL", wintypes.WORD),
        ("wParamH", wintypes.WORD)
    ]

class MOUSEINPUT(ctypes.Structure):
    _fields_ = [
        ("dx", wintypes.LONG),
        ("dy", wintypes.LONG),
        ("mouseData", wintypes.DWORD),
        ("dwFlags", wintypes.DWORD),
        ("time", wintypes.DWORD),
        ("dwExtraInfo", ctypes.c_ulonglong if ctypes.sizeof(ctypes.c_void_p) == 8 else ctypes.c_ulong)
    ]

class INPUT_UNION(ctypes.Union):
    _fields_ = [
        ("ki", KEYBDINPUT),
        ("mi", MOUSEINPUT),
        ("hi", HARDWAREINPUT)
    ]

class INPUT(ctypes.Structure):
    _fields_ = [
        ("type", wintypes.DWORD),
        ("u", INPUT_UNION)
    ]

def send_single_key(vk_code, is_down):
    scan_code = user32.MapVirtualKeyW(vk_code, MAPVK_VK_TO_VSC)
    flags = 0 if is_down else KEYEVENTF_KEYUP
    
    inp = INPUT()
    inp.type = INPUT_KEYBOARD
    inp.u.ki = KEYBDINPUT(
        wVk=vk_code,
        wScan=scan_code & 0xFF,
        dwFlags=flags,
        time=0,
        dwExtraInfo=0
    )
    user32.SendInput(1, ctypes.byref(inp), ctypes.sizeof(INPUT))

def read_glic_config():
    """读取浏览器级 Local State 里的 Gemini 热键配置，返回 (enabled, hotkey_str)；失败返回 None。"""
    try:
        mtime = os.path.getmtime(LOCAL_STATE_PATH)
        if _glic_cache["mtime"] == mtime:
            return _glic_cache["config"]
        with open(LOCAL_STATE_PATH, "r", encoding="utf-8") as f:
            data = json.load(f)
        glic = data.get("glic", {})
        config = (bool(glic.get("launcher_enabled")), glic.get("launcher_hotkey"))
        _glic_cache["mtime"] = mtime
        _glic_cache["config"] = config
        return config
    except Exception as e:
        log(f"read_glic_config failed: {e}")
        return None

def parse_accelerator(text):
    """解析 Chromium accelerator 记法（如 Alt+G、Ctrl+Shift+K），返回 (修饰键 VK 列表, 主键 VK)；不支持或非法返回 None。"""
    if not isinstance(text, str):
        return None
    tokens = [token.strip().upper() for token in text.split("+") if token.strip()]
    if len(tokens) < 2 or tokens[-1] in MODIFIER_VKS:
        return None
    *modifiers, key_token = tokens
    modifier_vks = []
    for token in modifiers:
        vk = MODIFIER_VKS.get(token)
        if vk is None or vk in modifier_vks:
            return None
        modifier_vks.append(vk)
    if len(key_token) == 1 and ("A" <= key_token <= "Z" or "0" <= key_token <= "9"):
        return modifier_vks, ord(key_token)
    if key_token[0] == "F" and key_token[1:].isdigit() and 1 <= int(key_token[1:]) <= 24:
        return modifier_vks, 0x70 + int(key_token[1:]) - 1
    return None

def resolve_hotkey():
    """解析当前应模拟的热键；任一环节失败回退 Alt+G 并记日志。

    返回 (修饰键 VK 列表, 主键 VK, info)；info 携带 enabled/hotkey/source 供扩展 tooltip 展示。"""
    config = read_glic_config()
    if config is not None:
        enabled, hotkey_text = config
        parsed = parse_accelerator(hotkey_text)
        if enabled and parsed is not None:
            log(f"using dynamic hotkey {hotkey_text}")
            return parsed[0], parsed[1], {"enabled": True, "hotkey": hotkey_text, "source": "dynamic"}
        if not enabled:
            log("fallback to Alt+G: launcher hotkey disabled in Chrome settings")
            return FALLBACK_MODIFIERS, FALLBACK_KEY, {"enabled": False, "hotkey": None, "source": "fallback"}
        log(f"fallback to Alt+G: unparsable hotkey {hotkey_text!r}")
        return FALLBACK_MODIFIERS, FALLBACK_KEY, {"enabled": True, "hotkey": "Alt+G", "source": "fallback"}
    log("fallback to Alt+G: Local State unavailable")
    return FALLBACK_MODIFIERS, FALLBACK_KEY, {"enabled": None, "hotkey": "Alt+G", "source": "fallback"}

def press_hotkey(modifier_vks, key_vk):
    # Chromium 深度依赖硬件扫描码 (wScan) 以及修饰键与主键之间的微小时间差 (时序)
    for vk in modifier_vks:
        send_single_key(vk, is_down=True)
        time.sleep(0.02)
    send_single_key(key_vk, is_down=True)
    time.sleep(0.03)
    send_single_key(key_vk, is_down=False)
    time.sleep(0.02)
    for vk in reversed(modifier_vks):
        send_single_key(vk, is_down=False)
        time.sleep(0.02)

def read_native_message():
    raw_length = sys.stdin.buffer.read(4)
    if not raw_length or len(raw_length) < 4:
        return None
    message_length = struct.unpack('<I', raw_length)[0]
    message_data = sys.stdin.buffer.read(message_length)
    if len(message_data) < message_length:
        return None
    return json.loads(message_data.decode('utf-8'))

def send_native_response(response_dict):
    encoded = json.dumps(response_dict).encode('utf-8')
    header = struct.pack('<I', len(encoded))
    sys.stdout.buffer.write(header)
    sys.stdout.buffer.write(encoded)
    sys.stdout.buffer.flush()

def main():
    log("gemini_host started")
    while True:
        try:
            msg = read_native_message()
            if msg is None:
                log("EOF received on stdin, exiting")
                break
            
            log(f"Received message: {msg}")
            action = msg.get("action")
            if action == "trigger":
                # 短暂等待点击后焦点归位，长连接模式下可取更激进的值
                time.sleep(0.05)
                modifier_vks, key_vk, info = resolve_hotkey()
                press_hotkey(modifier_vks, key_vk)
                log(f"SendInput sequence ({info['hotkey']}, source={info['source']}, enabled={info['enabled']}) completed")
                send_native_response({"status": "ok", "action": "triggered", **info})
                log("Responded ok to Chrome")
            elif action == "get_hotkey":
                modifier_vks, key_vk, info = resolve_hotkey()
                send_native_response({"status": "ok", "action": "get_hotkey", **info})
            else:
                send_native_response({"status": "ignored", "action": action})
        except Exception as e:
            log(f"Error encountered: {e}")
            send_native_response({"status": "error", "error": str(e)})
            break
    log("gemini_host stopped")

if __name__ == "__main__":
    main()
