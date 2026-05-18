# Reporte Detallado: Comunicación entre Frontend, Backend y Base de Datos (Proyecto Invory)

Este informe detalla el flujo de datos y la arquitectura de red del sistema Invory, explicando cómo se intercomunican las distintas capas de la aplicación (Frontend, API Gateway, Microservicios y Base de Datos).

---

## 1. Patrón Arquitectónico General
El proyecto Invory implementa una arquitectura basada en **Microservicios** orquestada mediante Docker Compose. 
Para gestionar la complejidad de múltiples servicios, se utiliza el patrón **API Gateway (Puerta de Enlace API)**. Esto significa que el Frontend nunca se comunica directamente con los microservicios backend; en su lugar, todas las peticiones pasan por un único punto de entrada (el API Gateway), el cual enruta, autentica y autoriza las solicitudes hacia el servicio correspondiente.

---

## 2. Comunicación Frontend ➔ API Gateway
El Frontend (construido en React) opera en el navegador del usuario final (expuesto en el puerto `80`).
*   **Punto de Enlace:** El frontend centraliza todas las peticiones HTTP (mediante `fetch` o `axios` en la carpeta `src/api`) hacia la URL base definida en `VITE_API_URL` (típicamente `http://localhost:3000/api` en desarrollo). El puerto `3000` corresponde al API Gateway.
*   **Autenticación y Seguridad:** Tras un inicio de sesión exitoso, el frontend recibe un token JWT. En cada petición subsiguiente a rutas protegidas, el frontend adjunta este token en los headers de la solicitud (`Authorization: Bearer <token>`).

---

## 3. Capa API Gateway ➔ Microservicios (Backend)
El **API Gateway** (`api-gateway` en el puerto `3000`) es una aplicación Node.js/Express que actúa como proxy inverso y barrera de seguridad.

### 3.1. Proceso de Enrutamiento
Cuando el Gateway recibe una solicitud (ej. `GET /api/products`), evalúa la ruta y actúa como un proxy delegando la petición al microservicio correspondiente a través de la red interna de Docker:
*   `/api/auth` ➔ **auth-service** (Puerto 3002)
*   `/api/users` ➔ **user-service** (Puerto 3004)
*   `/api/categories` ➔ **category-service** (Puerto 3003)
*   `/api/products` ➔ **product-service** (Puerto 3001)
*   `/api/providers` ➔ **supplier-service** (Puerto 3008)
*   `/api/clients` ➔ **client-service** (Puerto 3009)
*   `/api/fiados` ➔ **client-service** (Puerto 3009)
*   `/api/inventory` ➔ **inventory-service** (Puerto 3005)
*   `/api/audit` ➔ **audit-service** (Puerto 3006)
*   `/api/export` ➔ **export-service** (Puerto 3007)

### 3.2. Middleware de Autenticación (Zero-Trust)
Antes de redirigir la petición al microservicio destino, el Gateway intercepta las rutas protegidas usando su `authMiddleware`.
1. Extrae el JWT del header.
2. Hace una llamada interna al `auth-service` para verificar la validez y los permisos del token.
3. Si el token es válido, inyecta los datos del usuario en la petición y la reenvía al microservicio correspondiente. El microservicio final recibe el JWT propagado y también puede aplicar validaciones de autorización (enfoque de confianza cero).

---

## 4. Comunicación Inter-Servicios (Microservicio a Microservicio)
Los microservicios backend se comunican entre sí utilizando la red interna provista por Docker (mediante resolución de nombres DNS de contenedores, ej. `http://audit-service:3006`).

La comunicación entre servicios se realiza de dos maneras principales:
*   **Llamadas Síncronas (HTTP REST):** Usadas cuando un servicio necesita datos de otro para completar su operación. Por ejemplo, el `export-service` hace peticiones síncronas a `inventory-service` y `audit-service` para consolidar información antes de generar un archivo de exportación masiva.
*   **Eventos y Webhooks (Asíncrono/Desacoplado):** Usado principalmente para el sistema de Auditoría. Servicios como `auth-service`, `user-service`, `category-service`, `product-service`, `client-service` y `inventory-service` utilizan variables de entorno como `MS06_AUDIT_WEBHOOK_URL` (*Nota: se mantiene el prefijo heredado MS09 en la variable de entorno en código por retrocompatibilidad, aunque lógicamente hace referencia a MS-06*). Cuando ocurre una acción crítica (ej. login, creación de producto, movimiento de stock), el servicio responsable dispara una petición POST (Webhook) de "fire-and-forget" al `audit-service` para que este registre el evento en el historial sin bloquear la operación principal.

---

## 5. Comunicación Backend ➔ Base de Datos
La capa de persistencia se centraliza en un contenedor Docker de **PostgreSQL 16** (`invory-postgres` en el puerto interno `5432`).

*   **Arquitectura de Datos:** Todos los microservicios comparten la misma instancia de base de datos relacional (Base de datos principal llamada `invory`).
*   **Conexión:** Cada microservicio gestiona su propia conexión a la base de datos (mediante variables de entorno como `DB_HOST`, `DB_USER`, `DB_PASSWORD`). Utilizan el host `postgres` definido en `docker-compose.yml` para conectarse a través de la red de contenedores de Docker.
*   **Integridad:** Dependiendo de la implementación específica de las tablas (verificado en el entorno), los microservicios interactúan con las mismas estructuras relacionales, permitiendo que las dependencias lógicas (ej. un producto en el inventario y una categoría) se mantengan consistentes.

---

## Resumen del Flujo de una Petición (Ejemplo: Crear un Producto)
1. **Frontend:** El usuario (Administrador) llena el formulario y la app React envía un `POST /api/products` con el JWT en el header.
2. **API Gateway:** Recibe la petición, verifica el JWT con el `auth-service`. Al confirmar que el usuario es Administrador, enruta la petición hacia `http://product-service:3001/api/products`.
3. **Product Service (Backend):** Recibe los datos, los valida e inserta el nuevo producto ejecutando un query SQL `INSERT` directamente en el contenedor **PostgreSQL**.
4. **Auditoría (Webhook):** Inmediatamente después de guardar en la DB, el `product-service` envía un POST al webhook del `audit-service` (`http://audit-service:3006/api/audit/events`) informando "Usuario X creó Producto Y".
5. **Respuesta:** El `product-service` responde `201 Created` al Gateway, que a su vez se lo reenvía al Frontend para mostrar la notificación de éxito al usuario.
