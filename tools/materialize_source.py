#!/usr/bin/env python3
from __future__ import annotations

import argparse
import base64
import hashlib
import io
import shutil
import sys
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PARTS = ROOT / 'bootstrap' / 'source'
OUTPUT = ROOT / '.brokerpad-materialized'
ARCHIVE_SHA256 = '72f9a60244b43940fdc89462c4f011d0ffbd961d47e1cfe10f41c089e15d0ea6'
INDEX_SHA256 = '4f32fe3717b3d7128cddc4f52368e667c8cfe2fcf093173ab61fee47fc1691f6'
SOURCE_DIR = 'brokerpad-benchmark-consolidated/'


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def read_archive() -> bytes:
    parts = sorted(PARTS.glob('part-*.b64'))
    if len(parts) != 20:
        raise RuntimeError(f'Expected 20 source parts, found {len(parts)}.')
    encoded = ''.join(path.read_text('ascii').strip() for path in parts)
    archive = base64.b64decode(encoded, validate=True)
    actual = sha256(archive)
    if actual != ARCHIVE_SHA256:
        raise RuntimeError(f'Archive SHA-256 mismatch: {actual}')
    return archive


def verify_archive(archive: bytes) -> tuple[zipfile.ZipFile, bytes]:
    bundle = zipfile.ZipFile(io.BytesIO(archive))
    index_path = SOURCE_DIR + 'index.html'
    if index_path not in bundle.namelist():
        raise RuntimeError(f'Missing {index_path} in source archive.')
    index = bundle.read(index_path)
    actual = sha256(index)
    if actual != INDEX_SHA256:
        raise RuntimeError(f'index.html SHA-256 mismatch: {actual}')
    return bundle, index


def materialize(bundle: zipfile.ZipFile) -> None:
    if OUTPUT.exists():
        shutil.rmtree(OUTPUT)
    OUTPUT.mkdir(parents=True)
    for name in bundle.namelist():
        if not name.startswith(SOURCE_DIR) or name.endswith('/'):
            continue
        relative = Path(name).relative_to(SOURCE_DIR)
        target = OUTPUT / relative
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(bundle.read(name))


def main() -> int:
    parser = argparse.ArgumentParser(
        description='Verify and materialize the approved BrokerPad prototype source.'
    )
    parser.add_argument(
        '--verify-only',
        action='store_true',
        help='Verify checksums without extracting files.',
    )
    args = parser.parse_args()

    archive = read_archive()
    bundle, index = verify_archive(archive)
    print(f'archive_sha256={sha256(archive)}')
    print(f'index_sha256={sha256(index)}')
    print('source_integrity=PASS')
    if not args.verify_only:
        materialize(bundle)
        print(f'materialized={OUTPUT}')
    return 0


if __name__ == '__main__':
    try:
        raise SystemExit(main())
    except Exception as exc:
        print(f'source_integrity=FAIL: {exc}', file=sys.stderr)
        raise SystemExit(1)
