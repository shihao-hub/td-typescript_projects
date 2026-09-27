"""
Chrome Native Messaging Host for Gemini Launcher
Reads message from Chrome extension via stdin, simulates Alt+Shift+G via Windows SendInput API,
and responds via stdout.
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
VK_MENU = 0x12       # Alt key
VK_G = 0x47          # 'G' key

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

def press_alt_shift_g():
    # Chromium 深度依赖硬件扫描码 (wScan) 以及修饰键与字母键之间的微小时间差 (时序)
    # 步骤 1: 按下 Alt 与 Shift
    send_single_key(VK_MENU, is_down=True)
    time.sleep(0.02)
    send_single_key(VK_SHIFT, is_down=True)
    time.sleep(0.03)

    # 步骤 2: 按下并释放 G
    send_single_key(VK_G, is_down=True)
    time.sleep(0.03)
    send_single_key(VK_G, is_down=False)
    time.sleep(0.02)

    # 步骤 3: 释放 Shift 与 Alt
    send_single_key(VK_SHIFT, is_down=False)
    time.sleep(0.02)
    send_single_key(VK_MENU, is_down=False)

    log("SendInput sequence (with hardware scan codes & timing) completed")

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
                # 等待 100ms 确保点击图标后浏览器焦点完全归位
                time.sleep(0.1)
                press_alt_shift_g()
                send_native_response({"status": "ok", "action": "triggered_alt_shift_g"})
                log("Responded ok to Chrome")
            else:
                send_native_response({"status": "ignored", "action": action})
        except Exception as e:
            log(f"Error encountered: {e}")
            send_native_response({"status": "error", "error": str(e)})
            break
    log("gemini_host stopped")

if __name__ == "__main__":
    main()
