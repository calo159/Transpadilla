import { LegalPage, LegalH2, LegalP, LegalUl } from "@/components/LegalPage";
import { useDocumentTitle } from "@/hooks/use-document-title";
import { WHATSAPP_NUMERO, DPO_NOMBRE, DPO_EMAIL, DPO_TELEFONO } from "@/lib/constants";

export default function Privacidad() {
  useDocumentTitle("Política de Privacidad · TransPadilla");
  return (
    <LegalPage titulo="Política de Privacidad" actualizado="Junio de 2026">
      <LegalP>
        TransPadilla ("la plataforma") es un sistema de información de transporte público en
        tiempo real para el Distrito de Riohacha. Esta política explica qué datos tratamos,
        con qué fin y cuáles son tus derechos, conforme a la Ley 1581 de 2012 y el Decreto
        1377 de 2013 de Colombia (protección de datos personales — Habeas Data).
      </LegalP>

      <LegalH2>1. Datos que tratamos</LegalH2>
      <LegalP><strong>Pasajeros (público):</strong> usar el mapa NO requiere crear cuenta. No
        recogemos datos personales del pasajero. Tu ubicación, si la activas para ver paradas
        cercanas, se usa solo en tu dispositivo y no se envía ni almacena en nuestros
        servidores. Las rutas favoritas se guardan localmente en tu navegador.</LegalP>
      <LegalP><strong>Conductores y administradores:</strong> para operar el servicio tratamos
        nombre, correo electrónico, una contraseña cifrada y, durante el turno, la ubicación
        GPS del vehículo. Estos datos los suministra la empresa operadora o el Distrito.</LegalP>
      <LegalP><strong>Datos del servicio:</strong> posición de los buses, ocupación y
        novedades reportadas, e historial de recorridos para fines estadísticos y de gestión.</LegalP>

      <LegalH2>2. Finalidad</LegalH2>
      <LegalUl items={[
        "Mostrar a la ciudadanía los buses en vivo y los tiempos de llegada.",
        "Permitir al conductor transmitir su posición y reportar novedades.",
        "Permitir al Distrito/operador gestionar y supervisar la flota.",
        "Generar reportes agregados (kilómetros, ocupación, actividad) para la toma de decisiones.",
      ]} />

      <LegalH2>3. Ubicación de los conductores</LegalH2>
      <LegalP>La ubicación GPS solo se transmite mientras el conductor inicia su turno de
        forma voluntaria, y deja de transmitirse al finalizarlo. Sirve exclusivamente para el
        funcionamiento del servicio de transporte; no se usa con fines distintos.</LegalP>

      <LegalH2>4. Conservación</LegalH2>
      <LegalP>La posición en vivo se actualiza permanentemente. El historial de recorridos se
        conserva por un periodo limitado (por defecto 30 días) y luego se elimina
        automáticamente. Las cuentas se conservan mientras la persona preste el servicio.</LegalP>

      <LegalH2>5. Seguridad</LegalH2>
      <LegalP>Aplicamos cifrado HTTPS en todas las comunicaciones, contraseñas cifradas
        (bcrypt), controles de acceso por rol y medidas contra abuso. Ningún sistema es
        infalible, pero trabajamos para proteger la información con estándares razonables.</LegalP>

      <LegalH2>6. Tus derechos (ARCO)</LegalH2>
      <LegalP>Como titular de datos puedes ejercer tus derechos de <strong>acceso, rectificación,
        cancelación y oposición (ARCO)</strong>: conocer, actualizar y rectificar tus datos,
        solicitar su supresión y revocar la autorización, conforme a la Ley 1581 de 2012. Para
        ejercerlos, escríbenos por WhatsApp al {WHATSAPP_NUMERO} o contacta al Delegado de
        Protección de Datos (ver sección 7). Responderemos en los términos y plazos que fija la ley.</LegalP>

      <LegalH2>7. Delegado de Protección de Datos (DPO)</LegalH2>
      <LegalP>Para asuntos relacionados con el tratamiento de tus datos personales, puedes
        dirigirte al responsable designado:</LegalP>
      <LegalUl items={[
        <span key="n"><strong>Nombre:</strong> {DPO_NOMBRE}</span>,
        <span key="e"><strong>Correo:</strong> {DPO_EMAIL}</span>,
        <span key="t"><strong>Teléfono:</strong> {DPO_TELEFONO}</span>,
      ]} />

      <LegalH2>8. Cambios</LegalH2>
      <LegalP>Podemos actualizar esta política; los cambios se publicarán en esta misma
        página con su nueva fecha de actualización.</LegalP>

      <LegalP><em>Nota: este documento es un borrador de referencia y debe ser revisado y validado
        por el área jurídica de la entidad antes de su adopción formal.</em></LegalP>
    </LegalPage>
  );
}
