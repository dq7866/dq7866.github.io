"""从 forest 素材生成敲散图鉴（192px 透明 WebP + gallery.js）"""
import json
import os
from PIL import Image

SRC = r"E:\Blog\myBlog\source\forest\assets"
OUT = r"E:\Blog\myBlog\source\敲散\src\assets\gallery"
JS = r"E:\Blog\myBlog\source\敲散\src\gallery.js"
os.makedirs(OUT, exist_ok=True)

PALS = [
    ("fox", "狐狸", "🦊", r"art\pals\fox.webp"),
    ("rabbit", "兔子", "🐰", r"art\pals\rabbit.webp"),
    ("deer", "小鹿", "🦌", r"art\pals\deer.webp"),
    ("owl", "猫头鹰", "🦉", r"art\pals\owl.webp"),
    ("hedgehog", "刺猬", "🦔", r"art\pals\hedgehog.webp"),
    ("squirrel", "松鼠", "🐿️", r"art\pals\squirrel.webp"),
    ("bee", "蜜蜂", "🐝", r"art\pals\bee.webp"),
    ("butterfly", "蝴蝶", "🦋", r"art\pals\butterfly.webp"),
]

ITEMS = [
    ("apple", "苹果", "🍎", r"dgrefs\dgref-apple.png"),
    ("cake", "蛋糕", "🍰", r"dgrefs\dgref-cake.png"),
    ("balloon", "气球", "🎈", r"dgrefs\dgref-balloon.png"),
    ("car", "小汽车", "🚗", r"dgrefs\dgref-car.png"),
    ("carrot", "胡萝卜", "🥕", r"dgrefs\dgref-carrot.png"),
    ("basketball", "篮球", "🏀", r"dgrefs\dgref-basketball.png"),
    ("mush", "蘑菇", "🍄", r"art\world\prop-mush.webp"),
    ("berry", "浆果", "🫐", r"art\world\prop-berry.webp"),
    ("star", "星星", "⭐", r"art\world\prop-star.png"),
    ("gem", "宝石", "💎", r"art\world\prop-gem.png"),
    ("magnet", "磁铁", "🧲", r"art\world\prop-magnet.png"),
    ("shield", "盾牌", "🛡️", r"art\world\prop-shield.png"),
]

def make(item, prefix, size=192):
    key, label, emoji, rel = item
    path = os.path.join(SRC, rel)
    im = Image.open(path).convert("RGBA")
    bbox = im.getbbox()
    if bbox:
        im = im.crop(bbox)
    w, h = im.size
    scale = (size * 0.86) / max(w, h)
    im = im.resize((max(1, round(w * scale)), max(1, round(h * scale))), Image.LANCZOS)
    canvas = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    canvas.paste(im, ((size - im.size[0]) // 2, (size - im.size[1]) // 2), im)
    name = f"{prefix}-{key}.webp"
    out = os.path.join(OUT, name)
    canvas.save(out, "WEBP", quality=82, method=6)
    return {"id": key, "label": label, "emoji": emoji, "src": "assets/gallery/" + name,
            "kb": round(os.path.getsize(out) / 1024, 1)}

pals = [make(i, "pals") for i in PALS]
items = [make(i, "item") for i in ITEMS]

def js_rows(rows):
    out = []
    for r in rows:
        out.append('    { id: %s, label: %s, emoji: %s, src: %s }'
                   % (json.dumps(r["id"], ensure_ascii=False), json.dumps(r["label"], ensure_ascii=False),
                      json.dumps(r["emoji"], ensure_ascii=False), json.dumps(r["src"])))
    return ",\n".join(out)

js = """/* 敲散 · 图鉴素材清单（由 tools/build_gallery.py 生成，勿手改） */
window.QS_GALLERY = {
  pals: {
    name: '森林伙伴',
    items: [
%s
    ]
  },
  items: {
    name: '万物图鉴',
    items: [
%s
    ]
  }
};
""" % (js_rows(pals), js_rows(items))

with open(JS, "w", encoding="utf-8", newline="\n") as f:
    f.write(js)

total = sum(r["kb"] for r in pals + items)
print("pals", len(pals), "items", len(items), "total", round(total, 1), "KB")
for r in pals + items:
    print(r["id"], r["kb"], "KB")
