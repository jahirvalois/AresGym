
# Ares GYM Pro - Guía de Despliegue en Azure (Cosmos DB for MongoDB)

Este sistema está listo para escalar a la nube de Azure mediante una arquitectura de **Static Web Apps**.

## Paso a Paso para Despliegue Cloud

### 1. Base de Datos
- Crea un **Azure Cosmos DB for MongoDB**.
- Obtén tu cadena de conexión (Connection String).
- Crea una base de datos llamada `AresGymCloud` y colecciones: `users`, `routines`, `logs`, `exerciseBank`, `exerciseMedia`, `branding`.

### 2. Backend (Azure Functions)
Azure Static Web Apps buscará una carpeta `/api` en tu repositorio. Cada archivo `.ts` o carpeta en `/api` se convertirá en un endpoint.
- **Ejemplo**: `/api/users.ts` manejará las peticiones de `GET`, `POST`, `PATCH` y `DELETE` para guerreros.
- Utiliza la variable de entorno `process.env.MONGODB_URI` para conectarte a la base de datos.

### 3. Frontend (React)
- El `apiService.ts` ya está configurado para llamar a `/api`.
- Azure Static Web Apps servirá el frontend y la API bajo el mismo dominio, evitando problemas de CORS.

### 4. Configuración en Azure
- En tu recurso de Static Web App, ve a **Settings > Configuration**.
- Añade el secreto: `MONGODB_URI` = `[Tu Cadena de Conexión de Cosmos DB]`.

## Cuentas de Prueba (Simuladas en Local, Reales en Cloud)

| Rol | Email | Escenario |
| :--- | :--- | :--- |
| **ADMIN** | `admin@ares.com` | Gestión total y Branding. |
| **COACH** | `coach@ares.com` | Creación de rutinas. |
| **USER (OK)** | `cliente@ares.com` | Acceso normal. |

## ¿Necesitas VNet?
No es obligatoria. Azure Static Web Apps utiliza una red interna segura para comunicarse con las funciones integradas. Para proteger Cosmos DB, simplemente configura el firewall de Cosmos para permitir "Servicios de Azure".
