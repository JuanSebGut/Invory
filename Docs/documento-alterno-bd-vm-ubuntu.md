# Documento Alterno: Base de Datos en Maquina Virtual (Ubuntu Server) y Flujo de Comunicacion

## 1) Contexto del escenario

En este escenario alterno, PostgreSQL **no corre en el mismo host Windows ni en un contenedor local**, sino en una **maquina virtual Ubuntu Server** dentro de este mismo computador.

Esto convierte la comunicacion de datos en un flujo de red local entre:

- Host (Windows): frontend, API Gateway y microservicios
- Invitado (Ubuntu Server VM): motor PostgreSQL

## 2) Topologia de comunicacion propuesta

Arquitectura:

1. Frontend (`localhost:5173`) envia solicitudes HTTP al API Gateway (`localhost:3000`).
2. API Gateway enruta al microservicio correspondiente (`localhost:3001..3008` o contenedores).
3. Cada microservicio que requiere persistencia abre conexion TCP a PostgreSQL en la VM Ubuntu (`<IP_VM>:5432`).
4. PostgreSQL procesa la consulta y devuelve resultados al microservicio.
5. Respuesta regresa por cadena: microservicio -> gateway -> frontend.

## 3) Comunicacion por capas en este modelo

## 3.1 Frontend -> Backend

Se mantiene igual:

- protocolo HTTP/JSON
- frontend habla con gateway
- autenticacion JWT via `Authorization: Bearer <token>`

No hay acceso directo frontend -> base de datos.

## 3.2 Backend -> Base de datos (cambio principal)

Aqui ocurre el cambio clave:

- antes: `DB_HOST=localhost` o `postgres` (docker network)
- ahora: `DB_HOST=<IP_VM_UBUNTU>`

Variables tipicas por servicio:

- `DB_HOST=192.168.x.x` (IP de la VM)
- `DB_PORT=5432`
- `DB_USER=postgres`
- `DB_PASSWORD=...`
- `DB_NAME=invory`

## 4) Requisitos de red para que funcione

## 4.1 Tipo de adaptador de red de la VM

Para un flujo estable, usar preferiblemente:

- `Bridged Adapter` (la VM aparece como otro equipo de la red), o
- `Host-Only + NAT` (si quieres aislarla y controlar mejor acceso)

Si usas NAT puro, debes mapear puertos y puede complejizar conexiones desde servicios.

## 4.2 Puertos

Abrir/permitir en Ubuntu Server:

- `5432/tcp` (PostgreSQL)

En firewall de Ubuntu (`ufw`) y/o reglas del hipervisor.

## 4.3 Configuracion PostgreSQL en Ubuntu

Ajustes clave:

1. `postgresql.conf`:
   - `listen_addresses = '*'` (o IP especifica de la interfaz VM)
2. `pg_hba.conf`:
   - permitir red del host Windows, por ejemplo:
     - `host    invory    postgres    192.168.1.0/24    md5`
3. reiniciar servicio PostgreSQL.

Sin estos cambios, los microservicios no podran autenticarse remotamente.

## 5) Flujo completo de ejemplo (login)

1. Usuario inicia sesion en frontend.
2. Frontend llama `POST /api/auth/login` al gateway.
3. Gateway reenvia a `auth-service`.
4. `auth-service` consulta tabla `usuarios` en PostgreSQL de la VM (`<IP_VM>:5432`).
5. DB responde con datos del usuario y hash.
6. `auth-service` valida, emite JWT y responde.
7. Frontend guarda token y continua flujo normal.

## 6) Flujos que impactan mas por latencia

En este escenario, la latencia adicional se nota sobre todo en:

- consultas paginadas de historial/inventario
- reportes consolidados
- exportaciones (MS-12)
- operaciones con multiples lecturas encadenadas

Como la VM esta en la misma maquina fisica, el impacto suele ser bajo si la red virtual esta bien configurada.

## 7) Seguridad recomendada

1. Restringir `pg_hba.conf` solo a la subred necesaria.
2. No exponer 5432 a redes publicas.
3. Usar credenciales robustas y rotacion periodica.
4. Separar usuarios DB por entorno (dev/test/prod).
5. Habilitar backups automaticos en Ubuntu Server.

## 8) Observabilidad y diagnostico

Comprobaciones utiles:

- desde host/microservicio: `Test-NetConnection <IP_VM> -Port 5432`
- en Ubuntu: `ss -ltnp | grep 5432`
- logs PostgreSQL para rechazos de autenticacion/red

Si falla conexion, revisar en orden:

1. IP de la VM
2. reachability de red
3. `listen_addresses`
4. `pg_hba.conf`
5. firewall Ubuntu/hipervisor
6. credenciales

## 9) Ventajas y compromisos del modelo VM

Ventajas:

- separacion de responsabilidades (app vs datos)
- entorno mas cercano a despliegues reales
- mejor control de backups y hardening del motor DB

Compromisos:

- mayor complejidad operativa de red
- dependencia del estado de la VM
- necesidad de administrar firewall, usuarios y servicio PostgreSQL fuera del host principal

## 10) Conclusiones

Ubicar la base de datos de INVORY en una VM Ubuntu Server en este mismo computador es una arquitectura valida y recomendable para madurez tecnica local. La comunicacion general del sistema no cambia en el frontend ni en el gateway; el cambio central esta en la **capa backend-datos**, que pasa a una conexion TCP remota controlada por IP, puertos y politicas de acceso de PostgreSQL en la VM.
