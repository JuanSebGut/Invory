# GuÃƒÂ­a QA Ã¢â‚¬â€ VerificaciÃƒÂ³n de MS-02 (User Service)

**Proyecto:** INVENTARIO INVORY  
**Alcance:** ValidaciÃƒÂ³n de gestiÃƒÂ³n de usuarios (CRUD + reglas de negocio)  
**ÃƒÅ¡ltima actualizaciÃƒÂ³n:** 2026-04-08

---

## 1) Objetivo

Verificar que `services/user-service` cumple los requisitos funcionales de MS-02:

- CRUD de usuarios.
- Hash de contraseÃƒÂ±a con bcrypt.
- PaginaciÃƒÂ³n con filtros.
- Borrado lÃƒÂ³gico.
- ProtecciÃƒÂ³n para que administrador no se deshabilite a sÃƒÂ­ mismo.

---

## 2) Precondiciones

1. Tener Node.js 18+ instalado.
2. Estar ubicado en la raÃƒÂ­z del repositorio (`invory1`).
3. Ejecutar bootstrap:

```bash
npm run setup:deps
```

4. Tener `services/user-service/.env` configurado (o usar `.env.example` como base).

---

## 3) Comando de verificaciÃƒÂ³n automÃƒÂ¡tica

```bash
npm run verify:ms02
```

Resultado esperado:

- 6 pruebas aprobadas.
- Sin fallos.

---

## 4) Matriz de casos cubiertos automÃƒÂ¡ticamente

Archivo: `services/user-service/tests/user.integration.test.js`

1. `POST /api/users` crea usuario y persiste contraseÃƒÂ±a hasheada con bcrypt.
2. `GET /api/users` pagina y filtra correctamente por `estado`.
3. `PUT /api/users/:id` actualiza parcialmente campos opcionales.
4. `DELETE /api/users/:id` realiza borrado lÃƒÂ³gico (`estado=false`).
5. Un administrador no puede deshabilitarse a sÃƒÂ­ mismo (`409`).
6. `GET /api/users` responde por debajo de 1000ms en escenario local de prueba.

---

## 5) Pruebas manuales recomendadas

## 5.1 Iniciar servicio

```bash
cd services/user-service
npm start
```

## 5.2 Flujo mÃƒÂ­nimo de validaciÃƒÂ³n

1. Crear usuario:

```http
POST http://localhost:3003/api/users
Content-Type: application/json

{
  "nombre": "Empleado QA",
  "correo": "operador.qa@stocker.test",
  "contrasena": "ClaveSegura123",
  "id_rol": 2
}
```

2. Listar paginado y filtrado:

```http
GET http://localhost:3003/api/users?page=1&size=10&estado=activo
```

3. ActualizaciÃƒÂ³n parcial:

```http
PUT http://localhost:3003/api/users/2
Content-Type: application/json

{
  "nombre": "Empleado QA Editado"
}
```

4. Borrado lÃƒÂ³gico:

```http
DELETE http://localhost:3003/api/users/2
x-user-id: 1
x-user-role: Administrador
```

5. Regla de negocio (debe fallar):

```http
PUT http://localhost:3003/api/users/1
x-user-id: 1
x-user-role: Administrador
Content-Type: application/json

{
  "estado": false
}
```

Resultado esperado: `409 ADMIN_SELF_DISABLE_FORBIDDEN`.

---

## 6) Criterios de aceptaciÃƒÂ³n QA

- [ ] CRUD ejecutable por API.
- [ ] ContraseÃƒÂ±a no se devuelve en respuestas.
- [ ] Filtro por estado y paginaciÃƒÂ³n funcionan.
- [ ] DELETE no elimina fÃƒÂ­sicamente el registro.
- [ ] Regla de auto-deshabilitaciÃƒÂ³n de admin protegida con `409`.
- [ ] Suite automÃƒÂ¡tica MS-02 en verde.

