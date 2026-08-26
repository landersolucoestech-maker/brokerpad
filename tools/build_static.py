#!/usr/bin/env python3
from __future__ import annotations

import base64
import hashlib
import html as html_lib
import io
import shutil
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DIST = ROOT / 'dist'
ARCHIVE_SHA256 = '72f9a60244b43940fdc89462c4f011d0ffbd961d47e1cfe10f41c089e15d0ea6'
BASELINE_INDEX_SHA256 = '4f32fe3717b3d7128cddc4f52368e667c8cfe2fcf093173ab61fee47fc1691f6'
BASELINE_INDEX = 'brokerpad-benchmark-consolidated/index.html'
JSZIP_CDN = 'https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js'
RUNTIME_MODULES = [
    'app.js',
    'modules/customers.js',
    'modules/leads.js',
    'modules/quotes.js',
    'modules/orders.js',
    'modules/carriers.js',
    'modules/dispatch.js',
    'modules/compliance.js',
    'modules/finance.js',
    'modules/risk.js',
    'modules/documents.js',
    'modules/communications.js',
    'modules/reports.js',
    'modules/sync.js',
    'modules/audit.js',
    'ui-system.js',
]


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def read_archive() -> bytes:
    parts = sorted((ROOT / 'bootstrap' / 'source').glob('part-*.b64'))
    if len(parts) != 20:
        raise SystemExit(f'Expected 20 source chunks, found {len(parts)}')
    payload = ''.join(part.read_text(encoding='utf-8').strip() for part in parts)
    archive = base64.b64decode(payload, validate=True)
    digest = sha256(archive)
    if digest != ARCHIVE_SHA256:
        raise SystemExit(f'Archive checksum mismatch: {digest}')
    return archive


def document_for(fragment: str) -> str:
    styles = (
        '<link rel="stylesheet" href="src/runtime/app.css">'
        '<link rel="stylesheet" href="src/runtime/design-system.css">'
    )
    scripts = ''.join(f'<script src="src/runtime/{html_lib.escape(name, quote=True)}"></script>' for name in RUNTIME_MODULES)
    return (
        '<!doctype html>\n'
        '<html lang="en">\n'
        '<head>\n'
        '  <meta charset="utf-8">\n'
        '  <meta name="viewport" content="width=device-width, initial-scale=1">\n'
        '  <meta name="color-scheme" content="light">\n'
        '  <title>BrokerPad</title>\n'
        f'  {styles}\n'
        f'  <script src="{JSZIP_CDN}"></script>\n'
        '</head>\n'
        '<body>\n'
        f'{fragment}\n'
        f'{scripts}\n'
        '</body>\n'
        '</html>\n'
    )


def build() -> None:
    archive = read_archive()
    with zipfile.ZipFile(io.BytesIO(archive)) as zf:
        if BASELINE_INDEX not in zf.namelist():
            raise SystemExit(f'Missing {BASELINE_INDEX}')
        baseline = zf.read(BASELINE_INDEX)

    digest = sha256(baseline)
    if digest != BASELINE_INDEX_SHA256:
        raise SystemExit(f'Baseline index checksum mismatch: {digest}')

    fragment = baseline.decode('utf-8')
    if '<div id="lander-full-review"' not in fragment:
        raise SystemExit('Verified baseline root was not found.')
    if fragment.lstrip().lower().startswith('<!doctype') or '<html' in fragment[:500].lower():
        raise SystemExit('Expected the verified BrokerPad source to be an HTML fragment, not a full document.')

    rendered = document_for(fragment)

    if DIST.exists():
        shutil.rmtree(DIST)
    (DIST / 'src').mkdir(parents=True)
    shutil.copytree(ROOT / 'src' / 'runtime', DIST / 'src' / 'runtime')
    (DIST / 'index.html').write_text(rendered, encoding='utf-8')
    (DIST / '.nojekyll').write_text('', encoding='utf-8')

    print(f'Built BrokerPad static site: {DIST}')
    print(f'Baseline SHA-256: {digest}')
    print('Document shell: PASS (charset + viewport + JSZip + runtime assets)')
    print(f'Runtime modules: {len(RUNTIME_MODULES)}')


if __name__ == '__main__':
    build()
