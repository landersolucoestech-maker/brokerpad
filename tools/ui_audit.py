#!/usr/bin/env python3
from __future__ import annotations

import argparse
import base64
import io
import json
import re
import sys
import zipfile
from collections import Counter
from html.parser import HTMLParser
from pathlib import Path

EXPECTED_SOURCE_PAGES = [
    'dashboard','customers','leads','quotes','quote-calculator','orders','dispatch',
    'carriers','compliance','communications','documents','finance','risk','reports',
    'automations','integrations','users','audit','settings'
]
REQUIRED_TOKENS = [
    '--bp-font-sans','--bp-text-sm','--bp-text-metric','--bp-text-page-mobile',
    '--bp-space-1','--bp-space-2','--bp-space-3','--bp-radius-sm',
    '--bp-control-md','--bp-avatar-size','--bp-card-head-height','--bp-kpi-min-height',
    '--bp-table-head-height','--bp-table-row-min-height','--bp-modal-max-width',
    '--bp-bg','--bp-surface','--bp-text','--bp-text-label','--bp-placeholder',
    '--bp-border','--bp-border-hover','--bp-accent','--bp-on-accent',
    '--bp-overlay','--bp-shadow-md'
]
REQUIRED_DESIGN_IMPORTS = [
    "@import url('./design/tokens-shell.css')",
    "@import url('./design/controls.css')",
    "@import url('./design/data-components.css')",
    "@import url('./design/overlays.css')",
    "@import url('./design/workspaces.css')",
    "@import url('./design/responsive.css')",
    "@import url('./design/responsive-hardening.css')",
    "@import url('./design/runtime-fixes.css')",
    "@import url('./design/product-decisions.css')",
]
REQUIRED_RUNTIME_MODULES = {
    'audit.js','carriers.js','communications.js','compliance.js','customers.js',
    'dashboard.js','dispatch.js','documents.js','finance.js','integrity.js',
    'leads.js','legacy-surface-guard.js','orders.js','quote-calculator.js','quotes.js',
    'reports.js','risk.js','settings.js','sync.js'
}
CANONICAL_BREAKPOINTS = {'1280','1024','800','520'}


class SourcePageParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.pages: list[str] = []
        self._in_script = False

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if tag == 'script':
            self._in_script = True
            return
        if self._in_script:
            return
        attrs_map = dict(attrs)
        if tag == 'section' and 'page' in (attrs_map.get('class') or '').split() and attrs_map.get('data-page'):
            self.pages.append(str(attrs_map['data-page']))

    def handle_endtag(self, tag: str) -> None:
        if tag == 'script':
            self._in_script = False


def load_baseline(root: Path) -> str:
    parts = sorted((root / 'bootstrap' / 'source').glob('part-*.b64'))
    if len(parts) != 20:
        raise AssertionError(f'expected 20 bootstrap chunks, found {len(parts)}')
    payload = ''.join(p.read_text(encoding='utf-8').strip() for p in parts)
    archive = base64.b64decode(payload)
    with zipfile.ZipFile(io.BytesIO(archive)) as zf:
        name = 'brokerpad-benchmark-consolidated/index.html'
        if name not in zf.namelist():
            raise AssertionError(f'{name} missing from baseline archive')
        return zf.read(name).decode('utf-8')


def scan_values(css: str, prop: str) -> Counter:
    return Counter(v.strip() for v in re.findall(rf'{re.escape(prop)}\s*:\s*([^;}}]+)', css, flags=re.I))


def source_pages(html: str) -> list[str]:
    parser = SourcePageParser()
    parser.feed(html)
    return list(dict.fromkeys(parser.pages))


def run(root: Path) -> dict:
    index = (root / 'index.html').read_text(encoding='utf-8')
    build_static = (root / 'tools/build_static.py').read_text(encoding='utf-8')
    ds_root = root / 'src/runtime/design-system.css'
    ds_root_text = ds_root.read_text(encoding='utf-8')
    design_dir = root / 'src/runtime/design'
    design_files = {p.name: p.read_text(encoding='utf-8') for p in sorted(design_dir.glob('*.css'))}
    ds = ds_root_text + '\n' + '\n'.join(design_files.values())
    ui = (root / 'src/runtime/ui-system.js').read_text(encoding='utf-8')
    app = (root / 'src/runtime/app.js').read_text(encoding='utf-8')
    reports = (root / 'src/runtime/modules/reports.js').read_text(encoding='utf-8')
    guard = (root / 'src/runtime/modules/legacy-surface-guard.js').read_text(encoding='utf-8')
    baseline = load_baseline(root)

    pages = source_pages(baseline)
    style_blocks = re.findall(r'<style\b[^>]*>(.*?)</style>', baseline, flags=re.I | re.S)
    legacy_css = '\n'.join(style_blocks)
    inline_styles = len(re.findall(r'\sstyle=["\']', baseline, flags=re.I))

    errors: list[str] = []
    warnings: list[str] = []

    if pages != EXPECTED_SOURCE_PAGES:
        errors.append(f'source page map mismatch: {pages}')
    if any('loadboard' in page.lower() for page in pages):
        errors.append('Loadboards must not exist as a standalone source page; integrations belong under Settings → Integrations')

    for token in REQUIRED_TOKENS:
        if token not in ds:
            errors.append(f'missing design token {token}')

    import_positions = []
    for required_import in REQUIRED_DESIGN_IMPORTS:
        pos = ds_root_text.find(required_import)
        if pos < 0:
            errors.append(f'missing canonical design layer: {required_import}')
        import_positions.append(pos)
    valid_positions = [p for p in import_positions if p >= 0]
    if valid_positions != sorted(valid_positions):
        errors.append('canonical design-system import order changed')

    hardcoded_color_files: dict[str, list[str]] = {}
    color_pattern = re.compile(r'(?<![\w-])(?:#[0-9a-fA-F]{3,8}|rgba?\([^)]*\))')
    for name, css in design_files.items():
        if name == 'tokens-shell.css':
            continue
        colors = sorted(set(color_pattern.findall(css)))
        if colors:
            hardcoded_color_files[name] = colors
    if hardcoded_color_files:
        errors.append(f'hardcoded colors outside tokens-shell.css: {hardcoded_color_files}')

    if 'src/runtime/design-system.css' not in index:
        errors.append('design-system.css is not loaded by index.html')
    if 'src/runtime/ui-system.js' not in index:
        errors.append('ui-system.js is not loaded by index.html')
    if 'jszip@3.10.1' not in build_static.lower():
        errors.append('materialized static build must load JSZip for Reports XLSX import/export')

    runtime_dir = root / 'src/runtime/modules'
    runtime_paths = sorted(runtime_dir.glob('*.js'))
    runtime_modules = sorted(p.name for p in runtime_paths)
    missing_runtime = sorted(REQUIRED_RUNTIME_MODULES - set(runtime_modules))
    if missing_runtime:
        errors.append(f'required runtime modules missing: {missing_runtime}')

    # Existence is insufficient: every canonical owner must be executed in both
    # development and materialized builds.
    for module in sorted(REQUIRED_RUNTIME_MODULES):
        dev_ref = f'src/runtime/modules/{module}'
        build_ref = f"'modules/{module}'"
        if dev_ref not in index:
            errors.append(f'canonical runtime module is not loaded by index.html: {module}')
        if build_ref not in build_static:
            errors.append(f'canonical runtime module is not loaded by static build: {module}')

    if 'dashboard-removals.js' in index or 'dashboard-removals.js' in build_static:
        errors.append('obsolete dashboard-removals.js loader reference remains; use legacy-surface-guard.js')

    app_pos = index.find('src/runtime/app.css')
    ds_pos = index.find('src/runtime/design-system.css')
    if app_pos < 0 or ds_pos < app_pos:
        errors.append('design-system.css must load after app.css')

    guard_pos = index.find('src/runtime/modules/legacy-surface-guard.js')
    first_owner = min(
        (index.find(f'src/runtime/modules/{name}') for name in REQUIRED_RUNTIME_MODULES if name != 'legacy-surface-guard.js'),
        default=-1,
    )
    if guard_pos < 0 or (first_owner >= 0 and guard_pos > first_owner):
        errors.append('legacy-surface-guard.js must initialize before page runtime owners')

    last_module = index.rfind('src/runtime/modules/')
    ui_pos = index.find('src/runtime/ui-system.js')
    if last_module >= 0 and ui_pos < last_module:
        errors.append('ui-system.js must load after runtime modules')

    breakpoints = set(re.findall(r'@media\s*\(max-width:\s*(\d+)px\)', ds))
    if not CANONICAL_BREAKPOINTS.issubset(breakpoints):
        errors.append(f'canonical responsive breakpoints missing: {sorted(CANONICAL_BREAKPOINTS - breakpoints)}')

    if '.sidebar.is-open' not in ds or '.bp-mobile-nav-toggle' not in ds:
        errors.append('responsive sidebar off-canvas pattern missing')
    if '100vh' not in ds or '100dvh' not in ds:
        errors.append('viewport-fill fallback requires both vh and dvh')
    if '.bp-loading' not in ds or '.bp-spinner' not in ds or '.bp-skeleton' not in ds:
        errors.append('canonical loading primitives missing')
    if '[role="tooltip"]' not in ds or 'details > summary' not in ds:
        errors.append('tooltip/disclosure component normalization missing')

    if 'MutationObserver' not in ui:
        errors.append('dynamic UI normalization observer missing')
    if 'aria-labelledby' not in ui or 'aria-current' not in ui:
        errors.append('page/navigation accessibility normalization missing')
    if "scope', 'col'" not in ui or 'data table' not in ui:
        errors.append('table accessibility normalization missing')
    if 'bp-mobile-nav-toggle' not in ui:
        errors.append('mobile navigation controller missing')
    if 'relations' not in app or 'hasReferences' not in app:
        errors.append('runtime relational integrity API missing')

    # Legacy surface ownership: benchmark retries may remain in the immutable
    # source, but maintained UI must neutralize them and keep Loadboards inside
    # Settings → Integrations rather than Orders.
    required_guard_markers = [
        'bp-lead-intel','bp-repeat-intel','bp-pricing-intel','bp-order-benchmark',
        'bp-carrier-network-intel','bp-comm-benchmark','bp-doc-benchmark',
        'bp-fin-benchmark','bp-auto-benchmark','bp-integration-benchmark',
        'bp-org-benchmark','bp-security-benchmark','orderPostLoadBoards','data-lb-order-post'
    ]
    for marker in required_guard_markers:
        if marker not in guard:
            errors.append(f'legacy surface guard missing ownership marker: {marker}')

    runtime_inline_style_files: list[str] = []
    runtime_css_text_files: list[str] = []
    runtime_prompt_files: list[str] = []
    for path in runtime_paths:
        source = path.read_text(encoding='utf-8')
        if re.search(r'\bstyle\s*=\s*["\']', source):
            runtime_inline_style_files.append(path.name)
        if '.style.cssText' in source:
            runtime_css_text_files.append(path.name)
        if re.search(r'\b(?:window\.)?prompt\s*\(', source):
            runtime_prompt_files.append(path.name)

    if runtime_css_text_files:
        errors.append(f'runtime modules use style.cssText instead of canonical classes: {runtime_css_text_files}')
    if runtime_prompt_files:
        errors.append(f'runtime modules use browser prompt instead of canonical UI: {runtime_prompt_files}')
    if runtime_inline_style_files:
        errors.append(f'runtime modules contain generated inline style attributes: {runtime_inline_style_files}')

    if '<th>Import</th>' in reports or '<th>Export</th>' in reports:
        errors.append('Reports must not expose separate Import or Export columns')
    if '<th>Dataset</th><th>Records</th><th>Source</th><th>Actions</th>' not in reports:
        errors.append('Reports canonical Dataset/Records/Source/Actions header missing')
    if 'data-dataset-import' not in reports or 'data-dataset-export' not in reports:
        errors.append('Reports Actions must expose dataset Import and Export controls')
    forbidden_report_ui = ['Saved Reports', 'Create Report', 'Import XLSX', 'Export XLSX']
    for label in forbidden_report_ui:
        if label in reports:
            errors.append(f'Reports runtime reintroduced forbidden control: {label}')

    legacy_font_sizes = scan_values(legacy_css, 'font-size')
    legacy_radii = scan_values(legacy_css, 'border-radius')
    legacy_weights = scan_values(legacy_css, 'font-weight')
    legacy_breakpoints = set(re.findall(r'@media\s*\(max-width:\s*(\d+)px\)', legacy_css))

    if len(legacy_font_sizes) > 12:
        warnings.append(f'legacy baseline has {len(legacy_font_sizes)} font-size variants; canonical layer overrides maintained UI')
    if len(legacy_radii) > 10:
        warnings.append(f'legacy baseline has {len(legacy_radii)} radius variants; canonical layer overrides maintained UI')
    if len(legacy_breakpoints) > 8:
        warnings.append(f'legacy baseline has {len(legacy_breakpoints)} breakpoints; canonical layer reduces maintained breakpoints to 4')
    if inline_styles:
        warnings.append(f'legacy baseline contains {inline_styles} inline style attributes; retained only inside checksum baseline')

    return {
        'status': 'pass' if not errors else 'fail',
        'source_page_count': len(pages),
        'source_pages': pages,
        'legacy_style_blocks': len(style_blocks),
        'legacy_inline_style_attributes': inline_styles,
        'legacy_font_size_variants': len(legacy_font_sizes),
        'legacy_radius_variants': len(legacy_radii),
        'legacy_weight_variants': len(legacy_weights),
        'legacy_breakpoints': sorted(int(x) for x in legacy_breakpoints),
        'canonical_breakpoints': sorted(int(x) for x in breakpoints),
        'runtime_modules': runtime_modules,
        'runtime_generated_inline_style_files': runtime_inline_style_files,
        'runtime_css_text_files': runtime_css_text_files,
        'runtime_prompt_files': runtime_prompt_files,
        'hardcoded_color_files': hardcoded_color_files,
        'errors': errors,
        'warnings': warnings,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description='BrokerPad UI architecture audit')
    parser.add_argument('--root', default='.', help='repository root')
    parser.add_argument('--json', action='store_true', help='JSON output')
    parser.add_argument('--check', action='store_true', help='fail on structural errors')
    args = parser.parse_args()
    result = run(Path(args.root).resolve())
    if args.json:
        print(json.dumps(result, indent=2))
    else:
        print(f"UI audit: {result['status'].upper()} · {result['source_page_count']} source pages · {len(result['runtime_modules'])} runtime modules")
        print(f"Legacy baseline: {result['legacy_style_blocks']} style blocks, {result['legacy_font_size_variants']} font sizes, {result['legacy_radius_variants']} radii, {len(result['legacy_breakpoints'])} breakpoints")
        print(f"Canonical breakpoints: {result['canonical_breakpoints']}")
        if result['runtime_generated_inline_style_files']:
            print(f"Runtime inline-style files: {result['runtime_generated_inline_style_files']}")
        if result['hardcoded_color_files']:
            print(f"Hardcoded design colors: {result['hardcoded_color_files']}")
        for warning in result['warnings']:
            print(f'WARN: {warning}')
        for error in result['errors']:
            print(f'ERROR: {error}')
    return 1 if args.check and result['errors'] else 0


if __name__ == '__main__':
    sys.exit(main())
