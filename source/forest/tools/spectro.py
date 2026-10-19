import os, subprocess, tempfile, numpy as np, imageio_ffmpeg
from PIL import Image, ImageDraw
FF = imageio_ffmpeg.get_ffmpeg_exe()
D = "assets/audio/animal"; OUT = "C:/Users/Administrator/WorkBuddy/2026-10-19-07-10-26/spectro"
os.makedirs(OUT, exist_ok=True)

def spec(fp):
    tmp = tempfile.mktemp(suffix=".wav")
    subprocess.run([FF,"-y","-v","quiet","-i",fp,"-ac","1","-ar","16000","-t","3",tmp], check=True)
    import wave
    with wave.open(tmp) as w:
        x = np.frombuffer(w.readframes(w.getnframes()), dtype=np.int16).astype(np.float32)/32768
    os.remove(tmp)
    win, hop = 1024, 256
    if len(x) < win*2: x = np.pad(x, (0, win*2-len(x)))
    fr = np.lib.stride_tricks.sliding_window_view(x, win)[::hop]
    S = np.abs(np.fft.rfft(fr*np.hanning(win), axis=1))[:, :400]   # 0-6.25k
    db = 20*np.log10(S+1e-6)
    db = np.clip((db - db.max() + 65)/65, 0, 1)
    img = Image.fromarray((db.T[::-1]*255).astype(np.uint8)).resize((360, 150))
    return img.convert("RGB")

files = [f for f in sorted(os.listdir(D)) if f.endswith(".mp3")]
for page in range(0, len(files), 8):
    chunk = files[page:page+8]
    sheet = Image.new("RGB", (740, 190*((len(chunk)+1)//2)), (18,18,22))
    d = ImageDraw.Draw(sheet)
    for i, f in enumerate(chunk):
        x = 10 + (i % 2)*370; y = 30 + (i//2)*190
        sheet.paste(spec(os.path.join(D, f)), (x, y))
        d.text((x, y-16), f[:-4], fill=(230,230,120))
    sheet.save(f"{OUT}/p{page//8+1}.png")
    print("saved", page//8+1, [f[:-4] for f in chunk])
