# -*- coding: utf-8 -*-
"""重制儿歌"真人唱"：
1) 用完整版录音（freesound CC0），按句切分做卡拉OK时间轴，而不是"按总长均分"；
2) 重编码 44.1k 立体声 96kbps，高通去低频轰鸣 + 轻度降噪 + 响度标准化，去掉廉价 mp3 的杂音。
"""
import os, re, json, time, urllib.request, urllib.parse, subprocess, tempfile, wave, struct, math

FF = r"C:/Users/Administrator/.workbuddy/binaries/python/envs/default/Lib/site-packages/imageio_ffmpeg/binaries/ffmpeg-win-x86_64-v7.1.exe"
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36"
OUT = "assets/audio/songs"

# key, 声音页 id, 用户, 期望秒数（原文完整版长度）
PICK = {
    "twinkle":  ("512975", "isohoo", 130),
    "birthday": ("770325", "beautifuldaymonster1968", 20),
    "rowboat":  ("634637", "ghastlycollection", 23),
}


def fetch(url, binary=False, tries=3):
    for i in range(tries):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA})
            with urllib.request.urlopen(req, timeout=60) as r:
                return r.read() if binary else r.read().decode("utf-8", "ignore")
        except Exception as e:
            if i == tries - 1:
                print("  ! fetch", e, flush=True)
                return None if binary else ""
            time.sleep(1.5 * (i + 1))


def mp3_url(page):
    html = fetch(page)
    m = re.search(r'data-mp3="([^"]+)"', html or "")
    if m:
        return m.group(1).replace("&amp;", "&")
    m = re.search(r'og:audio"\s+content="([^"]+)"', html or "")
    return m.group(1) if m else None


def encode(src, dst):
    """重编码：85Hz 高通去低频轰鸣，afftdn 轻降噪（保人声），loudnorm 统一响度，96k 立体声"""
    af = "highpass=f=90,afftdn=nf=-28:tn=1,loudnorm=I=-15:TP=-1.2:LRA=11"
    subprocess.run([FF, "-y", "-hide_banner", "-loglevel", "error", "-i", src,
                    "-af", af, "-ac", "2", "-ar", "44100", "-b:a", "96k", dst], capture_output=True)
    return os.path.exists(dst) and os.path.getsize(dst) > 40000


def decode_wav(src):
    """解码成 16bit mono 16k wav 用于算包络"""
    tmp = src + ".env.wav"
    subprocess.run([FF, "-y", "-hide_banner", "-loglevel", "error", "-i", src,
                    "-ac", "1", "-ar", "16000", tmp], capture_output=True)
    with wave.open(tmp, "rb") as w:
        n, sr = w.getnframes(), w.getframerate()
        raw = w.readframes(n)
    os.remove(tmp)
    return list(struct.unpack("<%dh" % (len(raw) // 2), raw)), sr


def envelope(samples, sr, hop=160):
    """每 10ms 一个 RMS 值"""
    out = []
    for i in range(0, len(samples) - hop, hop):
        seg = samples[i:i + hop]
        out.append(math.sqrt(sum(x * x for x in seg) / hop))
    return out, sr / hop  # 值 + 每秒帧数


def split_phrases(env, fps, k, min_gap=0.45):
    """把能量包络按"静音凹谷"切成 k 段，返回每段起点（秒）。
    儿童清唱/合唱录音句间一般有明显停顿；找不到足够凹谷时退化为均分。"""
    if not env:
        return None
    peak = max(env) or 1
    thr = peak * 0.12
    # 找静音区间
    gaps, run = [], None
    for i, v in enumerate(env):
        if v < thr:
            run = i if run is None else run
        else:
            if run is not None and (i - run) / fps >= 0.12:
                gaps.append(((run + i) / 2 / fps, (i - run) / fps))
            run = None
    # 只看内部凹谷，取最长的 k-1 个作为切点
    inner = [g for g in gaps if 0.3 < g[0] < (len(env) / fps - 0.4)]
    inner.sort(key=lambda g: -g[1])
    cuts = sorted(g[0] for g in inner[:k - 1])
    if len(cuts) < k - 1:
        return None
    starts = [0.0] + cuts
    return starts


def main():
    mp = os.path.join(OUT, "meta.json")
    meta = json.load(open(mp, encoding="utf-8")) if os.path.exists(mp) else {}
    for key, (sid, user, want) in PICK.items():
        page = f"https://freesound.org/people/{user}/sounds/{sid}/"
        print(f"=== {key} {page}", flush=True)
        url = mp3_url(page)
        if not url:
            print("  ! 找不到 mp3 地址", flush=True); continue
        with tempfile.TemporaryDirectory() as td:
            raw = os.path.join(td, "in.mp3")
            data = fetch(url, binary=True)
            if not data:
                continue
            open(raw, "wb").write(data)
            samples, sr = decode_wav(raw)
            env, fps = envelope(samples, sr)
            total = len(samples) / sr
            starts = split_phrases(env, fps, 6)
            dst = os.path.join(OUT, key + ".mp3")
            if not encode(raw, dst):
                print("  ! 编码失败", flush=True); continue
        meta[key] = {"page": page, "user": user, "dur": round(total, 1),
                     "phraseAt": [round(s, 2) for s in starts] if starts else None}
        print(f"  [ok] {total:.1f}s  phrases={meta[key]['phraseAt']}", flush=True)
    json.dump(meta, open(mp, "w", encoding="utf-8"), ensure_ascii=False, indent=1)


if __name__ == "__main__":
    main()
