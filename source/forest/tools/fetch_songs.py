# -*- coding: utf-8 -*-
"""从 freesound 抓 CC0 真人演唱儿歌（供儿歌音乐盒的"唱给我听"按钮）"""
import os, re, json, sys, time, urllib.request, urllib.parse, subprocess, tempfile, imageio_ffmpeg
FF = imageio_ffmpeg.get_ffmpeg_exe()
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36"
OUT = "assets/audio/songs"

def fetch(url, binary=False, tries=3):
    for i in range(tries):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA})
            with urllib.request.urlopen(req, timeout=35) as r:
                return r.read() if binary else r.read().decode("utf-8", "ignore")
        except Exception as e:
            if i == tries - 1:
                print("   ! fetch fail", e, flush=True); return None if binary else ""
            time.sleep(1.5 * (i + 1))

def search(query, limit=10):
    q = urllib.parse.quote_plus(query)
    html = fetch(f"https://freesound.org/search/?q={q}&f=license%3A%22Creative+Commons+0%22&s=score")
    blocks = re.split(r'class="bw-search__result"', html or "")[1:]
    out = []
    for blk in blocks[:limit]:
        mid = re.search(r'data-sound-id="(\d+)"', blk)
        mp3 = re.search(r'data-mp3="([^"]+)"', blk)
        title = re.search(r'data-title="([^"]*)"', blk)
        user = re.search(r'data-username="([^"]*)"', blk)
        dur = re.search(r'data-duration="([\d.]+)"', blk)
        if not (mid and mp3): continue
        out.append({"id": mid.group(1), "mp3": mp3.group(1).replace("&amp;", "&"),
                    "title": (title.group(1) if title else "").strip(),
                    "user": (user.group(1) if user else "").strip(),
                    "dur": float(dur.group(1)) if dur else 0.0,
                    "page": f'https://freesound.org/people/{(user.group(1) if user else "")}/sounds/{mid.group(1)}/'})
    return out

def tags_of(s):
    html = fetch(s["page"])
    tags = re.findall(r'href="/browse/tags/([^"/]+)/"', html or "")
    return [urllib.parse.unquote(t).lower() for t in dict.fromkeys(tags)][:20]

def probe(fp):
    r = subprocess.run([FF, "-hide_banner", "-i", fp], capture_output=True, text=True, errors="ignore")
    m = re.search(r"Duration: (\d+):(\d+):([\d.]+)", r.stderr)
    return int(m.group(1))*3600 + int(m.group(2))*60 + float(m.group(3)) if m else 0

ITEMS = [
    # key, 查询, 标题/标签必须含, 禁用词, 最短秒
    ("twinkle",  "twinkle twinkle little star", ["twinkle"], ["harmonica", "glockenspiel", "instrument", "piano", "music box", "kalimba", "box", "oscar"], 8),
    ("birthday", "happy birthday", ["birthday"], ["corporate", "office", "toiletrolltube", "instrument", "piano", "box", "bell"], 8),
    ("rowboat",  "row your boat", ["row", "boat"], ["motor", "engine", "bnote"], 6),
]

def process(src, dst, secs):
    af = "silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.1,loudnorm=I=-16:TP=-1.5:LRA=11"
    subprocess.run([FF, "-y", "-hide_banner", "-loglevel", "error", "-i", src,
                    "-af", af, "-t", f"{secs:.1f}", "-ac", "1", "-ar", "22050", "-b:a", "40k", dst],
                   capture_output=True)
    return os.path.exists(dst) and os.path.getsize(dst) > 8000

def main():
    os.makedirs(OUT, exist_ok=True)
    meta = {}
    mp = os.path.join(OUT, "meta.json")
    if os.path.exists(mp): meta = json.load(open(mp, encoding="utf-8"))
    for key, q, must, ban, secs in ITEMS:
        dst = os.path.join(OUT, key + ".mp3")
        if os.path.exists(dst) and os.path.getsize(dst) > 8000:
            print("[skip]", key); continue
        found = False
        for c in search(q):
            text = (c["title"] + " " + " ".join(tags_of(c))).lower()
            if any(b in text for b in ban): continue
            if not any(m in text for m in must): continue
            if c["dur"] < secs * 0.6: continue
            with tempfile.TemporaryDirectory() as td:
                raw = os.path.join(td, "a")
                data = fetch(c["mp3"], binary=True)
                if not data: continue
                open(raw, "wb").write(data)
                total = probe(raw)
                use = min(secs, max(total - 1, secs * 0.6))
                if not process(raw, dst, use): continue
            meta[key] = {"title": c["title"], "user": c["user"], "page": c["page"],
                         "dur": round(probe(dst), 1)}
            print(f"[ok] {key} | {c['title']} | {meta[key]['dur']}s", flush=True)
            found = True
            break
        if not found: print(f"[fail] {key}", flush=True)
    json.dump(meta, open(mp, "w", encoding="utf-8"), ensure_ascii=False, indent=1)

if __name__ == "__main__":
    main()
