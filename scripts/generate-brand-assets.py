#!/usr/bin/env python3
"""
品牌资产生成（205-plugin-branding）：从工作区官方 logo 生成 Android 启动图标与通知小图标。

输入：<workspace>/assets/logo.png（200×200 RGBA，#1296db 品牌气泡，透明底）
输出：
  app/src/main/res/mipmap-<dpi>/ic_launcher.png        legacy 方形图标（白底 + 居中 logo）
  app/src/main/res/mipmap-<dpi>/ic_launcher_round.png  圆形裁切
  app/src/main/res/drawable-<dpi>/ic_stat_dsh.png      通知小图标（白色剪影，透明底）

重跑幂等。仅依赖 Pillow。
"""
import os
import sys
from PIL import Image, ImageDraw

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
LOGO_SRC = os.path.normpath(os.path.join(ROOT, '..', 'assets', 'logo.png'))
RES = os.path.join(ROOT, 'app', 'src', 'main', 'res')

# mipmap 密度 → legacy 边长 px
MIPMAP = {'mdpi': 48, 'hdpi': 72, 'xhdpi': 96, 'xxhdpi': 144, 'xxxhdpi': 192}
# 通知小图标密度 → 边长 px（24dp 基准）
STAT = {'mdpi': 24, 'hdpi': 36, 'xhdpi': 48, 'xxhdpi': 72, 'xxxhdpi': 96}


def load_logo():
    if not os.path.isfile(LOGO_SRC):
        sys.exit(f'logo 源文件缺失: {LOGO_SRC}')
    logo = Image.open(LOGO_SRC).convert('RGBA')
    return logo


def launcher_icon(size, logo, round_mask=False):
    """白底（Android 8 以下 legacy 图标需要不透明底）+ 居中 logo（占 86%）。"""
    canvas = Image.new('RGBA', (size, size), (255, 255, 255, 255))
    inner = int(size * 0.86)
    mark = logo.resize((inner, inner), Image.LANCZOS)
    canvas.alpha_composite(mark, ((size - inner) // 2, (size - inner) // 2))
    if round_mask:
        mask = Image.new('L', (size, size), 0)
        ImageDraw.Draw(mask).ellipse((0, 0, size - 1, size - 1), fill=255)
        out = Image.new('RGBA', (size, size), (0, 0, 0, 0))
        out.paste(canvas, (0, 0), mask)
        canvas = out
    return canvas.convert('RGB')


def notification_icon(size, logo):
    """
    状态栏/通知小图标：Android 要求白色 + alpha 的剪影（彩色会被渲染成白方块）。
    取 logo alpha 通道作为形状，纯白填充；内缩到安全区（92%）。
    """
    inner = int(size * 0.92)
    mark = logo.resize((inner, inner), Image.LANCZOS)
    canvas = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    alpha = mark.split()[3]
    white = Image.new('RGBA', (inner, inner), (255, 255, 255, 0))
    white.putalpha(alpha)
    canvas.alpha_composite(white, ((size - inner) // 2, (size - inner) // 2))
    return canvas


def main():
    logo = load_logo()
    written = []
    for dpi, size in MIPMAP.items():
        d = os.path.join(RES, f'mipmap-{dpi}')
        os.makedirs(d, exist_ok=True)
        launcher_icon(size, logo).save(os.path.join(d, 'ic_launcher.png'))
        launcher_icon(size, logo, round_mask=True).save(os.path.join(d, 'ic_launcher_round.png'))
        written.append(f'mipmap-{dpi}')
    for dpi, size in STAT.items():
        d = os.path.join(RES, f'drawable-{dpi}')
        os.makedirs(d, exist_ok=True)
        notification_icon(size, logo).save(os.path.join(d, 'ic_stat_dsh.png'))
        written.append(f'drawable-{dpi}/ic_stat_dsh')
    print('品牌资产生成完成:', ', '.join(written))


if __name__ == '__main__':
    main()
