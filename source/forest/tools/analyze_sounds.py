import os, json, subprocess, tempfile, numpy as np, imageio_ffmpeg
FF = imageio_ffmpeg.get_ffmpeg_exe()
D = "assets/audio/animal"

def load(fp):
    tmp = tempfile.mktemp(suffix=".wav")
    subprocess.run([FF,"-y","-v","quiet","-i",fp,"-ac","1","-ar","16000",tmp], check=True)
    import wave
    with wave.open(tmp) as w:
        sr = w.getframerate(); n = w.getnframes()
        x = np.frombuffer(w.readframes(n), dtype=np.int16).astype(np.float32)/32768
    os.remove(tmp); return x, sr

def feat(x, sr):
    win = 1024; hop = 512
    if len(x) < win*4: x = np.pad(x, (0, win*4-len(x)))
    frames = np.lib.stride_tricks.sliding_window_view(x, win)[::hop]
    S = np.abs(np.fft.rfft(frames*np.hanning(win), axis=1)) + 1e-9
    p = S**2 / (S**2).sum(axis=1, keepdims=True)
    freqs = np.fft.rfftfreq(win, 1/sr)
    cent = (p*freqs).sum(axis=1)
    flat = np.exp(np.log(S).mean(axis=1)) / S.mean(axis=1)   # 谱平坦度 0=纯音 1=噪声
    rms = np.sqrt((frames**2).mean(axis=1))
    rms_db = 20*np.log10(rms+1e-9)
    # 包络动态：活跃段内 dB 标准差
    act = rms_db > (rms_db.max()-35)
    dyn = rms_db[act].std()
    # 主频稳定度：峰值频点随时间的标准差 / 均值
    pk = freqs[np.argmax(p, axis=1)]
    stab = np.std(pk[act]) / (np.mean(pk[act])+1e-9) if act.sum() > 4 else 9
    low = p[:, freqs < 500].sum(axis=1).mean()
    return dict(cent=float(np.median(cent)), flat=float(np.median(flat)),
                dyn=float(dyn), stab=float(stab), low=float(low),
                dur=len(x)/sr)

rows = []
for f in sorted(os.listdir(D)):
    if not f.endswith(".mp3"): continue
    x, sr = load(os.path.join(D,f))
    ft = feat(x, sr); ft["key"] = f[:-4]
    rows.append(ft)
rows.sort(key=lambda r: (r["flat"], -r["dyn"]))
print(f"{'key':16s}{'cent':>7s}{'flat':>7s}{'dyn':>7s}{'stab':>7s}{'low':>7s}{'dur':>6s}")
for r in rows:
    flag = ""
    # 嗡嗡/噪声嫌疑：谱平坦度高（噪声样）+ 包络平 + 主频稳定（窄带嗡鸣）
    if r["flat"] > 0.18 and r["dyn"] < 6: flag = "  <== 噪声/无起伏"
    elif r["stab"] < 0.05 and r["dyn"] < 5: flag = "  <== 恒定窄带(嗡鸣?)"
    print(f"{r['key']:16s}{r['cent']:7.0f}{r['flat']:7.3f}{r['dyn']:7.1f}{r['stab']:7.3f}{r['low']:7.2f}{r['dur']:6.1f}{flag}")
