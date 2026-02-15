
# Ares GYM Pro - Sistema de Gestión de Alto Rendimiento

Este sistema está diseñado para el control total de Ares GYM, integrando gestión de branding, suscripciones y rutinas inteligentes.

## Cuentas de Prueba (Seed Data)

Para probar los diferentes escenarios del sistema, utiliza las siguientes credenciales:

| Rol | Email | Password | Escenario de Prueba |
| :--- | :--- | :--- | :--- |
| **ADMIN** | `admin@ares.com` | `Cualquiera` | Gestión total, Auditoría y Branding. |
| **COACH** | `coach@ares.com` | `Cualquiera` | Creación de rutinas y vista de clientes. |
| **USER (OK)** | `cliente@ares.com` | `Cualquiera` | Acceso normal a rutina y registros. |
| **USER (WAIT)** | `vence@ares.com` | `Cualquiera` | **Alerta Amarilla**: Pago próximo a vencer. |
| **USER (BLOCK)** | `deudor@ares.com` | `Cualquiera` | **Bloqueo Rojo**: Acceso denegado por impago. |

## Reglas de Suscripción implementadas:
1. **Bloqueo (Rojo)**: Si la fecha actual es posterior a `subscriptionEndDate`. El sistema impide el login y muestra el mensaje obligatorio.
2. **Alerta (Amarillo)**: Si faltan 2 días o menos para el vencimiento. Permite el acceso pero muestra la advertencia en el dashboard.
3. **Acceso Limpio**: Suscripciones con más de 2 días de vigencia.

## Rutas de Interés
- `/docs`: Documentación Swagger (Simulada).
- `/branding`: Panel de personalización Ares GYM (Solo Admin).
- `/audit`: Registro de acciones críticas (Solo Admin).
