# -*- coding: utf-8 -*-
""" farm 声音专项修复：对指定 key 重抓，并在多个合格候选里自动挑"声谱质量最好"的一条

与 fetch_animal_sounds.py 的区别：
  那个脚本取第一个通过标题核验的候选；farm 这批出现过"核验通过但录音本身
  前 2 秒静音 / 全程噪声"的情况。这里把每个合格候选都处理成成品后打分
  （谱平坦度低 = 调性叫声清晰；包络动态高 = 有起伏），挑分最高的落盘。
"""
import os, re, sys, json, time, tempfile, subprocess, urllib.parse, urllib.request
import numpy as np
import imageio_ffmpeg
from concurrent.futures import ThreadPoolExecutor

FF = imageio_ffmpeg.get_ffmpeg_exe()
BASE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(BASE, "..", "assets", "audio", "animal")
UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/120.0 Safari/537.36")

# key: (中文名, 搜索词, 必须词, 禁用词, 成品秒数)
FIX = {
    "cattle": ("黄牛", "cow mooing", ["cow", "moo"], ["music"], 3.2),
    "pig":    ("家猪", "pig oinking", ["pig", "oink"], ["guinea"], 3.0),
    "turkey": ("火鸡", "turkey gobbling", ["turkey", "gobble"], ["thanksgiving music"], 3.2),
}

BAN_ALWAYS = ["music", "musical", "instrument", "piano", "synth", "remix", "ringtone",
              "alarm", "cartoon", "monster", "alien", "horror", "cinematic", "midi",
              "test", "pretend", "child", "human", "voice", "speech", "robot"]


def fetch(url, binary=False, tries=3):
    for i in range(tries):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA})
            with urllib.request.urlopen(req, timeout=30) as r:
                return r.read() if binary else r.read().decode("utf-8", "ignore")
        except Exception:
            if i == tries - 1:
                return None if binary else ""
            time.sleep(1.2 * (i + 1))


def search(query, limit=10):
    q = urllib.parse.quote_plus(query)
    html = fetch(f"https://freesound.org/search/?q={q}&f=license%3A%22Creative+Commons+0%22&s=score")
    if not html:
        return []
    out = []
    for blk in re.split(r'class="bw-search__result"', html)[1:limit]:
        mid = re.search(r'data-sound-id="(\d+)"', blk)
        mp3 = re.search(r'data-mp3="([^"]+)"', blk)
        if not (mid and mp3):
            continue
        title = re.search(r'data-title="([^"]*)"', blk)
        user = re.search(r'data-username="([^"]*)"', blk)
        dur = re.search(r'data-duration="([\d.]+)"', blk)
        out.append({"id": mid.group(1), "mp3": mp3.group(1).replace("&amp;", "&"),
                    "title": (title.group(1) if title else "").strip(),
                    "user": (user.group(1) if user else "").strip(),
                    "dur": float(dur.group(1)) if dur else 0.0,
                    "page": f'https://freesound.org/people/{user.group(1) if user else ""}/sounds/{mid.group(1)}/'})
    return out


def tags_of(page):
    html = fetch(page)
    if not html:
        return []
    seen, out = set(), []
    for t in re.findall(r'href="/browse/tags/([^"/]+)/"', html):
        t = urllib.parse.unquote(t).lower()
        if t not in seen:
            seen.add(t); out.append(t)
    return out[:24]


def probe_dur(p):
    r = subprocess.run([FF, "-hide_banner", "-i", p], capture_output=True, text=True, errors="ignore")
    m = re.search(r"Duration: (\d+):(\d+):([\d.]+)", r.stderr)
    return (int(m.group(1)) * 3600 + int(m.group(2)) * 60 + float(m.group(3))) if m else 0.0


def process(src, dst, secs):
    """更激进地去静音（-38dB），中段起切"""
    af = ("silenceremove=start_periods=1:start_threshold=-38dB:start_silence=0.05,"
          "loudnorm=I=-16:TP=-1.5:LRA=11")
    subprocess.run([FF, "-y", "-hide_banner", "-loglevel", "error", "-i", src,
                    "-af", af, "-t", f"{secs:.2f}", "-ac", "1", "-ar", "22050",
                    "-b:a", "32k", dst], capture_output=True)
    return os.path.exists(dst) and os.path.getsize(dst) > 3000


def load(p):
    tmp = tempfile.mktemp(suffix=".wav")
    subprocess.run([FF, "-y", "-v", "quiet", "-i", p, "-ac", "1", "-ar", "16000", tmp], check=True)
    import wave
    with wave.open(tmp) as w:
        x = np.frombuffer(w.readframes(w.getnframes()), dtype=np.int16).astype(np.float32) / 32768
    os.remove(tmp)
    return x


def score(path):
    """flat 越低越好（调性叫声），dyn 越高越好（有起伏），有效时长越长越好"""
    x = load(path)
    win, hop = 1024, 512
    if len(x) < win * 4:
        x = np.pad(x, (0, win * 4 - len(x)))
    fr = np.lib.stride_tricks.sliding_window_view(x, win)[::hop]
    S = np.abs(np.fft.rfft(fr * np.hanning(win), axis=1)) + 1e-9
    flat = float(np.median(np.exp(np.log(S).mean(axis=1)) / S.mean(axis=1)))
    rms_db = 20 * np.log10(np.sqrt((fr ** 2).mean(axis=1)) + 1e-9)
    act = rms_db > (rms_db.max() - 30)
    dyn = float(rms_db[act].std()) if act.sum() > 4 else 0.0
    # 活跃占比：整段里有多少在"出声"
    cover = float(act.mean())
    return flat, dyn, cover, len(x) / 16000


def fix_one(key):
    cn, query, must, ban, secs = FIX[key]
    cands = search(query)
    if not cands:
        print(f"[{key}] no result"); return None
    rated = []
    with tempfile.TemporaryDirectory() as td:
        for c in cands[:6]:
            text = (c["title"] + " " + " ".join(tags_of(c["page"]))).lower()
            if any(b in text for b in BAN_ALWAYS + list(ban)):
                continue
            if not any(m in text for m in must):
                continue
            raw = os.path.join(td, c["id"] + ".mp3")
            data = fetch(c["mp3"], binary=True)
            if not data:
                continue
            open(raw, "wb").write(data)
            total = probe_dur(raw)
            if total < 1.0:
                continue
            out = os.path.join(td, c["id"] + "_out.mp3")
            off = min(total * 0.12, max(0.0, total - secs - 0.2))
            af = None
            if not process(raw, out, secs):
                continue
            flat, dyn, cover, dur = score(out)
            s = (1 - min(flat, 1)) * 0.55 + min(dyn, 14) / 14 * 0.3 + min(cover, 1) * 0.15
            print(f"   cand {c['id']} 「{c['title']}」 flat={flat:.3f} dyn={dyn:.1f} cover={cover:.2f} -> {s:.3f}", flush=True)
            rated.append((s, c, out, flat, dyn, dur))
        if not rated:
            print(f"[{key}] no verified candidate"); return None
        rated.sort(key=lambda r: -r[0])
        s, c, out, flat, dyn, dur = rated[0]
        dst = os.path.join(OUT, key + ".mp3")
        open(dst, "wb").write(open(out, "rb").read())
        meta = {"cn": cn, "group": "farm", "title": c["title"], "user": c["user"],
                "page": c["page"], "tags": tags_of(c["page"])[:12], "dur": round(dur, 2),
                "qc": {"flat": round(flat, 3), "dyn": round(dyn, 1), "score": round(s, 3)}}
        print(f"[{key}] -> {c['title']} (score {s:.3f})", flush=True)
        return meta


if __name__ == "__main__":
    mp = os.path.join(OUT, "meta.json")
    meta = json.load(open(mp, encoding="utf-8")) if os.path.exists(mp) else {}
    with ThreadPoolExecutor(max_workers=3) as ex:
        for key, m in zip(FIX, ex.map(fix_one, FIX)):
            if m:
                meta[key] = m
    json.dump(meta, open(mp, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print("meta saved", len(meta))
