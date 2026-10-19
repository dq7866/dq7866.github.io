# -*- coding: utf-8 -*-
"""用 iNaturalist 物种默认精选照替换 farm 图鉴里构图不佳的照片。

普通观察接口按最近时间排序，随机性大（容易抓到"远处一小坨"）；
taxa 接口的 taxon_photos 是社区精选的物种代表照，构图好得多。
仍只接受 CC0 / CC BY。用法：python tools/replace_farm_photos.py [key...]
"""
import os, io, sys, json, time, urllib.request
from PIL import Image

BASE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(BASE, "..", "assets", "photos")
META = os.path.join(BASE, "..", "data", "photo-meta-farm.json")
UA = {"User-Agent": "Mozilla/5.0"}

TAXON = {"dog": 47144, "cat": 118552, "cattle": 74113, "sheep": 121578,
         "goat": 123070, "horse": 209233, "pig": 324492, "rooster": 505478,
         "duck": 236935, "goose": 120479, "donkey": 148030, "rabbit": 334341,
         "pigeon": 122767, "turkey": 524794}
W, H = 640, 480


def get(url, binary=False, tries=3):
    for i in range(tries):
        try:
            req = urllib.request.Request(url, headers=UA)
            with urllib.request.urlopen(req, timeout=40) as r:
                return r.read() if binary else json.load(r)
        except Exception:
            if i == tries - 1:
                return None
            time.sleep(1.5 * (i + 1))


def cover(im):
    im = im.convert("RGB")
    sw, sh = im.size
    scale = max(W / sw, H / sh)
    nw, nh = max(W, int(sw * scale + 0.5)), max(H, int(sh * scale + 0.5))
    im = im.resize((nw, nh), Image.LANCZOS)
    l, t = (nw - W) // 2, (nh - H) // 2
    return im.crop((l, t, l + W, t + H))


def obs_best(key):
    """精选照没有合适许可时：按 votes 排序抓观察照片（查询慢，~80s，但构图好）"""
    url = ("https://api.inaturalist.org/v1/observations?"
           f"taxon_id={TAXON[key]}&photo_license=cc0,cc-by&quality_grade=research"
           f"&per_page=12&order_by=votes&order=desc")
    d = get(url)
    for o in (d or {}).get("results", []):
        for ph in (o.get("photos") or [])[:2]:
            if (ph.get("license_code") or "").lower() not in ("cc0", "cc-by"):
                continue
            u = (ph.get("url") or "").replace("/square.", "/large.")
            data = get(u, binary=True)
            if not data or len(data) < 20000:
                continue
            try:
                im = Image.open(io.BytesIO(data))
            except Exception:
                continue
            if min(im.size) < 400:
                continue
            cover(im).save(os.path.join(OUT, key + ".jpg"), "JPEG", quality=84, optimize=True, progressive=True)
            if os.path.getsize(os.path.join(OUT, key + ".jpg")) < 15000:
                continue
            return {
                "cn": json.load(open(META, encoding="utf-8")).get(key, {}).get("cn", key),
                "file": "assets/photos/" + key + ".jpg", "ready": True,
                "provider": "iNaturalist",
                "license": "CC0" if ph["license_code"].lower() == "cc0" else "CC-BY",
                "credit": (ph.get("attribution") or "").strip(),
                "source": "https://www.inaturalist.org/observations/%s" % o.get("id"),
            }
    return None


def replace(key):
    d = get(f"https://api.inaturalist.org/v1/taxa/{TAXON[key]}")
    photos = ((d or {}).get("results") or [{}])[0].get("taxon_photos") or []
    for tp in photos:
        ph = tp.get("photo") or {}
        if (ph.get("license_code") or "").lower() not in ("cc0", "cc-by", "pd"):
            continue
        url = (ph.get("url") or "").replace("/square.", "/large.")
        if not url:
            continue
        data = get(url, binary=True)
        if not data or len(data) < 20000:
            continue
        try:
            im = Image.open(io.BytesIO(data))
        except Exception:
            continue
        if min(im.size) < 400:
            continue
        dst = os.path.join(OUT, key + ".jpg")
        cover(im).save(dst, "JPEG", quality=84, optimize=True, progressive=True)
        if os.path.getsize(dst) < 15000:
            continue
        return {
            "cn": json.load(open(META, encoding="utf-8")).get(key, {}).get("cn", key),
            "file": "assets/photos/" + key + ".jpg", "ready": True,
            "provider": "iNaturalist",
            "license": {"cc0": "CC0", "cc-by": "CC-BY", "pd": "PD"}.get(ph["license_code"].lower(), "CC-BY"),
            "credit": (ph.get("attribution") or "").strip(),
            "source": "https://www.inaturalist.org/photos/%s" % ph.get("id"),
        }
    return obs_best(key)


if __name__ == "__main__":
    keys = sys.argv[1:] or list(TAXON)
    meta = json.load(open(META, encoding="utf-8"))
    for k in keys:
        m = replace(k)
        print(f"[{'ok' if m else 'fail'}] {k}", (m or {}).get("credit", "")[:60], flush=True)
        if m:
            meta[k] = m
        time.sleep(1)
    json.dump(meta, open(META, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
