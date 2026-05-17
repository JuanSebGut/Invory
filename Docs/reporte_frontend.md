# Reporte Técnico del Frontend: Proyecto Invory

## 1. Visión General y Stack Tecnológico
El frontend de Invory es una Single Page Application (SPA) moderna, diseñada para gestionar de manera eficiente las operaciones de inventario, ventas y administración de la plataforma. Está construido con un enfoque en rendimiento, seguridad mediante Roles (RBAC) y una experiencia de usuario fluida con soporte para modo claro/oscuro.

**Tecnologías Principales:**
*   **Framework Core:** React 19 (React-DOM 19.2.4)
*   **Enrutamiento:** React Router v7
*   **Build Tool:** Vite v8
*   **Estilos:** Vanilla CSS (Archivos dedicados por componente, con un sistema unificado en `theme-unify.css` y `index.css` que soporta variables CSS para temas).
*   **Testing:** Vitest y React Testing Library.

## 2. Arquitectura y Estructura de Directorios
La aplicación sigue una arquitectura modular y organizada por responsabilidades dentro del directorio `src/`:

*   `api/`: Contiene los servicios de abstracción para la comunicación con el Backend. Centraliza las peticiones a los distintos microservicios (auth, inventory, clients, invoices, etc.).
*   `assets/`: Recursos estáticos (imágenes, fuentes, etc.).
*   `components/`: Componentes reutilizables de la UI. Destaca el `Layout.jsx` que define la estructura principal de la aplicación (Sidebar, Topbar).
*   `context/`: Gestión de estado global de la aplicación. Destaca `AuthContext.jsx` para el manejo centralizado de la sesión y la autenticación.
*   `hooks/`: Custom hooks de React (ej. `useAuth.js` para simplificar el consumo del contexto).
*   `pages/`: Contiene las vistas principales o pantallas de la aplicación, agrupadas por módulo (Login, Dashboard, Products, Inventory, etc.).
*   `utils/`: Funciones utilitarias o helpers globales (ej. formateo de moneda o de facturas).

## 3. Autenticación y Gestión de Sesión
El manejo de la sesión está centralizado en el `AuthContext.jsx`.
*   **Almacenamiento:** Utiliza el API nativo `localStorage` para persistir el JWT (`invory_token`) y la información básica del usuario (`invory_user`).
*   **Flujo:** Al iniciar sesión exitosamente, se guarda el token y los datos del perfil (id, rol, nombre, correo). Al cerrar sesión o cuando el token expira o es revocado, se limpia el almacenamiento local, forzando la redirección al Login.
*   **Estado Global:** El contexto expone variables booleanas reactivas como `isAuthenticated` y funciones de estado como `isLoading`, `login` y `logout` para controlar el comportamiento del resto de la aplicación y las rutas.

## 4. Sistema de Enrutamiento y Control de Acceso (RBAC)
El archivo `App.jsx` define de forma declarativa las reglas de acceso a las distintas vistas utilizando componentes contenedores (HOC - Higher Order Components) basados en el rol del usuario:

*   **PublicRoute:** Rutas exclusivas para usuarios no autenticados (ej. `/login`). Si un usuario autenticado intenta acceder a esta ruta, es redirigido automáticamente al `/dashboard`.
*   **PrivateRoute:** Rutas accesibles por cualquier usuario autenticado, sin distinción del rol (tanto **Administrador** como **Empleado**). En estas vistas, los permisos granulares se manejan internamente a nivel de componente. Incluye: Dashboard, Productos, Inventario, Clientes, Facturas, Historial y Reportes.
*   **AdminRoute:** Rutas restringidas **únicamente a usuarios con el rol "Administrador"**. Incluye módulos de configuración o datos sensibles: Usuarios, Categorías, Proveedores y Auditoría. Si un empleado intenta acceder, es bloqueado y redirigido al Dashboard.

## 5. Diseño y Experiencia de Usuario (UI/UX)
El componente principal de la interfaz es el `Layout.jsx`, el cual envuelve todas las rutas privadas y proporciona la "concha" visual de la aplicación. Sus características principales son:

*   **Barra Lateral Navigacional (Sidebar):** Renderiza dinámicamente los elementos del menú principal según el rol del usuario. Los empleados cuentan con una navegación simplificada que oculta las opciones administrativas para evitar distracciones y clics no permitidos.
*   **Barra Superior (Topbar):** 
    *   **Theme Toggle:** Soporte nativo y rápido para modo claro y oscuro. Persiste la preferencia en `localStorage` (`invory_theme`) y manipula el atributo `data-theme` en la etiqueta `<html>`, aplicando variables CSS globales al instante.
    *   **Sistema de Alertas:** Incluye una campanilla de notificaciones que, de forma asíncrona al cargar la vista, consulta al backend por alertas urgentes como anomalías de stock (bajo, alto, por caducar) y cuentas por cobrar (fiados vencidos), unificando la métrica en un solo contador.
    *   **Menú de Usuario:** Acceso directo al perfil personal y botón de cierre seguro de sesión.
*   **Iconografía:** Implementación propia de iconos mediante SVG embebidos. Esto mejora radicalmente el rendimiento de carga y el LCP (Largest Contentful Paint) al evitar depender de pesadas librerías de fuentes de iconos externas.

## 6. Módulos Principales de la Aplicación
El frontend está dividido en dominios lógicos que se comunican con los correspondientes microservicios del backend:
*   **Dashboard:** Panel principal de resumen general con métricas clave operativas.
*   **Inventario & Productos:** Gestión del catálogo de productos y control estricto de las entradas y salidas (movimientos de existencias).
*   **Clientes & Proveedores:** Mantenimiento de los directorios y la relación comercial con los actores del negocio.
*   **Facturación (Invoices) & Fiados:** Módulo transaccional para el registro de ventas directas y el manejo de créditos/deudas (fiados).
*   **Reportes & Historial:** Sección analítica para la exportación de información y revisión de logs.
*   **Administración:** Mantenimiento interno del sistema (Usuarios, Auditoría, Categorías), exclusivo para personal de confianza.

## 7. Conclusión
El frontend de Invory está construido sobre una arquitectura robusta, modular y moderna (React 19 + Vite). Destaca su enfoque "Security-by-Design" con un RBAC claramente implementado a nivel de enrutamiento y menús de interfaz. Su aproximación a la UI es limpia, priorizando la accesibilidad (Modo Claro/Oscuro) y la información procesable en tiempo real a través del sistema de notificaciones. Esta estructura facilita el mantenimiento continuo, la escalabilidad hacia nuevas funcionalidades y un alto rendimiento percibido por el usuario final.
