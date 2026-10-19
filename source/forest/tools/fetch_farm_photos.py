# -*- coding: utf-8 -*-
"""家畜家禽图鉴照片抓取（iNaturalist，仅 CC0 / CC BY）

为什么单独写：
  图鉴照片统一 640x480 竖版构图，旧管线（photo-meta.json）已随脚本丢失，
  这里按 taxon_id 精确取"研究级观察"照片，只接受 CC0/CC BY，
  把作者、许可、观察页链接写进 data/photo-meta-farm.json，可随时复核。

用法：
  python tools/fetch_farm_photos.py            # 增量（已有则跳过）
  python tools/fetch_farm_photos.py --force    # 重下
"""
import os, io, sys, json, time, urllib.parse, urllib.request
from PIL import Image

BASE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(BASE, "..", "assets", "photos")
META = os.path.join(BASE, "..", "data", "photo-meta-farm.json")
os.makedirs(OUT, exist_ok=True)
UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/120.0 Safari/537.36")

# (key, 中文名, taxon_id)
ITEMS = [
    ("dog",      "家犬",   47144),
    ("cat",      "家猫",   118552),
    ("cattle",   "黄牛",   74113),
    ("sheep",    "绵羊",   121578),
    ("goat",     "家山羊", 123070),
    ("horse",    "马",     209233),
    ("pig",      "家猪",   324492),
    ("rooster",  "公鸡",   505478),
    ("duck",     "家鸭",   236935),
    ("goose",    "家鹅",   120479),
    ("donkey",   "驴",     148030),
    ("rabbit",   "家兔",   334341),
    ("pigeon",   "家鸽",   122767),
    ("turkey",   "火鸡",   524794),
]

W, H = 640, 480


def get(url, binary=False, tries=3):
    for i in range(tries):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA})
            with urllib.request.urlopen(req, timeout=40) as r:
                return r.read() if binary else json.load(r)
        except Exception as e:
            if i == tries - 1:
                print("   ! fail", url[:80], e, flush=True)
                return None
            time.sleep(1.5 * (i + 1))


def observations(taxon_id, per_page=6):
    # 注意：带 order_by=votes 的查询在 iNaturalist 上要 80s+，默认排序 ~25s，只取前 6 条足够
    url = ("https://api.inaturalist.org/v1/observations?"
           f"taxon_id={taxon_id}&photo_license=cc0,cc-by&quality_grade=research"
           f"&per_page={per_page}")
    d = get(url)
    return (d or {}).get("results", [])


def cover(im):
    """等比填充到 640x480，居中裁剪 —— 与图鉴既有照片规格一致"""
    im = im.convert("RGB")
    sw, sh = im.size
    scale = max(W / sw, H / sh)
    nw, nh = max(W, int(sw * scale + 0.5)), max(H, int(sh * scale + 0.5))
    im = im.resize((nw, nh), Image.LANCZOS)
    left, top = (nw - W) // 2, (nh - H) // 2
    return im.crop((left, top, left + W, top + H))


def do_one(item):
    key, cn, tid = item
    dst = os.path.join(OUT, key + ".jpg")
    if not FORCE and os.path.exists(dst) and os.path.getsize(dst) > 15000:
        return key, cn, "skip", {}
    obs = observations(tid)
    if not obs:
        return key, cn, "no-obs", {}
    for o in obs:
        for ph in (o.get("photos") or [])[:2]:
            lic = (ph.get("license_code") or "").lower()
            if lic not in ("cc0", "cc-by"):
                continue
            url = ph.get("url") or ""
            if not url:
                continue
            # 观察接口只给 square 缩略图，换尺寸后缀取大图（已实测 large 可用）
            url = url.replace("/square.", "/large.")
            data = get(url, binary=True)
            if not data or len(data) < 20000:
                continue
            try:
                im = Image.open(io.BytesIO(data))
                if min(im.size) < 400:
                    continue
                cover(im).save(dst, "JPEG", quality=84, optimize=True, progressive=True)
            except Exception as e:
                print("   ! image", key, e, flush=True)
                continue
            if os.path.getsize(dst) < 15000:
                continue
            meta = {
                "cn": cn, "file": "assets/photos/" + key + ".jpg", "ready": True,
                "provider": "iNaturalist",
                "license": "CC0" if lic == "cc0" else "CC-BY",
                "credit": (ph.get("attribution") or "").strip(),
                "source": "https://www.inaturalist.org/observations/%s" % o.get("id"),
            }
            return key, cn, "ok", meta
    return key, cn, "fail", {}


if __name__ == "__main__":
    FORCE = "--force" in sys.argv
    old = {}
    if os.path.exists(META):
        try:
            old = json.load(open(META, encoding="utf-8"))
        except Exception:
            old = {}
    for item in ITEMS:
        key, cn, st, meta = do_one(item)
        print(f"[{st}] {key} ({cn})", meta.get("license", ""), meta.get("credit", "")[:60], flush=True)
        if meta:
            old[key] = meta
    json.dump(old, open(META, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print("OK", sum(1 for k in old))
