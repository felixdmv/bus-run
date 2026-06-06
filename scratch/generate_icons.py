import os
import sys

# Try importing PIL, if not available, try installing it
try:
    from PIL import Image, ImageDraw
except ImportError:
    import subprocess
    print("Pillow not found, installing it...")
    subprocess.check_call([sys.executable, "-m", "pip", "install", "Pillow"])
    from PIL import Image, ImageDraw

def create_icon(size, filename):
    # Orange color: #fc5200 -> RGB (252, 82, 0)
    img = Image.new("RGBA", (size, size), (252, 82, 0, 255))
    draw = ImageDraw.Draw(img)
    
    # Scaled coordinates for a clean lightning bolt
    scale = size / 100.0
    points = [
        (55 * scale, 15 * scale),
        (30 * scale, 55 * scale),
        (48 * scale, 55 * scale),
        (40 * scale, 85 * scale),
        (70 * scale, 45 * scale),
        (52 * scale, 45 * scale)
    ]
    draw.polygon(points, fill=(255, 255, 255, 255))
    
    img.save(filename, "PNG")
    print(f"Icon created successfully: {filename} ({size}x{size})")

if __name__ == "__main__":
    os.makedirs("public", exist_ok=True)
    create_icon(192, "public/icon-192.png")
    create_icon(512, "public/icon-512.png")
    print("All PWA icons generated successfully!")
