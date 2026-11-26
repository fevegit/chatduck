from pathlib import Path
from PIL import Image, ImageOps
import sys

source = Path(sys.argv[1])
assets = Path(sys.argv[2])
source_image = Image.open(source).convert('RGBA')
alpha = source_image.getchannel('A')
bounds = alpha.getbbox()
if bounds is None:
    raise SystemExit('Source icon has no visible pixels.')
crop = source_image.crop(bounds)
side = max(crop.size)
pad = max(1, round(side * 0.04))
canvas_side = side + pad * 2
canvas = Image.new('RGBA', (canvas_side, canvas_side), (0, 0, 0, 0))
canvas.alpha_composite(crop, ((canvas_side - crop.width) // 2, (canvas_side - crop.height) // 2))
assets.mkdir(parents=True, exist_ok=True)
canvas.save(assets / 'chatduck.png', optimize=True)
(assets / 'chatduck-source.png').write_bytes(source.read_bytes())
sizes = [16, 24, 32, 48, 64, 128, 256]
renders = assets / 'renders'
renders.mkdir(parents=True, exist_ok=True)
frames = []
for size in sizes:
    frame = canvas.resize((size, size), Image.Resampling.LANCZOS)
    frame.save(renders / f'{size}.png', optimize=True)
    frames.append(frame)
frames[-1].save(assets / 'chatduck.ico', format='ICO', sizes=[(s, s) for s in sizes], append_images=frames[:-1])
# Read ICO directory to confirm all expected entries.
icon = Image.open(assets / 'chatduck.ico')
icon_sizes = sorted(icon.info.get('sizes', set()))
if icon_sizes != sorted((s, s) for s in sizes):
    raise SystemExit(f'ICO size table mismatch: {icon_sizes}')
# Contact sheet on neutral background for checking small-size legibility.
preview = Image.new('RGBA', (sum(sizes) + 24 * (len(sizes) + 1), 300), (37, 43, 46, 255))
x = 24
for size, frame in zip(sizes, frames):
    scaled = frame.resize((size * 2, size * 2), Image.Resampling.NEAREST)
    preview.alpha_composite(scaled, (x, 30))
    x += size * 2 + 24
preview.convert('RGB').save(assets / 'chatduck-icons-preview.png', optimize=True)
print(f'Source {source_image.size}, visible bounds {bounds}, normalized canvas {canvas.size}, ICO sizes {icon_sizes}')
