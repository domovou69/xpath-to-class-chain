#!/usr/bin/env python3
"""Draws ../llm-chart-plain.svg: S against cost per run, plain request and the same model with the rules prompt.
Usage: python3 chart-plain.py   (numbers are in POINTS; label positions are set by hand per point)"""
import os

X0, X1, Y0, Y1 = 70, 470, 440, 70          # plot box: S 20..100 down to up, cost $0.2..$8 log left to right
import math
CMIN, CMAX = 0.2, 8   # log scale
def px(cost): return X0 + (math.log(cost) - math.log(CMIN)) * (X1 - X0) / (math.log(CMAX) - math.log(CMIN))
SMIN = 20   # the axis starts here; a lower S is drawn on the axis line and keeps its true value in the label
def py(s): return Y0 - (max(s, SMIN) - SMIN) * (Y0 - Y1) / (100 - SMIN)

# name, version-suffix, family, shape, plain, rules, note
# values: (S, R, cost, tokens, thinking, minutes); label = (anchor, dx, dy) relative to the point for the two lines
POINTS = [
    dict(name='Opus 5.5', sfx=' low', fam='opus', shape='circle',
         plain=(81.9, 95.1, 2.04, '57k (14k)', 7.1), rules=(86.9, 95.0, 1.72, '45k (4k)', 5.1),
         lab=('start', 12, 12), rlab=('start', 12, -4)),
    dict(name='Sonnet 5.5', sfx=' low', fam='sonnet', shape='circle',
         plain=(68.5, 94.8, 1.03, '58k (15k)', 5.2), rules=(84.7, 95.0, 1.58, '93k (32k)', 8.9),
         lab=('start', 12, -2), rlab=('end', -11, -8)),
    dict(name='Haiku 5.5', sfx=' medium', fam='haiku', shape='circle',
         plain=(63.6, 94.1, 0.28, '99k (45k)', 6.0), rules=(72.0, 94.8, 0.27, '102k (45k)', 5.7),
         lab=('start', 12, -2), rlab=('start', -24, -16)),
    dict(name='Opus 5', sfx=' low', fam='opus', shape='square',
         plain=(62.5, 94.5, 3.11, '70k (24k)', 11.6), lab=('start', 12, -2)),
    dict(name='Sonnet 5', sfx=' low', fam='sonnet', shape='square',
         plain=(56.5, 95.2, 2.27, '140k (81k)', 21.8), lab=('start', 12, -2)),
    dict(name='Opus 4.6', sfx=' low', fam='opus', shape='diamond',
         plain=(51.5, 93.9, 5.75, '166k (120k)', 47.1), lab=('middle', 0, 26)),
    dict(name='Sonnet 4.6', sfx=' low', fam='sonnet', shape='diamond',
         plain=(48.9, 89.1, 2.58, '100k (51k)', 23.1), lab=('middle', 0, 26), note='run in chunks'),
    dict(name='Haiku 4.5', sfx=' medium', fam='haiku', shape='diamond',
         plain=(18.1, 59.6, 0.61, '44k (3k)', 6.0), lab=('start', 12, -20), note='wrote scripts, 1 of 3 runs returned answers', bad=True),
]
CONV = dict(S=93.6, R=96.0)

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
ROW0, STEP, GAP = 116, 20, 24   # GAP: space between the soft bands
GROUPS = {'Opus 5.5': 'FRONTIER · 5.5', 'Opus 5': 'GENERATION · 5', 'Opus 4.6': 'OLDER MODELS · 4.x'}
y = ROW0
table, bands = [], []
t = table.append
def cols(y, S, R, tok, mn, c):
    return (f'<text class="lab" x="672" y="{y}" text-anchor="end">{S}</text><text class="lab" x="722" y="{y}" text-anchor="end">{R}</text>'
            f'<text class="lab" x="822" y="{y}" text-anchor="end">{tok}</text><text class="lab" x="868" y="{y}" text-anchor="end">{mn}</text><text class="lab" x="924" y="{y}" text-anchor="end">${c:.2f}</text>')
def band(y0, y1, k): bands.append(f'<rect class="band b{k}" x="490" y="{y0:.1f}" width="440" height="{y1-y0:.1f}" rx="8"/>')
gstart, gk = None, 0
def close(yend):
    if gstart is not None: band(gstart, yend, gk)
for p in POINTS:
    if p['name'] in GROUPS:
        close(y - 8 if gstart is not None else y)
        if gstart is not None: y += GAP - 8
        gk += 1; gstart = y - STEP + 4
        t(f'<text class="cap" x="506" y="{y-3:.1f}">{GROUPS[p["name"]]}</text>'); y += 18
    S, R, c, tok, mn = p['plain']
    t(marker(p['shape'], 516.0, y - 4, p['fam'], False) + f'<text class="labb" x="528" y="{y}">{p["name"]}<tspan class="lab" font-weight="400">{p["sfx"]}</tspan></text>')
    t(cols(y, S, R, tok, mn, c))
    y += STEP
    if 'note' in p:
        t(f'<text class="{"badn" if p.get("bad") else "t2"}" x="528" y="{y-4}">{p["note"]}</text>'); y += 16
    if 'rules' in p:
        S, R, c, tok, mn = p['rules']
        t(marker('circle', 516.0, y - 4, p['fam'], False, ring=True) + f'<text class="lab" x="528" y="{y}">+ rules</text>')
        t(cols(y, S, R, tok, mn, c))
        y += STEP
close(y - 8)
table = bands + table
y += 0
foot = max(Y0 + 70, y + 24)
H = foot + 62

a(f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 940 {H}" width="940" height="{H}" role="img" aria-label="Edge-case score vs cost: plain request and rules prompt">')
a('<title>Edge-case score vs cost</title>')
a('''<style>
  :root { --surface: #fcfcfb; --ink: #0b0b0b; --ink2: #52514e; --muted: #7a7872; --grid: #ebeae4; --axis: #c3c2b7; --conv: #0b0b0b; --opus: #2a78d6; --sonnet: #eb6834; --haiku: #1baf7a; --bad: #c9302c; --band1: #e8f0f9; --zone1: #dbe8f7; --zone2: #e9e5d8; --zone3: #f0eee8; --band2: #f0efe9; --band3: #f6f5f1; }
  @media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) { --surface: #1a1a19; --ink: #ffffff; --ink2: #c3c2b7; --muted: #9b9a94; --grid: #262624; --axis: #3d3d3a; --conv: #ffffff; --opus: #3987e5; --sonnet: #d95926; --haiku: #199e70; --bad: #ff6b66; --band1: #212c38; --zone1: #2b3c4f; --zone2: #3a3931; --zone3: #2d2d2a; --band2: #242422; --band3: #1f1f1e; } }
  :root[data-theme="dark"] { --surface: #1a1a19; --ink: #ffffff; --ink2: #c3c2b7; --muted: #9b9a94; --grid: #262624; --axis: #3d3d3a; --conv: #ffffff; --opus: #3987e5; --sonnet: #d95926; --haiku: #199e70; --bad: #ff6b66; --band1: #212c38; --zone1: #2b3c4f; --zone2: #3a3931; --zone3: #2d2d2a; --band2: #242422; --band3: #1f1f1e; }
  text { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif; }
  .zone { stroke-width: 26; stroke-linejoin: round; } .z1 { fill: var(--zone1); stroke: var(--zone1); } .z2 { fill: var(--zone2); stroke: var(--zone2); } .z3 { fill: var(--zone3); stroke: var(--zone3); stroke-width: 26; }
  .tick { stroke: var(--surface); stroke-width: 4; paint-order: stroke; stroke-linejoin: round; }
  .bg { fill: var(--surface); } .band { stroke: none; } .b1 { fill: var(--band1); } .b2 { fill: var(--band2); } .b3 { fill: var(--band3); }
  .t1 { fill: var(--ink); font-size: 20px; font-weight: 600; }
  .hd { fill: var(--ink2); font-size: 11px; font-weight: 600; }
  .axt { fill: var(--ink2); font-size: 13px; font-weight: 600; }
  .t2, .tick { fill: var(--muted); font-size: 11px; }
  .sub { fill: var(--ink2); font-size: 12px; }
  .lab { fill: var(--ink2); font-size: 12px; } .labb { fill: var(--ink); font-size: 12px; font-weight: 600; }
  .hair { stroke: var(--axis); stroke-width: 1; } .cap { fill: var(--muted); font-size: 10px; letter-spacing: 0.08em; }
  text { font-variant-numeric: tabular-nums; }
  .grid { stroke: var(--grid); stroke-width: 1; } .axis { stroke: var(--axis); stroke-width: 1; }
  .bad { fill: var(--bad); font-size: 12px; } .badn { fill: var(--bad); font-size: 11px; }
  .ref { stroke: var(--conv); stroke-width: 1; stroke-dasharray: 4 4; }
  .dot { stroke: var(--surface); stroke-width: 2; } .ring { fill: var(--surface); stroke-width: 2.5; }
  .join { fill: none; stroke-width: 1.5; stroke-dasharray: 3 3; }
  .c-conv { fill: var(--conv); } .c-opus { fill: var(--opus); } .c-sonnet { fill: var(--sonnet); } .c-haiku { fill: var(--haiku); }
  .l-opus { stroke: var(--opus); } .l-sonnet { stroke: var(--sonnet); } .l-haiku { stroke: var(--haiku); }
</style>''')
a(f'<rect class="bg" width="940" height="{H}" rx="8"/>')
a('<text class="t1" x="70" y="42">Edge-case score vs cost: plain request and with rules</text>')
for s in range(SMIN, 101, 20):
    a(f'<line class="grid" x1="70" x2="470" y1="{py(s):.1f}" y2="{py(s):.1f}"/><text class="tick" x="62" y="{py(s)+4:.1f}" text-anchor="end">{s}</text>')
for c in [.2, .5, 1, 2, 5, 8]:
    lab = f'${c:g}'
    a(f'<text class="tick" x="{px(c):.1f}" y="{Y0+18}" text-anchor="middle">{lab}</text>')
a(f'<line class="axis" x1="70" x2="470" y1="{Y0}" y2="{Y0}"/><line class="axis" x1="70" x2="70" y1="70" y2="{Y0}"/>')
a(f'<text class="axt" x="270" y="{Y0+42}" text-anchor="middle">Cost per run, log scale (up is better, left is cheaper)</text>')
a(f'<text class="axt" transform="translate(30 {(Y0+Y1)//2}) rotate(-90)" text-anchor="middle">S, edge cases</text>')
a('<text class="hd" x="672" y="90" text-anchor="end">S</text><text class="hd" x="722" y="90" text-anchor="end">R</text><text class="hd" x="822" y="78" text-anchor="end">output tokens</text><text class="hd" x="822" y="90" text-anchor="end">(thinking)</text><text class="hd" x="868" y="90" text-anchor="end">min</text><text class="hd" x="924" y="90" text-anchor="end">cost</text>')
a(f'<line class="ref" x1="70" x2="470" y1="{py(CONV["S"]):.1f}" y2="{py(CONV["S"]):.1f}"/><text class="labb" x="78" y="{py(CONV["S"])-8:.1f}">Converter <tspan class="lab" font-weight="400">S {CONV["S"]} · R {CONV["R"]} · maximum · free</tspan></text>')
# one soft shape around all frontier (5.5) points: convex hull, drawn with a thick round-joined outline
def hull(pts):
    pts = sorted(set(pts))
    def cross(o, p, q): return (p[0]-o[0])*(q[1]-o[1]) - (p[1]-o[1])*(q[0]-o[0])
    lo, up = [], []
    for p in pts:
        while len(lo) >= 2 and cross(lo[-2], lo[-1], p) <= 0: lo.pop()
        lo.append(p)
    for p in reversed(pts):
        while len(up) >= 2 and cross(up[-2], up[-1], p) <= 0: up.pop()
        up.append(p)
    return lo[:-1] + up[:-1]
def zone(pts, k):
    pts = [(px(c), py(S)) for S, R, c in pts]
    if len(pts) == 1: return
    a(f'<polygon class="zone z{k}" points="{" ".join(f"{x:.1f},{y:.1f}" for x, y in hull(pts))}"/>')
def pp(ps): return [q for p in ps for q in ([p['plain'][:3]] + ([p['rules'][:3]] if 'rules' in p else []))]
a(f'<defs><clipPath id="plot"><rect x="{X0}" y="{Y1}" width="{X1-X0}" height="{Y0-Y1}"/></clipPath></defs><g clip-path="url(#plot)">')
zone(pp(POINTS[5:]), 3)   # older: 4.x
zone(pp(POINTS[3:5]), 2)  # previous: 5
zone(pp(POINTS[:3]), 1)   # frontier: 5.5
a('</g>')
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
        a(f'<text class="lab" x="{rx+dx:.1f}" y="{ry+dy:.1f}" text-anchor="{an}">+ rules (S {rs})</text>')
out.extend(table)
a(f'<text class="t2" x="70" y="{foot}"><tspan font-weight="600">S</tspan> = score on 84 of 115 spec locators, weighted by category (0–100).</text>')
a(f'<text class="t2" x="70" y="{foot+16}"><tspan font-weight="600">R</tspan> = score on 490 of 563 real-world locators that a class chain can express (0–100).</text>')
a(f'<text class="t2" x="70" y="{foot+32}">Each model got all 678 locators in one file.</text>')
a('</svg>')
open(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'llm-chart-plain.svg'), 'w').write('\n'.join(out))
