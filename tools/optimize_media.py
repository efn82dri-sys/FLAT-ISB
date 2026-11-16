#!/usr/bin/env python3
"""آماده‌سازی عکس و کلیپ برای سایت (سبک کردن برای اینترنت کند).

عکس (نیاز: pip install pillow):
    python tools/optimize_media.py photos "C:\\path\\to\\renders" out
هر عکس را به دو فایل WEBP تبدیل می‌کند: نسخهٔ دسکتاپ (عرض ۲۰۰۰) و نسخهٔ موبایل (عرض ۹۰۰، پسوند -m).
هدف: حدود ۱۵۰ تا ۳۰۰ کیلوبایت برای هر عکس دسکتاپ.

کلیپ (نیاز: برنامهٔ ffmpeg نصب باشد):
    python tools/optimize_media.py video "C:\\path\\clip.mp4" out --seconds 8
کلیپ را بی‌صدا، ۷۲۰p و کم‌حجم می‌کند و هر دو فرمت MP4 و WEBM می‌سازد. هدف: حداکثر ۲ تا ۳ مگابایت.

بعد خروجی‌ها را در پنل ادمین (اسلایدهای هیرو) آپلود کنید.
"""
import argparse, os, shutil, subprocess, sys

def kb(p): return os.path.getsize(p) / 1024

def photos(src, out, width, quality):
    try:
        from PIL import Image, ImageOps
    except ImportError:
        sys.exit('Pillow نصب نیست. اجرا کنید:  pip install pillow')
    os.makedirs(out, exist_ok=True)
    files = [os.path.join(src, f) for f in sorted(os.listdir(src))] if os.path.isdir(src) else [src]
    n = 0
    for f in files:
        if not f.lower().endswith(('.jpg', '.jpeg', '.png', '.webp', '.tif', '.tiff', '.bmp')): continue
        im = ImageOps.exif_transpose(Image.open(f)).convert('RGB'); base = os.path.splitext(os.path.basename(f))[0].replace(' ', '-')
        for suffix, w, q in (('', width, quality), ('-m', 900, quality - 4)):
            o = im if im.width <= w else im.resize((w, round(im.height * w / im.width)), Image.LANCZOS)
            dst = os.path.join(out, f'{base}{suffix}.webp'); o.save(dst, 'WEBP', quality=q, method=6)
            print(f'  {os.path.basename(dst):40s} {o.width}x{o.height}  {kb(dst):7.0f} KB' + ('  ← سنگین است؛ --quality را کم کنید' if suffix == '' and kb(dst) > 450 else ''))
        if im.width < 1800: print(f'  هشدار: عرض {base} فقط {im.width} پیکسل است؛ روی صفحهٔ بزرگ نرم دیده می‌شود (عکس بزرگ‌تر بدهید).')
        n += 1
    print(f'\n✓ {n} عکس آماده شد → {out}')

def video(src, out, seconds, height):
    ff = shutil.which('ffmpeg')
    if not ff: sys.exit('ffmpeg پیدا نشد. از ffmpeg.org دانلود و نصب کنید (یا در PATH بگذارید).')
    os.makedirs(out, exist_ok=True); base = os.path.splitext(os.path.basename(src))[0].replace(' ', '-')
    vf = f"scale=-2:'min({height},ih)',fps=24"; common = ['-y', '-loglevel', 'error', '-i', src, '-t', str(seconds), '-an', '-vf', vf]
    mp4 = os.path.join(out, base + '.mp4'); webm = os.path.join(out, base + '.webm')
    subprocess.check_call([ff] + common + ['-c:v', 'libx264', '-profile:v', 'main', '-pix_fmt', 'yuv420p', '-preset', 'slow', '-crf', '29', '-movflags', '+faststart', mp4])
    subprocess.check_call([ff] + common + ['-c:v', 'libvpx-vp9', '-b:v', '0', '-crf', '37', '-row-mt', '1', webm])
    poster = os.path.join(out, base + '-poster.jpg')
    subprocess.call([ff, '-y', '-loglevel', 'error', '-i', src, '-ss', '1', '-frames:v', '1', '-vf', f"scale=-2:'min(1080,ih)'", '-q:v', '3', poster])
    for p in (mp4, webm, poster):
        if os.path.exists(p): print(f'  {os.path.basename(p):40s} {kb(p)/1024:6.2f} MB' + ('  ← سنگین است؛ --seconds را کم کنید' if p.endswith(('.mp4', '.webm')) and kb(p) > 3500 else ''))
    print('\n✓ پوستر (jpg) را به‌عنوان «تصویر» و mp4/webm را به‌عنوان کلیپ در اسلاید آپلود کنید.')

if __name__ == '__main__':
    ap = argparse.ArgumentParser(description='سبک‌سازی عکس و کلیپ برای سایت ISB')
    ap.add_argument('kind', choices=['photos', 'video']); ap.add_argument('src'); ap.add_argument('out')
    ap.add_argument('--width', type=int, default=2000); ap.add_argument('--quality', type=int, default=78)
    ap.add_argument('--seconds', type=float, default=8); ap.add_argument('--height', type=int, default=720)
    a = ap.parse_args()
    photos(a.src, a.out, a.width, a.quality) if a.kind == 'photos' else video(a.src, a.out, a.seconds, a.height)
