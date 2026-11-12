#!/usr/bin/env python3
"""Dossier DICOM synthétique (pydicom) pour tester l'import direct d'un dossier DICOM (v4.21) :
  - série IRM T1 3D (MR, 40 coupes 64×64, 2 mm, oblique léger) d'une tête sphérique avec un « cerveau » ;
  - série CT post-implantation (CT, 30 coupes 80×80, 1 mm, rescale −1024) avec une « électrode » hyperdense ;
  - repérage (localizer, 3 coupes) qui ne doit pas être pré-coché ;
  - un fichier qui n'est pas un DICOM (rapport .txt) à ignorer.
    python tools/tests/make_synth_dicom.py DOSSIER"""
import os, sys, math, datetime
import numpy as np, pydicom
from pydicom.dataset import Dataset, FileDataset, FileMetaDataset
from pydicom.uid import generate_uid, ExplicitVRLittleEndian, ImplicitVRLittleEndian

out = sys.argv[1] if len(sys.argv) > 1 else '/tmp/claude-0/dcm_synth'
PAT = ('SYNTH^Dicom', 'SYN-01', '19900101')

def write_series(folder, modality, desc, n, nx, pix, pos0, iop, pixels, date, ts=ExplicitVRLittleEndian, rescale=None, implicit=False, series_no=1, bits=16):
    os.makedirs(folder, exist_ok=True)
    study, series, frame = generate_uid(), generate_uid(), generate_uid()
    for k in range(n):
        fm = FileMetaDataset(); fm.MediaStorageSOPClassUID = '1.2.840.10008.5.1.4.1.1.4' if modality == 'MR' else '1.2.840.10008.5.1.4.1.1.2'
        fm.MediaStorageSOPInstanceUID = generate_uid(); fm.TransferSyntaxUID = ImplicitVRLittleEndian if implicit else ts
        ds = FileDataset(None, {}, file_meta=fm, preamble=b'\0' * 128)
        ds.is_little_endian = True; ds.is_implicit_VR = bool(implicit)
        ds.PatientName, ds.PatientID, ds.PatientBirthDate = PAT
        ds.StudyInstanceUID, ds.SeriesInstanceUID, ds.FrameOfReferenceUID = study, series, frame
        ds.SOPClassUID, ds.SOPInstanceUID = fm.MediaStorageSOPClassUID, fm.MediaStorageSOPInstanceUID
        ds.Modality, ds.SeriesDescription, ds.SeriesNumber, ds.InstanceNumber = modality, desc, series_no, k + 1
        ds.StudyDate = ds.SeriesDate = ds.AcquisitionDate = date; ds.StudyTime = '101500'
        ds.ImageType = ['ORIGINAL', 'PRIMARY', 'LOCALIZER' if 'repérage' in desc else 'OTHER']
        nrm = np.cross(iop[:3], iop[3:])
        ds.ImagePositionPatient = [float(pos0[i] + nrm[i] * pix[2] * k) for i in range(3)]
        ds.ImageOrientationPatient = [float(v) for v in iop]
        ds.PixelSpacing = [float(pix[1]), float(pix[0])]; ds.SliceThickness = float(pix[2]); ds.SpacingBetweenSlices = float(pix[2])
        ds.Rows = ds.Columns = nx; ds.SamplesPerPixel = 1; ds.PhotometricInterpretation = 'MONOCHROME2'
        ds.BitsAllocated = 16; ds.BitsStored = 12 if modality == 'CT' else 16; ds.HighBit = ds.BitsStored - 1; ds.PixelRepresentation = 0
        if rescale: ds.RescaleIntercept, ds.RescaleSlope = rescale
        if modality == 'MR': ds.EchoTime, ds.RepetitionTime, ds.MagneticFieldStrength = 3.1, 2200.0, 3.0; ds.SequenceName = 'tfl3d1'
        if modality == 'CT': ds.KVP = 120.0; ds.WindowCenter, ds.WindowWidth = 40.0, 400.0
        ds.PixelData = pixels[k].astype(np.uint16).tobytes()
        ds.save_as(os.path.join(folder, f'IM{k + 1:04d}.dcm' if k % 2 == 0 else f'{k + 1:06d}'), write_like_original=False)
    return series

# IRM T1 : tête sphérique, cerveau plus clair, légère obliquité (rotation de 6° autour de x)
n, nx = 40, 64; pix = (3.0, 3.0, 2.0)
a = math.radians(6); iop = np.array([1, 0, 0, 0, math.cos(a), math.sin(a)])
yy, xx = np.mgrid[0:nx, 0:nx]
mr = []
for k in range(n):
    z = (k - n / 2) * pix[2]; r = np.hypot((xx - nx / 2) * pix[0], (yy - nx / 2) * pix[1]); r3 = np.hypot(r, z)
    im = np.where(r3 < 90, 300 + 25 * np.sin(xx / 3.0), 0) + np.where(r3 < 70, 500 + 150 * (np.cos(yy / 4.0) > 0), 0)
    mr.append(np.clip(im, 0, 4000))
write_series(os.path.join(out, 'IRM_2021', 'T1_3D'), 'MR', 'T1 MPRAGE 3D', n, nx, pix, (-96, -100, -40), iop, mr, '20210512')
# repérage (3 coupes, à ne pas pré-cocher)
write_series(os.path.join(out, 'IRM_2021', 'repérage'), 'MR', 'repérage', 3, nx, (4.0, 4.0, 10.0), (-128, -128, -20), [1, 0, 0, 0, 1, 0], [np.full((nx, nx), 100)] * 3, '20210512', series_no=0)
# CT post-implantation : 30 coupes 1 mm, 80×80 à 1,5 mm, implicite VR, HU = pixel − 1024, une électrode oblique hyperdense
n, nx = 30, 80; pix = (1.5, 1.5, 1.0)
ct = []
for k in range(n):
    z = (k - n / 2) * pix[2]; r = np.hypot((xx2 := (np.mgrid[0:nx, 0:nx][1] - nx / 2) * pix[0]), (yy2 := (np.mgrid[0:nx, 0:nx][0] - nx / 2) * pix[1])); r3 = np.hypot(r, z)
    im = np.where(r3 < 58, 1024 + 40, 0) + np.where((r3 < 58) & (r3 > 52), 900, 0)   # tissu 40 HU, os ~ 940 HU
    # électrode : tige de 1 mm de rayon, oblique (x = 10 + 0.6·z, y = −5)
    ex = 10 + 0.6 * z; d = np.hypot(xx2 - ex, yy2 + 5); im = np.where((d < 1.2) & (r3 < 50), 1024 + 2500, im)
    ct.append(np.clip(im, 0, 4095))
write_series(os.path.join(out, 'CT_implantation'), 'CT', 'CT crane post-implantation', n, nx, pix, (-60, -60, -15), [1, 0, 0, 0, 1, 0], ct, '20210915', rescale=(-1024.0, 1.0), implicit=True, series_no=2)
open(os.path.join(out, 'compte_rendu.txt'), 'w').write('pas un DICOM\n')
print(out, sum(len(f) for _, _, f in os.walk(out)), 'fichiers')
