import hashlib
import json
from pathlib import Path, PurePosixPath
from zipfile import ZipFile

root = Path(__file__).resolve().parent
candidate = root / 'candidate-08'
archives = json.loads((candidate / 'archives.json').read_text(encoding='utf-8'))
result = {'readOnly': True, 'extracted': False, 'enterpriseAuthorized': False, 'archives': []}
for side in ('server', 'client'):
    archive = candidate / f'{side}-candidate026.zip'
    assert hashlib.sha256(archive.read_bytes()).hexdigest() == archives[side]['sha256']
    with ZipFile(archive) as z:
        names = z.namelist()
        assert len(names) == len(set(names))
        for name in names:
            p = PurePosixPath(name)
            assert not p.is_absolute() and '..' not in p.parts and '\\' not in name
        raw = z.read('release-inventory.json')
        assert hashlib.sha256(raw).hexdigest() == archives[side]['inventoryDigest']
        inventory = json.loads(raw)
        expected = {item['file']: item['sha256'] for item in inventory['files']}
        assert set(names) == set(expected) | {'release-inventory.json'}
        for name, digest in expected.items():
            assert hashlib.sha256(z.read(name)).hexdigest() == digest
        assert z.testzip() is None
        result['archives'].append({'side': side, 'files': len(names), 'allSha256Match': True,
                                   'noExtraOrMissing': True, 'crcValid': True})
with (root / 'zip-verification.json').open('x', encoding='utf-8') as stream:
    json.dump(result, stream, ensure_ascii=False, indent=2)
print(json.dumps(result))
