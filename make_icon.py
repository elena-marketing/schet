# -*- coding: utf-8 -*-
"""Рисует иконку приложения без графических библиотек.

На сервере нет ни Pillow, ни конвертеров, поэтому картинка собирается
попиксельно и упаковывается в PNG вручную: синий скруглённый квадрат,
белый лист с текстовыми линиями и круглый оттиск печати.
"""
import math
import struct
import zlib


def rounded(x, y, size, radius):
    """Точка внутри скруглённого квадрата?"""
    cx = min(max(x, radius), size - radius)
    cy = min(max(y, radius), size - radius)
    return (x - cx) ** 2 + (y - cy) ** 2 <= radius ** 2


def draw(size):
    px = [[(0, 0, 0, 0)] * size for _ in range(size)]
    r = int(size * 0.22)

    bg_top = (37, 99, 235)
    bg_bottom = (14, 60, 170)
    paper = (255, 255, 255)
    line = (203, 213, 225)
    stamp = (37, 99, 235)

    # лист занимает середину, поля рассчитываем от размера
    px0, py0 = int(size * 0.24), int(size * 0.17)
    px1, py1 = int(size * 0.76), int(size * 0.83)
    sc_x, sc_y = int(size * 0.66), int(size * 0.70)
    sc_r = int(size * 0.135)

    for y in range(size):
        for x in range(size):
            if not rounded(x + 0.5, y + 0.5, size, r):
                continue
            t = y / size
            col = tuple(int(bg_top[i] + (bg_bottom[i] - bg_top[i]) * t) for i in range(3))
            a = 255

            if px0 <= x < px1 and py0 <= y < py1:
                col, a = paper, 255
                # строки текста на листе
                for k in range(5):
                    ly = py0 + int(size * (0.09 + k * 0.085))
                    if ly <= y < ly + max(1, int(size * 0.022)):
                        right = px1 - int(size * (0.06 if k % 2 else 0.12))
                        if px0 + int(size * 0.05) <= x < right:
                            col = line

            d = math.hypot(x + 0.5 - sc_x, y + 0.5 - sc_y)
            ring = max(1.5, size * 0.022)
            if sc_r - ring <= d <= sc_r or sc_r * 0.62 - ring * 0.7 <= d <= sc_r * 0.62:
                col, a = stamp, 255

            px[y][x] = (col[0], col[1], col[2], a)
    return px


def png(px):
    h = len(px)
    w = len(px[0])
    raw = b''.join(b'\x00' + bytes(v for pixel in row for v in pixel) for row in px)

    def chunk(tag, data):
        body = tag + data
        return struct.pack('>I', len(data)) + body + struct.pack('>I', zlib.crc32(body) & 0xffffffff)

    return (b'\x89PNG\r\n\x1a\n'
            + chunk(b'IHDR', struct.pack('>IIBBBBB', w, h, 8, 6, 0, 0, 0))
            + chunk(b'IDAT', zlib.compress(raw, 9))
            + chunk(b'IEND', b''))


if __name__ == '__main__':
    for size, name in ((192, 'icon-192.png'), (512, 'icon-512.png')):
        with open(name, 'wb') as f:
            f.write(png(draw(size)))
        print(name, 'готово')
