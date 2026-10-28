# -*- coding: utf-8 -*-
"""儿歌录音的"句子时间轴"：用自相关估节奏，按拍数比例分配每句时长，
再在比例点附近 ±0.35s 找能量低谷做微调。比纯能量凹谷稳（清唱也会有起音/拖腔）。"""
import os, json, math, wave, struct, subprocess

FF = r"C:/Users/Administrator/.workbuddy/binaries/python/envs/default/Lib/site-packages/imageio_ffmpeg/binaries/ffmpeg-win-x86_64-v7.1.exe"
OUT = "assets/audio/songs"

# 每句的拍数（与 index.html 里的旋律音符数/句长一致）
BEATS = {
    "twinkle":  [8, 8, 8, 8, 8, 8],
    "birthday": [8, 8, 9, 8],
    "rowboat":  [8, 8, 8, 8],
}
# 需要切出来的"一遍"范围（秒）：小星星的录音唱了三遍，取第一遍
SPAN = {
    "twinkle":  (0.40, 42.60),
    "birthday": (0.95, 20.30),
    "rowboat":  (0.30, 22.60),
}


def env_of(fp, hop_ms=10):
    tmp = fp + ".env.wav"
    subprocess.run([FF, "-y", "-hide_banner", "-loglevel", "error", "-i", fp,
                    "-ac", "1", "-ar", "16000", tmp], capture_output=True)
    with wave.open(tmp, "rb") as w:
        raw = w.readframes(w.getnframes())
    os.remove(tmp)
    a = struct.unpack("<%dh" % (len(raw) // 2), raw)
    hop = int(16000 * hop_ms / 1000)
    env = []
    for i in range(0, len(a) - hop, hop):
        seg = a[i:i + hop]
        env.append(math.sqrt(sum(x * x for x in seg) / hop))
    return env, hop_ms / 1000.0


def main():
    mp = os.path.join(OUT, "meta.json")
    meta = json.load(open(mp, encoding="utf-8")) if os.path.exists(mp) else {}
    for key, beats in BEATS.items():
        env, fps = env_of(os.path.join(OUT, key + ".mp3"))
        a, b = SPAN[key]
        tot = sum(beats)
        acc, bounds = 0, [a]
        for k in beats[:-1]:
            acc += k
            ideal = a + (b - a) * acc / tot
            # ±0.35s 内找能量局部最小
            lo, hi = max(bounds[-1] + 0.35, ideal - 0.35), min(b - 0.35, ideal + 0.35)
            j0, j1 = int(lo / fps), int(hi / fps)
            win = env[j0:j1] or [0]
            j = min(range(len(win)), key=lambda x: win[x])
            bounds.append(round(lo + j * fps, 2))
        bounds.append(b)
        lines = [[bounds[i], bounds[i + 1]] for i in range(len(beats))]
        meta[key] = dict(meta.get(key, {}), lines=lines, playFrom=a, playTo=b)
        print(key, [f"{x[0]:.2f}-{x[1]:.2f}({x[1]-x[0]:.1f}s)" for x in lines], flush=True)
    json.dump(meta, open(mp, "w", encoding="utf-8"), ensure_ascii=False, indent=1)


if __name__ == "__main__":
    main()
