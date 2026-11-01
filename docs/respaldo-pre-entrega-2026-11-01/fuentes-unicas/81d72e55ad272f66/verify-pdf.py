"""Lectura y render de los PDFs reales del ensayo; no imprime ni modifica PDFs."""
from pathlib import Path
import hashlib
import json
from pypdf import PdfReader
import pdfplumber
import pypdfium2 as pdfium

root = Path(__file__).parent
files = list((root / 'artifacts').glob('*/*.pdf'))
assert any(p.name == 'restored-daily.pdf' for p in files)
results = []
for file in files:
    reader = PdfReader(file)
    text = '\n'.join(page.extract_text() for page in reader.pages)
    assert 'Community Tours' in text and 'Daily operativo' in text
    assert '1,200.00' in text and 'Notas operador' in text
    if file.name == 'restored-daily.pdf':
        assert 'Cliente grupo1' in text and 'Cliente grupo2' in text
        assert 'CANCELADA' in text and 'Notas pasajero' in text
        assert '29/10/2099' in text and len(reader.pages) == 2
    else:
        assert 'CUI-Principal' in text and 'Notas CUI <b> como texto' in text
        assert '20/12/2098' in text and len(reader.pages) == 1
    assert 'sin transporte' not in text.lower()
    assert 'motivo' not in text.lower()
    assert 'password' not in text.lower() and 'JWT' not in text
    with pdfplumber.open(file) as pdf:
        for page in pdf.pages:
            assert not [c for c in page.chars if c['x0'] < -1 or c['x1'] > page.width + 1
                        or c['top'] < -1 or c['bottom'] > page.height + 1]
    renders = []
    document = pdfium.PdfDocument(file)
    for n in range(len(document)):
        page = document[n]
        image = page.render(scale=1.6).to_pil()
        output = file.with_name(file.stem + '-page-' + str(n + 1) + '.png')
        image.save(output)
        renders.append(str(output))
        page.close()
    document.close()
    results.append({'file': str(file), 'sha256': hashlib.sha256(file.read_bytes()).hexdigest(),
                    'bytes': file.stat().st_size, 'pages': len(reader.pages),
                    'textChecksPassed': True, 'boundsPassed': True, 'renders': renders})
(root / 'pdf-verification.json').write_text(json.dumps(results, ensure_ascii=True, indent=2), encoding='utf8')
print(json.dumps([{'file': p['file'], 'pages': p['pages'], 'bytes': p['bytes']} for p in results]))
