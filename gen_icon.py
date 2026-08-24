# -*- coding: utf-8 -*-
"""XLG 扩展图标生成器。

设计：靛蓝圆角底（品牌主色 #4f46e5）+ 粗体白色「X」字形，
X 的笔画在中心留出一个菱形空隙（形似程序节点/分支），笔画两端为圆头。
扁平、无渐变，符合品牌规范（现代、干净、无 AI 味），并在 16px 小尺寸下依旧可辨识。
"""
import math
import os

from PIL import Image, ImageDraw

INDIGO = (79, 70, 229, 255)
WHITE = (255, 255, 255, 255)


def thick_line(draw, p1, p2, width, fill):
    """绘制一条厚直线（多边形填充），并给两端补圆头。"""
    x1, y1 = p1
    x2, y2 = p2
    dx = x2 - x1
    dy = y2 - y1
    L = math.hypot(dx, dy)
    if L == 0:
        return
    nx, ny = -dy / L, dx / L
    w = width / 2.0
    pts = [
        (x1 + nx * w, y1 + ny * w),
        (x2 + nx * w, y2 + ny * w),
        (x2 - nx * w, y2 - ny * w),
        (x1 - nx * w, y1 - ny * w),
    ]
    draw.polygon(pts, fill=fill)
    # 圆头
    r = w
    draw.ellipse([x1 - r, y1 - r, x1 + r, y1 + r], fill=fill)
    draw.ellipse([x2 - r, y2 - r, x2 + r, y2 + r], fill=fill)


def draw_xlg(size):
    """绘制单枚图标（放大 4 倍绘制再缩小，保证边缘平滑）。"""
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    # 靛蓝圆角底
    r = int(size * 0.235)
    draw.rounded_rectangle([0, 0, size - 1, size - 1], radius=r, fill=INDIGO)

    S = float(size)
    cx = cy = S / 2.0
    w = 0.165 * S           # 笔画宽度（加粗，保证小尺寸可读）
    outer = 0.30 * S        # 外端距中心距离
    gap = 0.095 * S         # 中心菱形空隙（笔画不相交，形成“节点”感）
    d = math.sqrt(2.0) / 2.0  # 45° 单位向量分量

    # 两条对角线方向单位向量
    dirs = [(d, d), (-d, d)]

    for (ux, uy) in dirs:
        # 每一条对角线分成两段，中间留 gap
        o1 = (cx - ux * outer, cy - uy * outer)
        i1 = (cx - ux * gap, cy - uy * gap)
        i2 = (cx + ux * gap, cy + uy * gap)
        o2 = (cx + ux * outer, cy + uy * outer)
        thick_line(draw, o1, i1, w, WHITE)
        thick_line(draw, i2, o2, w, WHITE)

    return img


def render(path, px):
    factor = 4
    big = draw_xlg(px * factor)
    big = big.convert("RGBA")
    out = big.resize((px, px), Image.LANCZOS)
    out.save(path)


if __name__ == "__main__":
    base = os.path.join(os.path.dirname(os.path.abspath(__file__)), "extension", "icons")
    for px in (128, 48, 16):
        p = os.path.join(base, "icon%d.png" % px)
        render(p, px)
        print("wrote", p)
