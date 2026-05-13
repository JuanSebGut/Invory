# GuÃ­a Docker â€” INVORY Backend MS-01

## Objetivo

Levantar un entorno reproducible para backend usando contenedores:

- API Gateway
- Auth Service (MS-01)
- PostgreSQL

## Servicios definidos

### `api-gateway`
- Puerto host: `3000`
- Dependencia: `auth-service`
- Variable clave: `AUTH_SERVICE_URL=http://auth-service:3002`

### `auth-service`
- Puerto host: `3002`
- Dependencia: `postgres`
- Variables JWT y credenciales demo incluidas en compose para entorno local

### `postgres`
- Imagen: `postgres:16-alpine`
- Puerto host: `5433` (interno del contenedor: `5432`)
- Volumen persistente: `invory_pg_data`
- InicializaciÃ³n automÃ¡tica con backup: `docker/postgres/init/01_backup_invorybd.sql`

## InicializaciÃ³n de base de datos desde backup

El servicio PostgreSQL ejecuta automÃ¡ticamente los scripts ubicados en:

`/docker-entrypoint-initdb.d`

En este proyecto se monta:

`./docker/postgres/init:/docker-entrypoint-initdb.d:ro`

Por eso el backup SQL se importa en el primer arranque del contenedor (cuando el volumen de datos estÃ¡ vacÃ­o).

## Comandos

### Construir y levantar

```bash
docker compose up --build
```

### Levantar en background

```bash
docker compose up -d --build
```

### Ver logs

```bash
docker compose logs -f
```

### Detener entorno

```bash
docker compose down
```

### Detener y borrar datos de PostgreSQL

```bash
docker compose down -v
```

Luego, para recrear e importar nuevamente el backup:

```bash
docker compose up --build
```

## Prueba rÃ¡pida de integraciÃ³n

1. Login por gateway:

```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"nombre_usuario":"admin","contrasena":"Admin1234"}'
```

2. Copiar el `token` de la respuesta y validar:

```bash
curl http://localhost:3000/api/auth/verify \
  -H "Authorization: Bearer <TOKEN>"
```

## Consideraciones

- `.env` reales no se versionan.
- Para producciÃ³n, mover secretos a gestor seguro y no dejar credenciales por defecto.
- El servicio auth estÃ¡ preparado para migrar de repositorio en memoria a persistencia completa en siguientes iteraciones.

## SoluciÃ³n de problemas

### 1) Error de puerto PostgreSQL ocupado

Si `5432` estÃ¡ ocupado por otro servicio local, este proyecto expone PostgreSQL en `5433` del host.

### 2) El backup no se reimporta

La importaciÃ³n de scripts ocurre solo en inicializaciÃ³n. Ejecutar:

```bash
docker compose down -v
docker compose up --build
```

### 3) Compatibilidad del dump

El backup recibido fue generado en PostgreSQL 18 y se ajustÃ³ para ejecutarse en imagen PostgreSQL 16 del proyecto.
TambiÃ©n se usa el usuario `postgres` en el contenedor para mantener compatibilidad con sentencias `OWNER TO postgres` presentes en el dump.
