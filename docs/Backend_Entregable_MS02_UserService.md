# Entregable Backend MS-02 â€” User Service

**Proyecto:** INVENTARIO INVORY  
**MÃ³dulo principal:** MS-02 (GestiÃ³n de usuarios)  
**Responsable:** Juan NicolÃ¡s Urrutia  
**Rama objetivo:** `feature/MS-02-user-service`

---

## 1. Alcance

Se implementa el microservicio `services/user-service` con arquitectura por capas para cubrir el alcance funcional de MS-02:

- CRUD de usuarios.
- Hash de contraseÃ±a con bcrypt.
- GET paginado con filtros por estado.
- ActualizaciÃ³n parcial de campos opcionales.
- Borrado lÃ³gico (deshabilitar usuario sin eliminar registro).
- Regla de negocio: un administrador no puede deshabilitarse a sÃ­ mismo.

---

## 2. Endpoints implementados

Base: `/api/users`

- `POST /api/users` â†’ crear usuario.
- `GET /api/users` â†’ listar usuarios paginados (`page`, `size`, `estado`).
- `GET /api/users/:id` â†’ obtener usuario por id.
- `PUT /api/users/:id` â†’ actualizaciÃ³n parcial.
- `DELETE /api/users/:id` â†’ borrado lÃ³gico (`estado=false`).

---

## 3. Estructura tÃ©cnica

```text
services/user-service/
â”œâ”€ src/
â”‚  â”œâ”€ app.js
â”‚  â”œâ”€ config/db.js
â”‚  â”œâ”€ controllers/user.controller.js
â”‚  â”œâ”€ models/user.model.js
â”‚  â”œâ”€ repositories/user.repository.js
â”‚  â”œâ”€ routes/user.routes.js
â”‚  â””â”€ services/user.service.js
â”œâ”€ tests/user.integration.test.js
â”œâ”€ server.js
â”œâ”€ package.json
â””â”€ .env.example
```

---

## 4. Decisiones de diseÃ±o

1. **Capa de repositorio dual (PostgreSQL + InMemory)**
   - `PgUserRepository` para ejecuciÃ³n real contra base de datos.
   - `InMemoryUserRepository` para pruebas de integraciÃ³n determinÃ­sticas.

2. **ValidaciÃ³n de negocio en servicio**
   - La regla crÃ­tica (admin no se auto-deshabilita) vive en `user.service.js` para mantener control de dominio fuera del controlador.

3. **SanitizaciÃ³n de respuesta**
   - Nunca se expone la contraseÃ±a hash en respuestas API.

---

## 5. Variables de entorno

Archivo recomendado: `services/user-service/.env` (tomando como base `.env.example`)

Variables mÃ­nimas:

- `PORT`
- `DB_HOST`
- `DB_PORT`
- `DB_USER`
- `DB_PASSWORD`
- `DB_NAME`
- `USER_REPOSITORY` (`postgres` o `inmemory`)

---

## 6. EjecuciÃ³n y pruebas

Desde la raÃ­z del repositorio:

```bash
npm run setup:deps
npm run verify:ms02
```

Comando directo por servicio:

```bash
npm --prefix services/user-service test
```

---

## 7. Criterios de aceptaciÃ³n cubiertos

- [x] CRUD de usuarios operativo.
- [x] ContraseÃ±a almacenada con hash bcrypt.
- [x] GET paginado con filtros `page`, `size`, `estado`.
- [x] PUT con actualizaciÃ³n parcial.
- [x] DELETE lÃ³gico sin borrado fÃ­sico.
- [x] ValidaciÃ³n de negocio para evitar auto-deshabilitaciÃ³n de admin.
- [x] Suite de pruebas de integraciÃ³n para flujo MS-02.

---

## 8. DocumentaciÃ³n complementaria

- `docs/QA_Guia_Verificacion_MS02_UserService.md`
- `docs/Frontend_Integracion_MS02_UserService.md`
