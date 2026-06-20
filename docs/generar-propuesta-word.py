"""
Genera PROPUESTA-ALCALDIA.docx — propuesta profesional extensa para la Alcaldía.
Uso: python generar-propuesta-word.py
"""

import os

from docx import Document
from docx.shared import Pt, Cm, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.enum.table import WD_TABLE_ALIGNMENT, WD_ALIGN_VERTICAL
from docx.oxml.ns import qn
from docx.oxml import OxmlElement

# ── Tasa de cambio de referencia ──────────────────────────────────────────────
# 1 USD ~ $4.200 COP (junio 2026, referencia estimada)

# ── Colores corporativos ──────────────────────────────────────────────────────
AZUL_OSCURO = RGBColor(0x1B, 0x4F, 0x8A)
AZUL_CLARO  = RGBColor(0x4B, 0xA9, 0xD8)
GRIS_FILA   = RGBColor(0xE8, 0xF0, 0xF7)
GRIS_FILA2  = RGBColor(0xF5, 0xF5, 0xF5)
BLANCO      = RGBColor(0xFF, 0xFF, 0xFF)
NEGRO       = RGBColor(0x1A, 0x1A, 0x2E)
GRIS_TEXTO  = RGBColor(0x55, 0x55, 0x55)
VERDE       = RGBColor(0x15, 0x80, 0x3D)


# ── Helpers ───────────────────────────────────────────────────────────────────

def set_cell_bg(cell, color):
    tc = cell._tc
    tcPr = tc.get_or_add_tcPr()
    shd = OxmlElement("w:shd")
    shd.set(qn("w:val"), "clear")
    shd.set(qn("w:color"), "auto")
    shd.set(qn("w:fill"), f"{color[0]:02X}{color[1]:02X}{color[2]:02X}")
    tcPr.append(shd)


def set_cell_borders(cell, color="BBCCE4"):
    tc = cell._tc
    tcPr = tc.get_or_add_tcPr()
    tcBorders = OxmlElement("w:tcBorders")
    for side in ("top", "left", "bottom", "right"):
        b = OxmlElement(f"w:{side}")
        b.set(qn("w:val"), "single")
        b.set(qn("w:sz"), "4")
        b.set(qn("w:space"), "0")
        b.set(qn("w:color"), color)
        tcBorders.append(b)
    tcPr.append(tcBorders)


def add_heading1(doc, text):
    h = doc.add_heading(level=1)
    h.clear()
    run = h.add_run(text)
    run.font.color.rgb = AZUL_OSCURO
    run.font.size = Pt(14)
    run.bold = True
    run.font.name = "Calibri"
    h.paragraph_format.space_before = Pt(20)
    h.paragraph_format.space_after = Pt(6)
    # Borde inferior decorativo
    pPr = h._p.get_or_add_pPr()
    pBdr = OxmlElement("w:pBdr")
    bottom = OxmlElement("w:bottom")
    bottom.set(qn("w:val"), "single")
    bottom.set(qn("w:sz"), "6")
    bottom.set(qn("w:space"), "1")
    bottom.set(qn("w:color"), "4BA9D8")
    pBdr.append(bottom)
    pPr.append(pBdr)
    return h


def add_heading2(doc, text):
    h = doc.add_heading(level=2)
    h.clear()
    run = h.add_run(text)
    run.font.color.rgb = AZUL_OSCURO
    run.font.size = Pt(12)
    run.bold = True
    run.font.name = "Calibri"
    h.paragraph_format.space_before = Pt(14)
    h.paragraph_format.space_after = Pt(4)
    return h


def add_heading3(doc, text):
    h = doc.add_heading(level=3)
    h.clear()
    run = h.add_run(text)
    run.font.color.rgb = AZUL_CLARO
    run.font.size = Pt(11)
    run.bold = True
    run.font.name = "Calibri"
    h.paragraph_format.space_before = Pt(10)
    h.paragraph_format.space_after = Pt(3)
    return h


def add_body(doc, text, bold_parts=None, space_after=6):
    p = doc.add_paragraph()
    p.paragraph_format.space_after = Pt(space_after)
    p.paragraph_format.space_before = Pt(2)

    def _run(para, t, bold=False):
        r = para.add_run(t)
        r.bold = bold
        r.font.name = "Calibri"
        r.font.size = Pt(11)
        r.font.color.rgb = NEGRO

    if bold_parts:
        remaining = text
        for bp in bold_parts:
            idx = remaining.find(bp)
            if idx == -1:
                continue
            if idx > 0:
                _run(p, remaining[:idx])
            _run(p, bp, bold=True)
            remaining = remaining[idx + len(bp):]
        if remaining:
            _run(p, remaining)
    else:
        _run(p, text)
    return p


def add_bullet(doc, text, bold_prefix=None, level=0):
    p = doc.add_paragraph(style="List Bullet")
    p.paragraph_format.space_after = Pt(3)
    p.paragraph_format.left_indent = Cm(0.5 + level * 0.5)

    def _run(para, t, bold=False):
        r = para.add_run(t)
        r.bold = bold
        r.font.name = "Calibri"
        r.font.size = Pt(11)

    if bold_prefix:
        _run(p, bold_prefix, bold=True)
        _run(p, text[len(bold_prefix):])
    else:
        _run(p, text)
    return p


def add_numbered(doc, text, bold_prefix=None):
    p = doc.add_paragraph(style="List Number")
    p.paragraph_format.space_after = Pt(5)

    def _run(para, t, bold=False):
        r = para.add_run(t)
        r.bold = bold
        r.font.name = "Calibri"
        r.font.size = Pt(11)

    if bold_prefix:
        _run(p, bold_prefix, bold=True)
        _run(p, text[len(bold_prefix):])
    else:
        _run(p, text)
    return p


def add_note(doc, text):
    p = doc.add_paragraph()
    p.paragraph_format.left_indent = Cm(0.8)
    p.paragraph_format.right_indent = Cm(0.8)
    p.paragraph_format.space_after = Pt(8)
    p.paragraph_format.space_before = Pt(4)
    run = p.add_run(text)
    run.italic = True
    run.font.name = "Calibri"
    run.font.size = Pt(10)
    run.font.color.rgb = GRIS_TEXTO
    return p


def add_highlight_box(doc, title, body):
    """Cuadro destacado con borde izquierdo azul (simulado con tabla 1x1)."""
    t = doc.add_table(rows=1, cols=1)
    t.alignment = WD_TABLE_ALIGNMENT.CENTER
    cell = t.cell(0, 0)
    set_cell_bg(cell, GRIS_FILA)
    set_cell_borders(cell, "4BA9D8")
    cell.width = Cm(15)

    p1 = cell.add_paragraph()
    r1 = p1.add_run(title)
    r1.bold = True
    r1.font.name = "Calibri"
    r1.font.size = Pt(11)
    r1.font.color.rgb = AZUL_OSCURO

    p2 = cell.add_paragraph()
    r2 = p2.add_run(body)
    r2.font.name = "Calibri"
    r2.font.size = Pt(10)
    r2.font.color.rgb = NEGRO

    # quitar primer párrafo vacío de la celda
    cell.paragraphs[0]._element.getparent().remove(cell.paragraphs[0]._element)
    doc.add_paragraph()
    return t


def make_table(doc, headers, rows, col_widths=None, center_cols=None):
    center_cols = center_cols or []
    t = doc.add_table(rows=1 + len(rows), cols=len(headers))
    t.alignment = WD_TABLE_ALIGNMENT.CENTER
    t.style = "Table Grid"

    hdr = t.rows[0]
    for i, htext in enumerate(headers):
        cell = hdr.cells[i]
        set_cell_bg(cell, AZUL_OSCURO)
        set_cell_borders(cell, "1B4F8A")
        cell.vertical_alignment = WD_ALIGN_VERTICAL.CENTER
        p = cell.paragraphs[0]
        p.alignment = WD_ALIGN_PARAGRAPH.CENTER
        run = p.add_run(htext)
        run.bold = True
        run.font.color.rgb = BLANCO
        run.font.name = "Calibri"
        run.font.size = Pt(10)

    for r_idx, row_data in enumerate(rows):
        row = t.rows[r_idx + 1]
        bg = GRIS_FILA if r_idx % 2 == 0 else BLANCO
        for c_idx, ctext in enumerate(row_data):
            cell = row.cells[c_idx]
            set_cell_bg(cell, bg)
            set_cell_borders(cell)
            p = cell.paragraphs[0]
            p.alignment = (WD_ALIGN_PARAGRAPH.CENTER
                           if c_idx in center_cols
                           else WD_ALIGN_PARAGRAPH.LEFT)
            parts = ctext.split("**")
            for pi, part in enumerate(parts):
                r = p.add_run(part)
                r.bold = (pi % 2 == 1)
                r.font.name = "Calibri"
                r.font.size = Pt(10)

    if col_widths:
        for c_idx, w in enumerate(col_widths):
            for row in t.rows:
                row.cells[c_idx].width = Cm(w)

    doc.add_paragraph()
    return t


def add_footer(doc):
    footer = doc.sections[0].footer
    fp = footer.paragraphs[0]
    fp.alignment = WD_ALIGN_PARAGRAPH.CENTER
    run = fp.add_run(
        "TransPadilla  |  Sistema de Rastreo de Transporte Publico  |  "
        "Riohacha, La Guajira  |  Documento Confidencial"
    )
    run.font.name = "Calibri"
    run.font.size = Pt(9)
    run.font.color.rgb = GRIS_TEXTO


def spacer(doc, n=1):
    for _ in range(n):
        p = doc.add_paragraph()
        p.paragraph_format.space_after = Pt(0)
        p.paragraph_format.space_before = Pt(0)


# ── Construccion del documento ────────────────────────────────────────────────

def build():
    doc = Document()

    for section in doc.sections:
        section.top_margin    = Cm(2.5)
        section.bottom_margin = Cm(2.5)
        section.left_margin   = Cm(3.0)
        section.right_margin  = Cm(2.5)

    doc.styles["Normal"].font.name = "Calibri"
    doc.styles["Normal"].font.size = Pt(11)

    add_footer(doc)

    # ══════════════════════════════════════════════════════════════════════════
    # PORTADA
    # ══════════════════════════════════════════════════════════════════════════
    spacer(doc, 7)

    p = doc.add_paragraph()
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    r = p.add_run("TransPadilla")
    r.font.name = "Calibri"; r.font.size = Pt(44); r.bold = True
    r.font.color.rgb = AZUL_OSCURO

    p2 = doc.add_paragraph()
    p2.alignment = WD_ALIGN_PARAGRAPH.CENTER
    r2 = p2.add_run("Sistema de Rastreo de Transporte Publico en Tiempo Real")
    r2.font.name = "Calibri"; r2.font.size = Pt(16)
    r2.font.color.rgb = AZUL_CLARO

    spacer(doc, 1)

    p3 = doc.add_paragraph()
    p3.alignment = WD_ALIGN_PARAGRAPH.CENTER
    r3 = p3.add_run("Propuesta de Implementacion para la")
    r3.font.name = "Calibri"; r3.font.size = Pt(13); r3.bold = True
    r3.font.color.rgb = NEGRO

    p4 = doc.add_paragraph()
    p4.alignment = WD_ALIGN_PARAGRAPH.CENTER
    r4 = p4.add_run("Alcaldia de Riohacha, La Guajira")
    r4.font.name = "Calibri"; r4.font.size = Pt(15); r4.bold = True
    r4.font.color.rgb = AZUL_OSCURO

    spacer(doc, 2)

    lp = doc.add_paragraph()
    lp.alignment = WD_ALIGN_PARAGRAPH.CENTER
    rl = lp.add_run("_" * 60)
    rl.font.color.rgb = AZUL_CLARO; rl.font.size = Pt(11)

    spacer(doc, 1)

    p5 = doc.add_paragraph()
    p5.alignment = WD_ALIGN_PARAGRAPH.CENTER
    r5 = p5.add_run("Riohacha, La Guajira  |  Junio de 2026")
    r5.font.name = "Calibri"; r5.font.size = Pt(11)
    r5.font.color.rgb = GRIS_TEXTO

    p6 = doc.add_paragraph()
    p6.alignment = WD_ALIGN_PARAGRAPH.CENTER
    r6 = p6.add_run("Contacto: wa.me/573144167656  |  @transpadilla.co")
    r6.font.name = "Calibri"; r6.font.size = Pt(10)
    r6.font.color.rgb = AZUL_CLARO

    doc.add_page_break()

    # ══════════════════════════════════════════════════════════════════════════
    # TABLA DE CONTENIDO (manual, aspecto institucional)
    # ══════════════════════════════════════════════════════════════════════════
    add_heading1(doc, "Contenido")
    toc_items = [
        ("1.", "Resumen Ejecutivo"),
        ("2.", "El Problema: El Transporte Publico de Riohacha Hoy"),
        ("3.", "La Solucion: Que es TransPadilla"),
        ("4.", "Funcionalidades del Sistema"),
        ("5.", "Beneficios por Actor"),
        ("6.", "Estado Actual del Sistema"),
        ("7.", "Lo que Requiere Financiamiento (Operacion 24/7)"),
        ("8.", "Presupuesto Consolidado en Pesos Colombianos"),
        ("9.", "Plan de Implementacion"),
        ("10.", "Riesgos y Mitigaciones"),
        ("11.", "Proximos Pasos"),
        ("12.", "Conclusion"),
    ]
    for num, title in toc_items:
        p = doc.add_paragraph()
        p.paragraph_format.space_after = Pt(3)
        r1 = p.add_run(f"{num}  ")
        r1.bold = True; r1.font.name = "Calibri"; r1.font.size = Pt(11)
        r1.font.color.rgb = AZUL_OSCURO
        r2 = p.add_run(title)
        r2.font.name = "Calibri"; r2.font.size = Pt(11)

    doc.add_page_break()

    # ══════════════════════════════════════════════════════════════════════════
    # 1. RESUMEN EJECUTIVO
    # ══════════════════════════════════════════════════════════════════════════
    add_heading1(doc, "1. Resumen Ejecutivo")

    add_body(doc,
        "TransPadilla es un sistema digital de rastreo de transporte publico en tiempo "
        "real, desarrollado especificamente para la ciudad de Riohacha, La Guajira. "
        "Permite a los ciudadanos saber en vivo donde estan los buses, cuanto tardan "
        "en llegar a cada parada y en que estado se encuentra el trafico de la ciudad. "
        "A su vez, permite a la Alcaldia supervisar la operacion de la flota de manera "
        "centralizada, transparente y sin necesidad de radio o llamadas.",
        bold_parts=["rastreo de transporte publico en tiempo real",
                    "supervisar la operacion de la flota"]
    )

    add_body(doc,
        "El sistema ya fue construido, probado y esta en linea en una version de "
        "demostracion accesible desde cualquier celular o computador con internet. "
        "No se trata de un proyecto en papel: es un producto funcionando.",
        bold_parts=["ya fue construido, probado y esta en linea",
                    "es un producto funcionando"]
    )

    add_body(doc,
        "Para convertirlo en un servicio publico operativo las 24 horas del dia, "
        "los 7 dias de la semana, se requiere una inversion en infraestructura y operacion "
        "que se detalla en este documento. La inversion es modesta comparada con los "
        "beneficios institucionales y para la ciudadania.",
        bold_parts=["24 horas del dia, los 7 dias de la semana"]
    )

    add_highlight_box(doc,
        "Cifra clave:",
        "Con menos de $250.000 COP al mes en infraestructura, la Alcaldia puede tener "
        "un sistema de monitoreo de transporte publico operando en tiempo real, accesible "
        "desde cualquier dispositivo, sin instalar nada. Mas barato que un operador "
        "de radio al mes."
    )

    # ══════════════════════════════════════════════════════════════════════════
    # 2. EL PROBLEMA
    # ══════════════════════════════════════════════════════════════════════════
    add_heading1(doc, "2. El Problema: El Transporte Publico de Riohacha Hoy")

    add_body(doc,
        "El servicio de transporte publico urbano de Riohacha enfrenta varios problemas "
        "que afectan tanto a los usuarios como a la empresa operadora y a la administracion "
        "municipal:"
    )

    problemas = [
        ("Sin informacion para el pasajero: ",
         "Los ciudadanos no saben cuanto tiempo falta para que llegue el bus a su parada. "
         "Esto genera esperas innecesarias, incomodidad y desincentiva el uso del transporte "
         "publico formal."),
        ("Sin visibilidad de la flota: ",
         "La empresa y la Alcaldia no tienen forma de saber en tiempo real donde esta "
         "cada bus, si esta operando, si hay un accidente o si un conductor abandono la ruta."),
        ("Comunicacion ineficiente: ",
         "Los conductores reportan novedades por radio o telefono, lo que es lento, "
         "costoso y no queda registrado de forma sistematica."),
        ("Sin datos para la gestion: ",
         "Sin registros historicos de recorridos, velocidades ni ocupacion, es imposible "
         "tomar decisiones basadas en datos sobre frecuencias, rutas o recursos."),
        ("Imagen institucional: ",
         "La ausencia de tecnologia en el transporte publico afecta la percepcion ciudadana "
         "sobre la modernizacion de la ciudad."),
    ]

    for prefix, rest in problemas:
        add_bullet(doc, prefix + rest, bold_prefix=prefix)

    # ══════════════════════════════════════════════════════════════════════════
    # 3. LA SOLUCION
    # ══════════════════════════════════════════════════════════════════════════
    add_heading1(doc, "3. La Solucion: Que es TransPadilla")

    add_body(doc,
        "TransPadilla es una plataforma web y movil que conecta en tiempo real a "
        "tres actores del sistema de transporte: el pasajero, el conductor y el "
        "administrador. Cada uno accede a su propia interfaz desde cualquier "
        "celular o computador, sin necesidad de instalar ninguna aplicacion."
    )

    add_body(doc,
        "El sistema opera sobre internet y utiliza tecnologia de mapa interactivo "
        "(similar a Google Maps) para mostrar la posicion exacta de cada bus mientras "
        "se mueve por la ciudad. Las actualizaciones de posicion se reciben en "
        "tiempo real, con menos de un segundo de retraso.",
        bold_parts=["tiempo real, con menos de un segundo de retraso"]
    )

    # Tabla de actores
    make_table(doc,
        ["Actor", "Como accede", "Que puede hacer"],
        [
            ["Pasajero\n(ciudadano)",
             "Abre el navegador del celular o PC. No requiere cuenta ni registro.",
             "Ver buses en el mapa en tiempo real, consultar rutas y paradas, "
             "estimar tiempo de llegada, ver ocupacion del bus, contacto WhatsApp."],
            ["Conductor",
             "Inicia sesion con su cuenta en el celular. La Alcaldia le asigna su bus.",
             "Iniciar y finalizar su recorrido, transmitir su GPS en vivo, reportar "
             "novedades (accidente, desvio, demora), informar la ocupacion del bus."],
            ["Administrador\n(Alcaldia / empresa)",
             "Inicia sesion con cuenta de administrador desde cualquier dispositivo.",
             "Gestionar rutas, paradas y buses; asignar conductores; monitorear el "
             "trafico de la ciudad en tiempo real con colores (verde/amarillo/rojo)."],
        ],
        col_widths=[3.5, 4, 10]
    )

    # ══════════════════════════════════════════════════════════════════════════
    # 4. FUNCIONALIDADES
    # ══════════════════════════════════════════════════════════════════════════
    add_heading1(doc, "4. Funcionalidades del Sistema")

    add_heading2(doc, "4.1 Vista del Pasajero (publica, sin registro)")
    funciones_pasajero = [
        ("Mapa en tiempo real: ",
         "posicion de todos los buses activos sobre el mapa de Riohacha, actualizado "
         "cada segundo."),
        ("Rutas y paradas: ",
         "las rutas aparecen trazadas sobre las calles reales; el pasajero puede "
         "seleccionar una ruta para ver solo esos buses y sus paradas."),
        ("Tiempo de llegada estimado (ETA): ",
         "calculado automaticamente con la posicion real del bus y la velocidad actual."),
        ("Ocupacion del bus: ",
         "indicador visual de si el bus esta vacio, medio o lleno, reportado por "
         "el conductor en tiempo real."),
        ("Novedades en vivo: ",
         "si el conductor reporta un accidente o desvio, el pasajero lo ve "
         "instantaneamente en el mapa."),
        ("Rutas favoritas: ",
         "el pasajero puede marcar rutas favoritas para encontrarlas rapidamente."),
        ("Seguir mi bus: ",
         "el mapa sigue automaticamente al bus seleccionado mientras se mueve."),
        ("Contacto WhatsApp: ",
         "boton directo al canal de atencion al cliente de TransPadilla."),
    ]
    for prefix, rest in funciones_pasajero:
        add_bullet(doc, prefix + rest, bold_prefix=prefix)

    add_heading2(doc, "4.2 Panel del Conductor")
    funciones_conductor = [
        ("Inicio de recorrido: ",
         "con un solo boton el conductor activa la transmision GPS y el bus aparece "
         "en el mapa de todos los pasajeros."),
        ("GPS automatico: ",
         "la ubicacion se transmite automaticamente cada pocos segundos. La pantalla "
         "se mantiene encendida durante el recorrido (tecnologia Wake Lock)."),
        ("Reporte de novedades: ",
         "accidente, desvio de ruta, demora o problema con el vehiculo, con un toque."),
        ("Reporte de ocupacion: ",
         "el conductor indica si el bus va vacio, medio o lleno, para que los pasajeros "
         "lo vean en tiempo real."),
        ("Finalizacion segura: ",
         "confirmacion antes de finalizar el recorrido para evitar cierres accidentales."),
    ]
    for prefix, rest in funciones_conductor:
        add_bullet(doc, prefix + rest, bold_prefix=prefix)

    add_heading2(doc, "4.3 Panel de Administracion (Alcaldia)")
    funciones_admin = [
        ("Gestion de rutas: ",
         "crear, renombrar y eliminar rutas; agregar o quitar paradas de cada ruta."),
        ("Gestion de buses y conductores: ",
         "registrar buses, asignar cada bus a un conductor, gestionar cuentas."),
        ("Mapa de trafico en tiempo real: ",
         "visualizacion tipo semaforo (verde = fluido, amarillo = lento, rojo = detenido) "
         "calculada con la velocidad real de los buses en cada tramo de via."),
        ("Monitoreo de la flota: ",
         "ver en tiempo real cuantos buses estan activos, su posicion y estado."),
        ("Estadisticas basicas: ",
         "rutas activas, buses en operacion y paradas registradas en el tablero."),
    ]
    for prefix, rest in funciones_admin:
        add_bullet(doc, prefix + rest, bold_prefix=prefix)

    # ══════════════════════════════════════════════════════════════════════════
    # 5. BENEFICIOS POR ACTOR
    # ══════════════════════════════════════════════════════════════════════════
    add_heading1(doc, "5. Beneficios por Actor")

    make_table(doc,
        ["Actor", "Beneficio", "Impacto esperado"],
        [
            ["Ciudadano / Pasajero",
             "Sabe donde esta el bus y cuanto falta; no pierde tiempo esperando a ciegas.",
             "Mayor satisfaccion con el servicio publico; mas uso del transporte formal."],
            ["Conductor",
             "Comunica novedades con un toque; no tiene que usar radio ni llamar.",
             "Menos friccion operativa; su trabajo queda registrado automaticamente."],
            ["Alcaldia / Empresa",
             "Visibilidad total de la flota en tiempo real; datos para decision y planeacion.",
             "Mejor supervision sin costo de personal adicional; imagen de ciudad moderna."],
            ["Ciudad de Riohacha",
             "Primer sistema publico de rastreo de transporte en la region.",
             "Diferenciacion institucional; atraccion de inversion y turismo."],
        ],
        col_widths=[4, 6.5, 7]
    )

    # ══════════════════════════════════════════════════════════════════════════
    # 6. ESTADO ACTUAL
    # ══════════════════════════════════════════════════════════════════════════
    add_heading1(doc, "6. Estado Actual del Sistema")

    add_body(doc,
        "TransPadilla no es un prototipo ni un modelo en papel. Es un sistema "
        "completamente funcional, desplegado en internet y accesible ahora mismo "
        "desde cualquier dispositivo. A continuacion se describe lo que ya existe:"
    )

    make_table(doc,
        ["Componente", "Estado", "Descripcion"],
        [
            ["Aplicacion web (frontend)",
             "**Listo y en linea**",
             "Interfaz para pasajero, conductor y administrador. Funciona en celular "
             "y computador sin instalar nada."],
            ["Servidor API (backend)",
             "**Listo y en linea**",
             "Motor del sistema: gestiona usuarios, rutas, buses, GPS en tiempo real "
             "(WebSockets) y seguridad."],
            ["Base de datos",
             "**Lista y activa**",
             "PostgreSQL con todas las tablas del sistema (usuarios, rutas, paradas, "
             "buses, posiciones GPS)."],
            ["Microservicio de trafico",
             "**Listo y en linea**",
             "Modulo Python/Django que clasifica cada tramo de via segun la velocidad "
             "real de los buses y calcula tiempos de llegada."],
            ["Seguridad de produccion",
             "**Implementada**",
             "Cabeceras de seguridad, autenticacion con tokens JWT, limite de intentos "
             "de login, validacion de datos de entrada."],
            ["Despliegue en internet",
             "**Activo**",
             "Sistema accesible en: transpadilla-web.onrender.com (plan gratuito de "
             "demostracion; se apaga por inactividad)."],
            ["App nativa Android (conductor)",
             "**Base lista**",
             "Configuracion base de Capacitor preparada para generar el APK del "
             "conductor si la Alcaldia lo requiere."],
        ],
        col_widths=[4.5, 3.5, 9.5]
    )

    add_note(doc,
        "La version de demostracion usa infraestructura gratuita que se 'duerme' "
        "tras minutos de inactividad. Esto es normal en planes gratuitos y no "
        "refleja el comportamiento del sistema en produccion con infraestructura pagada."
    )

    # ══════════════════════════════════════════════════════════════════════════
    # 7. INVERSION REQUERIDA
    # ══════════════════════════════════════════════════════════════════════════
    add_heading1(doc, "7. Lo que Requiere Financiamiento para Operacion 24/7")

    add_body(doc,
        "El sistema ya esta construido. Lo que se requiere financiar es la "
        "operacion continua: el servidor que lo mantiene vivo, los GPS de los "
        "buses y el soporte tecnico para corregir cualquier falla rapidamente. "
        "A continuacion se describen en detalle cada rubro.",
        bold_parts=["ya esta construido", "operacion continua"]
    )

    # 7.1
    add_heading2(doc, "7.1 Infraestructura (Hospedaje del Sistema) — Obligatorio")
    add_body(doc,
        "El sistema necesita un servidor en internet que este encendido las 24 horas. "
        "Existen dos alternativas segun el presupuesto disponible:"
    )
    make_table(doc,
        ["Alternativa", "Descripcion tecnica", "Costo mensual (COP)", "Recomendado para"],
        [
            ["**Servidor VPS propio\n(recomendado)**",
             "Un servidor virtual (Hetzner / DigitalOcean). Incluye base de datos, "
             "sistema web y modulo de trafico. Administrado con Docker.",
             "**$25.000 – $63.000 / mes**",
             "Operacion institucional 24/7; maximo ahorro."],
            ["Render (servicios gestionados)",
             "Plataforma en la nube que administra los servidores automaticamente. "
             "Menos configuracion, mas costo.",
             "$84.000 – $210.000 / mes",
             "Si no se cuenta con soporte tecnico para administrar el VPS."],
        ],
        col_widths=[4, 6.5, 4.5, 4]
    )
    add_note(doc,
        "Tasa de referencia utilizada: 1 USD = $4.200 COP (junio 2026). "
        "Los precios en pesos pueden variar con la tasa de cambio."
    )

    # 7.2
    add_heading2(doc, "7.2 Dominio Propio y Correo Institucional — Recomendado")
    add_body(doc,
        "Para que el sistema tenga una direccion institucional "
        "(ej. transpadilla.riohacha.gov.co) se requiere contratar un dominio. "
        "Esto refuerza la imagen oficial del servicio."
    )
    make_table(doc,
        ["Item", "Descripcion", "Costo anual (COP)"],
        [
            ["Dominio .gov.co", "Gestionado por el MinTIC; requiere ser entidad publica.", "$42.000 – $168.000 / ano"],
            ["Dominio .co / .com", "Alternativa rapida si el .gov.co tiene tramites.", "$42.000 – $100.000 / ano"],
        ],
        col_widths=[4, 8.5, 5]
    )

    # 7.3
    add_heading2(doc, "7.3 Mapas con Garantia de Servicio — Recomendado")
    add_body(doc,
        "El mapa actual usa servidores publicos de OpenStreetMap que no tienen "
        "garantia de disponibilidad para uso institucional intensivo. Para produccion "
        "se recomienda contratar un proveedor con SLA (acuerdo de nivel de servicio):"
    )
    make_table(doc,
        ["Proveedor de mapas", "Capa gratuita incluida", "Costo mensual si se supera (COP)"],
        [
            ["MapTiler", "Hasta 100.000 vistas/mes gratis", "$0 – $210.000 / mes"],
            ["Mapbox", "Hasta 50.000 vistas/mes gratis", "$0 – $210.000 / mes"],
            ["OSRM propio (calculo de rutas)", "Incluido en el VPS (sin costo adicional)", "**$0**"],
        ],
        col_widths=[5, 6, 6.5]
    )
    add_note(doc,
        "Para una flota de 20 buses con trafico moderado de pasajeros, es probable "
        "que la capa gratuita de MapTiler sea suficiente durante los primeros meses. "
        "El costo de mapas solo aumenta si el sistema tiene alto trafico de usuarios."
    )

    # 7.4
    add_heading2(doc, "7.4 GPS de los Buses — El Rubro Principal")
    add_body(doc,
        "Esta es la decision mas importante del presupuesto. Define como cada bus "
        "reporta su posicion. Existen tres alternativas de menor a mayor confiabilidad:",
        bold_parts=["decision mas importante del presupuesto"]
    )

    add_heading3(doc, "Opcion A — Aplicacion Web con Pantalla Activa (ya implementado, sin costo adicional)")
    add_body(doc,
        "El conductor usa el celular con la app de TransPadilla abierta durante todo "
        "el recorrido. Ya se implemento tecnologia Wake Lock para que la pantalla no "
        "se apague. Costo de tecnologia: $0. Solo se requiere un celular por conductor "
        "y un plan de datos."
    )
    make_table(doc,
        ["Concepto", "Estimado mensual por bus (COP)"],
        [
            ["Plan de datos movil (minimo)", "$20.000 – $35.000"],
            ["Celular (si el conductor no tiene)", "$0 (asumiendo que ya tienen)"],
            ["Costo tecnologico adicional", "**$0**"],
        ],
        col_widths=[10, 7.5]
    )

    add_heading3(doc, "Opcion B — App Nativa Android (GPS en segundo plano)")
    add_body(doc,
        "Se genera un APK (aplicacion Android) de TransPadilla que puede transmitir "
        "el GPS incluso con la pantalla apagada. La base tecnica ya esta preparada "
        "(Capacitor). Requiere un desarrollo adicional puntual y la cuenta de "
        "Google Play para publicar."
    )
    make_table(doc,
        ["Concepto", "Costo estimado (COP)"],
        [
            ["Cuenta de desarrollador Google Play (pago unico)", "~$105.000 (una vez)"],
            ["Plugin de GPS en segundo plano (opcional, confiabilidad profesional)", "~$1.260.000 (una vez)"],
            ["Plan de datos por conductor / mes", "$20.000 – $35.000"],
        ],
        col_widths=[10, 7.5]
    )

    add_heading3(doc, "Opcion C — Rastreador GPS Dedicado (recomendado para flota institucional)")
    add_body(doc,
        "Dispositivo fisico que se instala en el bus y transmite la posicion "
        "automaticamente por SIM, sin depender del celular del conductor. "
        "Es la opcion mas confiable para uso 24/7: opera aunque el conductor "
        "no tenga celular, aunque lo apague o aunque salga del bus.",
        bold_parts=["mas confiable para uso 24/7"]
    )
    make_table(doc,
        ["Concepto", "Costo por bus (COP)"],
        [
            ["Equipo rastreador GPS (pago unico por bus)", "$126.000 – $336.000"],
            ["SIM con plan de datos (mensual)", "$12.600 – $33.600 / mes"],
            ["Instalacion en el vehiculo", "$0 (conecta al conector OBD o bateria)"],
        ],
        col_widths=[10, 7.5]
    )
    add_note(doc,
        "Ejemplo para una flota de 20 buses con rastreadores dedicados: "
        "inversion inicial $2.520.000 – $6.720.000 COP (una vez) + "
        "costo mensual $252.000 – $672.000 COP / mes en datos. "
        "Los rastreadores se consiguen en Colombia en tiendas de electronica "
        "y plataformas como MercadoLibre."
    )

    # Comparativo GPS
    add_heading2(doc, "Comparativo de opciones GPS")
    make_table(doc,
        ["Opcion", "Confiabilidad", "Inversion inicial", "Mensual / bus", "Depende del conductor"],
        [
            ["A) Web + Wake Lock\n(ya implementado)",
             "Media\n(pantalla activa)",
             "$0 en tecnologia",
             "$20.000–$35.000\n(datos)",
             "Si (app abierta)"],
            ["B) App nativa Android\n(Capacitor)",
             "Alta\n(pantalla apagada)",
             "~$1.365.000\n(una vez)",
             "$20.000–$35.000\n(datos)",
             "Si (lleva el celular)"],
            ["**C) Rastreador GPS\n(recomendado)**",
             "**Maxima**\n(autonomo)",
             "$126.000–$336.000\npor bus",
             "**$12.600–$33.600**\n(SIM datos)",
             "**No** (autonomo)"],
        ],
        col_widths=[4.5, 3, 4, 3.5, 3.5]
    )

    # 7.5
    add_heading2(doc, "7.5 Monitoreo y Confiabilidad Operativa")
    add_body(doc,
        "Para garantizar que el sistema este disponible las 24 horas y que los "
        "fallos se detecten y corrijan rapido, se recomiendan las siguientes herramientas:"
    )
    make_table(doc,
        ["Herramienta", "Para que sirve", "Costo mensual (COP)"],
        [
            ["UptimeRobot (monitoreo)", "Alerta por WhatsApp/correo si el sistema cae", "$0 – $42.000"],
            ["Sentry (rastreo de errores)", "Detecta y notifica errores tecnicos en tiempo real", "$0 – $109.200"],
            ["Respaldos de base de datos", "Copia diaria automatica de toda la informacion", "Incluido en VPS"],
            ["Certificado HTTPS (SSL)", "Cifrado y seguridad para los usuarios (obligatorio)", "$0 (automatico con Caddy)"],
        ],
        col_widths=[4.5, 8, 5]
    )

    # 7.6
    add_heading2(doc, "7.6 Mantenimiento y Soporte Tecnico — Clave para 'Sin Errores'")
    add_body(doc,
        "Ningun sistema tecnologico opera sin mantenimiento. El soporte tecnico es "
        "lo que garantiza que ante una falla el sistema vuelva a funcionar rapidamente, "
        "que las actualizaciones de seguridad se apliquen y que el sistema se adapte "
        "a los cambios de la operacion (nuevas rutas, mas buses, etc.).",
        bold_parts=["soporte tecnico es lo que garantiza"]
    )
    make_table(doc,
        ["Modalidad de soporte", "Descripcion", "Costo estimado (COP)"],
        [
            ["Contrato mensual de soporte",
             "Disponibilidad para resolver incidencias, actualizaciones y ajustes menores.",
             "$400.000 – $1.200.000 / mes"],
            ["Horas de desarrollo (bajo demanda)",
             "Para nuevas funcionalidades, integraciones o cambios mayores.",
             "$60.000 – $120.000 / hora"],
        ],
        col_widths=[5, 8, 5]
    )
    add_note(doc,
        "El costo de soporte es el que mas impacta la calidad del servicio a largo plazo. "
        "Un sistema sin soporte se deteriora con el tiempo. Se recomienda incluirlo "
        "en el presupuesto desde el inicio."
    )

    # ══════════════════════════════════════════════════════════════════════════
    # 8. PRESUPUESTO CONSOLIDADO
    # ══════════════════════════════════════════════════════════════════════════
    add_heading1(doc, "8. Presupuesto Consolidado en Pesos Colombianos")

    add_heading2(doc, "8.1 Costos de Puesta en Marcha (pago unico)")
    make_table(doc,
        ["Concepto", "Estimado (COP)", "Prioridad"],
        [
            ["Dominio (.gov.co o .co, primer ano)", "$42.000 – $168.000", "Recomendado"],
            ["Rastreadores GPS (por bus, si se elige opcion C)", "$126.000 – $336.000 c/u", "Opcional"],
            ["Plugin GPS en segundo plano (si se elige opcion B)", "~$1.260.000 (una vez)", "Opcional"],
            ["Cuenta Google Play (si se elige opcion B)", "~$105.000 (una vez)", "Opcional"],
            ["Configuracion inicial y puesta en marcha", "A acordar con el proveedor", "Obligatorio"],
        ],
        col_widths=[8, 5, 4.5]
    )

    add_heading2(doc, "8.2 Costos Recurrentes Mensuales — Escenario Economico (VPS)")
    make_table(doc,
        ["Concepto", "Estimado mensual (COP)", "Notas"],
        [
            ["Hospedaje VPS", "$25.000 – $63.000", "Incluye DB + Django + Web"],
            ["Mapas con SLA (opcional)", "$0 – $210.000", "Depende del trafico de usuarios"],
            ["Monitoreo + errores", "$0 – $151.200", "UptimeRobot + Sentry"],
            ["Plan de datos GPS por bus (opcion A o B)", "$20.000 – $35.000 x N buses", "Por cada bus activo"],
            ["SIM datos rastreador (opcion C)", "$12.600 – $33.600 x N buses", "Por cada bus activo"],
            ["Dominio (prorrateado mensual)", "~$3.500 – $14.000", "Si se tiene dominio propio"],
            ["**Nucleo sin GPS ni soporte**", "**$25.000 – $250.000 / mes**", "Segun opciones elegidas"],
        ],
        col_widths=[6.5, 5.5, 5.5]
    )

    add_heading2(doc, "8.3 Escenarios de Costo Total Mensual (flota de 20 buses)")
    make_table(doc,
        ["Escenario", "Hospedaje", "GPS (20 buses)", "Monitoreo", "Total / mes (COP)"],
        [
            ["**Minimo** (VPS + celular conductor)",
             "$25.000", "$400.000–$700.000", "$0", "**$425.000–$725.000**"],
            ["**Medio** (VPS + rastreadores + monitoreo)",
             "$63.000", "$252.000–$672.000", "$109.200", "**$424.200–$844.200**"],
            ["**Completo** (Render + rastreadores + todo)",
             "$210.000", "$252.000–$672.000", "$151.200", "**$613.200–$1.033.200**"],
        ],
        col_widths=[5, 3.5, 4.5, 3.5, 5]
    )
    add_note(doc,
        "Estos estimados NO incluyen el soporte tecnico mensual (ver seccion 7.6), "
        "que se acuerda por separado segun el nivel de servicio requerido. "
        "Tasa de cambio de referencia: 1 USD = $4.200 COP."
    )

    # ══════════════════════════════════════════════════════════════════════════
    # 9. PLAN DE IMPLEMENTACION
    # ══════════════════════════════════════════════════════════════════════════
    add_heading1(doc, "9. Plan de Implementacion Sugerido")

    fases = [
        ("Fase 1 — Puesta en marcha (semanas 1–2): ",
         "contratar servidor VPS y dominio, desplegar el sistema en produccion, "
         "activar HTTPS, respaldos automaticos y monitoreo de disponibilidad. "
         "Cargar las rutas y paradas reales de Riohacha. Crear las cuentas de "
         "administrador y conductores. Verificar el sistema completo."),
        ("Fase 2 — Piloto con 2 a 4 buses (semanas 3–6): ",
         "equipar las primeras unidades con GPS (celular o rastreador segun presupuesto). "
         "Capacitar a los conductores del piloto. Validar el sistema en campo: "
         "GPS, mapa, novedades, ocupacion. Ajustar segun resultados del piloto."),
        ("Fase 3 — Escalado a la flota completa (mes 2–3): ",
         "equipar todos los buses, incorporar todos los conductores, finalizar "
         "la configuracion de rutas y paradas. Comunicar el servicio a la ciudadania "
         "de Riohacha (redes sociales, prensa, carteleria en paradas)."),
        ("Continuo — Operacion y mantenimiento: ",
         "monitoreo diario de disponibilidad, respaldos automaticos, soporte tecnico "
         "para incidencias, actualizaciones de seguridad y mejoras continuas segun "
         "la retroalimentacion de usuarios y conductores."),
    ]
    for prefix, rest in fases:
        add_numbered(doc, prefix + rest, bold_prefix=prefix)

    make_table(doc,
        ["Hito", "Semana estimada", "Responsable"],
        [
            ["Contratacion de infraestructura (VPS + dominio)", "Sem. 1", "Alcaldia"],
            ["Sistema en produccion con HTTPS y respaldos", "Sem. 1–2", "Equipo tecnico"],
            ["Carga de rutas y paradas reales de Riohacha", "Sem. 2", "Alcaldia + equipo"],
            ["Capacitacion de conductores piloto", "Sem. 3", "Equipo tecnico"],
            ["Inicio del piloto con 2–4 buses en campo", "Sem. 3–4", "Conductor + Alcaldia"],
            ["Evaluacion del piloto y ajustes", "Sem. 5–6", "Todos"],
            ["Lanzamiento a la flota completa", "Mes 2–3", "Alcaldia"],
            ["Comunicacion publica del servicio", "Mes 3", "Alcaldia"],
        ],
        col_widths=[8.5, 3.5, 5.5]
    )

    # ══════════════════════════════════════════════════════════════════════════
    # 10. RIESGOS Y MITIGACIONES
    # ══════════════════════════════════════════════════════════════════════════
    add_heading1(doc, "10. Riesgos y Mitigaciones")

    make_table(doc,
        ["Riesgo", "Probabilidad", "Impacto", "Mitigacion"],
        [
            ["El conductor no abre la app / apaga el celular",
             "Media", "Alto",
             "Capacitacion; en el mediano plazo, rastreadores GPS dedicados (Opcion C)."],
            ["Caida del servidor / falla tecnica",
             "Baja", "Alto",
             "Monitoreo 24/7 (UptimeRobot); respaldos diarios; contrato de soporte."],
            ["Problemas de conectividad en algunas zonas de Riohacha",
             "Media", "Medio",
             "El mapa del pasajero sigue mostrando la ultima posicion conocida del bus."],
            ["Cambio de proveedor de mapas / aumento de tarifa",
             "Baja", "Medio",
             "El sistema esta disenado para cambiar de proveedor de mapas sin "
             "reprogramar (solo configuracion)."],
            ["Actualizaciones de seguridad del sistema operativo / dependencias",
             "Alta (rutinaria)", "Bajo",
             "Contrato de soporte mensual incluye aplicacion de parches de seguridad."],
        ],
        col_widths=[5, 2.8, 2.5, 7.2]
    )

    # ══════════════════════════════════════════════════════════════════════════
    # 11. PROXIMOS PASOS
    # ══════════════════════════════════════════════════════════════════════════
    add_heading1(doc, "11. Proximos Pasos")

    add_body(doc,
        "Para avanzar con la implementacion de TransPadilla, se propone la "
        "siguiente secuencia de acciones inmediatas:"
    )

    pasos = [
        ("Demostracion en vivo: ",
         "agendar una sesion practica donde los funcionarios de la Alcaldia puedan "
         "ver el sistema funcionando desde cualquier celular, en tiempo real. "
         "Duracion estimada: 30 minutos."),
        ("Definicion de alcance inicial: ",
         "acordar cuantos buses entran al piloto, que opcion de GPS se utiliza "
         "y el nivel de soporte requerido."),
        ("Formalizacion del acuerdo: ",
         "convenio o contrato con el equipo de TransPadilla para la puesta en marcha "
         "y el soporte continuo."),
        ("Contratacion de infraestructura: ",
         "la Alcaldia (o el proveedor designado) contrata el servidor VPS y el dominio."),
        ("Inicio de la Fase 1: ",
         "despliegue en produccion y carga de rutas reales. En dos semanas el sistema "
         "esta operativo para el piloto."),
    ]
    for prefix, rest in pasos:
        add_numbered(doc, prefix + rest, bold_prefix=prefix)

    add_highlight_box(doc,
        "Para coordinar una demostracion o solicitar mas informacion:",
        "WhatsApp: +57 314 416 7656\n"
        "Instagram: @transpadilla.co\n"
        "Web: transpadilla-web.onrender.com"
    )

    # ══════════════════════════════════════════════════════════════════════════
    # 12. CONCLUSION
    # ══════════════════════════════════════════════════════════════════════════
    add_heading1(doc, "12. Conclusion")

    add_body(doc,
        "TransPadilla es la solucion que Riohacha necesita para modernizar su "
        "transporte publico: ya existe, ya funciona y puede estar en operacion "
        "institucional en menos de dos semanas.",
        bold_parts=["ya existe, ya funciona",
                    "en menos de dos semanas"]
    )

    add_body(doc,
        "La inversion requerida es modesta comparada con los beneficios: "
        "por menos de $250.000 COP al mes en infraestructura, la Alcaldia de "
        "Riohacha puede ofrecer a sus ciudadanos un servicio de informacion de "
        "transporte comparable al de las principales ciudades del pais, "
        "sin desarrollo desde cero ni contratos millonarios.",
        bold_parts=["menos de $250.000 COP al mes",
                    "sin desarrollo desde cero"]
    )

    add_body(doc,
        "El transporte publico es uno de los servicios que mas impacta la calidad "
        "de vida diaria de los ciudadanos. Dar informacion en tiempo real es el "
        "primer paso para mejorar ese servicio, y ese paso ya esta dado.",
        bold_parts=["informacion en tiempo real"]
    )

    spacer(doc, 2)

    firma = doc.add_paragraph()
    firma.alignment = WD_ALIGN_PARAGRAPH.CENTER
    r = firma.add_run("TransPadilla  |  Moviendo la Ciudad  |  Riohacha, La Guajira")
    r.font.name = "Calibri"; r.font.size = Pt(11)
    r.bold = True; r.font.color.rgb = AZUL_OSCURO

    # ── Guardar ───────────────────────────────────────────────────────────────
    # Guarda junto a este script (en docs/), sin importar desde dónde se ejecute.
    out = os.path.join(os.path.dirname(os.path.abspath(__file__)), "PROPUESTA-ALCALDIA.docx")
    doc.save(out)
    print(f"OK Documento generado: {out}")


if __name__ == "__main__":
    build()
