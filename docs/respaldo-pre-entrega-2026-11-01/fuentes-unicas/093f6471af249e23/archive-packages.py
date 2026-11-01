import hashlib, json, pathlib, zipfile

base = pathlib.Path(__file__).resolve().parent
inventory = json.loads((base / 'package-inventory.json').read_text(encoding='utf-8'))
result = []
for side, name in [('client', 'client-experimental.zip'), ('server', 'server-candidate-lab.zip')]:
    dest = base / name
    rows = sorted((r for r in inventory['files'] if r['side'] == side), key=lambda r: r['file'])
    with zipfile.ZipFile(dest, 'x', zipfile.ZIP_DEFLATED, compresslevel=6) as archive:
        for row in rows:
            content = (base / 'packages' / side / row['file']).read_bytes()
            assert hashlib.sha256(content).hexdigest() == row['sha256']
            archive.writestr(row['file'], content)
    with zipfile.ZipFile(dest, 'r') as archive:
        assert len(archive.infolist()) == len(rows)
        for row in rows:
            assert hashlib.sha256(archive.read(row['file'])).hexdigest() == row['sha256']
    result.append({'side': side, 'file': name, 'files': len(rows), 'bytes': dest.stat().st_size,
                   'sha256': hashlib.sha256(dest.read_bytes()).hexdigest(), 'verifiedEveryEntry': True,
                   'nativeInstaller': False, 'enterpriseAuthorized': False})
(base / 'package-archives.json').write_text(json.dumps(result, indent=2), encoding='utf-8')
print(json.dumps(result))
