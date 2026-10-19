# -*- coding: utf-8 -*-
"""freesound CC0 声音抓取 v2 —— 逐条核验录音标题/标签，避免"声音配错动物"

为什么重写：
  v1 按搜索结果在页面里的出现顺序配对预览链接，且不校验标题，
  一旦页面结构变化就会把 A 动物的录音存成 B 动物的文件。
  v2 改为按结果块解析（data-mp3 / data-title / data-sound-id），
  再打开录音详情页读标签，标题或标签必须命中目标关键词才采用，
  并把来源（录音名 / 作者 / 页面 / 标签）写进 meta.json，可随时复核。

用法：
  python tools/fetch_animal_sounds.py            # 增量（已存在则跳过）
  python tools/fetch_animal_sounds.py --force    # 全部重下（推荐，清洗旧数据）
"""
import os, re, sys, json, time, tempfile, subprocess, urllib.parse, urllib.request
import imageio_ffmpeg
from concurrent.futures import ThreadPoolExecutor

FF = imageio_ffmpeg.get_ffmpeg_exe()
BASE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(BASE, "..", "assets", "audio", "animal")
os.makedirs(OUT, exist_ok=True)
UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/120.0 Safari/537.36")

# (key, 中文名, 分组, 搜索词, 必须是标题/标签里出现的词(任一), 禁用词)
ITEMS = [
    # ---------- 动物 ----------
    ("lion", "非洲狮", "animal", "lion roar", ["lion"], []),
    ("tiger", "东北虎", "animal", "tiger roar", ["tiger"], []),
    ("wolf", "灰狼", "animal", "wolf howling", ["wolf"], ["scary", "ghost"]),
    ("elephant", "大象", "animal", "african elephant rumbling", ["elephant"], ["rhinoceros", "rhino", "mastodon", "mammoth"]),
    ("zebra", "斑马", "animal", "zebra bray", ["zebra"], []),
    ("deer", "梅花鹿", "animal", "deer call", ["deer"], ["dear"]),
    ("fox", "赤狐", "animal", "fox scream", ["fox"], []),
    ("camel", "骆驼", "animal", "camel grunt", ["camel"], []),
    ("hippo", "河马", "animal", "hippo", ["hippo", "hippopotamus"], []),
    ("gorilla", "大猩猩", "animal", "gorilla", ["gorilla"], []),
    ("polar-bear", "北极熊", "animal", "polar bear roar", ["polar", "bear"], ["eating", "panda", "cub"]),
    ("dolphin", "海豚", "animal", "dolphin whistle", ["dolphin"], ["echolocation only"]),
    ("whale", "蓝鲸", "animal", "whale calls vocalization", ["whale"], ["monster", "dinosaur", "sonar", "song", "low"]),
    ("penguin", "帝企鹅", "animal", "penguin", ["penguin"], ["alien"]),
    ("owl", "猫头鹰", "animal", "owl hoot", ["owl"], []),
    ("peacock", "蓝孔雀", "animal", "peacock call", ["peacock"], []),
    ("macaw", "金刚鹦鹉", "animal", "macaw", ["macaw", "parrot"], []),
    ("swan", "大天鹅", "animal", "swan call", ["swan"], []),
    ("crane", "丹顶鹤", "animal", "crane bird", ["crane"], ["machine", "truck", "construction", "cargo"]),
    ("eagle", "白头海雕", "animal", "bald eagle call", ["eagle"], []),
    ("magpie", "喜鹊", "animal", "magpie bird", ["magpie"], ["football", "club", "chant"]),
    ("swallow", "家燕", "animal", "swallow bird", ["swallow"], ["gulp", "drink", "eating"]),
    ("cricket", "田野蟋蟀", "animal", "cricket chirp", ["cricket"], ["ball", "sport", "match"]),
    ("cicada", "十七年蝉", "animal", "cicada", ["cicada"], []),
    ("wasp", "黄脚胡蜂", "animal", "wasp buzz", ["wasp"], ["wisp"]),
    ("cheetah", "猎豹", "animal", "cheetah chirp", ["cheetah"], []),
    ("panda", "大熊猫", "animal", "panda bear", ["panda"], []),
    ("yak", "牦牛", "animal", "yak", ["yak"], []),
    ("squirrel", "松鼠", "animal", "squirrel chirp call", ["squirrel"], ["eating", "rustling", "forest ambience", "alien"]),
    ("woodpecker", "啄木鸟", "animal", "woodpecker drumming", ["woodpecker"], []),
    ("bee", "蜜蜂", "animal", "bee buzzing", ["bee"], []),
    ("boar", "野猪", "animal", "wild boar grunt", ["boar"], ["eating", "forest ambience"]),
    ("badger", "獾", "animal", "badger growl", ["badger"], ["eating", "peanut"]),
    ("hedgehog", "刺猬", "animal", "hedgehog", ["hedgehog"], []),
    ("golden-eagle", "金雕", "animal", "golden eagle", ["eagle"], []),
    ("flamingo", "火烈鸟", "animal", "flamingo", ["flamingo"], []),
    ("kingfisher", "翠鸟", "animal", "kookaburra laughing", ["kookaburra", "kingfisher"], []),
    ("mandarin-duck", "鸳鸯", "animal", "mandarin duck", ["duck", "mandarin"], []),
    ("egret", "白鹭", "animal", "egret call", ["egret", "heron"], []),
    ("orca", "虎鲸", "animal", "orca call", ["orca", "killer whale"], ["whale song"]),
    # ---------- 家畜家禽（孩子身边最该认识的动物） ----------
    ("dog", "家犬", "farm", "dog barking", ["dog"], ["hotdog", "dogma", "barking mad music"]),
    ("cat", "家猫", "farm", "cat meow", ["cat", "meow"], ["catalog", "category", "cathedral"]),
    ("cattle", "黄牛", "farm", "cow moo", ["cow", "moo", "cattle"], ["cowboy music", "cowbell music"]),
    ("sheep", "绵羊", "farm", "sheep bleating", ["sheep", "bleat", "lamb"], ["sleep", "sheepskin"]),
    ("goat", "家山羊", "farm", "goat bleat", ["goat", "bleat"], ["goatee music"]),
    ("horse", "马", "farm", "horse neigh whinny", ["horse", "neigh", "whinny"], ["hoarse", "horsepower", "clop music"]),
    ("pig", "家猪", "farm", "pig oink grunt", ["pig", "oink", "grunt"], ["guinea pig", "piglet music"]),
    ("rooster", "公鸡", "farm", "rooster crowing", ["rooster", "cock", "crow"], ["crowd", "crown", "crowded"]),
    ("duck", "家鸭", "farm", "duck quacking", ["duck", "quack"], ["ducking", "duck tape"]),
    ("goose", "家鹅", "farm", "goose honk", ["goose", "honk", "geese"], ["goosebumps"]),
    ("donkey", "驴", "farm", "donkey bray", ["donkey", "bray", "burro"], ["donkey kong"]),
    ("rabbit", "家兔", "farm", "rabbit thumping", ["rabbit", "thump", "bunny"], ["rabbit hole music"]),
    ("pigeon", "家鸽", "farm", "pigeon cooing", ["pigeon", "dove", "coo"], ["cooing baby", "dove music"]),
    ("turkey", "火鸡", "farm", "turkey gobble", ["turkey", "gobble"], ["thanksgiving music"]),
    # ---------- 自然之声（孩子该认识的环境声） ----------
    ("rain", "雨声", "nature", "rain", ["rain"], ["train", "brain", "drain", "music", "song"]),
    ("thunder", "雷声", "nature", "thunder", ["thunder"], ["thunderstorm music"]),
    ("wind", "风声", "nature", "wind", ["wind"], ["flute", "instrument", "music", "song", "winding"]),
    ("stream", "溪流", "nature", "stream water", ["stream", "water", "river", "brook"], ["music", "song"]),
    ("waves", "海浪", "nature", "ocean waves", ["wave", "ocean", "sea", "surf"], ["music", "song"]),
    ("forest-birds", "林间鸟鸣", "nature", "forest birds", ["bird", "forest"], ["music", "song", "instrument"]),
    ("night-insects", "夏夜虫鸣", "nature", "night insects", ["insect", "cricket", "night"], ["music", "song"]),
    ("campfire", "篝火", "nature", "campfire", ["fire", "campfire", "bonfire"], ["music", "song"]),
]

BAN_ALWAYS = ["music", "musical", "instrument", "piano", "guitar", "flute", "synth",
              "remix", "ringtone", "alarm", "comedy", "cartoon",
              "monster", "demon", "nemean", "alien", "ghost", "zombie", "dragon",
              "horror", "cinematic", "trailer", "riser", "midi", "test", "port",
              "pretend", "child", "human", "voice", "speech", "robot"]


def fetch(url, binary=False, tries=3):
    for i in range(tries):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA})
            with urllib.request.urlopen(req, timeout=35) as r:
                return r.read() if binary else r.read().decode("utf-8", "ignore")
        except Exception as e:
            if i == tries - 1:
                print("   ! fetch fail", url.split("/")[-1], e, flush=True)
                return None if binary else ""
            time.sleep(1.5 * (i + 1))


def search(query, limit=12):
    q = urllib.parse.quote_plus(query)
    url = (f"https://freesound.org/search/?q={q}"
           f"&f=license%3A%22Creative+Commons+0%22&s=score")
    html = fetch(url)
    if not html:
        return []
    # 每个结果块自带 data-sound-id / data-mp3 / data-title，按块解析绝不会错位
    blocks = re.split(r'class="bw-search__result"', html)[1:]
    out = []
    for blk in blocks[:limit]:
        mid = re.search(r'data-sound-id="(\d+)"', blk)
        mp3 = re.search(r'data-mp3="([^"]+)"', blk)
        title = re.search(r'data-title="([^"]*)"', blk)
        user = re.search(r'data-username="([^"]*)"', blk)
        dur = re.search(r'data-duration="([\d.]+)"', blk)
        if not (mid and mp3):
            continue
        out.append({
            "id": mid.group(1),
            "mp3": mp3.group(1).replace("&amp;", "&"),
            "title": (title.group(1) if title else "").strip(),
            "user": (user.group(1) if user else "").strip(),
            "dur": float(dur.group(1)) if dur else 0.0,
            "page": f'https://freesound.org/people/{user.group(1) if user else ""}/sounds/{mid.group(1)}/',
        })
    return out


def tags_of(sound):
    """详情页标签：用来二次确认"这条录音真的是这个动物/这个声音" """
    html = fetch(sound["page"])
    if not html:
        return []
    tags = re.findall(r'href="/browse/tags/([^"/]+)/"', html)
    seen, out = set(), []
    for t in tags:
        t = urllib.parse.unquote(t).lower()
        if t not in seen:
            seen.add(t); out.append(t)
    return out[:24]


def probe_duration(path):
    r = subprocess.run([FF, "-hide_banner", "-i", path], capture_output=True, text=True, errors="ignore")
    m = re.search(r"Duration: (\d+):(\d+):([\d.]+)", r.stderr)
    return (int(m.group(1)) * 3600 + int(m.group(2)) * 60 + float(m.group(3))) if m else 0.0


def process(src, dst, offset=0.0, secs=3.0):
    """去头静音 -> 从 offset 起取 3 秒 -> 响度标准化 -> 32k 单声道 mp3"""
    af = ("silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.08,"
          "loudnorm=I=-16:TP=-1.5:LRA=11")
    cmd = [FF, "-y", "-hide_banner", "-loglevel", "error"]
    if offset > 0:
        cmd += ["-ss", f"{offset:.2f}"]
    cmd += ["-i", src, "-af", af, "-t", f"{secs:.2f}", "-ac", "1", "-ar", "22050", "-b:a", "32k", dst]
    subprocess.run(cmd, capture_output=True)
    return os.path.exists(dst) and os.path.getsize(dst) > 3000


def verify(sound, must, ban):
    text = (sound["title"] + " " + " ".join(sound.get("tags", []))).lower()
    if any(b in text for b in BAN_ALWAYS + ban):
        return False, "禁用词"
    if not any(m in text for m in must):
        return False, "标题/标签未命中"
    return True, "ok"


def do_one(item):
    key, cn, group, query, must, ban = item
    dst = os.path.join(OUT, key + ".mp3")
    if not FORCE and os.path.exists(dst) and os.path.getsize(dst) > 3000:
        return (key, cn, group, "skip", "", {})
    cands = search(query)
    if not cands:
        return (key, cn, group, "no-result", "", {})
    for c in cands:
        c["tags"] = tags_of(c)
        ok, why = verify(c, must, ban)
        if not ok:
            print(f"   - 跳过 {key}: 「{c['title']}」 {why}", flush=True)
            continue
        with tempfile.TemporaryDirectory() as td:
            raw = os.path.join(td, "a.mp3")
            data = fetch(c["mp3"], binary=True)
            if not data:
                continue
            open(raw, "wb").write(data)
            total = probe_duration(raw)
            if total < 0.8:
                continue
            # 叫声/环境声的高潮常在中段：从 15% 处起切，避开开头静音和尾部淡出
            off = min(total * 0.15, max(0.0, total - 3.2))
            if process(raw, dst, off):
                dur = probe_duration(dst)
                if dur < 0.8:
                    continue
                meta = {"cn": cn, "group": group, "title": c["title"], "user": c["user"],
                        "page": c["page"], "tags": c["tags"][:12], "dur": round(dur, 2)}
                return (key, cn, group, "ok", c["title"], meta)
    return (key, cn, group, "fail", "", {})


if __name__ == "__main__":
    FORCE = "--force" in sys.argv
    results, meta = [], {}
    with ThreadPoolExecutor(max_workers=4) as ex:
        for r in ex.map(do_one, ITEMS):
            print(f"[{r[3]}] {r[0]} ({r[1]}) {r[4]}", flush=True)
            results.append(r)
            if r[3] == "ok":
                meta[r[0]] = r[5]
    old = {}
    mp = os.path.join(OUT, "meta.json")
    if os.path.exists(mp):
        try:
            old = json.load(open(mp, encoding="utf-8"))
        except Exception:
            old = {}
    old.update(meta)   # 保留增量运行时的旧条目
    json.dump(old, open(mp, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    okn = sum(1 for r in results if r[3] in ("ok", "skip"))
    print(f"OK: {okn}/{len(ITEMS)}")
