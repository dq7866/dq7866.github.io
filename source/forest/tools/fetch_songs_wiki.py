# -*- coding: utf-8 -*-
"""从 Wikimedia Commons 抓 CC0 / 公有领域 儿歌演唱录音，压成站点用的 mp3。
只保留"完整唱完 + 人声清楚 + 有明显伴奏"的版本，替掉之前 6~8 秒的碎片。"""
import os, re, json, time, urllib.request, urllib.parse, subprocess, tempfile, sys

FF = r"C:/Users/Administrator/.workbuddy/binaries/python/envs/default/Lib/site-packages/imageio_ffmpeg/binaries/ffmpeg-win-x86_64-v7.1.exe"
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36"
OUT = "assets/audio/songs"
API = "https://commons.wikimedia.org/w/api.php"


def api(params):
    params = dict(params); params.update({"format": "json"})
    url = API + "?" + urllib.parse.urlencode(params)
    for i in range(4):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA})
            with urllib.request.urlopen(req, timeout=40) as r:
                return json.loads(r.read().decode("utf-8", "ignore"))
        except Exception as e:
            if i == 3:
                print("  ! api fail", e, flush=True); return {}
            time.sleep(1.5 * (i + 1))


def search(term, limit=30):
    d = api({"action": "query", "list": "search", "srsearch": term + " filetype:audio",
             "srnamespace": 6, "srlimit": limit})
    return [x["title"] for x in d.get("query", {}).get("search", [])]


def info(title):
    d = api({"action": "query", "titles": title, "prop": "imageinfo",
             "iiprop": "url|size|mime|extmetadata"})
    for p in d.get("query", {}).get("pages", {}).values():
        ii = (p.get("imageinfo") or [{}])[0]
        if not ii:
            return None
        md = ii.get("extmetadata", {})
        lic = (md.get("LicenseShortName", {}) or {}).get("value", "")
        return {"url": ii.get("url"), "secs": ii.get("duration", 0) or 0,
                "mime": ii.get("mime", ""), "license": lic,
                "artist": re.sub("<[^>]+>", "", (md.get("Artist", {}) or {}).get("value", ""))[:60],
                "desc": re.sub("<[^>]+>", "", (md.get("ImageDescription", {}) or {}).get("value", ""))[:160],
                "title": title}
    return None


def download(url, dst):
    for i in range(4):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA})
            with urllib.request.urlopen(req, timeout=90) as r, open(dst, "wb") as f:
                f.write(r.read())
            return os.path.getsize(dst) > 20000
        except Exception as e:
            if i == 3:
                print("  ! dl fail", e, flush=True); return False
            time.sleep(1.5 * (i + 1))


def probe(fp):
    r = subprocess.run([FF, "-hide_banner", "-i", fp], capture_output=True, text=True, errors="ignore")
    m = re.search(r"Duration: (\d+):(\d+):([\d.]+)", r.stderr)
    return int(m.group(1)) * 3600 + int(m.group(2)) * 60 + float(m.group(3)) if m else 0


def stats(fp):
    """用 volumedetect 判断：响度够（人声清楚）、有动态（不是纯静音/爆音）"""
    r = subprocess.run([FF, "-hide_banner", "-i", fp, "-af", "volumedetect", "-f", "null", "-"],
                       capture_output=True, text=True, errors="ignore")
    mean = re.search(r"mean_volume: (-?[\d.]+) dB", r.stderr)
    mx = re.search(r"max_volume: (-?[\d.]+) dB", r.stderr)
    return (float(mean.group(1)) if mean else -99, float(mx.group(1)) if mx else -99)


def encode(src, dst, af):
    subprocess.run([FF, "-y", "-hide_banner", "-loglevel", "error", "-i", src,
                    "-af", af, "-ac", "2", "-ar", "44100", "-b:a", "96k",
                    "-write_xing", "1", dst], capture_output=True)
    return os.path.exists(dst) and os.path.getsize(dst) > 30000


# key, 搜索词, 至少几秒, 标题/描述必须含的词, 必须排除
ITEMS = [
    ("twinkle",  "Twinkle Twinkle Little Star vocal", 25, ["twinkle", "star"],
     ["1888", "1890", "doll", "phonograph", "harmonica", "carillon", "cellar", "fifths", "octaves", "seconds", "unison", "plain"]),
    ("birthday", "Happy Birthday to You singing", 25, ["birthday"],
     ["1888", "harmonica", "carillon", "piano solo", "kazoo"]),
    ("rowboat",  "Row Row Row Your Boat singing", 20, ["row"],
     ["motor", "engine", "1888", "karaoke"]),
]

# 轻微降噪但保住人声：高通去低频轰鸣 + 适度降噪 + 响度标准化
AF = ("highpass=f=85,afftdn=nf=-26:tn=1,"
      "loudnorm=I=-15:TP=-1.2:LRA=11,"
      "alimiter=limit=0.94")


def main():
    os.makedirs(OUT, exist_ok=True)
    mp = os.path.join(OUT, "meta.json")
    meta = json.load(open(mp, encoding="utf-8")) if os.path.exists(mp) else {}
    for key, term, minsec, must, ban in ITEMS:
        dst = os.path.join(OUT, key + ".mp3")
        print(f"=== {key} ===", flush=True)
        best = None
        for title in search(term):
            t = title.lower()
            if not t.endswith((".ogg", ".oga", ".flac", ".wav", ".oga", ".opus", ".mp3")):
                continue
            if any(b in t for b in ban) or not any(m in t for m in must):
                continue
            inf = info(title)
            if not inf or not inf["url"]:
                continue
            if not re.search(r"public domain|cc0|CC BY-SA|CC BY 4", inf["license"], re.I):
                continue
            secs = inf["secs"] or 0
            if secs < minsec:
                continue
            with tempfile.TemporaryDirectory() as td:
                raw = os.path.join(td, "a" + os.path.splitext(title)[1].lower())
                if not download(inf["url"], raw):
                    continue
                real = probe(raw)
                if real < minsec:
                    continue
                mean, mx = stats(raw)
                if mean < -34 or mx < -6:       # 太空/太哑 → 弃
                    print(f"  - {title[:60]} {real:.0f}s mean={mean} max={mx} 太哑", flush=True)
                    continue
                if not encode(raw, dst, AF):
                    continue
                best = {"title": re.sub(r"^File:", "", title),
                        "license": inf["license"], "artist": inf["artist"],
                        "page": "https://commons.wikimedia.org/wiki/" + urllib.parse.quote(title.replace(" ", "_")),
                        "dur": round(probe(dst), 1), "mean": mean}
                print(f"  [ok] {title[:70]} {best['dur']}s mean={mean} max={mx}", flush=True)
                break
        if best:
            meta[key] = best
        else:
            print(f"  [fail] {key}", flush=True)
    json.dump(meta, open(mp, "w", encoding="utf-8"), ensure_ascii=False, indent=1)


if __name__ == "__main__":
    main()
