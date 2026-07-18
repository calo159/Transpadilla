import { LegalPage, LegalH2, LegalP, LegalUl } from "@/components/LegalPage";
import { useDocumentTitle } from "@/hooks/use-document-title";
import { WHATSAPP_NUMERO } from "@/lib/constants";

export default function Terminos() {
  useDocumentTitle("Términos y Condiciones · TransPadilla");
  return (
    <LegalPage titulo="Términos y Condiciones de Uso" actualizado="Junio de 2026">
      <LegalP>
        Al usar TransPadilla aceptas estos términos. La plataforma es un sistema de
        información para facilitar el uso del transporte público en el Distrito de Riohacha.
      </LegalP>

      <LegalH2>1. Naturaleza del servicio</LegalH2>
      <LegalP>TransPadilla muestra la posición de los buses y estima tiempos de llegada (ETA)
        a partir de datos en tiempo real. Las estimaciones son aproximadas y pueden variar por
        tráfico, clima, fallos de señal GPS u otros factores ajenos a la plataforma.</LegalP>

      <LegalH2>2. Uso aceptable</LegalH2>
      <LegalUl items={[
        "No intentar vulnerar, sobrecargar o interferir con el servicio.",
        "No suplantar a conductores, administradores u otras personas.",
        "No usar la plataforma para fines ilícitos o no autorizados.",
        "Los conductores y administradores deben cuidar sus credenciales de acceso.",
      ]} />

      <LegalH2>3. Cuentas</LegalH2>
      <LegalP>El uso público (pasajero) no requiere cuenta. Las cuentas de conductor y
        administrador son creadas por el operador o el Distrito; cada usuario es responsable
        del uso de su cuenta.</LegalP>

      <LegalH2>4. Disponibilidad</LegalH2>
      <LegalP>Procuramos una operación continua (24/7) con monitoreo y respaldos, pero el
        servicio puede tener interrupciones por mantenimiento, fallos de terceros (hospedaje,
        conectividad) o causas de fuerza mayor. No garantizamos disponibilidad ininterrumpida.</LegalP>

      <LegalH2>5. Limitación de responsabilidad</LegalH2>
      <LegalP>La información es de apoyo y no sustituye el criterio del usuario. TransPadilla
        no se responsabiliza por decisiones tomadas con base en estimaciones de llegada, ni por
        pérdidas derivadas de interrupciones del servicio o inexactitudes en los datos.</LegalP>

      <LegalH2>6. Nivel de servicio (SLA)</LegalH2>
      <LegalP>Para el uso institucional, TransPadilla se propone los siguientes objetivos de
        servicio (indicativos, sujetos al acuerdo formal con la entidad contratante):</LegalP>
      <LegalUl items={[
        "Disponibilidad objetivo: 99.5% mensual del servicio.",
        "Tiempo máximo de respuesta ante incidentes críticos (servicio caído): 1 hora.",
        "Ventana de mantenimiento programado: domingos de 2:00 a 4:00 a.m.",
        "Respaldos de la base de datos y plan de recuperación ante desastres documentados.",
      ]} />

      <LegalH2>7. Ley aplicable y jurisdicción</LegalH2>
      <LegalP>Estos términos se rigen por las leyes de la República de Colombia, en particular la
        Ley 1581 de 2012 y el Decreto 1377 de 2013 en materia de protección de datos. Cualquier
        controversia derivada del uso de la plataforma se someterá a los juzgados competentes de
        Riohacha, La Guajira, Colombia.</LegalP>

      <LegalH2>8. Propiedad</LegalH2>
      <LegalP>La marca, el diseño y el software de TransPadilla son propiedad de sus titulares.
        No se permite su reproducción o uso no autorizado.</LegalP>

      <LegalH2>9. Contacto</LegalH2>
      <LegalP>Para dudas sobre estos términos, escríbenos por WhatsApp al {WHATSAPP_NUMERO}.</LegalP>

    </LegalPage>
  );
}
