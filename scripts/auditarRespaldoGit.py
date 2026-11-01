"""Inventario local de respaldo. No modifica Git, servicios ni bases de datos.

La salida contiene rutas, hashes y clasificaciones; nunca valores de secretos.
Ejecutar desde la raiz: python scripts/auditarRespaldoGit.py
"""
import collections
import hashlib
import json
import pathlib
import re
import subprocess
import zipfile

ROOT = pathlib.Path(__file__).resolve().parents[1]
OUT = ROOT / 'docs/respaldo-pre-entrega-2026-11-01/revision-02'
CANDIDATE = 'docs/local-fase-2e6-enterprise/candidate-08/'
BRANCH = 'respaldo-pre-entrega-2026-11-01'
SOURCE_EXT = {'.js', '.cjs', '.mjs', '.html', '.css', '.sql', '.ps1', '.py',
              '.cs', '.manifest', '.nsi', '.md', '.json'}
TEXT_EXT = SOURCE_EXT | {'.txt', '.tap', '.example'}
CORE = {'backend', 'database', 'electron', 'frontend', 'scripts', 'shared'}


def git(*args):
    return subprocess.check_output(['git', *args], cwd=ROOT)


def names(*args):
    return git(*args, '-z').decode('utf-8').rstrip('\0').split('\0')


def sha(data):
    return hashlib.sha256(data).hexdigest()


def classify(name, tracked):
    p = pathlib.PurePosixPath(name)
    if tracked:
        return 'incluir', 'versionado_previo'
    if name.startswith(CANDIDATE):
        if 'node_modules' in p.parts:
            return 'excluir', 'dependencia_expandida_conservada_en_zip_funcional'
        return 'incluir', 'fuente_y_paquete_funcional_2E6_candidate08'
    if p.parts[0] in CORE and p.suffix.lower() in SOURCE_EXT:
        return 'incluir', 'fuente_actual_incluye_experimentos_no_certificados'
    if p.parts[0] == 'docs':
        generated = any(re.fullmatch(r'(?:packages(?:-attempt-\d+)?|candidate-\d+|runtime|node_modules|P01-kit|026-.*-\d+)', x)
                        for x in p.parts[1:-1])
        if generated:
            return 'excluir', 'paquete_generado_o_runtime_duplicado'
        if p.suffix == '.md':
            return 'incluir', 'documentacion_tecnica'
        if any(x in {'before', 'originals', 'source'} for x in p.parts) and p.suffix in SOURCE_EXT:
            return 'incluir', 'fuente_historica_conservada'
        if p.suffix == '.json':
            return 'excluir', 'evidencia_bruta_local_posibles_datos_o_contexto_privado'
        return 'excluir', 'salida_generada_o_evidencia_visual_local'
    return 'excluir', 'fuera_de_lista_de_fuentes'


def known_values():
    values = set()
    sensitive = re.compile(r'password|secret|token|private.?key', re.I)
    for filename in ['.env', '.env.test']:
        p = ROOT / filename
        if not p.exists():
            continue
        for line in p.read_text(encoding='utf-8-sig').splitlines():
            m = re.match(r'\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$', line)
            if m and sensitive.search(m[1]):
                value = m[2].strip('"\'')
                if len(value) >= 6:
                    values.add(value)
    def walk(v):
        if isinstance(v, dict):
            for k, x in v.items():
                if sensitive.search(k) and isinstance(x, str) and len(x) >= 8:
                    values.add(x)
                walk(x)
        elif isinstance(v, list):
            for x in v:
                walk(x)
    for p in (ROOT / 'secrets').rglob('*.json'):
        try:
            walk(json.loads(p.read_text(encoding='utf-8-sig')))
        except (ValueError, UnicodeError):
            pass
    # Dos asignaciones historicas no vacias: no se presupone vigencia ni revocacion.
    for oid in ['aea91d67d66de1171f98830a1f92d59a279a25db', '04239928b30f9ba4d9dd04956371906736075eed']:
        historic = subprocess.run(['git', 'cat-file', 'blob', oid], cwd=ROOT, capture_output=True)
        if historic.returncode == 0:
            for line in historic.stdout.decode().splitlines():
                if '=' not in line or line.lstrip().startswith('#'):
                    continue
                key, value = line.split('=', 1)
                value = value.strip().strip('"\'')
                if sensitive.search(key) and len(value) >= 6:
                    values.add(value)
    return values


PATTERNS = {
    'token_proveedor': re.compile(rb'\b(?:gh[pousr]_[A-Za-z0-9]{25,}|github_pat_[A-Za-z0-9_]{30,}|AIza[0-9A-Za-z_-]{30,}|EAA[A-Za-z0-9]{60,}|sk-(?:proj-)?[A-Za-z0-9_-]{25,})'),
    'jwt_literal': re.compile(rb'\beyJ[A-Za-z0-9_-]{8,}\.eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{15,}'),
    'url_credencial': re.compile(rb'(?:postgres(?:ql)?|https?)://[^\s/:]+:[^\s/@]+@'),
    'clave_privada_completa': re.compile(rb'-----BEGIN (?:RSA |EC |OPENSSH |DSA |ENCRYPTED )?PRIVATE KEY-----[\s\S]+?-----END (?:RSA |EC |OPENSSH |DSA |ENCRYPTED )?PRIVATE KEY-----'),
}

# Revision manual limitada al contenido exacto de README de terceros ya incluidos
# en el candidato original: PEM truncados con '...' y URI de ejemplo, sin secretos
# locales. No es una excepcion para fuentes propias ni para otros hashes/rutas.
DEPENDENCY_EXAMPLES = {
    ('node_modules/dotenv/README.md', 'clave_privada_completa'): '5d8a19bc75307f6c3a4b805f1693be379c2c236f3795d759fe20f6a74fe61b5b',
    ('node_modules/dotenv/README-es.md', 'clave_privada_completa'): 'ab9ead3242d473bd551044ac448b5cfc761496a5351bf0895d98fd7277e4da51',
    ('node_modules/pg-connection-string/README.md', 'url_credencial'): 'c2cba494f78d950f91ec21298bbf60a949dc379d4f873ffe3ee319c918a175e0',
    ('node_modules/pg-pool/README.md', 'url_credencial'): '9d7028ff70e7cddeb97e7a2fda222e12c0e52fe954baf640d62d29880d9628bb',
}


def scan(data, known):
    findings = [name for name, pattern in PATTERNS.items() if pattern.search(data)]
    if any(v.encode() in data for v in known):
        findings.append('coincidencia_secreto_local_conocido')
    return findings


def write_json(name, value):
    (OUT / name).write_text(json.dumps(value, ensure_ascii=True, indent=2) + '\n', encoding='utf-8')


def main():
    if OUT.exists():
        raise SystemExit('El inventario ya existe; no sobrescribir evidencias.')
    tracked = set(names('ls-files', '--cached'))
    untracked = set(names('ls-files', '--others', '--exclude-standard'))
    changed = set(names('diff', '--name-only'))
    known = known_values()
    inventory, included, excluded, findings = [], [], [], []
    for name in sorted(tracked | untracked):
        p = ROOT / name
        data = p.read_bytes()
        decision, category = classify(name, name in tracked)
        row = dict(path=name, tracked=name in tracked, modified=name in changed,
                   bytes=len(data), sha256=sha(data), decision=decision, category=category)
        inventory.append(row)
        if decision == 'incluir':
            included.append(name)
            if p.suffix.lower() in TEXT_EXT:
                for rule in scan(data, known):
                    findings.append(dict(path=name, rule=rule))
        else:
            excluded.append(name)
    # Los dos ZIP son la excepcion deliberada a salidas generadas: preservan el
    # candidato funcional exacto. Revisar tambien cada entrada descomprimida.
    archive_checks, reviewed_examples = [], []
    archives = json.loads((ROOT / CANDIDATE / 'archives.json').read_text())
    for side in ['server', 'client']:
        name = CANDIDATE + side + '-candidate026.zip'
        digest = sha((ROOT / name).read_bytes())
        if digest != archives[side]['sha256']:
            raise SystemExit('Hash de ZIP funcional no coincide.')
        with zipfile.ZipFile(ROOT / name) as z:
            members = [m for m in z.infolist() if not m.is_dir()]
            for m in members:
                parts = pathlib.PurePosixPath(m.filename.replace('\\', '/')).parts
                if any(x in {'.env', 'secrets', 'pgdata', 'pg_wal', 'desktop-profile026'} for x in parts) or pathlib.PurePosixPath(m.filename).suffix.lower() in {'.env', '.pem', '.key', '.dump', '.backup', '.pfx', '.p12', '.dpapi', '.clixml', '.exe', '.dll'}:
                    findings.append(dict(path=name + '::' + m.filename, rule='entrada_privada_o_binaria'))
                member_bytes = z.read(m)
                for rule in scan(member_bytes, known):
                    if DEPENDENCY_EXAMPLES.get((m.filename, rule)) == sha(member_bytes):
                        reviewed_examples.append(dict(path=name+'::'+m.filename, rule=rule,
                                                      sha256=sha(member_bytes), classification='ejemplo_documental_no_credencial_operativa'))
                    else:
                        findings.append(dict(path=name + '::' + m.filename, rule=rule))
        # Inventario original tambien se coteja contra todos los archivos expandidos.
        base = ROOT / CANDIDATE / side
        release = json.loads((base / 'release-inventory.json').read_text())
        for item in release['files']:
            if sha((base / item['file']).read_bytes()) != item['sha256']:
                raise SystemExit('El candidato expandido no coincide con su inventario.')
        archive_checks.append(dict(side=side, sha256=digest, members=len(members),
                                   inventoryDigest=archives[side]['inventoryDigest'], verified=True))
    proof_file = ROOT / 'docs/local-fase-2e6-enterprise/attempt-10/verification.json'
    proof = json.loads(proof_file.read_text())
    public_proof = dict(phase=proof['phase'], candidate=proof['candidate'], attempt=proof['attempt'],
                        scope=proof['scope'], enterpriseReady=proof['enterpriseReady'], completed=proof['completed'],
                        checks=proof['checks'], electron=proof['electron'], failureCount=len(proof['failures']),
                        originalEvidencePath=str(proof_file.relative_to(ROOT)).replace('\\', '/'),
                        originalEvidenceSha256=sha(proof_file.read_bytes()), archives=archive_checks,
                        note='Resumen derivado. El original local permanece intacto; no se publican snapshots de filas, perfiles, autoridades o credenciales.')
    OUT.mkdir()
    write_json('inventario-inicial.json', inventory)
    write_json('version-funcional-2E6.json', public_proof)
    write_json('revision-69.json', [r for r in inventory if r['modified']])
    (OUT / 'incluir-inicial.txt').write_text('\n'.join(included) + '\n', encoding='utf-8')
    (OUT / 'excluidos-inicial.tsv').write_text('ruta\tmotivo\n' + ''.join(r['path']+'\t'+r['category']+'\n' for r in inventory if r['decision']=='excluir'), encoding='utf-8')
    summary = dict(branch=BRANCH, baseCommit=git('rev-parse', 'HEAD').decode().strip(),
                   originalBranch=git('branch', '--show-current').decode().strip(),
                   tracked=len(tracked), modified=len(changed), untracked=len(untracked),
                   includeExisting=len(tracked), includeUntracked=len(set(included)-tracked),
                   excludeUntracked=len(excluded), includedBytes=sum(r['bytes'] for r in inventory if r['decision']=='incluir'),
                   groups=dict(collections.Counter(r['category'] for r in inventory)),
                   knownSecretValuesCompared=len(known), findings=findings, reviewedDependencyExamples=reviewed_examples,
                   remote=dict(name='origin', repository='LuisGarcia06/sistema-integrador-reservaciones',
                               visibility='public', verifiedViaAuthenticatedGitHubApi=True),
                   pushAuthorized=False, pushExecuted=False)
    write_json('resumen-inicial.json', summary)
    print(json.dumps(summary))
    if findings:
        raise SystemExit('Hallazgos pendientes: no preparar commits hasta resolverlos.')


if __name__ == '__main__':
    main()
