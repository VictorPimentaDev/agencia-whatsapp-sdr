"""Rebuild the 1200x630 project card. Requires Pillow; not an app dependency."""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

root = Path(__file__).resolve().parents[1]
canvas = Image.new('RGB', (1200, 630), '#f6f7f4')
draw = ImageDraw.Draw(canvas)
font_path = root / 'src/app/fonts/manrope.ttf'
def font(size):
    result = ImageFont.truetype(str(font_path), size)
    result.set_variation_by_axes([550])
    return result

draw.rounded_rectangle((54, 52, 1146, 578), radius=26, fill='#ffffff', outline='#dce4d4', width=2)
draw.rounded_rectangle((88, 86, 147, 145), radius=16, fill='#305b3c')
draw.line((104, 130, 131, 102), fill='#d9edb3', width=4)
draw.ellipse((111, 99, 133, 123), outline='#d9edb3', width=3)
draw.text((164, 85), 'agência.', fill='#25362d', font=font(41))
draw.text((91, 188), 'Good conversations.', fill='#25362d', font=font(58))
draw.text((91, 264), 'A human in charge.', fill='#52734b', font=font(58))
draw.text((94, 357), 'WhatsApp qualification + local AI + MCP', fill='#748076', font=font(25))
for index, (label, x, width) in enumerate([('Next.js', 94, 127), ('Supabase', 233, 162), ('MIT', 407, 82)]):
    draw.rounded_rectangle((x, 428, x+width, 472), radius=12, fill='#eef3e7')
    draw.text((x+16, 437), label, fill='#305b3c', font=font(20))
for index, h in enumerate([105, 151, 193, 235]):
    x = 820+index*65
    draw.rounded_rectangle((x, 496-h, x+43, 496), radius=10, fill=['#e4ecd8','#c8d9b0','#93af77','#305b3c'][index])
draw.text((94, 522), 'VictorPimentaDev / agencia-whatsapp-sdr', fill='#748076', font=font(19))
assert canvas.size == (1200, 630)
canvas.save(root / 'docs/social-preview.png')
assert (root / 'docs/social-preview.png').stat().st_size > 1000
