import {
  pgTable,
  serial,
  varchar,
  real,
  boolean,
  integer,
  text,
  timestamp,
  index,
  uniqueIndex,
  jsonb,
} from "drizzle-orm/pg-core";

export const usuarios = pgTable("usuarios", {
  id: serial("id").primaryKey(),
  nombre: varchar("nombre", { length: 100 }).notNull(),
  correo: varchar("correo", { length: 100 }).notNull().unique(),
  password: varchar("password", { length: 200 }).notNull(),
  rol: varchar("rol", { length: 20 }).notNull().default("pasajero"),
  identificacion: varchar("identificacion", { length: 30 }),
  // Bloqueo de cuenta por fuerza bruta (Fase 1.3): se incrementa en cada login
  // fallido; al llegar a 5 se fija bloqueado_hasta = now()+15min. Se resetea en
  // login exitoso. Complementa (no reemplaza) el rate-limit por IP.
  intentos_fallidos: integer("intentos_fallidos").notNull().default(0),
  bloqueado_hasta: timestamp("bloqueado_hasta"),
  // Consentimiento de términos del conductor (Fase 3.4/3.1): se registra al
  // aceptar los Términos de Conductor en el primer ingreso. Guarda versión,
  // fecha e IP como evidencia del consentimiento (Ley 1581 de 2012).
  terminos_conductor_aceptados: boolean("terminos_conductor_aceptados").notNull().default(false),
  terminos_conductor_version: varchar("terminos_conductor_version", { length: 20 }),
  terminos_conductor_fecha: timestamp("terminos_conductor_fecha"),
  terminos_conductor_ip: varchar("terminos_conductor_ip", { length: 64 }),
});

export const rutas = pgTable("rutas", {
  id: serial("id").primaryKey(),
  nombre: varchar("nombre", { length: 100 }).notNull(),
  color: varchar("color", { length: 20 }).notNull().default("#3498db"),
  activa: boolean("activa").notNull().default(true),
});

export const paradas = pgTable("paradas", {
  id: serial("id").primaryKey(),
  nombre: varchar("nombre", { length: 100 }).notNull(),
  latitud: real("latitud").notNull(),
  longitud: real("longitud").notNull(),
});

export const ruta_paradas = pgTable("ruta_paradas", {
  id: serial("id").primaryKey(),
  ruta_id: integer("ruta_id")
    .notNull()
    .references(() => rutas.id, { onDelete: "cascade" }),
  parada_id: integer("parada_id")
    .notNull()
    .references(() => paradas.id, { onDelete: "cascade" }),
  orden: integer("orden").notNull().default(0),
});

export const buses = pgTable("buses", {
  id: serial("id").primaryKey(),
  placa: varchar("placa", { length: 20 }).notNull().unique(),
  ruta_id: integer("ruta_id").references(() => rutas.id, {
    onDelete: "set null",
  }),
  conductor_id: integer("conductor_id").references(() => usuarios.id, {
    onDelete: "set null",
  }),
  estado: varchar("estado", { length: 20 }).notNull().default("inactivo"),
  lat: real("lat"),
  lng: real("lng"),
  velocidad: real("velocidad"),
  novedad: text("novedad"),
  ocupacion: varchar("ocupacion", { length: 10 }),
  actualizado: timestamp("actualizado"),
});

// Historial de posiciones: snapshot periódico de los buses en circulación.
// Base de los reportes (km recorridos, ocupación en el tiempo, actividad). NO se
// escribe en cada ping de GPS (sería enorme); un job lo muestrea cada ~60 s.
export const posiciones_historial = pgTable(
  "posiciones_historial",
  {
    id: serial("id").primaryKey(),
    bus_id: integer("bus_id")
      .notNull()
      .references(() => buses.id, { onDelete: "cascade" }),
    ruta_id: integer("ruta_id").references(() => rutas.id, { onDelete: "set null" }),
    lat: real("lat").notNull(),
    lng: real("lng").notNull(),
    velocidad: real("velocidad"),
    ocupacion: varchar("ocupacion", { length: 10 }),
    capturado: timestamp("capturado").notNull().defaultNow(),
  },
  (t) => [
    index("idx_hist_bus_capturado").on(t.bus_id, t.capturado),
    index("idx_hist_ruta_capturado").on(t.ruta_id, t.capturado),
  ],
);

// Registro de auditoría: quién (usuario_id) hizo qué (accion) sobre qué entidad.
// Solo mutaciones administrativas (crear/editar/eliminar rutas, paradas, buses, conductores).
export const auditoria = pgTable(
  "auditoria",
  {
    id: serial("id").primaryKey(),
    usuario_id: integer("usuario_id").references(() => usuarios.id, { onDelete: "set null" }),
    accion: varchar("accion", { length: 50 }).notNull(),
    entidad_tipo: varchar("entidad_tipo", { length: 30 }),
    entidad_id: integer("entidad_id"),
    detalle: jsonb("detalle"),
    // Contexto de la petición (Fase 1.2), para poder trazar de dónde vino cada
    // acción administrativa. Igual que el resto de la tabla: solo INSERT.
    ip: varchar("ip", { length: 64 }),
    user_agent: text("user_agent"),
    creado_en: timestamp("creado_en").notNull().defaultNow(),
  },
  (t) => [index("idx_auditoria_creado").on(t.creado_en)],
);

// Suscripciones Web Push del pasajero (sin cuenta): una por dispositivo/navegador.
// `rutas` = ids de rutas "seguidas" para las que quiere notificaciones.
export const suscripciones_push = pgTable("suscripciones_push", {
  id: serial("id").primaryKey(),
  endpoint: text("endpoint").notNull().unique(),
  p256dh: text("p256dh").notNull(),
  auth: text("auth").notNull(),
  rutas: jsonb("rutas").notNull().$type<number[]>().default([]),
  creado_en: timestamp("creado_en").notNull().defaultNow(),
});

// Favoritos del pasajero (sin cuenta): qué rutas marcó como favoritas cada
// dispositivo. `cliente_id` es un id anónimo generado en el navegador (localStorage);
// sirve para el reporte "ruta más solicitada" (COUNT DISTINCT cliente_id por ruta).
export const favoritos = pgTable(
  "favoritos",
  {
    id: serial("id").primaryKey(),
    cliente_id: varchar("cliente_id", { length: 64 }).notNull(),
    ruta_id: integer("ruta_id")
      .notNull()
      .references(() => rutas.id, { onDelete: "cascade" }),
    creado_en: timestamp("creado_en").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("idx_favoritos_cliente_ruta").on(t.cliente_id, t.ruta_id),
    index("idx_favoritos_ruta").on(t.ruta_id),
  ],
);

// Lista negra de tokens JWT revocados (cierre de sesión real). Se guarda el hash
// del token, no el token. Se purga cuando `expira_en` pasa (ya no hace falta).
export const tokens_revocados = pgTable("tokens_revocados", {
  id: serial("id").primaryKey(),
  token_hash: varchar("token_hash", { length: 64 }).notNull().unique(),
  expira_en: timestamp("expira_en").notNull(),
  creado_en: timestamp("creado_en").notNull().defaultNow(),
});

export type Usuario = typeof usuarios.$inferSelect;
export type Ruta = typeof rutas.$inferSelect;
export type Parada = typeof paradas.$inferSelect;
export type RutaParada = typeof ruta_paradas.$inferSelect;
export type Bus = typeof buses.$inferSelect;
export type PosicionHistorial = typeof posiciones_historial.$inferSelect;
export type Auditoria = typeof auditoria.$inferSelect;
