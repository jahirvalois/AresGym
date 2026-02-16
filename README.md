
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

## Ejecutar localmente

Requisitos:
- Node.js (>=16) y `npm` instalados.

1) Instalar dependencias (raíz y `api` opcional):

```bash
npm install
cd api && npm install || true
cd ..
```

2) Crear `.env` en la raíz con tu conexión (opcional para la UI, obligatorio para APIs que usan DB):

```
MONGODB_URI="mongodb+srv://<usuario>:<password>@.../AresGymCloud?retryWrites=true&w=majority"
PORT=8080
```

3) Ejecutar en desarrollo (Vite HMR para frontend):

```bash
npm run dev
```

4) Build de producción + servir con el servidor Express incluido (sirve frontend y API):

```bash
npm run build
# opcional: si el puerto 8080 está en uso, cambia PORT antes de arrancar
# bash
export PORT=8081
npm start
# PowerShell
$env:PORT=8081; npm start
```

5) Documentación API (Swagger):
- Swagger UI estará disponible en `/api-docs` (ejemplo: `http://localhost:8081/api-docs`).
- OpenAPI JSON en `/openapi.json`.

Notas rápidas:
- Si no quieres que la app use la base de datos localmente, deja `MONGODB_URI` vacío; el servidor arrancará pero las rutas de la API devolverán errores.
- Para ejecutar solo la API como Azure Functions, entra en `api/` y usa Azure Functions Core Tools (`func start`).

## Desplegar en Azure App Service

Esta app corre completamente como una aplicación Node.js en App Service: sirve el frontend React compilado + API Express desde un único proceso.

### Requisitos Previos
1. **Cosmos DB for MongoDB** creado con base de datos `AresGymCloud` y colecciones (usuarios, rutinas, etc.).
2. **Conexión a Cosmos DB** (cadena de conexión disponible en Azure Portal).
3. Repositorio de código en GitHub / Azure Repos.

### Paso a Paso

#### 1. Crear App Service
```bash
# Opción 1: CLI (reemplaza valores según tu caso)
az appservice plan create --name AresGymPlan --resource-group MyResourceGroup --sku B1 --is-linux
az webapp create --name AresGymApp --resource-group MyResourceGroup \
  --plan AresGymPlan --runtime "NODE|20-lts"

# Opción 2: Azure Portal
# - Crear "App Service" → Node.js 20 LTS
# - Plan recomendado: B1 o superior según tráfico
```

#### 2. Configurar Variables de Entorno
En Azure Portal → App Service → Settings → **Configuration** → Application settings:

| Clave | Valor |
|-------|-------|
| `MONGODB_URI` | `mongodb://user:pass@...cosmos.azure.com:10255/?...` |
| `PORT` | `8080` |
| `NODE_ENV` | `production` |

#### 3. Build y Deploy

**Opción A: Deploy desde Git (recomendado)**

```bash
# Localmente: asegúrate de que la build está limpia
npm run build
git add .
git commit -m "Ready for App Service"
git push
```

En App Service → Deployment → Deployment Center:
- Conecta tu repositorio (GitHub / Azure Repos)
- Configura rama: `main` (o equivalente)
- App Service construirá y desplegará automáticamente

**Opción B: Manual con zip**

```bash
# Compilar y empaquetar
npm run build
zip -r app.zip dist/ node_modules/ server.js package*.json .env

# Subir a App Service via Azure Portal o CLI
az webapp deployment source config-zip -g MyResourceGroup -n AresGymApp --src app.zip
```

#### 4. Configurar Startup Command
En App Service → Configuration → General → **Startup Command**:

```
npm start
```

O sin fichero de configuración, deja vacío y asegúrate de que `package.json` tiene:
```json
"scripts": {
  "start": "node server.js"
}
```

#### 5. Firewall Cosmos DB (Seguridad)

En Cosmos DB → Firewall y redes virtuales:
- Habilita: **"Aceptar conexiones desde redes públicas"**
- O restringe a la IP pública de App Service (ve a App Service → propiedades para ver IP saliente)

### Verificación Post-Deploy

- Accede a: `https://AresGymApp.azurewebsites.net/`
- Verifica API: `https://AresGymApp.azurewebsites.net/api-docs` (Swagger)
- Logs en vivo: Azure Portal → App Service → Log Stream

### Problemas Comunes

| Problema | Solución |
|----------|----------|
| Error 503 - Servicio no disponible | Verifica `MONGODB_URI` en Configuration; revisa logs |
| Frontend carga pero API falla | Confirma Cosmos DB acepta conexiones desde App Service IP |
| Build lento | Aumenta Plan de App Service (B2+) o cachea node_modules |

### Monitoreo

Azure Monitor → Application Insights (opcional pero recomendado):
- Adjunta Application Insights al App Service
- Verifica métricas de rendimiento, errores y disponibilidad 
