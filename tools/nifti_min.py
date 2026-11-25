# -*- coding: utf-8 -*-
"""Lecture / écriture NIfTI-1 minimales (numpy seul) pour les scripts de gabarits d'EpiScope (tools/make_templates_*.py)."""
import gzip, struct
import numpy as np

DT = {2: np.uint8, 4: np.int16, 8: np.int32, 16: np.float32, 64: np.float64, 256: np.int8, 512: np.uint16}


def nii_read(path):
    raw = open(path, 'rb').read()
    if raw[:2] == b'\x1f\x8b': raw = gzip.decompress(raw)
    h = raw[:348]; dim = struct.unpack('<8h', h[40:56]); dt = struct.unpack('<h', h[70:72])[0]
    off = int(struct.unpack('<f', h[108:112])[0]); sl, it = struct.unpack('<2f', h[112:120])
    A = np.eye(4); A[:3] = np.array(struct.unpack('<12f', h[280:328])).reshape(3, 4)
    a = np.frombuffer(raw, DT[dt], dim[1] * dim[2] * dim[3], off).reshape(dim[3], dim[2], dim[1]).transpose(2, 1, 0)
    if sl not in (0, 1) or it: a = a * sl + it
    return a, A


def nii_write(path, a, A):
    a = np.asarray(a); code = {np.dtype('uint8'): 2, np.dtype('int16'): 4, np.dtype('float32'): 16, np.dtype('uint16'): 512}[a.dtype]
    h = bytearray(352); struct.pack_into('<i', h, 0, 348); struct.pack_into('<8h', h, 40, 3, *a.shape, 1, 1, 1, 1)
    struct.pack_into('<hh', h, 70, code, a.dtype.itemsize * 8)
    struct.pack_into('<8f', h, 76, 1, *np.sqrt((A[:3, :3] ** 2).sum(0)), 0, 0, 0, 0)
    struct.pack_into('<f', h, 108, 352); struct.pack_into('<2f', h, 112, 1, 0); struct.pack_into('<hh', h, 252, 1, 1)
    struct.pack_into('<12f', h, 280, *A[:3].ravel()); h[344:348] = b'n+1\0'
    open(path, 'wb').write(gzip.compress(bytes(h) + np.ascontiguousarray(a.transpose(2, 1, 0)).tobytes(), 6))
