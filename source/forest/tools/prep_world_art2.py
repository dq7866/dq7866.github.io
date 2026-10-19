# -*- coding: utf-8 -*-
"""八域世界素材加工 v2：
   1) 域背景 7 张（forest/mountain/city/sea/star/farm/map/run）→ 裁水印 → jpg
   2) 跑酷道具排列图 → rembg → 按透明间隙切 5 件 → prop-*.webp
   3) NPC 群像 2 张 → rembg → 按透明间隙切 6 人 → npc-*.webp
   4) 走路帧 8 张 → rembg → 底边对齐 + 统一高度 → walk/{boy,girl}-{1..4}.webp
"""
import os
from PIL import Image
from rembg import remove, new_session

GEN = r"C:/Users/Administrator/WorkBuddy/2026-10-19-07-10-26/gen-world"
OUT = "assets/art/world"
WALK = "assets/art/walk"
session = new_session("u2net")

# gen 目录里的文件名都是长前缀，用包含关键词匹配
def find(kw):
    for f in os.listdir(GEN):
        if kw in f and f.lower().endswith(".png"):
            return os.path.join(GEN, f)
    raise FileNotFoundError(kw)

def cut_watermark(im):
    w, h = im.size
    return im.crop((0, 0, w, int(h * 0.93)))

def trim(im, pad=6):
    bbox = im.getchannel("A").getbbox()
    if bbox:
        x0, y0, x1, y1 = bbox
        im = im.crop((max(0, x0 - pad), max(0, y0 - pad),
                      min(im.width, x1 + pad), min(im.height, y1 + pad)))
    return im

def jpg(im, dst, maxw=1600, q=82):
    im = im.convert("RGB")
    if im.width > maxw:
        im = im.resize((maxw, int(im.height * maxw / im.width)), Image.LANCZOS)
    p = os.path.join(OUT, dst)
    im.save(p, "JPEG", quality=q, optimize=True, progressive=True)
    print(f"{dst:22s} {im.size} {os.path.getsize(p)//1024}KB")

def density_split(im, x0, x1):
    """在段内找 alpha 密度最低的列作为分割点"""
    a = im.getchannel("A")
    h = im.height
    dens = []
    for x in range(x0 + 10, x1 - 10):
        cnt = sum(1 for y in range(0, h, 4) if a.getpixel((x, y)) > 30)
        dens.append((cnt, x))
    if not dens:
        return None
    cnt, x = min(dens)
    return x if cnt < h * 0.04 else None

def split_by_alpha(im, n):
    """按透明列间隙把横排素材切成 n 块；粘连段按 alpha 密度谷值细分"""
    a = im.getchannel("A")
    w, h = im.size
    colsum = [a.crop((x, 0, x + 1, h)).getbbox() is not None for x in range(w)]
    segs, s = [], None
    for x, v in enumerate(colsum):
        if v and s is None: s = x
        elif not v and s is not None:
            if x - s > w * 0.04: segs.append([s, x])
            s = None
    if s is not None: segs.append([s, w])
    # 实体段数量多于 n：合并间隔最小的
    while len(segs) > n:
        _, i = min(((segs[i + 1][0] - segs[i][1], i) for i in range(len(segs) - 1)),
                   key=lambda g: g[0])
        segs[i] = [segs[i][0], segs[i + 1][1]]
        del segs[i + 1]
    # 段数少于 n：反复把最宽的段在密度谷值处一分为二
    while len(segs) < n:
        i = max(range(len(segs)), key=lambda k: segs[k][1] - segs[k][0])
        x0, x1 = segs[i]
        m = density_split(im, x0, x1)
        assert m, f"cannot split segment [{x0},{x1}] further"
        segs[i:i + 1] = [[x0, m], [m + 1, x1]]
    assert len(segs) == n, f"expect {n} segments, got {len(segs)}: {segs}"
    return [trim(im.crop((s, 0, e, h))) for s, e in segs]

# ---------- 1) 背景图 ----------
bgs = {
    "儿童绘本水彩画_林间空地大本营": "forest-bg.jpg",
    "儿童绘本水彩画_壮丽的山河谷": "mountain-bg.jpg",
    "儿童绘本水彩画_温馨的小镇街道": "city-bg.jpg",
    "儿童绘本水彩画_阳光明媚的海边渔村": "sea-bg.jpg",
    "儿童绘本水彩画_山顶天文台": "star-bg.jpg",
    "儿童绘本水彩画_阳光下的农庄小院": "farm-bg.jpg",
    "儿童绘本水彩风格手绘大地图": "world-map2.jpg",
    "儿童绘本水彩画_森林小径的透视风景": "run-bg.jpg",
}
for kw, dst in bgs.items():
    jpg(cut_watermark(Image.open(find(kw))), dst)

# ---------- 2) 跑酷道具 ----------
props = Image.open(find("纯白色背景上从左到右一字排开5个独")).convert("RGBA")
props = remove(cut_watermark(props), session=session)
for i, im in enumerate(split_by_alpha(props, 5), 1):
    name = ["prop-log", "prop-rock", "prop-stump", "prop-berry", "prop-mush"][i - 1]
    if im.height > 340:
        r = 340 / im.height
        im = im.resize((int(im.width * r), 340), Image.LANCZOS)
    p = os.path.join(OUT, name + ".webp")
    im.save(p, "WEBP", quality=88, method=4)
    print(f"{name:22s} {im.size} {os.path.getsize(p)//1024}KB")

# ---------- 3) NPC ----------
rows = {
    "儿童绘本水彩风人物立绘素材图_纯白色背景上三个全身人物并排站_2026-10-19T11-08-48": ["npc-guide", "npc-engineer", "npc-captain"],
    "儿童绘本水彩风人物立绘素材图_纯白色背景上三个全身人物并排站_2026-10-19T11-09-10": ["npc-astronomer", "npc-farmer", "npc-lass"],
}
for kw, names in rows.items():
    im = Image.open(find(kw)).convert("RGBA")
    im = remove(cut_watermark(im), session=session)
    for name, pic in zip(names, split_by_alpha(im, 3)):
        if pic.height > 720:
            r = 720 / pic.height
            pic = pic.resize((int(pic.width * r), 720), Image.LANCZOS)
        p = os.path.join(OUT, name + ".webp")
        pic.save(p, "WEBP", quality=88, method=4)
        print(f"{name:22s} {pic.size} {os.path.getsize(p)//1024}KB")

# ---------- 4) 走路帧 ----------
frames = {}
for who, kw in (("boy", "水彩小男孩"), ("girl", "水彩小女孩")):
    lst = [f for f in os.listdir(GEN) if kw in f and f.lower().endswith(".png")]
    lst.sort()
    frames[who] = [os.path.join(GEN, f) for f in lst]
assert all(len(v) == 4 for v in frames.values()), {k: len(v) for k, v in frames.items()}

os.makedirs(WALK, exist_ok=True)
cut = {}
for who, paths in frames.items():
    ims = []
    for i, p in enumerate(paths, 1):
        im = Image.open(p).convert("RGBA")
        im = remove(cut_watermark(im), session=session)
        im = trim(im, pad=2)
        cut[(who, i)] = im
# 统一高度（取中位数高度），底边中心对齐
import statistics
H = int(statistics.median(im.height for im in cut.values()))
for (who, i), im in cut.items():
    r = H / im.height
    im = im.resize((int(im.width * r), H), Image.LANCZOS)
    canvas = Image.new("RGBA", (im.width, H), (0, 0, 0, 0))
    canvas.paste(im, (0, 0), im)
    p = os.path.join(WALK, f"{who}-{i}.webp")
    canvas.save(p, "WEBP", quality=86, method=4)
    print(f"{who}-{i}.webp {canvas.size} {os.path.getsize(p)//1024}KB")

print("all done")
