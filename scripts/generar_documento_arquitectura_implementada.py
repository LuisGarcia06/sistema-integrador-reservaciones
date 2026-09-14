from pathlib import Path

from docx import Document
from docx.enum.section import WD_SECTION
from docx.enum.table import WD_CELL_VERTICAL_ALIGNMENT, WD_TABLE_ALIGNMENT
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Inches, Pt, RGBColor


ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "docs" / "Arquitectura_Tecnica_Implementada_2026-09-12.docx"


def set_cell_shading(cell, fill):
    tc_pr = cell._tc.get_or_add_tcPr()
    shd = tc_pr.find(qn("w:shd"))
    if shd is None:
        shd = OxmlElement("w:shd")
        tc_pr.append(shd)
    shd.set(qn("w:fill"), fill)


def set_cell_border(cell, color="D9D9D9", size="6"):
    tc = cell._tc
    tc_pr = tc.get_or_add_tcPr()
    borders = tc_pr.first_child_found_in("w:tcBorders")
    if borders is None:
        borders = OxmlElement("w:tcBorders")
        tc_pr.append(borders)
    for edge in ("top", "left", "bottom", "right", "insideH", "insideV"):
        tag = "w:{}".format(edge)
        element = borders.find(qn(tag))
        if element is None:
            element = OxmlElement(tag)
            borders.append(element)
        element.set(qn("w:val"), "single")
        element.set(qn("w:sz"), size)
        element.set(qn("w:space"), "0")
        element.set(qn("w:color"), color)


def set_cell_margins(cell, top=90, start=120, bottom=90, end=120):
    tc = cell._tc
    tc_pr = tc.get_or_add_tcPr()
    margins = tc_pr.first_child_found_in("w:tcMar")
    if margins is None:
        margins = OxmlElement("w:tcMar")
        tc_pr.append(margins)
    for margin, value in (("top", top), ("start", start), ("bottom", bottom), ("end", end)):
        element = margins.find(qn("w:{}".format(margin)))
        if element is None:
            element = OxmlElement("w:{}".format(margin))
            margins.append(element)
        element.set(qn("w:w"), str(value))
        element.set(qn("w:type"), "dxa")


def set_repeat_table_header(row):
    tr_pr = row._tr.get_or_add_trPr()
    tbl_header = OxmlElement("w:tblHeader")
    tbl_header.set(qn("w:val"), "true")
    tr_pr.append(tbl_header)


def style_run(run, bold=False, italic=False, size=None, color="000000", font="Aptos"):
    run.bold = bold
    run.italic = italic
    run.font.color.rgb = RGBColor.from_string(color)
    if size:
        run.font.size = Pt(size)
    run.font.name = font
    run._element.rPr.rFonts.set(qn("w:ascii"), font)
    run._element.rPr.rFonts.set(qn("w:hAnsi"), font)


def add_heading(doc, text, level=1):
    paragraph = doc.add_heading(text, level=level)
    for run in paragraph.runs:
        style_run(run, bold=True, color="000000")
    return paragraph


def add_para(doc, text="", bold_lead=None):
    paragraph = doc.add_paragraph()
    paragraph.style = doc.styles["Body Text"]
    if bold_lead:
        run = paragraph.add_run(bold_lead)
        style_run(run, bold=True)
        paragraph.add_run(" ")
    run = paragraph.add_run(text)
    style_run(run)
    return paragraph


def add_bullets(doc, items):
    for item in items:
        paragraph = doc.add_paragraph(style="List Bullet")
        run = paragraph.add_run(item)
        style_run(run)


def add_numbered(doc, items):
    for item in items:
        paragraph = doc.add_paragraph(style="List Number")
        run = paragraph.add_run(item)
        style_run(run)


def add_code_block(doc, text):
    for line in text.strip("\n").splitlines():
        paragraph = doc.add_paragraph()
        paragraph.paragraph_format.space_after = Pt(0)
        run = paragraph.add_run(line)
        style_run(run, font="Courier New", size=9)


def add_table(doc, headers, rows, widths=None):
    table = doc.add_table(rows=1, cols=len(headers))
    table.alignment = WD_TABLE_ALIGNMENT.CENTER
    table.style = "Table Grid"
    hdr = table.rows[0]
    set_repeat_table_header(hdr)
    for index, text in enumerate(headers):
        cell = hdr.cells[index]
        cell.vertical_alignment = WD_CELL_VERTICAL_ALIGNMENT.CENTER
        set_cell_shading(cell, "1F4E5F")
        set_cell_border(cell)
        set_cell_margins(cell)
        paragraph = cell.paragraphs[0]
        paragraph.alignment = WD_ALIGN_PARAGRAPH.CENTER
        run = paragraph.add_run(text)
        style_run(run, bold=True, color="FFFFFF", size=9)
        if widths:
            cell.width = widths[index]

    for row_index, row_data in enumerate(rows):
        row = table.add_row()
        for col_index, text in enumerate(row_data):
            cell = row.cells[col_index]
            cell.vertical_alignment = WD_CELL_VERTICAL_ALIGNMENT.CENTER
            set_cell_border(cell)
            set_cell_margins(cell)
            if row_index % 2 == 1:
                set_cell_shading(cell, "F5F9FB")
            paragraph = cell.paragraphs[0]
            paragraph.alignment = WD_ALIGN_PARAGRAPH.LEFT
            run = paragraph.add_run(str(text))
            style_run(run, size=8.8)
            if widths:
                cell.width = widths[col_index]

    doc.add_paragraph()
    return table


def configure_document(doc):
    section = doc.sections[0]
    section.top_margin = Inches(0.7)
    section.bottom_margin = Inches(0.65)
    section.left_margin = Inches(0.7)
    section.right_margin = Inches(0.7)

    styles = doc.styles
    normal = styles["Normal"]
    normal.font.name = "Aptos"
    normal._element.rPr.rFonts.set(qn("w:ascii"), "Aptos")
    normal._element.rPr.rFonts.set(qn("w:hAnsi"), "Aptos")
    normal.font.size = Pt(10.2)
    normal.font.color.rgb = RGBColor(0, 0, 0)

    body = styles["Body Text"]
    body.font.name = "Aptos"
    body._element.rPr.rFonts.set(qn("w:ascii"), "Aptos")
    body._element.rPr.rFonts.set(qn("w:hAnsi"), "Aptos")
    body.font.size = Pt(10.2)
    body.paragraph_format.space_after = Pt(5)
    body.paragraph_format.line_spacing = 1.05

    for style_name, size in (("Title", 22), ("Heading 1", 15), ("Heading 2", 12), ("Heading 3", 10.5)):
        style = styles[style_name]
        style.font.name = "Aptos Display" if style_name in ("Title", "Heading 1") else "Aptos"
        style._element.rPr.rFonts.set(qn("w:ascii"), style.font.name)
        style._element.rPr.rFonts.set(qn("w:hAnsi"), style.font.name)
        style.font.color.rgb = RGBColor(0, 0, 0)
        style.font.bold = True
        style.font.size = Pt(size)
        style.paragraph_format.space_before = Pt(8)
        style.paragraph_format.space_after = Pt(4)

    footer = section.footer
    footer_p = footer.paragraphs[0]
    footer_p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    run = footer_p.add_run("Sistema Integrador de Reservaciones - Arquitectura tecnica implementada")
    style_run(run, size=8)


def build_document():
    doc = Document()
    configure_document(doc)

    title = doc.add_paragraph(style="Title")
    title.alignment = WD_ALIGN_PARAGRAPH.CENTER
    run = title.add_run("Documentacion de Arquitectura Tecnica Implementada")
    style_run(run, bold=True, size=22)

    subtitle = doc.add_paragraph()
    subtitle.alignment = WD_ALIGN_PARAGRAPH.CENTER
    run = subtitle.add_run("Sistema Integrador de Reservaciones para Community Tours Sian Ka'an")
    style_run(run, size=12)

    meta = doc.add_paragraph()
    meta.alignment = WD_ALIGN_PARAGRAPH.CENTER
    run = meta.add_run("Revision tecnica: 12 de septiembre de 2026 | Commit revisado: 19cd788 | Rama: master")
    style_run(run, size=9)

    add_para(
        doc,
        "Este documento consolida la arquitectura implementada actualmente en el repositorio. "
        "Su objetivo es servir como base para decidir los siguientes pasos tecnicos sin depender de memoria de conversaciones anteriores."
    )

    add_heading(doc, "Resumen Ejecutivo", 1)
    add_para(
        doc,
        "El sistema ya funciona como una aplicacion de escritorio local basada en Electron, con un backend Node.js Express que se ejecuta en "
        "127.0.0.1:3000, sirve el frontend en /app y expone una API REST bajo /api. La persistencia esta centralizada en PostgreSQL mediante pg, "
        "con consultas parametrizadas y acceso a datos dentro del backend."
    )
    add_para(
        doc,
        "La implementacion supera la arquitectura propuesta original en el area operativa: ademas de reservaciones, usuarios, bitacora y Daily, "
        "existen tablas, servicios, validadores, rutas y vistas para operaciones de tour, transportes, guias, operadores, vehiculos, asignacion de "
        "reservaciones a transportes y control de capacidad."
    )
    add_table(
        doc,
        ["Area", "Estado actual", "Observacion para decision"],
        [
            ["Backend base", "Implementado", "Servidor Express local, rutas REST, middleware de autenticacion y autorizacion por rol."],
            ["Base de datos", "Implementada y ampliada", "Incluye tablas base y tablas operativas agregadas por migraciones SQL."],
            ["Autenticacion", "Implementada", "JWT con bcryptjs; token en memoria del frontend, sin persistencia entre recargas."],
            ["Reservaciones", "API implementada", "Frontend de Reservaciones esta aun como pantalla visual base; Historial consume la API real."],
            ["Operaciones y transportes", "Implementado", "Vista funcional para planificar operaciones, crear transportes y organizar reservaciones."],
            ["Daily operativo", "Implementado", "Consulta agrupada por fecha, impresion y exportacion PDF desde Electron."],
            ["Bitacora", "Implementada", "Registra creacion, modificacion, cancelacion y asignacion de transporte de reservaciones."],
            ["Usuarios", "Implementado", "Administracion segura con proteccion contra degradar o desactivar el ultimo administrador."],
            ["Notificaciones", "Pendiente", "Solo hay espacio visual futuro en Configuracion; no existe modulo backend."],
            ["Integraciones externas", "Pendiente", "No hay endpoints ni servicios para FareHarbor, GetYourGuide o WhatsApp Business."],
            ["Pruebas automatizadas", "Pendiente", "No se encontraron scripts de test en package.json."],
        ],
        [Inches(1.45), Inches(1.55), Inches(4.1)],
    )

    add_heading(doc, "Fuentes Revisadas", 1)
    add_para(
        doc,
        "La revision se baso en el repositorio actual, el historial de commits, el documento de arquitectura tecnica propuesto y los archivos principales "
        "de backend, frontend, Electron, base de datos y empaquetado."
    )
    add_table(
        doc,
        ["Fuente", "Uso en esta documentacion"],
        [
            ["Repositorio local", "Estado real de archivos, rutas, servicios, validadores, frontend, Electron y package.json."],
            ["Git log", "Reconstruccion incremental de modulos implementados y checkpoints tecnicos."],
            ["Documento original de arquitectura tecnica", "Referencia de arquitectura propuesta; la version actualizada aqui describe lo ya implementado."],
            ["AGENTS.md", "Restricciones de tecnologias, capas, seguridad y decisiones pendientes del proyecto."],
        ],
        [Inches(2.2), Inches(4.8)],
    )

    add_heading(doc, "Arquitectura General Implementada", 1)
    add_para(
        doc,
        "La arquitectura efectiva conserva el patron por capas. Electron actua como contenedor de escritorio y arranca o reutiliza el backend local. "
        "Express sirve los archivos del frontend y expone endpoints REST. Los controladores validan la entrada, delegan a servicios y los servicios "
        "ejecutan reglas de negocio y consultas parametrizadas contra PostgreSQL."
    )
    add_code_block(
        doc,
        """
Usuario
  |
  v
Electron
  |
  v
Frontend HTML CSS JavaScript servido en /app
  |
  | HTTP REST con JWT Bearer
  v
Node.js Express en 127.0.0.1:3000
  |
  +-- Routes
  +-- Controllers
  +-- Validators
  +-- Services
  +-- Middleware
  +-- Utils y constantes
  |
  v
PostgreSQL mediante pg
"""
    )
    add_para(
        doc,
        "El frontend no se conecta a PostgreSQL. La base de datos queda detras del backend y las credenciales se leen desde variables de entorno o, "
        "en version empaquetada, desde un archivo config.env ubicado en el directorio de datos de usuario de Electron."
    )

    add_heading(doc, "Estructura Actual del Proyecto", 1)
    add_table(
        doc,
        ["Ruta", "Responsabilidad implementada"],
        [
            ["backend/config", "Conexion PostgreSQL centralizada en database.js con dotenv y APP_CONFIG_PATH."],
            ["backend/routes", "Definicion de endpoints REST y proteccion por JWT y rol."],
            ["backend/controllers", "Validacion de entrada, codigos HTTP y coordinacion hacia servicios."],
            ["backend/services", "Logica de negocio, transacciones, calculos operativos y consultas SQL parametrizadas."],
            ["backend/validators", "Validadores por modulo para filtros, cuerpos de peticion e identificadores."],
            ["backend/middleware", "Autenticacion JWT y autorizacion por roles."],
            ["backend/utils", "Normalizacion de cambios, turnos y respuestas de errores PostgreSQL."],
            ["database", "Schema inicial, seeds y migraciones operativas."],
            ["frontend/js", "API client, auth en memoria, router hash, layout y componentes UI."],
            ["frontend/pages", "Vistas de login, dashboard, reservaciones, operaciones, daily, historial, bitacora, usuarios y configuracion."],
            ["electron", "Proceso principal, preload seguro e integracion de exportacion PDF."],
            ["dist", "Salida generada de empaquetado; excluida por .gitignore y build config."],
        ],
        [Inches(1.75), Inches(5.25)],
    )

    add_heading(doc, "Base de Datos Implementada", 1)
    add_para(
        doc,
        "La base esperada se llama sian_kaan_reservaciones. El schema.sql ya contiene las tablas base y las extensiones operativas que fueron agregadas "
        "en migraciones. Las tablas nuevas de operacion permiten planificar tours por fecha y hora, crear transportes por operacion, asignar vehiculos "
        "y operadores, y relacionar reservaciones con transportes."
    )
    add_table(
        doc,
        ["Tabla", "Funcion principal", "Estado"],
        [
            ["roles", "Catalogo de roles Administrador y Consulta.", "Base"],
            ["usuarios", "Cuentas de acceso con correo unico, password hash y estado activo.", "Base"],
            ["tours", "Catalogo de tours consultables.", "Base"],
            ["paises", "Catalogo de paises de origen de reservaciones.", "Base"],
            ["plataformas", "FareHarbor, GetYourGuide, WhatsApp Business y Externa.", "Base"],
            ["vehiculos", "Vehiculos operativos con identificador, placas, color, capacidad y estado.", "Agregada"],
            ["operadores", "Catalogo de operadores activos o inactivos.", "Agregada"],
            ["guias", "Catalogo de guias activos o inactivos.", "Agregada"],
            ["operaciones_tour", "Tour programado por fecha y hora, con guia opcional y estado.", "Agregada"],
            ["transportes_operacion", "Transporte asociado a una operacion, vehiculo, operador y observaciones.", "Agregada"],
            ["reservaciones", "Reservacion con datos comerciales, pickup, cliente, estado e id_transporte_operacion.", "Base ampliada"],
            ["daily_observaciones", "Observaciones generales por fecha para Daily.", "Agregada"],
            ["bitacora", "Auditoria por usuario, reservacion, accion, descripcion y fecha.", "Base"],
        ],
        [Inches(1.45), Inches(4.6), Inches(1.0)],
    )
    add_table(
        doc,
        ["Relacion", "Descripcion"],
        [
            ["roles 1:N usuarios", "Cada usuario pertenece a un rol funcional."],
            ["usuarios 1:N bitacora", "Las acciones auditadas conservan el usuario responsable."],
            ["tours 1:N reservaciones", "Cada reservacion corresponde a un tour."],
            ["paises 1:N reservaciones", "Cada reservacion conserva pais asociado."],
            ["plataformas 1:N reservaciones", "Cada reservacion conserva plataforma de origen o venta."],
            ["tours 1:N operaciones_tour", "Un tour puede tener varias operaciones por fecha y hora."],
            ["guias 1:N operaciones_tour", "Una operacion puede tener guia asignado opcionalmente."],
            ["operaciones_tour 1:N transportes_operacion", "Una operacion puede organizar uno o mas transportes."],
            ["vehiculos 1:N transportes_operacion", "Un vehiculo puede asignarse a transportes, con unicidad por operacion."],
            ["operadores 1:N transportes_operacion", "Un operador puede estar asignado a transportes."],
            ["transportes_operacion 1:N reservaciones", "Una reservacion puede asignarse a un transporte operativo."],
            ["reservaciones 1:N bitacora", "Cada reservacion puede tener multiples eventos auditados."],
        ],
        [Inches(2.35), Inches(4.65)],
    )
    add_para(
        doc,
        "Seeds iniciales: dos roles funcionales, Administrador y Consulta, y cuatro plataformas: FareHarbor, GetYourGuide, WhatsApp Business y Externa."
    )

    add_heading(doc, "Backend y API", 1)
    add_para(
        doc,
        "El backend usa Express 5.2.1, pg 8.23.0, dotenv, jsonwebtoken y bcryptjs. server.js fija HOST 127.0.0.1 y PORT 3000, sirve el frontend "
        "desde /app, deshabilita x-powered-by y aplica cabeceras de seguridad como X-Content-Type-Options, Referrer-Policy, X-Frame-Options, "
        "Permissions-Policy y Content-Security-Policy para la ruta /app."
    )
    add_table(
        doc,
        ["Modulo API", "Endpoints implementados", "Acceso"],
        [
            ["/api/auth", "POST /login", "Publico"],
            ["/api/reservaciones", "GET /, POST /, GET /:id, PATCH /:id, PATCH /:id/cancelar, PATCH /:id/transporte", "Consulta lee; Administrador modifica"],
            ["/api/daily", "GET /, GET /operativo, GET /observaciones, PUT /observaciones", "Consulta lee; Administrador guarda observaciones"],
            ["/api/operaciones", "GET /, POST /, GET /:id, PATCH /:id", "Consulta lee; Administrador modifica"],
            ["/api/transportes", "GET /, POST /, GET /:id, PATCH /:id", "Consulta lee; Administrador modifica"],
            ["/api/tours", "GET /, GET /:id", "Administrador y Consulta"],
            ["/api/guias", "GET /, POST /, GET /:id, PATCH /:id", "Consulta lee; Administrador modifica"],
            ["/api/operadores", "GET /, POST /, GET /:id, PATCH /:id", "Consulta lee; Administrador modifica"],
            ["/api/vehiculos", "GET /, POST /, GET /:id, PATCH /:id", "Consulta lee; Administrador modifica"],
            ["/api/bitacora", "GET / con filtros fecha_desde y fecha_hasta", "Solo Administrador"],
            ["/api/usuarios", "GET /roles, GET /, POST /, GET /:id, PATCH /:id, PATCH /:id/password", "Solo Administrador"],
        ],
        [Inches(1.35), Inches(4.2), Inches(1.55)],
    )
    add_para(
        doc,
        "No se observaron rutas backend para /api/paises ni /api/plataformas, aunque ambas tablas existen y plataformas tiene seeds. Esta decision "
        "importa si el frontend de alta o edicion de reservaciones necesitara cargar esos catalogos dinamicamente."
    )

    add_heading(doc, "Reglas de Negocio Implementadas", 1)
    add_table(
        doc,
        ["Area", "Reglas implementadas"],
        [
            ["Reservaciones", "Validacion de campos obligatorios, fechas, horas, enteros positivos, numeros, filtros permitidos, ninos no mayor que pax, cambios parciales permitidos y cancelacion transaccional."],
            ["Auditoria", "Crear, modificar, cancelar y asignar transporte generan entradas en bitacora dentro de la misma transaccion cuando aplica."],
            ["Capacidad", "Maximo operativo de 12 pasajeros por transporte y 24 pasajeros por tour fecha turno. Canceladas cuentan como 0 PAX activo."],
            ["Vehiculo asignado", "Un transporte con vehiculo debe mantener al menos 2 pasajeros activos. No se permite crear transporte con vehiculo desde cero."],
            ["Compatibilidad operativa", "Reservacion y transporte deben corresponder a la misma fecha y tour. Cambios de operacion validan reservaciones asignadas."],
            ["Concurrencia", "Servicios usan transacciones y bloqueos FOR UPDATE sobre reservaciones, transportes u operaciones cuando hay riesgo de integridad."],
            ["Usuarios", "Password con bcrypt salt rounds 12, correo unico, password minimo 8 caracteres y proteccion contra desactivar o degradar al propio administrador o al ultimo administrador activo."],
            ["Errores PostgreSQL", "dbErrors traduce claves foraneas, unicidad, checks y tipos invalidos a mensajes HTTP controlados."],
        ],
        [Inches(1.6), Inches(5.4)],
    )

    add_heading(doc, "Frontend Implementado", 1)
    add_para(
        doc,
        "El frontend es una aplicacion HTML, CSS y JavaScript sin framework. Usa router por hash, layout lateral, header autenticado y un cliente API "
        "centralizado que adjunta Authorization Bearer cuando existe token. Ante 401, limpia la sesion en memoria y redirige a login."
    )
    add_table(
        doc,
        ["Vista", "Estado", "Notas tecnicas"],
        [
            ["Login", "Funcional", "Consume /api/auth/login, maneja 400, 401, 403 y errores de red."],
            ["Dashboard", "Visual base", "Muestra metricas placeholder y acciones deshabilitadas."],
            ["Reservaciones", "Visual base", "Tabla y filtros preparados, sin consumo de API real en esta vista."],
            ["Operaciones", "Funcional", "Carga operaciones por fecha, catálogos de tours/guias, gestiona transportes y asigna o mueve reservaciones."],
            ["Daily", "Funcional", "Consulta /api/daily/operativo, muestra resumen, transportes, reservaciones sin asignar, impresion y exportacion PDF."],
            ["Historial", "Funcional", "Consulta reservaciones y tours, filtra historicas hasta ayer, agrupa por tour."],
            ["Bitacora", "Funcional admin", "Consulta /api/bitacora con rango de fechas y muestra usuario, accion, reservacion y descripcion."],
            ["Usuarios", "Funcional admin", "Lista, filtra, crea, edita, cambia password y activa o desactiva usuarios con protecciones UI."],
            ["Configuracion", "Visual base", "Espacios de perfil, notificaciones y seguridad aun deshabilitados."],
        ],
        [Inches(1.45), Inches(1.35), Inches(4.2)],
    )
    add_para(
        doc,
        "La navegacion por rol esta implementada en layout.js: Administrador ve todas las secciones; Consulta no ve Bitacora ni Usuarios. La restriccion "
        "importante se aplica tambien en backend mediante middleware, por lo que ocultar opciones no es el unico control."
    )

    add_heading(doc, "Electron y Escritorio", 1)
    add_table(
        doc,
        ["Componente", "Implementacion actual"],
        [
            ["electron/main.js", "Solicita single instance lock, espera o inicia backend local, abre BrowserWindow maximizada y carga http://127.0.0.1:3000/app/."],
            ["Backend local", "Se ejecuta con process.execPath y ELECTRON_RUN_AS_NODE=1. En empaquetado usa app.asar.unpacked."],
            ["Configuracion empaquetada", "Valida config.env en app.getPath('userData') con DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASSWORD y JWT_SECRET."],
            ["Seguridad ventana", "nodeIntegration false, contextIsolation true, sandbox true, webSecurity true, webviewTag false y bloqueo de navegacion fuera de /app."],
            ["preload.js", "Expone solo desktopAPI.exportDailyPdf con normalizacion del payload."],
            ["PDF Daily", "Usa webContents.printToPDF, dialogo de guardar y canal IPC daily:export-pdf validando origen emisor."],
        ],
        [Inches(1.8), Inches(5.2)],
    )

    add_heading(doc, "Empaquetado y Configuracion", 1)
    add_para(
        doc,
        "package.json define scripts start, desktop, pack:win y dist:win. Electron Builder esta configurado con appId com.communitytours.reservaciones, "
        "productName Sistema Integrador de Reservaciones, target NSIS x64 y asar habilitado."
    )
    add_para(
        doc,
        "La configuracion de build incluye electron, backend, frontend y package.json. Excluye .env, .env.*, database, docs, referencias, scripts, .git y dist. "
        "Tambien desempaqueta backend, frontend y node_modules para permitir la ejecucion local desde Electron."
    )

    add_heading(doc, "Seguridad Implementada", 1)
    add_bullets(
        doc,
        [
            "Contraseñas almacenadas con bcryptjs y salt rounds 12.",
            "JWT firmado con JWT_SECRET y expiracion configurable por JWT_EXPIRES_IN, por defecto 8h.",
            "Validacion de usuario activo en login y en middleware de autenticacion.",
            "Autorizacion por rol aplicada en rutas backend.",
            "Consultas SQL parametrizadas con pg.",
            "Variables sensibles fuera del codigo fuente mediante .env o config.env empaquetado.",
            ".env ignorado por Git.",
            "Frontend sin acceso directo a PostgreSQL.",
            "Electron con contextIsolation, sandbox, sin nodeIntegration y preload limitado.",
            "Cabeceras HTTP de seguridad y CSP para el frontend servido por Express.",
        ]
    )
    add_para(
        doc,
        "Riesgos o temas a decidir: no hay rate limiting, no hay refresh tokens, el token del frontend vive solo en memoria, no hay pruebas automatizadas de seguridad, "
        "y la estrategia de distribucion de config.env debe formalizarse para equipos reales."
    )

    add_heading(doc, "Historial de Implementacion", 1)
    add_table(
        doc,
        ["Checkpoint", "Implementacion acumulada"],
        [
            ["1e279af a 22f7da5", "Estructura inicial, conexion PostgreSQL, schema, seeds, entorno y consulta de reservaciones."],
            ["4cd7da9 a 5a40bac", "Creacion, actualizacion parcial, cancelacion, busquedas, filtros y validadores de reservaciones."],
            ["5adc094 a 61dc110", "JWT, permisos por rol, autenticacion y bitacora transaccional."],
            ["ab3635e a 773b759", "Consulta de bitacora, Daily por fecha, observaciones y frontend base con login y layout."],
            ["da3055e a 1745bfb", "Catalogos operativos, operaciones de tour, transportes operativos y ampliacion de reservaciones."],
            ["61af455 a 0ab3feb", "API de operaciones/transportes, asignacion de reservaciones, capacidad e integridad operativa."],
            ["1c7e4d8 a 5fa2c03", "Daily operativo, frontend de Daily, consulta de tours, operaciones, transportes y organizacion."],
            ["2dfbc1c a 71cda88", "Impresion, base Electron segura, exportacion PDF, refuerzos web y empaquetado Windows."],
            ["d9336e4 a 19cd788", "Consulta de bitacora, historial completo y administracion segura de usuarios."],
        ],
        [Inches(1.65), Inches(5.35)],
    )

    add_heading(doc, "Pendientes Tecnicos Relevantes", 1)
    add_table(
        doc,
        ["Pendiente", "Impacto", "Decision recomendada"],
        [
            ["Frontend completo de reservaciones", "La API existe, pero la vista Reservaciones no permite crear, editar ni cancelar desde UI.", "Priorizar si el usuario operativo capturara reservaciones manuales desde el sistema."],
            ["Catalogos de paises y plataformas por API", "La tabla existe, pero no hay rutas registradas para cargarlos dinamicamente.", "Definir si se exponen como catalogos de solo lectura o administrables."],
            ["Notificaciones", "El modulo no existe en base de datos, backend ni frontend funcional.", "Decidir eventos, persistencia y si realmente entra antes de integraciones externas."],
            ["Integraciones externas", "No hay servicios para FareHarbor, GetYourGuide o WhatsApp Business.", "Esperar documentacion, credenciales y alcance tecnico antes de implementar."],
            ["Dashboard real", "Metricas principales aun son placeholders.", "Definir indicadores utiles para operacion diaria."],
            ["Pruebas automatizadas", "No hay script npm test ni suites visibles.", "Agregar pruebas de servicios criticos: auth, roles, reservaciones, capacidad y usuarios."],
            ["Migraciones", "Existen SQL manuales, no runner de migraciones.", "Decidir si se mantiene manual o se crea un flujo controlado sin ORM."],
            ["Empaquetado final", "Electron Builder esta preparado, pero requiere politica de config.env y despliegue PostgreSQL.", "Definir instalacion, ubicacion de BD y soporte por equipo."],
            ["Persistencia de sesion", "Token en memoria mejora simplicidad pero se pierde al recargar.", "Decidir si basta para escritorio local o si se requiere sesion persistente segura."],
        ],
        [Inches(1.75), Inches(3.0), Inches(2.25)],
    )

    add_heading(doc, "Decisiones Arquitectonicas Vigentes", 1)
    add_numbered(
        doc,
        [
            "La aplicacion conserva Electron como contenedor de escritorio.",
            "El frontend se mantiene en HTML, CSS y JavaScript sin framework.",
            "El backend se mantiene en Node.js Express con API REST bajo /api.",
            "PostgreSQL se mantiene como base de datos y pg como cliente de acceso.",
            "No se usa ORM.",
            "La comunicacion de datos pasa por backend; frontend y Electron no acceden directamente a PostgreSQL.",
            "Los permisos se validan en backend segun rol.",
            "Las operaciones relevantes de reservaciones se auditan en bitacora.",
            "Las integraciones externas siguen pendientes hasta tener documentacion y acceso autorizado.",
            "El empaquetado Windows esta preparado con Electron Builder, pero la estrategia operativa final aun debe cerrarse.",
        ]
    )

    add_heading(doc, "Recomendacion para las Siguientes Decisiones", 1)
    add_para(
        doc,
        "Para avanzar con menor riesgo conviene decidir primero si el sistema se usara como escritorio local en una sola maquina o si varias terminales "
        "compartiran una base PostgreSQL comun. Esa decision afecta autenticacion, instalacion, red local, respaldo de base de datos, soporte y seguridad."
    )
    add_para(
        doc,
        "Despues de eso, el siguiente bloque tecnico natural es completar la interfaz de Reservaciones usando la API existente, porque desbloquea la captura "
        "manual, edicion y cancelacion operativa desde la aplicacion, y tambien alimenta Daily, historial y bitacora."
    )
    add_para(
        doc,
        "Las integraciones externas deberian mantenerse fuera del codigo hasta contar con credenciales, contratos de API y reglas claras de sincronizacion. "
        "La arquitectura ya tiene una base adecuada para agregarlas como servicios separados cuando esa informacion exista."
    )

    doc.save(OUTPUT)
    return OUTPUT


if __name__ == "__main__":
    output_path = build_document()
    print(output_path)
