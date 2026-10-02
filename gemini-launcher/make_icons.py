# /// script
# requires-python = ">=3.11"
# dependencies = ["pillow>=10"]
# ///
"""从官方 Gemini favicon 源图 (icon_source.png) 生成扩展图标，覆盖 extension/icons/ 下的 16/32/128px PNG。

源图来源：Google favicon 服务 https://www.google.com/s2/favicons?domain=gemini.google.com&sz=256
（Gemini 官方渐变四角星：上红、右蓝、下绿、左黄）
"""
import os
from PIL import Image

CANVAS = 512  # 归一化画布：星形放大到画布 96%，留 2% 边距防裁切

here = os.path.dirname(os.path.abspath(__file__))
src = Image.open(os.path.join(here, "icon_source.png")).convert("RGBA")

# 裁掉源图四周透明边距，再居中放到归一化画布上
bbox = src.getchannel("A").getbbox()
star = src.crop(bbox)
side = max(star.size)
margin = round(CANVAS * 0.96)
scale = margin / side
star = star.resize((round(star.width * scale), round(star.height * scale)), Image.LANCZOS)

canvas = Image.new("RGBA", (CANVAS, CANVAS), (0, 0, 0, 0))
canvas.paste(star, ((CANVAS - star.width) // 2, (CANVAS - star.height) // 2), star)

out_dir = os.path.join(here, "extension", "icons")
for s in (128, 32, 16):
    canvas.resize((s, s), Image.LANCZOS).save(os.path.join(out_dir, f"icon{s}.png"))
    print(f"icon{s}.png written")
