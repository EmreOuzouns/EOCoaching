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
    
    # Draw background orange gradient circle
    draw.ellipse([c_x - r, c_y - r, c_x + r, c_y + r], fill=(249, 115, 22, 255)) # Orange (#f97316)
    
    # Draw inner white circular border
    r_in = 205 * scale
    draw.ellipse([c_x - r_in, c_y - r_in, c_x + r_in, c_y + r_in], outline=(255, 255, 255, 120), width=max(1, int(6*scale)))
    
    # Draw Dumbbell
    # Bar in the middle
    bar_w = 260 * scale
    bar_h = 32 * scale
    draw.rectangle([c_x - bar_w/2, c_y - bar_h/2, c_x + bar_w/2, c_y + bar_h/2], fill=(255, 255, 255, 255))
    
    # Inner plates
    ip_w = 24 * scale
    ip_h = 160 * scale
    draw.rectangle([c_x - bar_w/2 - ip_w, c_y - ip_h/2, c_x - bar_w/2, c_y + ip_h/2], fill=(255, 255, 255, 255))
    draw.rectangle([c_x + bar_w/2, c_y - ip_h/2, c_x + bar_w/2 + ip_w, c_y + ip_h/2], fill=(255, 255, 255, 255))
    
    # Outer plates
    op_w = 32 * scale
    op_h = 220 * scale
    draw.rectangle([c_x - bar_w/2 - ip_w - 12*scale - op_w, c_y - op_h/2, c_x - bar_w/2 - ip_w - 12*scale, c_y + op_h/2], fill=(255, 255, 255, 255))
    draw.rectangle([c_x + bar_w/2 + ip_w + 12*scale, c_y - op_h/2, c_x + bar_w/2 + ip_w + 12*scale + op_w, c_y + op_h/2], fill=(255, 255, 255, 255))
    
    # Grips in the middle (silver/light gray accent)
    grip_w = 120 * scale
    grip_h = 42 * scale
    draw.rectangle([c_x - grip_w/2, c_y - grip_h/2, c_x + grip_w/2, c_y + grip_h/2], fill=(241, 245, 249, 255))
    
    return img

# Save sizes
draw_dumbbell(192).save("icons/icon-192.png")
draw_dumbbell(512).save("icons/icon-512.png")
print("Icons generated successfully!")
