# Backups — Guía completa

## Resumen

TransPadilla incluye scripts para backups automáticos de PostgreSQL/Supabase con:
- Formato `custom` (comprimido, restaurable selectivamente)
- Retención automática (90 días local)
- Soporte para storage remoto (S3, rclone, etc.)
- Notificaciones por webhook si falla
- Verificación de integridad

---

## Archivos

| Script | Plataforma | Función |
|--------|-----------|---------|
| `scripts/backup-bd.ps1` | Windows | Crear backup manual |
| `scripts/backup-bd.sh` | Linux/Mac | Crear backup manual |
| `scripts/programar-backup.ps1` | Windows | Programar backup automático (Task Scheduler) |
| `scripts/verificar-backup.ps1` | Windows | Verificar integridad de un backup |
| `scripts/restore-bd.sh` | Linux/Mac | Restaurar desde un backup |

---

## Configuración rápida (Windows)

### 1. Backup manual
```powershell
./scripts/backup-bd.ps1 -DatabaseUrl "postgresql://..."
# O con DATABASE_URL definida en .env:
./scripts/backup-bd.ps1
```

### 2. Backup automático (Task Scheduler)
```powershell
# Programa un backup diario a las 3 AM
./scripts/programar-backup.ps1

# O con parámetros personalizados:
./scripts/programar-backup.ps1 -Hora 2 -Minuto 30 -BackupDir "D:\backups"
```

### 3. Verificar un backup
```powershell
./scripts/verificar-backup.ps1 -Archivo ".\backups\tp_2026-07-24_0300.dump"
```

---

## Configuración en Linux/Mac (crontab)

### 1. Crear archivo de credenciales (una sola vez)
```bash
printf 'DATABASE_URL=postgresql://...\n' > /ruta/al/repo/.env.backup
chmod 600 /ruta/al/repo/.env.backup
```

### 2. Agregar al crontab
```bash
crontab -e
# Agregar esta línea (backup diario a las 3 AM):
0 3 * * * . /ruta/al/repo/.env.backup && /ruta/al/repo/scripts/backup-bd.sh >> /var/log/tp-backup.log 2>&1
```

---

## Variables de entorno para backups

| Variable | Descripción | Ejemplo |
|----------|-------------|---------|
| `DATABASE_URL` | Cadena de conexión (obligatoria) | `postgresql://user:pass@host/db` |
| `BACKUP_DIR` | Carpeta destino (default: `./backups`) | `/var/backups/transpadilla` |
| `BACKUP_REMOTE` | Comando para subir a storage externo | `aws s3 cp {file} s3://bucket/` |
| `BACKUP_WEBHOOK` | Webhook para alertas de fallo | `https://discord.com/api/webhooks/...` |

---

## Storage remoto (opcional)

### AWS S3
```bash
BACKUP_REMOTE="aws s3 cp {file} s3://mi-bucket/transpadilla/"
```

### Rclone (multi-cloud)
```bash
BACKUP_REMOTE="rclone copy {file} remoto:transpadilla/"
```

### Google Cloud Storage
```bash
BACKUP_REMOTE="gsutil cp {file} gs://mi-bucket/transpadilla/"
```

---

## Retención de backups

| Ubicación | Política |
|-----------|----------|
| Local | 90 días (eliminación automática) |
| Storage remoto | Depende de tu configuración (recomendado: Lifecycle rules en S3) |

---

## Restaurar un backup

```bash
./scripts/restore-bd.sh ./backups/tp_2026-07-24_0300.dump "postgresql://user:pass@host/db"
```

El script pide confirmación escribiendo el hostname de destino.

---

## Restore test trimestral

Recomendado para verificar que los backups funcionan:

1. Crear una base de datos vacía de prueba
2. Restaurar el backup más reciente
3. Verificar que la app arranca correctamente
4. Revisar que rutas, buses y usuarios clave existen

---

## Monitoreo

### Verificar que los backups se están ejecutando
```powershell
# Windows - ver tareas programadas
Get-ScheduledTask -TaskName "TransPadilla-Backup-Diario"

# Linux - ver logs
tail -f /var/log/tp-backup.log
```

### Verificar integridad periódicamente
```powershell
# Verificar el último backup
$ultimo = Get-ChildItem .\backups\tp_*.dump | Sort-Object LastWriteTime | Select-Object -Last 1
./scripts/verificar-backup.ps1 -Archivo $ultimo.FullName
```

---

## Solución de problemas

| Problema | Causa | Solución |
|----------|-------|----------|
| `pg_dump no encontrado` | PostgreSQL client no instalado | Instalar desde https://www.postgresql.org/download/ |
| `connection refused` | PostgreSQL no está corriendo | Verificar que el servicio esté activo |
| `password authentication failed` | Credenciales incorrectas | Verificar DATABASE_URL |
| `backup corrupto` | Conexión interrumpida | Re-ejecutar el backup |
| `Task Scheduler no crea la tarea` | Permisos de administrator | Ejecutar PowerShell como admin |
