import { LegalPage, LegalH2, LegalP, LegalUl } from "@/components/LegalPage";
import { useDocumentTitle } from "@/hooks/use-document-title";

export default function TerminosConductor() {
  useDocumentTitle("Términos para Conductores · TransPadilla");
  return (
    <LegalPage titulo="Términos y Condiciones para Conductores" actualizado="Julio de 2026">
      <LegalP>
        Estos términos regulan el uso del Panel del Conductor de TransPadilla. Al aceptarlos en
        tu primer ingreso, declaras haberlos leído y estar de acuerdo. Son adicionales a los
        Términos y Condiciones generales y a la Política de Privacidad.
      </LegalP>

      <LegalH2>1. Tratamiento de tu ubicación (GPS)</LegalH2>
      <LegalP>Durante tu turno, la aplicación transmite la ubicación GPS del vehículo en tiempo
        real para mostrarla a los pasajeros y al operador. Autorizas expresamente este tratamiento
        conforme a la Ley 1581 de 2012. La transmisión ocurre únicamente cuando tú inicias el
        turno y se detiene al finalizarlo o al cerrar sesión.</LegalP>

      <LegalH2>2. Privacidad de tu ubicación</LegalH2>
      <LegalUl items={[
        "La ubicación se usa solo para el funcionamiento del servicio de transporte, no para vigilancia personal fuera del turno.",
        "No se transmite ubicación con el turno finalizado o la sesión cerrada.",
        "El historial de recorridos se conserva por un periodo limitado (por defecto 30 días) y luego se elimina.",
      ]} />

      <LegalH2>3. Uso del APK / aplicación</LegalH2>
      <LegalUl items={[
        "Mantén la app abierta y con permiso de ubicación durante el turno para que el servicio funcione.",
        "No compartas tus credenciales; eres responsable del uso de tu cuenta.",
        "Reporta las novedades (accidente, desvío, demora) de forma veraz.",
      ]} />

      <LegalH2>4. Obligaciones del conductor</LegalH2>
      <LegalUl items={[
        "Operar únicamente el bus que te fue asignado por el administrador.",
        "No manipular ni falsear la posición, la ocupación ni las novedades.",
        "Priorizar siempre la seguridad vial: no operar la app mientras conduces de forma insegura.",
        "Cerrar sesión al terminar tu jornada para dejar de transmitir tu ubicación.",
      ]} />

      <LegalH2>5. Consecuencias</LegalH2>
      <LegalP>El incumplimiento de estos términos puede llevar a la suspensión o revocación del
        acceso al Panel del Conductor por parte del operador o del Distrito.</LegalP>

      <LegalP><em>Nota: este documento es un borrador de referencia y debe ser revisado y validado
        por el área jurídica de la entidad antes de su adopción formal.</em></LegalP>
    </LegalPage>
  );
}
