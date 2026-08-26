#!/usr/bin/env python3
from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def read(path: str) -> str:
    target = ROOT / path
    if not target.exists():
        raise AssertionError(f'missing required file: {path}')
    return target.read_text(encoding='utf-8')


def main() -> int:
    errors: list[str] = []
    index = read('index.html')
    build = read('tools/build_static.py')
    settings = read('src/runtime/modules/settings.js')
    communications = read('src/runtime/modules/communications.js')
    sync = read('src/runtime/modules/sync.js')
    ui = read('src/runtime/ui-system.js')

    if 'src/runtime/modules/settings.js' not in index:
        errors.append('development shell must load settings.js')
    if "'modules/settings.js'" not in build:
        errors.append('materialized build must load settings.js')

    index_settings = index.find('src/runtime/modules/settings.js')
    index_communications = index.find('src/runtime/modules/communications.js')
    if index_settings < 0 or index_communications < 0 or index_settings > index_communications:
        errors.append('settings directory must initialize before communications')

    build_settings = build.find("'modules/settings.js'")
    build_communications = build.find("'modules/communications.js'")
    if build_settings < 0 or build_communications < 0 or build_settings > build_communications:
        errors.append('static build must initialize settings directory before communications')

    required_settings_tokens = [
        'BrokerPadDirectory',
        'activeUsers()',
        'data-settings-tab="users"',
        'data-settings-tab="automations"',
        'data-settings-tab="integrations"',
        'Loadboards do not have a standalone BrokerPad module',
        "category: 'Loadboard'",
        "status: 'Needs credentials'",
        'secret credentials are not stored in this browser prototype',
    ]
    for token in required_settings_tokens:
        if token not in settings:
            errors.append(f'Settings ownership contract missing: {token}')

    if "legacyIntegrations.dataset.bpSettingsOwned = '1'" in settings:
        errors.append('legacy ownership should be applied generically, not only to Integrations')
    if 'bpSettingsOwned' not in settings:
        errors.append('legacy Users/Automations/Integrations pages must be explicitly marked as Settings-owned')

    required_communications_tokens = [
        "conversationKinds = ['customer', 'team']",
        "customerStatuses = ['open', 'pending', 'closed']",
        "teamStatuses = ['active', 'archived']",
        'participantIds',
        'BrokerPadDirectory?.activeUsers',
        'name="participantIds" multiple',
        "row.kind === 'team'",
        "row.status === 'archived'",
        "customerFor(row)?.status === 'Do Not Contact'",
        'conversation.contact.blocked',
        'do_not_contact_first_message',
        'internal notes remain available',
        'Date.parse(b.updatedAt',
    ]
    for token in required_communications_tokens:
        if token not in communications:
            errors.append(f'Communications domain contract missing: {token}')

    if 'Do Not Contact' in sync or 'conversation.contact.blocked' in sync:
        errors.append('sync.js must not own Communications contact-policy business rules')

    required_modal_closers = [
        '[data-quote-close]', '[data-order-close]', '[data-carrier-close]',
        '[data-dispatch-close]', '[data-document-close]', '[data-settings-close]',
        '[data-integrity-close]'
    ]
    for token in required_modal_closers:
        if token not in ui:
            errors.append(f'central modal Escape support missing: {token}')
    if 'modalOpener' not in ui or 'syncModalFocus' not in ui:
        errors.append('central modal focus restoration contract missing')

    if errors:
        print('Domain audit: FAIL')
        for error in errors:
            print(f'ERROR: {error}')
        return 1

    print('Domain audit: PASS · Settings ownership · Communications domains · modal accessibility')
    return 0


if __name__ == '__main__':
    sys.exit(main())
