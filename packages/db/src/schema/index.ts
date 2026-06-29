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
} from "drizzle-orm/pg-core";

export const usuarios = pgTable("usuarios", {
  id: serial("id").primaryKey(),
  nombre: varchar("nombre", { length: 100 }).notNull(),
  correo: varchar("correo", { length: 100 }).notNull().unique(),
  password: varchar("password", { length: 200 }).notNull(),
  rol: varchar("rol", { length: 20 }).notNull().default("pasajero"),
  identificacion: varchar("identificacion", { length: 30 }),
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

export type Usuario = typeof usuarios.$inferSelect;
export type Ruta = typeof rutas.$inferSelect;
export type Parada = typeof paradas.$inferSelect;
export type RutaParada = typeof ruta_paradas.$inferSelect;
export type Bus = typeof buses.$inferSelect;
export type PosicionHistorial = typeof posiciones_historial.$inferSelect;
