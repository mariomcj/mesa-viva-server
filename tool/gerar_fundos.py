#!/usr/bin/env python3
"""Gera os 9 fundos de cena provisórios do Mesa Viva (public/fundos/*.png).

Arte 100% gerada por código, original, no estilo definido em design/DIRECAO-DE-ARTE.md:
"guache à luz de velas" — silhuetas em camadas, névoa, fontes de luz quentes
(velas, tochas, janelas) contra sombras frias.

Requisitos: Python 3.9+ e Pillow (nada é baixado da internet).
Uso:  python tool/gerar_fundos.py [pasta_saida]   (padrão: public/fundos)

É determinístico: a mesma semente gera sempre as mesmas imagens.
O app escurece o fundo com um gradiente preto (55 a 85%), por isso as cenas
têm contraste alto e o meio da tela mais calmo, onde fica o texto.
"""
import math
import os
import random
import sys

from PIL import Image, ImageChops, ImageDraw, ImageFilter, ImageOps

OUT_W, OUT_H = 540, 960      # retrato 9:16
S = 2                        # supersampling (desenha em 2x e reduz: bordas suaves)
W, H = OUT_W * S, OUT_H * S
LIMITE_BYTES = 400_000


# ----------------------------------------------------------------- utilidades
def rgb(c):
    if isinstance(c, tuple):
        return c
    c = c.lstrip('#')
    return tuple(int(c[i:i + 2], 16) for i in (0, 2, 4))


def mix(a, b, t):
    a, b = rgb(a), rgb(b)
    return tuple(int(round(a[i] + (b[i] - a[i]) * t)) for i in range(3))


def suave(t):
    t = max(0.0, min(1.0, t))
    return t * t * (3 - 2 * t)


def X(v):
    return v * W


def Y(v):
    return v * H


def gradiente(paradas):
    """Gradiente vertical. paradas = [(posição 0..1, cor)]."""
    col = Image.new('RGB', (1, 512))
    px = col.load()
    paradas = [(p, rgb(c)) for p, c in paradas]
    for y in range(512):
        t = y / 511
        if t <= paradas[0][0]:
            px[0, y] = paradas[0][1]
            continue
        if t >= paradas[-1][0]:
            px[0, y] = paradas[-1][1]
            continue
        for (p0, c0), (p1, c1) in zip(paradas, paradas[1:]):
            if p0 <= t <= p1:
                px[0, y] = mix(c0, c1, suave((t - p0) / max(1e-6, p1 - p0)))
                break
    return col.resize((W, H), Image.BICUBIC)


_QUEDA = None


def queda():
    """Disco com queda suave (para brilhos)."""
    global _QUEDA
    if _QUEDA is None:
        n = 256
        im = Image.new('L', (n, n))
        px = im.load()
        for y in range(n):
            for x in range(n):
                d = math.hypot(x - n / 2 + .5, y - n / 2 + .5) / (n / 2)
                v = max(0.0, 1 - d)
                px[x, y] = int(255 * (v ** 2.4))
        _QUEDA = im
    return _QUEDA


def brilho(base, x, y, r, cor, forca=1.0, ry=None):
    """Luz aditiva (modo 'screen') com queda suave, só na região afetada."""
    ry = ry or r
    x0, y0, x1, y1 = int(x - r), int(y - ry), int(x + r), int(y + ry)
    cx0, cy0, cx1, cy1 = max(0, x0), max(0, y0), min(W, x1), min(H, y1)
    if cx1 <= cx0 or cy1 <= cy0:
        return base
    f = queda().resize((max(1, x1 - x0), max(1, y1 - y0)), Image.BILINEAR)
    if forca != 1:
        f = f.point(lambda v: min(255, int(v * forca)))
    f = f.crop((cx0 - x0, cy0 - y0, cx0 - x0 + (cx1 - cx0), cy0 - y0 + (cy1 - cy0)))
    reg = base.crop((cx0, cy0, cx1, cy1))
    luz = ImageChops.multiply(Image.new('RGB', reg.size, rgb(cor)), f.convert('RGB'))
    base.paste(ImageChops.screen(reg, luz), (cx0, cy0))
    return base


def mascara(desenhar, blur=0, alpha=255):
    m = Image.new('L', (W, H), 0)
    desenhar(ImageDraw.Draw(m))
    if blur:
        m = m.filter(ImageFilter.GaussianBlur(blur))
    if alpha != 255:
        m = m.point(lambda v: v * alpha // 255)
    return m


def pintar(base, m, preench):
    fonte = preench if isinstance(preench, Image.Image) else Image.new('RGB', (W, H), rgb(preench))
    base.paste(fonte, (0, 0), m)
    return base


def forma(base, desenhar, preench, blur=0, alpha=255):
    return pintar(base, mascara(desenhar, blur, alpha), preench)


def luz_aditiva(base, desenhar, cor, blur, alpha=255):
    m = mascara(desenhar, blur, alpha)
    luz = ImageChops.multiply(Image.new('RGB', (W, H), rgb(cor)), m.convert('RGB'))
    return ImageChops.screen(base, luz)


def ruido(rng, escala, oitavas=3):
    """Ruído de valor (fBm) em tons de cinza, normalizado."""
    acc = None
    for o in range(oitavas):
        s = max(2, int(escala * 2.2 / (2 ** o)))
        w, h = max(2, W // s), max(2, H // s)
        im = Image.frombytes('L', (w, h), rng.randbytes(w * h)).resize((W, H), Image.BICUBIC)
        acc = im if acc is None else Image.blend(acc, im, 0.38)
    return ImageOps.autocontrast(acc, cutoff=1)


def textura(cor, n, contraste=.3):
    c = rgb(cor)
    contraste *= .7
    canais = []
    for i in range(3):
        lut = [max(0, min(255, int(c[i] * (1 + (v - 128) / 128 * contraste)))) for v in range(256)]
        canais.append(n.point(lut))
    return Image.merge('RGB', canais)


def nevoa(base, y0, y1, cor, alpha, n=None):
    m = mascara(lambda d: d.rectangle([0, y0, W, y1], fill=255), blur=max(4, (y1 - y0) / 3))
    if n is not None:
        m = ImageChops.multiply(m, n)
        alpha = min(255, alpha * 2)
    m = m.point(lambda v: v * alpha // 255)
    return pintar(base, m, cor)


def vinheta(base, forca=.55):
    m = queda().resize((int(W * 1.5), int(H * 1.25)), Image.BILINEAR)
    m = m.point(lambda v: int(255 * (1 - forca) + v * forca))
    m = m.crop(((m.width - W) // 2, (m.height - H) // 2, (m.width - W) // 2 + W, (m.height - H) // 2 + H))
    return ImageChops.multiply(base, m.convert('RGB'))


def crista(rng, x0, x1, ybase, amp, passos, rug=.5):
    """Linha irregular (montanhas, rochas) da esquerda para a direita."""
    pts = []
    for i in range(passos + 1):
        t = i / passos
        x = x0 + (x1 - x0) * t
        y = ybase - amp * (0.5 + 0.5 * math.sin(t * math.pi * rng.uniform(1.2, 2.2) + rng.uniform(0, 6))) * rng.uniform(1 - rug, 1)
        pts.append((x, y))
    return pts


def chama(base, x, y, tam, rng=None, cor_ext='#e2742a', cor_int='#ffe2a0', halo='#ff9a3c', forca_halo=1.0):
    """Chama de vela/tocha em forma de gota, com halo."""
    base = brilho(base, x, y - tam * .6, tam * 9, halo, .55 * forca_halo)
    base = brilho(base, x, y - tam * .6, tam * 3.2, '#ffcf7a', .6 * forca_halo)
    inc = rng.uniform(-.25, .25) if rng else 0

    def gota(d, k, cor):
        w, h = tam * .55 * k, tam * 1.6 * k
        pts = [(x - w, y), (x + inc * w - w * .2, y - h * .55), (x + inc * w * 2, y - h), (x + inc * w + w * .25, y - h * .55), (x + w, y)]
        d.polygon(pts, fill=cor)
        d.ellipse([x - w, y - w, x + w, y + w], fill=cor)
    forma(base, lambda d: gota(d, 1, 255), cor_ext, blur=tam * .12)
    forma(base, lambda d: gota(d, .55, 255), cor_int, blur=tam * .08)
    return base


def particulas(base, rng, n, area, cor, r=(1, 3), forca=1.0, brilho_r=0):
    x0, y0, x1, y1 = area
    camada = Image.new('L', (W, H), 0)
    d = ImageDraw.Draw(camada)
    pts = []
    for _ in range(n):
        x, y = rng.uniform(x0, x1), rng.uniform(y0, y1)
        rr = rng.uniform(*r) * S
        a = int(255 * rng.uniform(.35, 1) * forca)
        d.ellipse([x - rr, y - rr, x + rr, y + rr], fill=a)
        pts.append((x, y))
    camada = camada.filter(ImageFilter.GaussianBlur(S * .8))
    base = ImageChops.screen(base, ImageChops.multiply(Image.new('RGB', (W, H), rgb(cor)), camada.convert('RGB')))
    if brilho_r:
        for x, y in pts[: n // 3]:
            base = brilho(base, x, y, brilho_r * S, cor, .35)
    return base


def arco(cx, base_y, topo_y, meia_l, ogival=False, passos=24):
    """Contorno de arco (redondo ou gótico), fechado na base."""
    pts = [(cx - meia_l, base_y)]
    if ogival:
        # dois arcos de círculo que se encontram em ponta
        alt = base_y - topo_y
        for i in range(passos + 1):
            t = i / passos
            pts.append((cx - meia_l + meia_l * math.sin(t * math.pi / 2) ** .8, base_y - alt * .45 - alt * .55 * math.sin(t * math.pi / 2)))
        for i in range(passos, -1, -1):
            t = i / passos
            pts.append((cx + meia_l - meia_l * math.sin(t * math.pi / 2) ** .8, base_y - alt * .45 - alt * .55 * math.sin(t * math.pi / 2)))
    else:
        alt_reta = (base_y - topo_y) - meia_l
        for i in range(passos + 1):
            a = math.pi - math.pi * i / passos
            pts.append((cx + meia_l * math.cos(a), base_y - alt_reta - meia_l * math.sin(a)))
    pts.append((cx + meia_l, base_y))
    return pts


def d20(d, cx, cy, r, cor_linha, cor_fill, larg):
    """Dado de 20 faces visto de frente (a marca da mesa)."""
    hexa = [(cx + r * math.cos(math.radians(90 + 60 * i)), cy - r * math.sin(math.radians(90 + 60 * i))) for i in range(6)]
    d.polygon(hexa, fill=cor_fill)
    tri = [(cx, cy - r * .55), (cx - r * .5, cy + r * .32), (cx + r * .5, cy + r * .32)]
    d.line(hexa + [hexa[0]], fill=cor_linha, width=larg)
    d.line(tri + [tri[0]], fill=cor_linha, width=larg)
    for i, p in enumerate(hexa):
        alvo = tri[[0, 1, 1, 2, 2, 0][i]]
        d.line([p, alvo], fill=cor_linha, width=larg)


# ----------------------------------------------------------------- cenas
def taverna(rng):
    b = gradiente([(0, '#140c08'), (.35, '#2e1c10'), (.7, '#3a2312'), (1, '#1a0f08')])
    n = ruido(rng, 60)
    # parede de tábuas
    tabuas = textura('#4a2e18', n, .35)
    b = forma(b, lambda d: d.rectangle([0, Y(.1), W, Y(.78)], fill=255), tabuas)
    linhas = Image.new('L', (W, H), 0)
    dl = ImageDraw.Draw(linhas)
    x = 0
    while x < W:
        dl.line([(x, Y(.1)), (x + rng.uniform(-4, 4), Y(.78))], fill=200, width=3 * S)
        x += rng.uniform(.09, .13) * W
    b = pintar(b, linhas.filter(ImageFilter.GaussianBlur(S)), '#1c1008')
    # vigas do teto
    viga = textura('#24150b', n, .4)
    b = forma(b, lambda d: d.rectangle([0, 0, W, Y(.1)], fill=255), '#120a06')
    b = forma(b, lambda d: d.rectangle([0, Y(.085), W, Y(.135)], fill=255), viga)
    for xx in (.12, .88):
        b = forma(b, lambda d, xx=xx: d.rectangle([X(xx) - X(.035), Y(.1), X(xx) + X(.035), Y(.8)], fill=255), viga)
    # lareira de pedra
    cx, topo, base_y, meia = X(.5), Y(.40), Y(.78), X(.24)
    pedras = textura('#5a4a3e', ruido(rng, 30), .45)
    b = forma(b, lambda d: d.rectangle([cx - meia, topo, cx + meia, base_y], fill=255), pedras)
    juntas = Image.new('L', (W, H), 0)
    dj = ImageDraw.Draw(juntas)
    yy, linha = topo, 0
    while yy < base_y:
        h = rng.uniform(.028, .04) * H
        dj.line([(cx - meia, yy), (cx + meia, yy)], fill=230, width=2 * S)
        xx = cx - meia + (linha % 2) * X(.03)
        while xx < cx + meia:
            dj.line([(xx, yy), (xx, yy + h)], fill=230, width=2 * S)
            xx += rng.uniform(.05, .08) * W
        yy += h
        linha += 1
    b = pintar(b, juntas, '#2a1f18')
    b = forma(b, lambda d: d.rectangle([cx - meia - X(.03), topo - Y(.025), cx + meia + X(.03), topo + Y(.005)], fill=255), viga)
    boca = arco(cx, base_y, Y(.53), X(.15))
    b = forma(b, lambda d: d.polygon(boca, fill=255), '#0d0705')
    # fogo
    b = brilho(b, cx, Y(.74), X(.55), '#ff7a2a', .75)
    b = brilho(b, cx, Y(.74), X(.22), '#ffb04a', .9)
    for i in range(7):
        chama(b, cx + X(rng.uniform(-.1, .1)), Y(.775), X(rng.uniform(.018, .034)), rng, forca_halo=.25)
    b = forma(b, lambda d: d.rectangle([cx - X(.13), Y(.765), cx + X(.13), Y(.78)], fill=255), '#2a1408')
    # prateleira com garrafas e barris (esquerda)
    b = forma(b, lambda d: d.rectangle([0, Y(.36), X(.22), Y(.375)], fill=255), viga)
    for i in range(4):
        gx = X(.02 + i * .05)
        gh = Y(rng.uniform(.04, .06))
        b = forma(b, lambda d, gx=gx, gh=gh: (d.rectangle([gx, Y(.36) - gh, gx + X(.03), Y(.36)], fill=255),
                                             d.rectangle([gx + X(.01), Y(.36) - gh - Y(.018), gx + X(.02), Y(.36) - gh], fill=255)), '#160c06')
    for bx in (.06, .2):
        b = forma(b, lambda d, bx=bx: d.ellipse([X(bx - .09), Y(.62), X(bx + .09), Y(.8)], fill=255), textura('#3a2210', n, .3))
        for k in (.66, .76):
            b = forma(b, lambda d, bx=bx, k=k: d.line([(X(bx - .085), Y(k)), (X(bx + .085), Y(k))], fill=255, width=4 * S), '#1a0f07')
    # lanternas penduradas
    for lx, ly in ((.26, .22), (.78, .27)):
        b = forma(b, lambda d, lx=lx, ly=ly: d.line([(X(lx), Y(.135)), (X(lx), Y(ly - .03))], fill=255, width=2 * S), '#0e0805')
        b = brilho(b, X(lx), Y(ly), X(.45), '#ff9a40', .45)
        b = brilho(b, X(lx), Y(ly), X(.08), '#ffd890', .9)
        b = forma(b, lambda d, lx=lx, ly=ly: d.polygon([(X(lx - .025), Y(ly - .03)), (X(lx + .025), Y(ly - .03)), (X(lx + .02), Y(ly + .03)), (X(lx - .02), Y(ly + .03))], outline=255, width=3 * S), '#1a0e06')
    # mesa em primeiro plano
    mesa = textura('#2a170b', ruido(rng, 40), .35)
    b = forma(b, lambda d: d.polygon([(0, Y(.84)), (W, Y(.82)), (W, H), (0, H)], fill=255), mesa)
    b = forma(b, lambda d: d.line([(0, Y(.84)), (W, Y(.82))], fill=255, width=3 * S), '#6a4022')
    # canecas
    for mx in (.16, .3):
        b = forma(b, lambda d, mx=mx: (d.rectangle([X(mx - .035), Y(.775), X(mx + .035), Y(.84)], fill=255),
                                       d.arc([X(mx + .02), Y(.785), X(mx + .07), Y(.825)], -90, 90, fill=255, width=4 * S)), '#140b05')
    # o dado da mesa
    dd = Image.new('L', (W, H), 0)
    d20(ImageDraw.Draw(dd), X(.72), Y(.875), X(.055), 0, 255, 1)
    b = pintar(b, dd, '#3a2a40')
    b = brilho(b, X(.72), Y(.87), X(.09), '#c08040', .3)
    linhas_dado = Image.new('L', (W, H), 0)
    d20(ImageDraw.Draw(linhas_dado), X(.72), Y(.875), X(.055), 255, 0, 2 * S)
    b = pintar(b, linhas_dado, '#e8b070')
    # vela na mesa
    b = forma(b, lambda d: d.rectangle([X(.52), Y(.79), X(.55), Y(.84)], fill=255), '#d8c8a8')
    chama(b, X(.535), Y(.79), X(.02), rng)
    b = particulas(b, rng, 50, (X(.25), Y(.35), X(.75), Y(.75)), '#ffa040', (0.6, 1.6), .9)
    b = nevoa(b, Y(.25), Y(.6), '#5a3a20', 40, ruido(rng, 250, 2))
    return vinheta(b, .6)


def floresta(rng):
    b = gradiente([(0, '#071214'), (.3, '#10302c'), (.55, '#1d4a40'), (.75, '#0e2420'), (1, '#050c0a')])
    b = brilho(b, X(.72), Y(.1), X(.7), '#9fd6c0', .35)
    b = brilho(b, X(.72), Y(.1), X(.07), '#e8f4e8', 1.0)
    # raios de luar
    for i in range(4):
        dx = X(rng.uniform(-.25, .1))
        b = luz_aditiva(b, lambda d, dx=dx: d.polygon([(X(.7) + dx, Y(.1)), (X(.74) + dx, Y(.1)), (X(.45) + dx * 1.8, Y(.95)), (X(.3) + dx * 1.8, Y(.95))], fill=255), '#5f9a88', 30 * S, 70)
    neb = '#2c5a50'
    camadas = [(.62, .0, 26, .022), (.70, .3, 18, .03), (.80, .6, 11, .045), (.95, .9, 6, .07)]
    for chao, prof, n_arv, larg in camadas:
        cor = mix(neb, '#030807', prof)
        def arvs(d, chao=chao, n_arv=n_arv, larg=larg, prof=prof):
            for _ in range(n_arv):
                x = rng.uniform(-.05, 1.05)
                alt = rng.uniform(.35, .6) + prof * .3
                w = larg * rng.uniform(.7, 1.3)
                d.rectangle([X(x - w * .18), Y(chao - alt * .4), X(x + w * .18), Y(chao + .05)], fill=255)
                for k in range(7):
                    t = k / 7
                    yk = chao - alt * (0.25 + .75 * t)
                    wk = w * (1.6 - t * 1.3)
                    d.polygon([(X(x - wk), Y(yk + .06)), (X(x), Y(yk - .05)), (X(x + wk), Y(yk + .06))], fill=255)
            d.rectangle([0, Y(chao), W, H], fill=255)
        b = forma(b, arvs, cor)
        b = nevoa(b, Y(chao - .12), Y(chao + .02), neb, int(70 * (1 - prof) + 15), ruido(rng, 200, 2))
    # troncos grossos em primeiro plano
    for x, w in ((.04, .07), (.93, .09)):
        b = forma(b, lambda d, x=x, w=w: d.polygon([(X(x - w), H), (X(x - w * .6), 0), (X(x + w * .6), 0), (X(x + w), H)], fill=255), textura('#04090a', ruido(rng, 25), .5))
    # samambaias
    def samambaias(d):
        for _ in range(26):
            x0 = rng.uniform(0, 1)
            for k in range(6):
                ang = math.radians(rng.uniform(25, 155))
                comp = rng.uniform(.05, .11)
                d.line([(X(x0), H), (X(x0) + math.cos(ang) * X(comp), H - math.sin(ang) * Y(comp * .9))], fill=255, width=5 * S)
    b = forma(b, samambaias, '#020605', blur=S)
    b = particulas(b, rng, 40, (0, Y(.45), W, Y(.92)), '#c8e86a', (1, 2.2), 1, 10)
    return vinheta(b, .55)


def caverna(rng):
    b = gradiente([(0, '#06090c'), (.45, '#0f1a20'), (1, '#05080a')])
    # câmara distante iluminada
    b = brilho(b, X(.5), Y(.45), X(.6), '#2f6a74', .6)
    b = brilho(b, X(.5), Y(.45), X(.2), '#7ec0c0', .35)
    rocha_far = textura('#18262c', ruido(rng, 50), .4)
    rocha_mid = textura('#0e171b', ruido(rng, 40), .5)
    rocha_near = textura('#070c0e', ruido(rng, 30), .5)
    # paredes laterais em três profundidades
    for prof, rocha, m in ((0, rocha_far, .28), (1, rocha_mid, .18), (2, rocha_near, .07)):
        esq = [(0, 0)] + [(X(m + rng.uniform(-.04, .08) + .06 * math.sin(i)), Y(i / 12)) for i in range(13)] + [(0, H)]
        dir_ = [(W, 0)] + [(X(1 - m - rng.uniform(-.04, .08) - .06 * math.cos(i)), Y(i / 12)) for i in range(13)] + [(W, H)]
        b = forma(b, lambda d, e=esq, r=dir_: (d.polygon(e, fill=255), d.polygon(r, fill=255)), rocha, blur=S)
        # estalactites e estalagmites
        def pontas(d, prof=prof):
            for _ in range(9 - prof * 2):
                x = rng.uniform(0, 1)
                w, h = rng.uniform(.015, .04) * (1 + prof * .6), rng.uniform(.06, .2) * (1 + prof * .5)
                d.polygon([(X(x - w), Y(prof * .02) - 2), (X(x + w), Y(prof * .02) - 2), (X(x + rng.uniform(-.01, .01)), Y(h))], fill=255)
            for _ in range(6 - prof):
                x = rng.uniform(.1, .9)
                w, h = rng.uniform(.02, .05) * (1 + prof * .5), rng.uniform(.05, .14) * (1 + prof * .4)
                d.polygon([(X(x - w), Y(.86 + prof * .05)), (X(x + w), Y(.86 + prof * .05)), (X(x), Y(.86 + prof * .05 - h))], fill=255)
        b = forma(b, pontas, rocha)
        b = nevoa(b, Y(.5), Y(.9), '#1c3a40', 30, ruido(rng, 180, 2))
    # lago subterrâneo
    b = forma(b, lambda d: d.rectangle([0, Y(.88), W, H], fill=255), '#061014')
    # cristais
    for cx, cy, esc, cor in ((.18, .86, 1.0, '#5fd0d8'), (.84, .82, 1.3, '#9a7ae0'), (.62, .9, .6, '#5fd0d8')):
        b = brilho(b, X(cx), Y(cy - .05), X(.3 * esc), cor, .55)
        def cristal(d, cx=cx, cy=cy, esc=esc):
            for k in range(5):
                ang = math.radians(rng.uniform(-35, 35))
                comp, lw = Y(rng.uniform(.05, .12) * esc), X(rng.uniform(.012, .022) * esc)
                bx = X(cx) + rng.uniform(-1, 1) * X(.03 * esc)
                topo = (bx + math.sin(ang) * comp, Y(cy) - math.cos(ang) * comp)
                d.polygon([(bx - lw, Y(cy)), (bx + lw, Y(cy)), (topo[0] + lw * .5 * math.cos(ang), topo[1] + lw), topo, (topo[0] - lw * .5 * math.cos(ang), topo[1] + lw)], fill=255)
        b = forma(b, cristal, mix(cor, '#ffffff', .25))
        # reflexo no lago
        for k in range(6):
            yy = Y(.9 + k * .016)
            b = luz_aditiva(b, lambda d, yy=yy, cx=cx, k=k: d.line([(X(cx - .06 + k * .005), yy), (X(cx + .06 - k * .005), yy)], fill=255, width=2 * S), cor, S, 120 - k * 16)
    b = particulas(b, rng, 30, (X(.2), Y(.2), X(.8), Y(.8)), '#8fe0e0', (.6, 1.4), .7)
    return vinheta(b, .6)


def corredor(rng, vp, prof_n, cor_parede, cor_neb, desenhar_moldura, chao_cor):
    """Corredor em perspectiva de um ponto, com molduras (arcos ou escoras) que se afastam."""
    vx, vy = vp
    b = gradiente([(0, mix(cor_parede, '#000000', .6)), (.45, cor_neb), (1, mix(cor_parede, '#000000', .7))])
    n = ruido(rng, 35)
    parede = textura(cor_parede, n, .45)
    # paredes e chão convergindo
    b = forma(b, lambda d: d.polygon([(0, 0), (vx - X(.06), vy - Y(.05)), (vx - X(.06), vy + Y(.05)), (0, H)], fill=255), parede)
    b = forma(b, lambda d: d.polygon([(W, 0), (vx + X(.06), vy - Y(.05)), (vx + X(.06), vy + Y(.05)), (W, H)], fill=255), parede)
    b = forma(b, lambda d: d.polygon([(0, H), (vx - X(.06), vy + Y(.05)), (vx + X(.06), vy + Y(.05)), (W, H)], fill=255), textura(chao_cor, ruido(rng, 25), .4))
    b = forma(b, lambda d: d.polygon([(0, 0), (vx - X(.06), vy - Y(.05)), (vx + X(.06), vy - Y(.05)), (W, 0)], fill=255), textura(mix(cor_parede, '#000000', .45), n, .4))
    # fundo do corredor: névoa fria
    b = brilho(b, vx, vy, X(.35), cor_neb, .9)
    b = brilho(b, vx, vy, X(.12), mix(cor_neb, '#ffffff', .3), .5)
    escalas = [1.6 / (1 + k * .9) for k in range(prof_n)]
    for k in range(prof_n - 1, -1, -1):
        e = escalas[k]
        neblina = 1 - min(1, e / 1.4)
        desenhar_moldura(b, vx, vy, e, neblina, k)
    return b


def masmorra(rng):
    vp = (X(.5), Y(.44))
    pedra = '#3a3e48'

    def moldura(b, vx, vy, e, neb, k):
        cor = mix('#2a2d36', '#3c4a62', neb)
        meia, alt = X(.42) * e, Y(.42) * e
        ext = arco(vx, vy + alt * .55, vy - alt, meia * 1.25)
        inn = arco(vx, vy + alt * .55, vy - alt * .8, meia)
        m = mascara(lambda d: d.polygon(ext, fill=255))
        m = ImageChops.subtract(m, mascara(lambda d: d.polygon(inn, fill=255)))
        pintar(b, m, textura(cor, ruido(rng, 20 + k * 5), .5))
        # aduelas do arco
        juntas = Image.new('L', (W, H), 0)
        dj = ImageDraw.Draw(juntas)
        for i in range(1, len(inn) - 1, 3):
            j = min(len(ext) - 1, i)
            dj.line([inn[i], ext[j]], fill=200, width=max(1, int(2 * S * e)))
        pintar(b, ImageChops.multiply(juntas, m), mix(cor, '#000000', .55))
        # tochas nas duas primeiras molduras
        if k in (0, 1):
            for lado in (-1, 1):
                tx, ty = vx + lado * meia * 1.12, vy - alt * .05
                forma(b, lambda d, tx=tx, ty=ty: d.polygon([(tx - X(.01) * e, ty), (tx + X(.01) * e, ty), (tx + X(.006) * e, ty + Y(.05) * e), (tx - X(.006) * e, ty + Y(.05) * e)], fill=255), '#1a120c')
                chama(b, tx, ty, X(.03) * e, rng)
                brilho(b, tx, vy + alt * .55, X(.3) * e, '#c86a2a', .35, ry=Y(.05) * e)
    b = corredor(rng, vp, 5, pedra, '#2a3a58', moldura, '#24262c')
    fiadas = Image.new('L', (W, H), 0)
    df = ImageDraw.Draw(fiadas)
    for k in range(-9, 10):
        ang = math.radians(k * 9)
        for lado in (-1, 1):
            df.line([vp, (vp[0] + lado * W * 1.5, vp[1] + math.tan(ang) * W * 1.5)], fill=150, width=2 * S)
    z = 1.0
    while z < 30:
        xx = W * .5 / z
        df.line([(vp[0] - xx - X(.06), 0), (vp[0] - xx - X(.06), H)], fill=110, width=max(1, int(3 * S / z ** .5)))
        df.line([(vp[0] + xx + X(.06), 0), (vp[0] + xx + X(.06), H)], fill=110, width=max(1, int(3 * S / z ** .5)))
        z *= 1.45
    paredes = mascara(lambda d: (d.polygon([(0, 0), (vp[0] - X(.06), vp[1] - Y(.05)), (vp[0] - X(.06), vp[1] + Y(.05)), (0, H)], fill=255),
                                 d.polygon([(W, 0), (vp[0] + X(.06), vp[1] - Y(.05)), (vp[0] + X(.06), vp[1] + Y(.05)), (W, H)], fill=255)))
    b = pintar(b, ImageChops.multiply(fiadas.filter(ImageFilter.GaussianBlur(S)), paredes), '#101218')
    # correntes
    for cx, comp in ((.14, .28), (.86, .2)):
        def corrente(d, cx=cx, comp=comp):
            y = 0
            i = 0
            while y < Y(comp):
                if i % 2:
                    d.ellipse([X(cx) - S * 3, y, X(cx) + S * 3, y + S * 14], outline=255, width=S * 2)
                else:
                    d.ellipse([X(cx) - S * 5, y, X(cx) + S * 5, y + S * 14], outline=255, width=S * 3)
                y += S * 11
                i += 1
        b = forma(b, corrente, '#0c0d10')
    b = particulas(b, rng, 35, (X(.25), Y(.2), X(.75), Y(.7)), '#9fb4d8', (.5, 1.3), .6)
    return vinheta(b, .62)


def mina(rng):
    vp = (X(.5), Y(.47))
    madeira = '#5a3a1e'

    def moldura(b, vx, vy, e, neb, k):
        cor = mix('#3a2412', '#2c3a3a', neb)
        tex = textura(cor, ruido(rng, 18), .45)
        meia, alt = X(.4) * e, Y(.4) * e
        p = X(.05) * e
        base_y = vy + alt * .6
        forma(b, lambda d: (d.rectangle([vx - meia - p, vy - alt, vx - meia, base_y], fill=255),
                            d.rectangle([vx + meia, vy - alt, vx + meia + p, base_y], fill=255),
                            d.rectangle([vx - meia - p * 1.3, vy - alt - p, vx + meia + p * 1.3, vy - alt + p * .2], fill=255),
                            d.line([(vx - meia, vy - alt + p * 2.2), (vx - meia + p * 2.2, vy - alt)], fill=255, width=int(p * .5)),
                            d.line([(vx + meia, vy - alt + p * 2.2), (vx + meia - p * 2.2, vy - alt)], fill=255, width=int(p * .5))), tex)
        if k in (0, 1, 2):
            lx, ly = vx + (meia * .55 if k % 2 == 0 else -meia * .5), vy - alt + p * 2.4
            forma(b, lambda d: d.line([(lx, vy - alt + p * .2), (lx, ly - p * .4)], fill=255, width=max(1, int(S * 2 * e))), '#0c0806')
            brilho(b, lx, ly, X(.55) * e, '#f09a3a', .5)
            brilho(b, lx, ly, X(.07) * e, '#ffe0a0', .95)
            forma(b, lambda d: d.rectangle([lx - p * .35, ly - p * .4, lx + p * .35, ly + p * .4], outline=255, width=max(1, int(S * 2 * e))), '#1a0e06')
    b = corredor(rng, vp, 6, '#2e2a26', '#3a3a30', moldura, '#1e1a16')
    # veios de minério brilhando
    for _ in range(6):
        lado = rng.choice((-1, 1))
        x0 = X(.5 + lado * rng.uniform(.2, .45))
        y0 = Y(rng.uniform(.2, .8))
        cor = rng.choice(('#e0a040', '#5ad0c0', '#e0a040'))
        pts = [(x0, y0)]
        for _ in range(3):
            pts.append((pts[-1][0] + rng.uniform(-18, 18) * S, pts[-1][1] + rng.uniform(5, 25) * S))
        b = luz_aditiva(b, lambda d, pts=pts: d.line(pts, fill=255, width=3 * S), cor, S * 1.5, 170)
        b = brilho(b, x0, y0, X(.08), cor, .35)
    # trilhos
    vx, vy = vp

    def trilhos(d):
        for lado in (-1, 1):
            d.line([(vx + lado * X(.012), vy + Y(.06)), (X(.5) + lado * X(.3), H)], fill=255, width=4 * S)
        z = 1.0
        while z < 40:
            yy = vy + Y(.06) + (H - vy - Y(.06)) / z
            meia = (X(.3) + X(.06)) / z
            d.line([(vx - meia, yy), (vx + meia, yy)], fill=180, width=max(1, int(6 * S / z ** .5)))
            z *= 1.35
    b = forma(b, trilhos, '#6a5a4a')
    b = particulas(b, rng, 45, (X(.2), Y(.25), X(.8), Y(.75)), '#e0b070', (.5, 1.3), .7)
    return vinheta(b, .6)


def templo(rng):
    b = gradiente([(0, '#0e0c16'), (.5, '#1e1a28'), (1, '#0c0a10')])
    vx, vy = X(.5), Y(.58)
    # piso xadrez em perspectiva
    piso = Image.new('L', (W, H), 0)
    dp = ImageDraw.Draw(piso)
    linhas_y = [vy + (H - vy) * ((i / 10) ** 1.8) for i in range(11)]
    for i in range(10):
        for j in range(-8, 8):
            if (i + j) % 2:
                y0, y1 = linhas_y[i], linhas_y[i + 1]
                f0, f1 = (y0 - vy) / (H - vy), (y1 - vy) / (H - vy)
                dp.polygon([(vx + j * X(.16) * f0, y0), (vx + (j + 1) * X(.16) * f0, y0), (vx + (j + 1) * X(.16) * f1, y1), (vx + j * X(.16) * f1, y1)], fill=255)
    b = forma(b, lambda d: d.rectangle([0, vy, W, H], fill=255), '#1c1a22')
    b = pintar(b, piso.point(lambda v: v * 110 // 255), '#3a3446')
    # vitral gótico
    jan = arco(X(.5), Y(.44), Y(.06), X(.17), ogival=True)
    b = forma(b, lambda d: d.polygon(jan, fill=255), '#0a0810')
    cores = ['#d8a03a', '#a83040', '#2e8a90', '#6a4aa0', '#e0c070']
    vitral = Image.new('RGB', (W, H), (0, 0, 0))
    dv = ImageDraw.Draw(vitral)
    for gy in range(14):
        for gx in range(6):
            x0 = X(.33) + gx * X(.34) / 6
            y0 = Y(.06) + gy * Y(.38) / 14
            dv.rectangle([x0, y0, x0 + X(.34) / 6, y0 + Y(.38) / 14], fill=rgb(rng.choice(cores)))
    dv.ellipse([X(.43), Y(.11), X(.57), Y(.11) + X(.14)], fill=rgb('#f0d890'))
    jm = mascara(lambda d: d.polygon(arco(X(.5), Y(.43), Y(.075), X(.155), ogival=True), fill=255))
    b.paste(Image.blend(vitral, Image.new('RGB', (W, H), (0, 0, 0)), .4), (0, 0), jm)
    chumbo = Image.new('L', (W, H), 0)
    dc = ImageDraw.Draw(chumbo)
    for gx in range(1, 6):
        dc.line([(X(.33) + gx * X(.34) / 6, 0), (X(.33) + gx * X(.34) / 6, H)], fill=255, width=2 * S)
    for gy in range(1, 14):
        dc.line([(0, Y(.06) + gy * Y(.38) / 14), (W, Y(.06) + gy * Y(.38) / 14)], fill=255, width=2 * S)
    dc.ellipse([X(.43), Y(.11), X(.57), Y(.11) + X(.14)], outline=255, width=3 * S)
    for k in range(-10, 10):
        dc.line([(X(.33) + k * X(.06), Y(.06)), (X(.33) + k * X(.06) + Y(.38), Y(.44))], fill=255, width=S)
        dc.line([(X(.67) - k * X(.06), Y(.06)), (X(.67) - k * X(.06) - Y(.38), Y(.44))], fill=255, width=S)
    b = pintar(b, ImageChops.multiply(chumbo, jm), '#08060a')
    b = brilho(b, X(.5), Y(.25), X(.5), '#d8a050', .35)
    # raios de luz
    for i in range(5):
        o = (i - 2) * X(.05)
        b = luz_aditiva(b, lambda d, o=o: d.polygon([(X(.42) + o, Y(.2)), (X(.5) + o, Y(.2)), (X(.68) + o * 2.4, Y(1)), (X(.48) + o * 2.4, Y(1))], fill=255), '#c89a50', 22 * S, 85)
    # colunas
    for k in range(4, -1, -1):
        e = 1 / (1 + k * .55)
        neb = k / 5
        cor_l, cor_e = mix('#4a4252', '#2a2634', neb), mix('#14121a', '#201c28', neb)
        for lado in (-1, 1):
            cx = vx + lado * X(.46) * e
            larg = X(.07) * e
            topo, base_y = vy - Y(.75) * e, vy + Y(.42) * e
            col = gradiente([(0, cor_e), (1, cor_e)])
            luz = cx - larg * .1 * lado
            m = mascara(lambda d: d.rectangle([cx - larg, topo, cx + larg, base_y], fill=255))
            lm = mascara(lambda d: d.rectangle([min(luz, cx - larg * lado), topo, max(luz, cx - larg * lado), base_y], fill=255), blur=larg * .4)
            pintar(b, m, col)
            pintar(b, ImageChops.multiply(m, lm), cor_l)
            forma(b, lambda d: (d.rectangle([cx - larg * 1.35, topo, cx + larg * 1.35, topo + Y(.03) * e], fill=255),
                                d.rectangle([cx - larg * 1.35, base_y - Y(.03) * e, cx + larg * 1.35, base_y], fill=255)), cor_l)
    # altar com velas
    b = forma(b, lambda d: d.rectangle([X(.32), Y(.66), X(.68), Y(.76)], fill=255), textura('#3a3040', ruido(rng, 30), .3))
    b = forma(b, lambda d: d.polygon([(X(.44), Y(.66)), (X(.56), Y(.66)), (X(.55), Y(.76)), (X(.45), Y(.76))], fill=255), '#7a2a30')
    for i in range(7):
        cxv = X(.35 + i * .05)
        hv = Y(rng.uniform(.02, .045))
        b = forma(b, lambda d, cxv=cxv, hv=hv: d.rectangle([cxv - S * 4, Y(.66) - hv, cxv + S * 4, Y(.66)], fill=255), '#e0d4b8')
        chama(b, cxv, Y(.66) - hv, X(.012), rng, forca_halo=.6)
    b = particulas(b, rng, 80, (X(.3), Y(.25), X(.8), Y(.9)), '#f0c878', (.5, 1.3), .7)
    return vinheta(b, .6)


def ceu_noturno(rng, paradas, n_estrelas=220, limite=.6):
    b = gradiente(paradas)
    est = Image.new('L', (W, H), 0)
    de = ImageDraw.Draw(est)
    for _ in range(n_estrelas):
        x, y = rng.uniform(0, W), Y(rng.uniform(0, limite) ** 1.5)
        r = rng.choice((.6, .8, 1, 1, 1.4, 2)) * S
        de.ellipse([x - r, y - r, x + r, y + r], fill=int(255 * rng.uniform(.3, 1)))
    b = ImageChops.screen(b, ImageChops.multiply(Image.new('RGB', (W, H), rgb('#e8ecff')), est.filter(ImageFilter.GaussianBlur(S * .6)).convert('RGB')))
    return b


def torre(rng):
    b = ceu_noturno(rng, [(0, '#05070f'), (.4, '#141a36'), (.7, '#262848'), (1, '#0a0a14')])
    # lua crescente
    lx, ly, lr = X(.26), Y(.14), X(.075)
    b = brilho(b, lx, ly, X(.5), '#6a74b0', .4)
    b = forma(b, lambda d: d.ellipse([lx - lr, ly - lr, lx + lr, ly + lr], fill=255), '#f0ecd8')
    b = forma(b, lambda d: d.ellipse([lx - lr * .6, ly - lr * 1.15, lx + lr * 1.4, ly + lr * .85], fill=255), mix('#0b0e1e', '#141a36', .5), blur=S)
    # nuvens
    for _ in range(7):
        cy = Y(rng.uniform(.2, .5))
        cx = X(rng.uniform(-.1, 1.1))
        b = forma(b, lambda d, cx=cx, cy=cy: d.ellipse([cx - X(.35), cy - Y(.025), cx + X(.35), cy + Y(.025)], fill=255), '#2a2e50', blur=14 * S, alpha=150)
    # montanhas distantes
    b = forma(b, lambda d: d.polygon([(0, H)] + crista(rng, 0, W, Y(.7), Y(.12), 14) + [(W, H)], fill=255), '#1a1c34')
    b = nevoa(b, Y(.62), Y(.78), '#3a3c66', 60, ruido(rng, 220, 2))
    # penhasco
    pen = [(X(.15), H), (X(.3), Y(.78)), (X(.42), Y(.66)), (X(.5), Y(.62)), (X(.78), Y(.6)), (X(.9), Y(.7)), (X(1.0), Y(.68)), (W, H)]
    b = forma(b, lambda d: d.polygon(pen, fill=255), textura('#0c0d18', ruido(rng, 30), .5))
    # torre
    tx, base_y, topo = X(.64), Y(.62), Y(.22)
    tw_b, tw_t = X(.085), X(.065)
    corpo = [(tx - tw_b, base_y), (tx - tw_t, topo), (tx + tw_t, topo), (tx + tw_b, base_y)]
    b = forma(b, lambda d: d.polygon(corpo, fill=255), textura('#14142a', ruido(rng, 20), .45))
    b = forma(b, lambda d: d.polygon([(tx - tw_t * 1.45, topo + Y(.01)), (tx + tw_t * 1.45, topo + Y(.01)), (tx + X(.01), Y(.07)), (tx - X(.005), Y(.06))], fill=255), '#0e0c20')
    b = forma(b, lambda d: d.rectangle([tx - tw_t * 1.2, topo, tx + tw_t * 1.2, topo + Y(.018)], fill=255), '#1e1e3a')
    # janelas brilhando
    for wx, wy, cor in ((0, .29, '#c89aff'), (-.025, .4, '#ffc070'), (.02, .5, '#ffc070')):
        jx, jy = tx + X(wx), Y(wy)
        b = brilho(b, jx, jy, X(.12), cor, .5)
        b = forma(b, lambda d, jx=jx, jy=jy: d.polygon(arco(jx, jy + Y(.02), jy - Y(.022), X(.011)), fill=255), mix(cor, '#ffffff', .4))
    # anel arcano
    b = luz_aditiva(b, lambda d: d.ellipse([tx - X(.17), Y(.16), tx + X(.17), Y(.2)], outline=255, width=2 * S), '#a080ff', 2 * S, 200)
    b = luz_aditiva(b, lambda d: d.ellipse([tx - X(.17), Y(.16), tx + X(.17), Y(.2)], outline=255, width=8 * S), '#6040c0', 10 * S, 120)
    b = particulas(b, rng, 30, (tx - X(.25), Y(.08), tx + X(.25), Y(.6)), '#b8a0ff', (.6, 1.6), .9, 8)
    b = nevoa(b, Y(.85), Y(1.0), '#1a1a30', 90)
    return vinheta(b, .5)


def vila(rng):
    b = ceu_noturno(rng, [(0, '#0e1228'), (.3, '#262a4a'), (.52, '#5a4058'), (.62, '#8a5a4a'), (1, '#140e10')], 120, .4)
    b = forma(b, lambda d: d.polygon([(0, H)] + crista(rng, 0, W, Y(.6), Y(.06), 10) + [(W, H)], fill=255), '#2a2238')
    b = nevoa(b, Y(.55), Y(.66), '#6a4a58', 50)
    # casas
    casas = []
    x = X(-.05)
    while x < W:
        w = X(rng.uniform(.16, .24))
        base_y = Y(rng.uniform(.74, .78))
        alt = Y(rng.uniform(.1, .16))
        tel = Y(rng.uniform(.07, .11))
        casas.append((x, w, base_y, alt, tel))
        x += w * rng.uniform(.85, 1.0)
    fachada = textura('#16121c', ruido(rng, 22), .4)
    for (x, w, base_y, alt, tel) in casas:
        chx = x + w * rng.uniform(.6, .8)
        b = forma(b, lambda d, x=x, w=w, base_y=base_y, alt=alt, tel=tel, chx=chx: (
            d.rectangle([x, base_y - alt, x + w, H], fill=255),
            d.polygon([(x - w * .06, base_y - alt), (x + w / 2, base_y - alt - tel), (x + w * 1.06, base_y - alt)], fill=255),
            d.rectangle([chx, base_y - alt - tel * 1.1, chx + w * .1, base_y - alt - tel * .3], fill=255)), fachada)
        # fumaça
        for k in range(5):
            b = forma(b, lambda d, chx=chx, k=k, base_y=base_y, alt=alt, tel=tel, w=w: d.ellipse([chx + w * .05 - X(.02 + k * .012) + k * X(.015), base_y - alt - tel * 1.2 - Y(.03 * k) - Y(.015), chx + w * .05 + X(.02 + k * .012) + k * X(.015), base_y - alt - tel * 1.2 - Y(.03 * k) + Y(.015)], fill=255), '#6a6078', blur=6 * S, alpha=60 - k * 10)
        # janelas
        for _ in range(rng.randint(1, 3)):
            jx = x + w * rng.uniform(.15, .75)
            jy = base_y - alt * rng.uniform(.35, .75)
            if rng.random() < .8:
                b = brilho(b, jx + X(.015), jy + Y(.015), X(.1), '#ff9a40', .45)
                b = forma(b, lambda d, jx=jx, jy=jy: d.rectangle([jx, jy, jx + X(.03), jy + Y(.03)], fill=255), '#ffcf7a')
                b = forma(b, lambda d, jx=jx, jy=jy: (d.line([(jx + X(.015), jy), (jx + X(.015), jy + Y(.03))], fill=255, width=S * 2),
                                                      d.line([(jx, jy + Y(.015)), (jx + X(.03), jy + Y(.015))], fill=255, width=S * 2)), '#3a2010')
    # rua de pedras
    rua = textura('#1e181e', ruido(rng, 30), .35)
    b = forma(b, lambda d: d.polygon([(X(.38), Y(.78)), (X(.62), Y(.78)), (W * 1.1, H), (-W * .1, H)], fill=255), rua)
    b = brilho(b, X(.5), Y(.9), X(.4), '#a06030', .25, ry=Y(.06))
    # poste com lampião
    px_ = X(.84)
    b = forma(b, lambda d: (d.rectangle([px_ - S * 4, Y(.6), px_ + S * 4, H], fill=255),
                            d.line([(px_, Y(.61)), (px_ - X(.06), Y(.61))], fill=255, width=S * 4)), '#08060a')
    b = brilho(b, px_ - X(.06), Y(.64), X(.4), '#ffa040', .55)
    b = brilho(b, px_ - X(.06), Y(.64), X(.05), '#fff0c0', 1)
    b = forma(b, lambda d: d.polygon([(px_ - X(.08), Y(.62)), (px_ - X(.04), Y(.62)), (px_ - X(.045), Y(.665)), (px_ - X(.075), Y(.665))], outline=255, width=S * 3), '#08060a')
    # cerca à esquerda
    b = forma(b, lambda d: [d.rectangle([X(.02 + i * .06), Y(.84), X(.035 + i * .06), Y(.95)], fill=255) for i in range(4)] + [d.line([(0, Y(.87)), (X(.24), Y(.87))], fill=255, width=S * 5)], '#07050a')
    b = particulas(b, rng, 18, (0, Y(.6), W, Y(.95)), '#ffb060', (.6, 1.4), .7)
    return vinheta(b, .5)


def estrada(rng):
    b = gradiente([(0, '#141a34'), (.25, '#3a3458'), (.42, '#a05a5a'), (.5, '#e09a5a'), (.53, '#f0c070'), (.56, '#4a3040'), (1, '#140c10')])
    b = brilho(b, X(.62), Y(.52), X(.7), '#ff9a50', .55, ry=Y(.2))
    b = brilho(b, X(.62), Y(.52), X(.06), '#fff0c0', 1)
    # nuvens finas iluminadas
    for _ in range(6):
        cy, cx = Y(rng.uniform(.25, .46)), X(rng.uniform(0, 1))
        b = forma(b, lambda d, cx=cx, cy=cy: d.ellipse([cx - X(.4), cy - Y(.008), cx + X(.4), cy + Y(.008)], fill=255), '#e08a6a', blur=4 * S, alpha=110)
    # camadas de montanhas
    for i, (yb, amp, cor) in enumerate(((.53, .1, '#7a4a5a'), (.57, .08, '#4a2c40'), (.62, .07, '#2a1a28'))):
        b = forma(b, lambda d, yb=yb, amp=amp: d.polygon([(0, H)] + crista(rng, 0, W, Y(yb), Y(amp), 12 + i * 4) + [(W, H)], fill=255), cor)
        if i == 0:
            # castelo distante
            cx, cy = X(.2), Y(.47)
            b = forma(b, lambda d: (d.rectangle([cx - X(.04), cy, cx + X(.04), cy + Y(.04)], fill=255),
                                    d.rectangle([cx - X(.05), cy - Y(.02), cx - X(.03), cy + Y(.04)], fill=255),
                                    d.rectangle([cx + X(.03), cy - Y(.03), cx + X(.05), cy + Y(.04)], fill=255),
                                    d.polygon([(cx + X(.028), cy - Y(.03)), (cx + X(.04), cy - Y(.05)), (cx + X(.052), cy - Y(.03))], fill=255)), '#6a4050')
            b = brilho(b, cx + X(.01), cy + Y(.015), X(.015), '#ffc070', .8)
        b = nevoa(b, Y(yb - .02), Y(yb + .06), '#a06060', 40 - i * 10)
    # colinas próximas com árvores
    b = forma(b, lambda d: d.polygon([(0, H)] + crista(rng, 0, W, Y(.7), Y(.06), 8, .2) + [(W, H)], fill=255), textura('#160e14', ruido(rng, 25), .4))
    for _ in range(9):
        tx = X(rng.uniform(0, 1))
        ty = Y(rng.uniform(.66, .72))
        r = X(rng.uniform(.03, .06))
        b = forma(b, lambda d, tx=tx, ty=ty, r=r: (d.ellipse([tx - r, ty - r * 2.2, tx + r, ty], fill=255), d.rectangle([tx - S * 3, ty - r * .5, tx + S * 3, ty + r * .4], fill=255)), '#0e080c')
    # estrada sinuosa
    pts_e, pts_d = [], []
    for i in range(41):
        t = i / 40
        y = Y(.62) + (H - Y(.62)) * t ** 1.6
        cx = X(.6) + math.sin(t * 4.2) * X(.16) * t - X(.14) * t
        meia = X(.01) + X(.42) * t ** 1.6
        pts_e.append((cx - meia, y))
        pts_d.append((cx + meia, y))
    b = forma(b, lambda d: d.polygon(pts_e + pts_d[::-1], fill=255), textura('#2c2024', ruido(rng, 30), .3))
    b = luz_aditiva(b, lambda d: d.line([(p[0] + (q[0] - p[0]) * .5, p[1]) for p, q in zip(pts_e, pts_d)], fill=255, width=6 * S), '#c07a50', 8 * S, 60)
    # placa de madeira
    b = forma(b, lambda d: (d.rectangle([X(.14), Y(.72), X(.155), Y(.92)], fill=255),
                            d.polygon([(X(.06), Y(.74)), (X(.24), Y(.735)), (X(.27), Y(.76)), (X(.24), Y(.785)), (X(.06), Y(.79))], fill=255)), '#0a0608')
    # capim
    def capim(d):
        for _ in range(140):
            x0 = rng.uniform(0, W)
            h = Y(rng.uniform(.03, .08))
            d.line([(x0, H), (x0 + rng.uniform(-12, 12) * S, H - h)], fill=255, width=S * 2)
    b = forma(b, capim, '#06040a')
    # pássaros
    for _ in range(4):
        bx, by = X(rng.uniform(.3, .9)), Y(rng.uniform(.3, .42))
        b = forma(b, lambda d, bx=bx, by=by: d.line([(bx - S * 9, by - S * 3), (bx, by + S * 2), (bx + S * 9, by - S * 3)], fill=255, width=S * 2), '#2a1a28')
    return vinheta(b, .5)


CENAS = {
    'taverna': taverna, 'floresta': floresta, 'caverna': caverna, 'masmorra': masmorra, 'mina': mina,
    'templo': templo, 'torre': torre, 'vila': vila, 'estrada': estrada,
}


def salvar(img, caminho):
    final = img.resize((OUT_W, OUT_H), Image.LANCZOS).filter(ImageFilter.UnsharpMask(1.2, 40, 2))
    final.save(caminho, optimize=True)
    if os.path.getsize(caminho) > LIMITE_BYTES:
        # Paleta de 256 cores com pontilhado: imperceptível sob o escurecimento do app.
        final.quantize(256, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.FLOYDSTEINBERG).save(caminho, optimize=True)
    return os.path.getsize(caminho)


def main():
    raiz = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    saida = sys.argv[1] if len(sys.argv) > 1 else os.path.join(raiz, 'public', 'fundos')
    os.makedirs(saida, exist_ok=True)
    so = set(sys.argv[2:])
    for i, (nome, fn) in enumerate(CENAS.items()):
        if so and nome not in so:
            continue
        rng = random.Random(7919 * (i + 1))
        img = fn(rng)
        tam = salvar(img, os.path.join(saida, f'{nome}.png'))
        print(f'{nome}.png  {OUT_W}x{OUT_H}  {tam // 1024} KB')


if __name__ == '__main__':
    main()
