import hashlib, json, pathlib, zipfile, sys

root = pathlib.Path(__file__).resolve().parents[2]
out = pathlib.Path(__file__).resolve().parent
report_name = sys.argv[1] if len(sys.argv) == 2 else 'package-cleanliness-audit.json'
assert report_name in ('package-cleanliness-audit.json', 'package-cleanliness-audit-verified.json')
prior = root / 'docs' / 'local-fase-2e5'
archives = json.loads((prior / 'package-archives.json').read_text(encoding='utf-8'))
result = []
for entry in archives:
    file = prior / entry['file']
    digest = hashlib.sha256(file.read_bytes()).hexdigest()
    assert digest == entry['sha256'], 'PREVIOUS_ARCHIVE_CHANGED'
    findings = []
    with zipfile.ZipFile(file, 'r') as archive:
        names = archive.namelist()
        for name in names:
            parts = pathlib.PurePosixPath(name).parts
            lower = name.lower()
            if name.startswith(('/', '\\')) or '..' in parts:
                findings.append({'file': name, 'reason': 'unsafe-path'})
            if any(p in ('__tests__', '__fixtures__', 'fixtures', 'secrets', 'docs', 'artifacts') for p in parts) or lower.endswith(('.dump', '.log', '.pdf', '.key', '.pem')) or any(p.startswith('.env') for p in parts):
                findings.append({'file': name, 'reason': 'excluded-release-content'})
            if lower.startswith('frontend/lab/') or lower.startswith('scripts/') and any(s in lower for s in ('lab.', 'probe.', 'driver.')):
                findings.append({'file': name, 'reason': 'laboratory-dependency'})
            if name in ('electron/preproductionClientPolicy.js', 'backend/config/preproductionPolicy.js', 'scripts/pilot025Supervisor.cjs'):
                text = archive.read(name).decode('utf-8')
                if any(s in text for s in ('synthetic-client023-only', 'synthetic-preproduction-only', 'new-synthetic-cluster-only')):
                    findings.append({'file': name, 'reason': 'laboratory-only-contract'})
    result.append({'archive': str(file), 'sha256': digest, 'priorPreserved': True, 'files': len(names),
                   'enterpriseEligible': False, 'approval': 'missing-approved-business-release-contract',
                   'findings': findings, 'scope': 'Read-only ZIP inspection; no extraction, execution, SQL or network'})
with (out / report_name).open('x', encoding='utf-8') as evidence:
    evidence.write(json.dumps(result, ensure_ascii=False, indent=2))
print(json.dumps([{'archive': pathlib.Path(r['archive']).name, 'files': r['files'], 'findings': len(r['findings']), 'enterpriseEligible': False, 'priorPreserved': True} for r in result]))

sys.exit(2 if any(not r['enterpriseEligible'] for r in result) else 0)
