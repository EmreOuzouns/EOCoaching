import os
import sys

# Ensure PIL is installed, if not try to install it
try:
    from PIL import Image, ImageDraw
except ImportError:
    print("PIL not found, installing pillow...")
    import subprocess
    subprocess.check_call([sys.executable, "-m", "pip", "install", "pillow"])
    from PIL import Image, ImageDraw

# Create directories
os.makedirs("icons", exist_ok=True)

def draw_dumbbell(size):
    # Create image with transparent background
    img = Image.new("RGBA", (size, size), (255, 255, 255, 0))
    draw = ImageDraw.Draw(img)
    
    # Coordinates scaling
    scale = size / 512.0
    c_x, c_y = 256 * scale, 256 * scale
    r = 230 * scale
    
    # Draw dark slate circular badge
    draw.ellipse([c_x - r, c_y - r, c_x + r, c_y + r], fill=(15, 23, 42, 255))  # Deep Slate (#0f172a)

    # Draw inner yellow/gold circular border
    r_in = 208 * scale
    draw.ellipse([c_x - r_in, c_y - r_in, c_x + r_in, c_y + r_in], outline=(250, 204, 21, 210), width=max(2, int(8 * scale)))

    yellow_main = (250, 204, 21, 255)   # Vibrant Yellow (#facc15)
    yellow_accent = (234, 179, 8, 255)  # Rich Gold (#eab308)

    # Draw Yellow Dumbbell
    # Bar in the middle
    bar_w = 250 * scale
    bar_h = 30 * scale
    draw.rounded_rectangle([c_x - bar_w / 2, c_y - bar_h / 2, c_x + bar_w / 2, c_y + bar_h / 2], radius=max(2, int(6 * scale)), fill=yellow_main)

    # Inner plates
    ip_w = 30 * scale
    ip_h = 156 * scale
    rad_ip = max(2, int(8 * scale))
    draw.rounded_rectangle([c_x - bar_w / 2 - ip_w, c_y - ip_h / 2, c_x - bar_w / 2, c_y + ip_h / 2], radius=rad_ip, fill=yellow_main)
    draw.rounded_rectangle([c_x + bar_w / 2, c_y - ip_h / 2, c_x + bar_w / 2 + ip_w, c_y + ip_h / 2], radius=rad_ip, fill=yellow_main)

    # Outer plates
    op_w = 34 * scale
    op_h = 216 * scale
    rad_op = max(2, int(10 * scale))
    draw.rounded_rectangle([c_x - bar_w / 2 - ip_w - 10 * scale - op_w, c_y - op_h / 2, c_x - bar_w / 2 - ip_w - 10 * scale, c_y + op_h / 2], radius=rad_op, fill=yellow_accent)
    draw.rounded_rectangle([c_x + bar_w / 2 + ip_w + 10 * scale, c_y - op_h / 2, c_x + bar_w / 2 + ip_w + 10 * scale + op_w, c_y + op_h / 2], radius=rad_op, fill=yellow_accent)

    # Grips in the middle (darker gold/amber accent)
    grip_w = 110 * scale
    grip_h = 40 * scale
    draw.rounded_rectangle([c_x - grip_w / 2, c_y - grip_h / 2, c_x + grip_w / 2, c_y + grip_h / 2], radius=max(2, int(8 * scale)), fill=yellow_accent)

    return img


# Save PNG sizes & Windows ICO
draw_dumbbell(192).save("icons/icon-192.png")
icon_512 = draw_dumbbell(512)
icon_512.save("icons/icon-512.png")
icon_512.save(
    "icons/app.ico",
    format="ICO",
    sizes=[(16, 16), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)],
)
print("Yellow dumbbell icons (192, 512, app.ico) generated successfully!")
