"""Dark mode (Tim, Oct 20 2026: the light pages strain his eyes on the
computer). Writes the dark version of every hard-coded colour in the two
stylesheets, so each rule keeps its place in the cascade:

  main.css       → static/css/dark-main.gen.css   (loaded right after main.css)
  theme-cfa.css  → static/css/dark-theme.gen.css  (loaded right after theme-cfa.css)

Each rule is copied with only its colour declarations, under
`:where(html[data-theme="dark"])`, which adds no specificity: the dark rule
wins over its own light rule (it comes later) and loses to whatever beat
the light rule, exactly as before. The tokens (--cfa-white, --text-primary
…) and the few hand-tuned spots are in static/css/dark.css, loaded last.

How a colour turns dark depends on what it paints:
  background  light surfaces → dark surfaces (tints keep their hue),
              mid and dark colours (brand red, navy cards) stay
  text        dark ink → light ink (coloured ink lightened, same hue),
              light text (white on red) stays
  border      light lines → dark lines
Shadows stay as they are.

Run after changing main.css or theme-cfa.css:
    python3 tools/dark_css.py
tests/test_dark_mode.py fails while the generated files are out of date.
"""
import colorsys
import os
import re

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CSS = os.path.join(ROOT, 'static', 'css')
SOURCES = (('main.css', 'dark-main.gen.css'), ('theme-cfa.css', 'dark-theme.gen.css'))
DARK = 'html[data-theme="dark"]'

COLOR_RE = re.compile(r'#[0-9a-fA-F]{8}\b|#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{4}\b|#[0-9a-fA-F]{3}\b'
                      r'|rgba?\([^)]*\)|hsla?\([^)]*\)|\b(?<![-\w])(?:white|black)\b(?![-\w])', re.I)
BG_PROPS = {'background', 'background-color', 'background-image'}
FG_PROPS = {'color', 'fill', 'stroke', 'caret-color', '-webkit-text-fill-color', 'text-decoration-color', 'accent-color'}
SKIP_AT = ('@keyframes', '@-webkit-keyframes', '@font-face', '@import', '@charset', '@page', '@counter-style')
# Brand colours painted as text: the dark page's own lighter shades (dark.css).
INK_VARS = {'var(--cfa-navy)': 'var(--ink-navy)', 'var(--cfa-red)': 'var(--ink-red)', 'var(--cfa-dark-red)': 'var(--ink-dark-red)'}


# ----- colours -----

def parse_color(s):
    s = s.strip().lower()
    if s == 'white':
        return 1.0, 1.0, 1.0, 1.0
    if s == 'black':
        return 0.0, 0.0, 0.0, 1.0
    if s.startswith('#'):
        h = s[1:]
        if len(h) in (3, 4):
            h = ''.join(c * 2 for c in h)
        a = int(h[6:8], 16) / 255 if len(h) == 8 else 1.0
        return int(h[0:2], 16) / 255, int(h[2:4], 16) / 255, int(h[4:6], 16) / 255, a
    m = re.match(r'(rgba?|hsla?)\((.*)\)$', s)
    if not m:
        return None
    parts = [p for p in re.split(r'[\s,/]+', m.group(2).strip()) if p]
    if len(parts) < 3 or any('var(' in p for p in parts):
        return None

    def num(p, scale):
        return float(p[:-1]) / 100 if p.endswith('%') else float(p) / scale
    try:
        a = num(parts[3], 1) if len(parts) > 3 else 1.0
        if m.group(1).startswith('rgb'):
            return num(parts[0], 255), num(parts[1], 255), num(parts[2], 255), a
        h = float(parts[0].replace('deg', '')) / 360
        r, g, b = colorsys.hls_to_rgb(h, num(parts[2], 100), num(parts[1], 100))
        return r, g, b, a
    except ValueError:
        return None


def fmt(r, g, b, a):
    c = lambda v: max(0, min(255, round(v * 255)))
    if a >= 0.999:
        return '#%02X%02X%02X' % (c(r), c(g), c(b))
    return 'rgba(%d,%d,%d,%s)' % (c(r), c(g), c(b), ('%.3f' % a).rstrip('0').rstrip('.'))


def hls(rgb):
    return colorsys.rgb_to_hls(*rgb)


def from_hls(h, l, s, a):
    r, g, b = colorsys.hls_to_rgb(h, max(0, min(1, l)), max(0, min(1, s)))
    return fmt(r, g, b, a)


def chroma(r, g, b):
    return max(r, g, b) - min(r, g, b)


def dark_bg(rgba, light_from=0.85):
    r, g, b, a = rgba
    h, l, s = hls((r, g, b))
    c = chroma(r, g, b)
    if a < 0.35 and l < 0.25:                       # a faint black wash on light → a faint white one
        return fmt(1, 1, 1, min(0.12, a * 1.4))
    if l >= light_from:
        if c < 0.035:                               # white, greys
            return from_hls(h, 0.115 + (1 - l) * 0.9, min(s, 0.08), a)
        # Tints (ivory, a pink or green wash): a dark surface with a hint of the hue.
        return from_hls(h, 0.15 + (1 - l) * 0.45, min(0.32, c * 3.2), a)
    if c < 0.06 and l >= 0.55:                      # light greys (disabled, tracks)
        return from_hls(h, 1.08 - l, min(s, 0.08), a)
    return None                                     # brand colours, navy, dark: as they are


def dark_fg(rgba):
    r, g, b, a = rgba
    h, l, s = hls((r, g, b))
    if l > 0.5:
        return None                                 # white on red, light text: as it is
    if chroma(r, g, b) < 0.08:
        return from_hls(h, 0.92 - l * 0.6, min(s, 0.1), a)
    return from_hls(h, 0.56 + (0.5 - l) * 0.5, min(1, s * 1.05), a)


def dark_border(rgba):
    r, g, b, a = rgba
    h, l, s = hls((r, g, b))
    c = chroma(r, g, b)
    if a < 0.35 and l < 0.25:
        return fmt(1, 1, 1, min(0.16, a * 1.6))
    if l >= 0.75:
        if c < 0.1:                                 # greys and ivory lines
            return from_hls(h, 0.16 + (1 - l) * 0.4, min(s, 0.08), a)
        return from_hls(h, 0.24 + (1 - l) * 0.3, min(0.4, c * 2.5), a)
    if c < 0.08 and l < 0.45:
        return from_hls(h, 0.62 - l * 0.5, min(s, 0.1), a)
    return None


def kind_of(prop):
    p = prop.lower()
    if p.startswith('--'):
        n = p[2:]
        if re.search(r'ink|text|muted|primary|secondary|tertiary|fg', n):
            return 'fg'
        if re.search(r'line|border', n):
            return 'border'
        if re.search(r'bg|card|white|light|soft|surface|ground|paper|unrated|sky', n):
            return 'bg'
        return None
    if p in BG_PROPS:
        return 'bg'
    if p in FG_PROPS:
        return 'fg'
    if p.startswith('border') or p.startswith('outline') or p in ('column-rule', 'column-rule-color'):
        return 'border'
    return None


MAPPERS = {'bg': dark_bg, 'fg': dark_fg, 'border': dark_border}


def dark_value(prop, value):
    """The dark value, or None when the declaration stays as it is."""
    kind = kind_of(prop)
    if not kind:
        return None
    changed = False

    def sub(m):
        nonlocal changed
        c = parse_color(m.group(0))
        if c is None:
            return m.group(0)
        # A custom property's tint (a daypart's sky) darkens from a lower lightness.
        out = dark_bg(c, 0.7) if kind == 'bg' and prop.startswith('--') else MAPPERS[kind](c)
        if out is None:
            return m.group(0)
        changed = True
        return out
    v = COLOR_RE.sub(sub, value)
    if kind == 'fg':
        for k, ink in INK_VARS.items():
            if k in v:
                v = v.replace(k, ink)
                changed = True
    return v if changed else None


# ----- a small CSS reader: rules, @media/@supports blocks, declarations -----

def strip_comments(css):
    return re.sub(r'/\*.*?\*/', '', css, flags=re.S)


def split_top(s, sep):
    out, depth, quote, cur = [], 0, None, []
    for ch in s:
        if quote:
            cur.append(ch)
            if ch == quote:
                quote = None
            continue
        if ch in '"\'':
            quote = ch
        elif ch in '([':
            depth += 1
        elif ch in ')]':
            depth -= 1
        elif ch == sep and depth == 0:
            out.append(''.join(cur))
            cur = []
            continue
        cur.append(ch)
    out.append(''.join(cur))
    return out


def blocks(css):
    """[(prelude, body)] at this level; body is the text between the braces."""
    out, i, n = [], 0, len(css)
    while i < n:
        j = css.find('{', i)
        if j < 0:
            break
        prelude = css[i:j].strip()
        semi = prelude.rfind(';')
        if semi >= 0:                               # "@import …;" before it
            prelude = prelude[semi + 1:].strip()
        depth, k = 1, j + 1
        while k < n and depth:
            if css[k] == '{':
                depth += 1
            elif css[k] == '}':
                depth -= 1
            k += 1
        out.append((prelude, css[j + 1:k - 1]))
        i = k
    return out


def dark_selector(sel):
    sel = sel.strip()
    m = re.match(r'^(:root|html)(?![-\w])', sel)
    if m:
        return DARK + sel[m.end():]
    return f':where({DARK}) {sel}'


def convert(css, indent=''):
    out = []
    for prelude, body in blocks(css):
        if prelude.startswith('@'):
            if prelude.lower().startswith(SKIP_AT):
                continue
            inner = convert(body, indent + '  ')
            if inner:
                out.append(f'{indent}{prelude}{{\n{inner}\n{indent}}}')
            continue
        decls = []
        # An "ink chip" (the ink as its background, ivory text): the ink
        # turns light, so its text turns dark.
        ink_bg = re.search(r'(?:^|;)\s*background(?:-color)?\s*:\s*var\(--(?:text-primary|su-ink)\)', body)
        for d in split_top(body, ';'):
            if ':' not in d:
                continue
            prop, value = d.split(':', 1)
            prop, value = prop.strip(), value.strip()
            important = re.search(r'\s*!important\s*$', value, re.I)
            if important:
                value = value[:important.start()].strip()
            dv = dark_value(prop, value)
            if ink_bg and kind_of(prop) == 'fg':
                c = parse_color(value)
                if c and hls(c[:3])[1] > 0.85:
                    dv = 'var(--cfa-bg)'
            if dv is not None:
                decls.append(f'{prop}:{dv}{" !important" if important else ""}')
        if decls:
            sels = ','.join(dark_selector(s) for s in split_top(prelude, ',') if s.strip())
            out.append(f'{indent}{sels}{{{";".join(decls)};}}')
    return '\n'.join(out)


def build(src):
    with open(os.path.join(CSS, src), encoding='utf-8') as f:
        css = strip_comments(f.read())
    return (f'/* Generated by tools/dark_css.py from {src}: do not edit; change {src} and run\n'
            f'   python3 tools/dark_css.py. Dark mode only (html[data-theme="dark"]). */\n' + convert(css) + '\n')


def main():
    for src, dst in SOURCES:
        with open(os.path.join(CSS, dst), 'w', encoding='utf-8') as f:
            f.write(build(src))
        print(f'{dst}: from {src}')


if __name__ == '__main__':
    main()
