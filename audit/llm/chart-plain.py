#!/usr/bin/env python3
"""Draws ../llm-chart-plain.svg: S against cost per run, plain request and the same model with the rules prompt.
Usage: python3 chart-plain.py   (numbers are in POINTS; label positions are set by hand per point)"""
import os

X0, X1, Y0, Y1 = 70, 470, 344, 70          # plot box: S 0..100 down to up, cost 0..$3 left to right
def px(cost): return X0 + cost * (X1 - X0) / 3
def py(s): return Y0 - s * (Y0 - Y1) / 100

# name, version-suffix, family, shape, plain, rules, note
# values: (S, R, cost, tokens, thinking, minutes); label = (anchor, dx, dy) relative to the point for the two lines
POINTS = [
    dict(name='Opus 5.5', sfx=' low', fam='opus', shape='circle',
         plain=(81.9, 95.0, 2.04, '57k (14k)', 7.1), rules=(86.0, 95.0, 1.72, '45k (4k)', 5.1),
         lab=('middle', 0, 26), rlab=('start', 12, -4)),
    dict(name='Sonnet 5.5', sfx=' low', fam='sonnet', shape='circle',
         plain=(68.6, 94.8, 1.03, '58k (15k)', 5.2), rules=(83.8, 95.0, 1.58, '93k (32k)', 8.9),
         lab=('middle', 0, 26), rlab=('end', -11, -8)),
    dict(name='Haiku 5.5', sfx=' medium', fam='haiku', shape='circle',
         plain=(63.8, 94.1, 0.28, '99k (45k)', 6.0), rules=(71.1, 94.8, 0.27, '102k (45k)', 5.7),
         lab=('start', -24, 26), rlab=('start', -24, -16)),
    dict(name='Sonnet 5', sfx=' low', fam='sonnet', shape='square',
         plain=(56.3, 95.2, 2.27, '140k (81k)', 21.8), lab=('end', -12, -2)),
    dict(name='Sonnet 4.6', sfx=' low', fam='sonnet', shape='diamond',
         plain=(48.6, 89.1, 2.58, '≈100k (51k)', 23.1), lab=('middle', 0, 26), note='run in chunks'),
    dict(name='Haiku 4.5', sfx=' medium', fam='haiku', shape='square',
         plain=(18.1, 59.6, 0.61, '44k (3k)', 6.0), lab=('start', 12, -2), note='wrote scripts, 1 of 3 runs returned answers', bad=True),
]
CONV = dict(S=91.8, R=95.8)

def marker(shape, cx, cy, fam, big, ring=False):
    r = 7 if big else 5
    cls = f'dot c-{fam}'
    if ring: return f'<circle class="ring l-{fam}" cx="{cx:.1f}" cy="{cy:.1f}" r="{r}"/>'
    if shape == 'circle': return f'<circle class="{cls}" cx="{cx:.1f}" cy="{cy:.1f}" r="{r}"/>'
    if shape == 'square':
        h = 6.5 if big else 4.5
        return f'<rect class="{cls}" x="{cx-h:.1f}" y="{cy-h:.1f}" width="{2*h:g}" height="{2*h:g}"/>'
    h = 9 if big else 6
    pts = f'{cx:.1f},{cy-h:.1f} {cx+h:.1f},{cy:.1f} {cx:.1f},{cy+h:.1f} {cx-h:.1f},{cy:.1f}'
    return f'<polygon class="{cls}" points="{pts}"/>'

out = []
a = out.append
# table first, to know the height
ROW0, STEP = 142, 20
rows = [('conv',)]
for p in POINTS:
    rows.append(('main', p))
    if 'rules' in p: rows.append(('rules', p))
y = ROW0
table = []
t = table.append
t(f'<circle class="dot c-conv" cx="506.0" cy="{y-4:.1f}" r="5"/><text class="labb" x="518" y="{y}">Converter</text>')
t(f'<text class="lab" x="700" y="{y}" text-anchor="end">—</text><text class="lab" x="745" y="{y}" text-anchor="end">—</text><text class="lab" x="800" y="{y}" text-anchor="end">free</text>')
y += STEP
for p in POINTS:
    S, R, c, tok, mn = p['plain']
    t(marker(p['shape'], 506.0, y - 4, p['fam'], False) + f'<text class="labb" x="518" y="{y}">{p["name"]}<tspan class="lab" font-weight="400">{p["sfx"]}</tspan></text>')
    t(f'<text class="lab" x="700" y="{y}" text-anchor="end">{tok}</text><text class="lab" x="745" y="{y}" text-anchor="end">{mn}</text><text class="lab" x="800" y="{y}" text-anchor="end">${c:.2f}</text>')
    y += STEP
    if 'note' in p:
        t(f'<text class="{"badn" if p.get("bad") else "t2"}" x="518" y="{y-4}">{p["note"]}</text>'); y += 16
    if 'rules' in p:
        S, R, c, tok, mn = p['rules']
        t(marker('circle', 506.0, y - 4, p['fam'], False, ring=True) + f'<text class="lab" x="518" y="{y}">+ rules</text>')
        t(f'<text class="lab" x="700" y="{y}" text-anchor="end">{tok}</text><text class="lab" x="745" y="{y}" text-anchor="end">{mn}</text><text class="lab" x="800" y="{y}" text-anchor="end">${c:.2f}</text>')
        y += STEP
foot = max(416, y + 24)
H = foot + 30

a(f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 840 {H}" width="840" height="{H}" role="img" aria-label="Quality vs Cost: plain request and rules prompt">')
a('<title>Quality vs Cost: plain request and rules prompt</title>')
a('''<style>
  svg { --surface: #fcfcfb; --ink: #0b0b0b; --ink2: #52514e; --muted: #898781; --grid: #e1e0d9; --axis: #c3c2b7; --conv: #0b0b0b; --opus: #2a78d6; --sonnet: #eb6834; --haiku: #1baf7a; --bad: #c9302c; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif; }
  @media (prefers-color-scheme: dark) { svg { --surface: #1a1a19; --ink: #ffffff; --ink2: #c3c2b7; --grid: #2c2c2a; --axis: #383835; --conv: #ffffff; --opus: #3987e5; --sonnet: #d95926; --haiku: #199e70; --bad: #ff6b66; } }
  .bg { fill: var(--surface); }
  .t1 { fill: var(--ink); font-size: 16px; font-weight: 600; }
  .t2, .tick { fill: var(--muted); font-size: 11px; }
  .sub { fill: var(--ink2); font-size: 12px; }
  .lab { fill: var(--ink2); font-size: 12px; } .labb { fill: var(--ink); font-size: 12px; font-weight: 600; }
  .grid { stroke: var(--grid); stroke-width: 1; } .axis { stroke: var(--axis); stroke-width: 1; }
  .bad { fill: var(--bad); font-size: 12px; } .badn { fill: var(--bad); font-size: 11px; }
  .ref { stroke: var(--conv); stroke-width: 1; stroke-dasharray: 4 4; }
  .dot { stroke: var(--surface); stroke-width: 2; } .ring { fill: var(--surface); stroke-width: 2.5; }
  .join { fill: none; stroke-width: 1.5; stroke-dasharray: 3 3; }
  .c-conv { fill: var(--conv); } .c-opus { fill: var(--opus); } .c-sonnet { fill: var(--sonnet); } .c-haiku { fill: var(--haiku); }
  .l-opus { stroke: var(--opus); } .l-sonnet { stroke: var(--sonnet); } .l-haiku { stroke: var(--haiku); }
</style>''')
a(f'<rect class="bg" width="840" height="{H}" rx="8"/>')
a('<text class="t1" x="70" y="28">Quality vs Cost: plain request and with rules</text>')
a('<text class="sub" x="70" y="48">S against cost per run. Filled dot: plain request. Ring: the same model with the rules prompt (dashed line joins them).</text>')
for s in range(0, 101, 20):
    a(f'<line class="grid" x1="70" x2="470" y1="{py(s):.1f}" y2="{py(s):.1f}"/><text class="tick" x="62" y="{py(s)+4:.1f}" text-anchor="end">{s}</text>')
for c in [0, .5, 1, 1.5, 2, 2.5, 3]:
    lab = 'free' if c == 0 else f'${c:g}'
    a(f'<text class="tick" x="{px(c):.1f}" y="362" text-anchor="middle">{lab}</text>')
a(f'<line class="axis" x1="70" x2="470" y1="344" y2="344"/><line class="axis" x1="70" x2="70" y1="70" y2="344"/>')
a('<text class="t2" x="270" y="384" text-anchor="middle">Cost per run, 678 locators (up is better, left is cheaper)</text>')
a('<text class="t2" transform="translate(16 207) rotate(-90)" text-anchor="middle">S, edge cases</text>')
a(f'<text class="t2" x="700" y="104" text-anchor="end">output tokens</text><text class="t2" x="700" y="116" text-anchor="end">(thinking)</text><text class="t2" x="745" y="116" text-anchor="end">min</text><text class="t2" x="800" y="116" text-anchor="end">cost</text>')
a(f'<line class="ref" x1="70" x2="470" y1="{py(CONV["S"]):.1f}" y2="{py(CONV["S"]):.1f}"/><text class="labb" x="78" y="{py(CONV["S"])-8:.1f}">Converter <tspan class="lab" font-weight="400">S {CONV["S"]} · R {CONV["R"]} · free</tspan></text>')
for p in POINTS:
    S, R, c = p['plain'][:3]; cx, cy = px(c), py(S)
    if 'rules' in p:
        rs, rr, rc = p['rules'][:3]
        a(f'<line class="join l-{p["fam"]}" x1="{cx:.1f}" y1="{cy:.1f}" x2="{px(rc):.1f}" y2="{py(rs):.1f}"/>')
for p in POINTS:
    S, R, c = p['plain'][:3]; cx, cy = px(c), py(S)
    a(marker(p['shape'], cx, cy, p['fam'], True))
    an, dx, dy = p['lab']
    a(f'<text class="labb" x="{cx+dx:.1f}" y="{cy+dy:.1f}" text-anchor="{an}">{p["name"]}</text><text class="lab" x="{cx+dx:.1f}" y="{cy+dy+14:.1f}" text-anchor="{an}">S {S} · R {R}</text>')
    if 'rules' in p:
        rs, rr, rc = p['rules'][:3]; rx, ry = px(rc), py(rs)
        a(marker('circle', rx, ry, p['fam'], True, ring=True))
        an, dx, dy = p['rlab']
        a(f'<text class="lab" x="{rx+dx:.1f}" y="{ry+dy:.1f}" text-anchor="{an}">Ruled (S {rs} · R {rr})</text>')
out.extend(table)
a(f'<text class="t2" x="70" y="{foot}"><tspan font-weight="600">S</tspan> = score on edge cases, <tspan font-weight="600">R</tspan> = score on real-world locators that have a chain (0–100 each).</text>')
a('</svg>')
open(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'llm-chart-plain.svg'), 'w').write('\n'.join(out))
