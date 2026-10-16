"""Inspecciona PDF reales de Electron; solo datos sinteticos del laboratorio."""
import json, re, sys
from pathlib import Path
from pypdf import PdfReader
import pypdfium2 as pdfium
lab = Path(sys.argv[1]).resolve()
if lab.parent.name != '.access-scope-lab' or not lab.name.startswith(('04b-', '05a-')):
    raise ValueError('Destino fuera del laboratorio')
results = []
for name in ('reservacion-selected', 'daily-admin'):
    file = lab / (name + '.pdf')
    reader = PdfReader(file)
    text = '\n'.join(page.extract_text() or '' for page in reader.pages)
    compact = re.sub(r'\s+', ' ', text)
    assert 'VISIBLE-2' in compact, (name, 'Falta reserva esperada')
    assert 'Cliente visible 2' in compact, (name, 'Falta cliente esperado')
    assert 'NOTA VISIBLE 2' in compact, (name, 'Falta observacion esperada')
    for excluded in ('OCULTA-', 'OCULTO', 'NOTA OCULTA', 'WhatsApp Business', 'Booking Directo', 'Externa'):
        assert excluded not in compact, (name, 'Informacion excluida: ' + excluded)
    codes = set(re.findall(r'VISIBLE-\d+', compact))
    assert codes == {'VISIBLE-2'}, (name, codes)
    (lab / (name + '.txt')).write_text(text, encoding='utf-8')
    document = pdfium.PdfDocument(str(file))
    rendered = []
    for index in range(len(document)):
        image = document[index].render(scale=1.5).to_pil()
        target = lab / (name + '-page-' + str(index + 1) + '.png')
        image.save(target)
        rendered.append(str(target))
    results.append({'file': str(file), 'pages': len(reader.pages), 'visible_codes': sorted(codes), 'excluded_content_absent': True, 'rendered': rendered})
(lab / 'pdf-audit.json').write_text(json.dumps(results, indent=2), encoding='utf-8')
print(json.dumps({'pdfs_checked': len(results), 'pages': sum(r['pages'] for r in results)}))
