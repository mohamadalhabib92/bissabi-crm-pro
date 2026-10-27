"""Génère les icônes de l'app (mobile + PWA) à partir d'un monogramme.
Usage : python3 scripts/make-icons.py "<MONOGRAMME>" <fond #hex> <texte #hex> [accent #hex]
Remplacez les fichiers par le logo officiel quand il est disponible."""
import os, sys
from PIL import Image, ImageDraw, ImageFont

mono, bg, fg = sys.argv[1], sys.argv[2], sys.argv[3]
accent = sys.argv[4] if len(sys.argv) > 4 else fg
FONTS = ["/usr/share/fonts/truetype/dejavu/DejaVuSerif-Bold.ttf", "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"]

def font(size):
    for f in FONTS:
        if os.path.exists(f):
            return ImageFont.truetype(f, size)
    return ImageFont.load_default()

def icon(size, pad_ratio=0.0, rounded=False):
    img = Image.new("RGBA", (size, size), bg)
    d = ImageDraw.Draw(img)
    inner = size * (1 - 2 * pad_ratio)
    f = font(int(inner * (0.42 if len(mono) <= 2 else 0.28)))
    box = d.textbbox((0, 0), mono, font=f)
    w, h = box[2] - box[0], box[3] - box[1]
    d.text(((size - w) / 2 - box[0], (size - h) / 2 - box[1] - size * 0.03), mono, font=f, fill=fg)
    lw = int(inner * 0.18)
    y = size / 2 + h / 2 + size * 0.04
    d.rounded_rectangle([(size - lw) / 2, y, (size + lw) / 2, y + max(2, size * 0.012)], radius=2, fill=accent)
    return img

os.makedirs("assets", exist_ok=True)
os.makedirs("public/icons", exist_ok=True)
icon(1024).save("assets/icon.png")
icon(1024, 0.18).save("assets/splash-icon.png")
icon(1024, 0.2).save("assets/android-icon-foreground.png")
Image.new("RGBA", (1024, 1024), bg).save("assets/android-icon-background.png")
icon(1024, 0.2).convert("L").save("assets/android-icon-monochrome.png")
icon(48).save("assets/favicon.png")
icon(192).save("public/icons/icon-192.png")
icon(512).save("public/icons/icon-512.png")
icon(512, 0.12).save("public/icons/maskable-512.png")
icon(180).save("public/icons/apple-touch-icon.png")
print("icônes générées")
