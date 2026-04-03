"""
Generate branded Humara icons from the source logo.
Colorizes the black silhouette with Humara brand colors:
  - Left-to-right gradient: indigo #6366f1 → deep navy #312e81
  - Transparent background
Outputs: favicon.ico, favicon.png, icon.png (256), apple-touch-icon.png (180), logo.png (512)
"""

from PIL import Image, ImageDraw
import numpy as np
import os

SRC = os.path.join("humanizer-engine", "frontend", "public", "logo-source-new.png")
OUT = os.path.join("humanizer-engine", "frontend", "public")

# Humara brand colors (from globals.css)
COLOR_LEFT  = (99, 102, 241)   # #6366f1  brand-500 (indigo)
COLOR_RIGHT = (49, 46, 129)    # #312e81  brand-900 (deep navy)
COLOR_MID   = (79, 70, 229)    # #4f46e5  brand-600

def hex_to_rgb(h):
    return tuple(int(h[i:i+2], 16) for i in (1, 3, 5))

def lerp_color(c1, c2, t):
    return tuple(int(c1[i] + (c2[i] - c1[i]) * t) for i in range(3))

def colorize_logo(src_path):
    """Recolor the logo: source is black with alpha transparency.
    Replace black RGB with a left-to-right brand gradient, keeping original alpha."""
    img = Image.open(src_path).convert("RGBA")
    arr = np.array(img)

    h, w = arr.shape[:2]
    alpha = arr[:, :, 3]  # original alpha IS the shape mask

    # Find bounding box of visible content for gradient mapping
    visible = alpha > 10
    rows = np.any(visible, axis=1)
    cols = np.any(visible, axis=0)
    rmin, rmax = np.where(rows)[0][[0, -1]]
    cmin, cmax = np.where(cols)[0][[0, -1]]
    content_width = max(cmax - cmin, 1)

    # Build horizontal gradient (left=COLOR_LEFT, right=COLOR_RIGHT)
    t = np.clip((np.arange(w) - cmin) / content_width, 0, 1)
    gradient_r = (COLOR_LEFT[0] + (COLOR_RIGHT[0] - COLOR_LEFT[0]) * t).astype(np.uint8)
    gradient_g = (COLOR_LEFT[1] + (COLOR_RIGHT[1] - COLOR_LEFT[1]) * t).astype(np.uint8)
    gradient_b = (COLOR_LEFT[2] + (COLOR_RIGHT[2] - COLOR_LEFT[2]) * t).astype(np.uint8)

    # Apply gradient colors, keep original alpha untouched
    result = np.zeros((h, w, 4), dtype=np.uint8)
    result[:, :, 0] = gradient_r[np.newaxis, :]
    result[:, :, 1] = gradient_g[np.newaxis, :]
    result[:, :, 2] = gradient_b[np.newaxis, :]
    result[:, :, 3] = alpha  # preserve original smooth alpha edges

    return Image.fromarray(result, "RGBA")

def crop_to_content(img, padding=10):
    """Crop to non-transparent bounding box + padding."""
    arr = np.array(img)
    alpha = arr[:,:,3]
    rows = np.any(alpha > 10, axis=1)
    cols = np.any(alpha > 10, axis=0)
    rmin, rmax = np.where(rows)[0][[0, -1]]
    cmin, cmax = np.where(cols)[0][[0, -1]]
    
    rmin = max(0, rmin - padding)
    rmax = min(arr.shape[0]-1, rmax + padding)
    cmin = max(0, cmin - padding)
    cmax = min(arr.shape[1]-1, cmax + padding)
    
    return img.crop((cmin, rmin, cmax+1, rmax+1))

def make_square(img):
    """Pad to square with transparent background."""
    w, h = img.size
    size = max(w, h)
    result = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    result.paste(img, ((size - w) // 2, (size - h) // 2))
    return result

def generate_favicon_ico(img, path):
    """Generate multi-size .ico file."""
    sizes = [(16, 16), (32, 32), (48, 48)]
    icons = [img.resize(s, Image.LANCZOS) for s in sizes]
    icons[0].save(path, format="ICO", sizes=sizes)

def main():
    print("Loading source image...")
    colored = colorize_logo(SRC)
    
    print("Cropping and squaring...")
    cropped = crop_to_content(colored, padding=5)
    square = make_square(cropped)
    
    # Generate all sizes
    sizes = {
        "logo.png": 512,
        "icon.png": 256,
        "apple-touch-icon.png": 180,
        "favicon.png": 32,
    }
    
    for name, size in sizes.items():
        out_path = os.path.join(OUT, name)
        resized = square.resize((size, size), Image.LANCZOS)
        
        # For apple-touch-icon, add white background (iOS requirement)
        if name == "apple-touch-icon.png":
            bg = Image.new("RGBA", (size, size), (255, 255, 255, 255))
            bg.paste(resized, (0, 0), resized)
            bg.save(out_path)
        else:
            resized.save(out_path)
        
        print(f"  ✓ {name} ({size}x{size})")
    
    # Generate .ico
    ico_path = os.path.join(OUT, "favicon.ico")
    generate_favicon_ico(square, ico_path)
    print(f"  ✓ favicon.ico (multi-size)")
    
    # Also save a large version for OG/social
    og = square.resize((1200, 1200), Image.LANCZOS)
    og_path = os.path.join(OUT, "og-logo.png")
    og.save(og_path)
    print(f"  ✓ og-logo.png (1200x1200)")
    
    print("\nAll icons generated successfully!")

if __name__ == "__main__":
    main()
