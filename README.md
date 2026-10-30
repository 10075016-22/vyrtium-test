# Orbita · Servicio de saldo

Versión simplificada del servicio de saldo prepago (USD) de Orbita: una API en Node.js + TypeScript y una pantalla web en React que la consume.

## Estructura

```
apps/
  api/   Express 5 + TypeScript + SQLite (better-sqlite3)
  web/   React 19 + Vite + TypeScript
```

Monorepo con npm workspaces. El código está en inglés; la documentación, en español.

## Requisitos

- Node.js 22 o superior (ver `.nvmrc`)
- npm 10 o superior

## Cómo correr el proyecto

```bash
npm install
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env
npm run dev
```

- API: http://localhost:3000
- Web: http://localhost:5173

> `better-sqlite3` compila un binario nativo al instalarse. El `package.json` raíz lo autoriza en `allowScripts` (npm 11 bloquea los scripts de instalación por defecto).

## Pruebas

```bash
npm test                # pruebas de API y web
npm run test:coverage   # pruebas con cobertura (falla si baja del 90%)
npm run lint            # ESLint con reglas basadas en tipos
npm run typecheck       # chequeo de tipos de ambos proyectos
```

El reporte HTML de cobertura queda en `apps/*/coverage/index.html`.

## Integración continua

En `.github/workflows/` hay dos workflows que corren en cada push y en cada pull request hacia `main` o `develop`:

- **Tests:** pruebas de API y web en paralelo, con umbral de cobertura del 90% (líneas, ramas, funciones y sentencias).
- **Lint:** ESLint (`strictTypeChecked` de typescript-eslint) y `tsc --noEmit`.

> TypeScript está fijado en 6.0.x porque typescript-eslint todavía no soporta TypeScript 7.

## Usuarios de prueba

La base se crea y se puebla sola al arrancar la API (`apps/api/data/orbita.db`). Solo se guarda el hash de cada contraseña.

| Id | Email | Contraseña |
|---|---|---|
| `u_123` | `ana@orbita.test` | `Orbita-Ana-2026` |
| `u_456` | `luis@orbita.test` | `Orbita-Luis-2026` |
| `u_789` | `maria@orbita.test` | `Orbita-Maria-2026` |
| `u_321` | `carlos@orbita.test` | `Orbita-Carlos-2026` |
| `u_654` | `sofia@orbita.test` | `Orbita-Sofia-2026` |

`u_123` es el usuario del ejemplo del webhook en el enunciado.

```bash
curl -X POST http://localhost:3000/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"ana@orbita.test","password":"Orbita-Ana-2026"}'
```

## Formato de errores

Todos los errores responden JSON con la misma forma; nunca se envía la traza al cliente:

```json
{ "error": { "code": "VALIDATION_ERROR", "message": "Request body is invalid", "details": [{ "field": "email", "message": "..." }] } }
```

| Código | HTTP | Cuándo |
|---|---|---|
| `VALIDATION_ERROR` | 400 | El body no cumple el esquema (`details` indica el campo) |
| `INVALID_JSON` | 400 | El body no es JSON válido |
| `INVALID_CREDENTIALS` | 401 | Email inexistente o contraseña incorrecta (mismo error en ambos casos) |
| `MISSING_TOKEN` | 401 | Falta el header `Authorization` |
| `INVALID_TOKEN` | 401 | Token mal formado, con firma inválida o de un usuario que ya no existe |
| `TOKEN_EXPIRED` | 401 | Token vencido |
| `NOT_FOUND` | 404 | Ruta inexistente |
| `PAYLOAD_TOO_LARGE` | 413 | Body de más de 10 KB |
| `INTERNAL_ERROR` | 500 | Error inesperado (el detalle queda solo en el log del servidor) |

Los tres códigos de 401 permiten que la pantalla explique al usuario por qué vuelve al login (por ejemplo, "tu sesión expiró").

## Decisiones

### Persistencia: SQLite (`better-sqlite3`)

- Corre sin Docker ni servicios externos: `npm install` y listo.
- Tiene lo que necesita un servicio de dinero: transacciones ACID, restricciones `CHECK`, `UNIQUE` y llaves foráneas. Las reglas críticas viven en la base, no solo en el código.
- Las tablas son `STRICT`, así que SQLite rechaza tipos incorrectos en lugar de convertirlos.
- El esquema se versiona con migraciones ordenadas (`PRAGMA user_version`), aplicadas al arrancar.
- **Límite conocido:** SQLite serializa las escrituras y vive en un solo archivo, así que no sirve para varias instancias de la API. En producción usaría PostgreSQL con el mismo diseño de restricciones.

### Autenticación

- **Contraseñas con scrypt** (`node:crypto`, N=2^14, r=8, p=1, sal aleatoria de 16 bytes). No requiere dependencias nativas extra y el formato guardado (`scrypt$N$r$p$sal$hash`) permite subir el costo en el futuro sin invalidar los hashes existentes. La comparación usa `timingSafeEqual`.
- **Mismo error y mismo costo** si el email no existe o la contraseña es incorrecta: cuando el email no existe se verifica contra un hash ficticio, para que el tiempo de respuesta no revele qué emails están registrados.
- **JWT HS256 con expiración de 30 minutos** (configurable con `JWT_TTL_SECONDS`). Se eligió JWT porque la verificación no necesita estado ni una tabla de sesiones. La contrapartida es que no se puede revocar antes de que venza; por eso la duración es corta. El algoritmo se fija en la verificación para bloquear tokens `alg: none`.
- El middleware toma el usuario **solo del token** (`sub`) y verifica que siga existiendo. Las rutas protegidas no leen ningún id de usuario de headers, query ni body.
- Los secretos (`JWT_SECRET`, `WEBHOOK_SECRET`) vienen solo de variables de entorno; la API no arranca si faltan.

## Qué dejé fuera y qué haría con más tiempo

_Pendiente._

## Tiempo dedicado

_Pendiente._

## Uso de IA

_Pendiente._
