# Rebuilds the self-hosted variable fonts from the google/fonts sources (pip install fonttools brotli):
#   python3 src/fonts/subset-font.py "Archivo[wdth,wght].ttf" src/fonts/archivo-latin-ext.woff2 wght=400:800 wdth=100:125
#   python3 src/fonts/subset-font.py "JetBrainsMono[wght].ttf" src/fonts/jetbrains-mono-latin-ext.woff2 wght=400:800
# Axes are limited to what the tokens use and glyphs to Latin + Latin Extended-A, so each family is
# one small file instead of several full Google subsets.
import sys
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont
from fontTools import subset

src, out, *axes = sys.argv[1:]
limits = {tag: tuple(float(v) for v in rng.split(":")) for tag, rng in (a.split("=") for a in axes)}
font = TTFont(src)

unicodes = (
    list(range(0x20, 0x7F)) + list(range(0xA0, 0x180)) + list(range(0x218, 0x21C)) +
    [0x2BB, 0x2BC, 0x2C6, 0x2DA, 0x2DC, 0x304, 0x308, 0x329] +
    list(range(0x2000, 0x2070)) +
    [0x20AC, 0x2122, 0x2190, 0x2191, 0x2192, 0x2193, 0x2212, 0x2215, 0xFFFD]
)
opts = subset.Options()
opts.flavor = "woff2"
opts.layout_features = opts.layout_features + ["tnum", "lnum", "case"]
opts.name_IDs = [0, 1, 2, 3, 4, 5, 6, 13, 14]
opts.notdef_outline = True
sub = subset.Subsetter(opts)
sub.populate(unicodes=unicodes)
sub.subset(font)
font = instantiateVariableFont(font, limits)
font.flavor = "woff2"
font.save(out)
