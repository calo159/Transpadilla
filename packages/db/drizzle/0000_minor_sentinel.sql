-- Baseline idempotente: seguro de correr tanto sobre una BD NUEVA (crea todo)
-- como sobre la BD de producción ya existente (todo IF NOT EXISTS/EXISTS →
-- queda no-op). Coexiste con el arranque idempotente en
-- apps/api/src/lib/init-db.ts (ensureSchema), que sigue siendo la red de
-- seguridad de cada boot; esta migración es la vía versionada/documentada.
CREATE TABLE IF NOT EXISTS "auditoria" (
	"id" serial PRIMARY KEY NOT NULL,
	"usuario_id" integer,
	"accion" varchar(50) NOT NULL,
	"entidad_tipo" varchar(30),
	"entidad_id" integer,
	"detalle" jsonb,
	"creado_en" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "buses" (
	"id" serial PRIMARY KEY NOT NULL,
	"placa" varchar(20) NOT NULL,
	"ruta_id" integer,
	"conductor_id" integer,
	"estado" varchar(20) DEFAULT 'inactivo' NOT NULL,
	"lat" real,
	"lng" real,
	"velocidad" real,
	"novedad" text,
	"ocupacion" varchar(10),
	"actualizado" timestamp,
	CONSTRAINT "buses_placa_unique" UNIQUE("placa")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "paradas" (
	"id" serial PRIMARY KEY NOT NULL,
	"nombre" varchar(100) NOT NULL,
	"latitud" real NOT NULL,
	"longitud" real NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "posiciones_historial" (
	"id" serial PRIMARY KEY NOT NULL,
	"bus_id" integer NOT NULL,
	"ruta_id" integer,
	"lat" real NOT NULL,
	"lng" real NOT NULL,
	"velocidad" real,
	"ocupacion" varchar(10),
	"capturado" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "ruta_paradas" (
	"id" serial PRIMARY KEY NOT NULL,
	"ruta_id" integer NOT NULL,
	"parada_id" integer NOT NULL,
	"orden" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "rutas" (
	"id" serial PRIMARY KEY NOT NULL,
	"nombre" varchar(100) NOT NULL,
	"color" varchar(20) DEFAULT '#3498db' NOT NULL,
	"activa" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "suscripciones_push" (
	"id" serial PRIMARY KEY NOT NULL,
	"endpoint" text NOT NULL,
	"p256dh" text NOT NULL,
	"auth" text NOT NULL,
	"rutas" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"creado_en" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "suscripciones_push_endpoint_unique" UNIQUE("endpoint")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "tokens_revocados" (
	"id" serial PRIMARY KEY NOT NULL,
	"token_hash" varchar(64) NOT NULL,
	"expira_en" timestamp NOT NULL,
	"creado_en" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "tokens_revocados_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "usuarios" (
	"id" serial PRIMARY KEY NOT NULL,
	"nombre" varchar(100) NOT NULL,
	"correo" varchar(100) NOT NULL,
	"password" varchar(200) NOT NULL,
	"rol" varchar(20) DEFAULT 'pasajero' NOT NULL,
	"identificacion" varchar(30),
	CONSTRAINT "usuarios_correo_unique" UNIQUE("correo")
);
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "auditoria" ADD CONSTRAINT "auditoria_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "buses" ADD CONSTRAINT "buses_ruta_id_rutas_id_fk" FOREIGN KEY ("ruta_id") REFERENCES "public"."rutas"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "buses" ADD CONSTRAINT "buses_conductor_id_usuarios_id_fk" FOREIGN KEY ("conductor_id") REFERENCES "public"."usuarios"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "posiciones_historial" ADD CONSTRAINT "posiciones_historial_bus_id_buses_id_fk" FOREIGN KEY ("bus_id") REFERENCES "public"."buses"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "posiciones_historial" ADD CONSTRAINT "posiciones_historial_ruta_id_rutas_id_fk" FOREIGN KEY ("ruta_id") REFERENCES "public"."rutas"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "ruta_paradas" ADD CONSTRAINT "ruta_paradas_ruta_id_rutas_id_fk" FOREIGN KEY ("ruta_id") REFERENCES "public"."rutas"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "ruta_paradas" ADD CONSTRAINT "ruta_paradas_parada_id_paradas_id_fk" FOREIGN KEY ("parada_id") REFERENCES "public"."paradas"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_auditoria_creado" ON "auditoria" USING btree ("creado_en");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_hist_bus_capturado" ON "posiciones_historial" USING btree ("bus_id","capturado");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_hist_ruta_capturado" ON "posiciones_historial" USING btree ("ruta_id","capturado");
