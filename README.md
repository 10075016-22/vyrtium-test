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

## Endpoints

| Método | Ruta | Auth | Descripción |
|---|---|---|---|
| `POST` | `/auth/login` | No | `{ email, password }` → `{ accessToken, tokenType, expiresIn }` |
| `GET` | `/balances/me` | Bearer | Saldo actual; si no existe, se crea en `0.00` |
| `POST` | `/balances/me/deposits` | Bearer + `Idempotency-Key` | `{ amount: "150.25", currency: "USD" }` → 201 con el movimiento y el saldo |
| `POST` | `/balances/me/withdrawals` | Bearer + `Idempotency-Key` | Igual que el depósito; nunca deja el saldo negativo |
| `GET` | `/balances/me/transactions?page=1&pageSize=10` | Bearer | Movimientos del más reciente al más antiguo |
| `POST` | `/webhooks/payment-gateway` | `X-Signature` (HMAC) | Evento de la pasarela; si está `approved`, acredita al `user_id` del evento |

Los montos viajan siempre como **string** con hasta 2 decimales (`"150.25"`), tanto en las peticiones como en las respuestas. Un `amount` numérico en JSON se rechaza con 400.

Las respuestas de depósito y retiro incluyen el header `Idempotent-Replayed: true|false`, que indica si es una repetición de una respuesta guardada.

```bash
TOKEN=<accessToken del login>
curl -X POST http://localhost:3000/balances/me/deposits \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Idempotency-Key: 6f1c2a9e-deposito-1' \
  -H 'Content-Type: application/json' \
  -d '{"amount":"150.25","currency":"USD"}'
```

Webhook firmado con el secreto de `apps/api/.env`:

```bash
SECRET=$(grep '^WEBHOOK_SECRET=' apps/api/.env | cut -d= -f2-)
BODY='{"event_id":"evt_8f2a","user_id":"u_123","amount":"200.00","currency":"USD","status":"approved"}'
SIG=$(printf '%s' "$BODY" | openssl dgst -sha256 -hmac "$SECRET" | awk '{print $NF}')
curl -X POST http://localhost:3000/webhooks/payment-gateway \
  -H 'Content-Type: application/json' -H "X-Signature: $SIG" -d "$BODY"
```

Respuesta del webhook (200 tanto para eventos nuevos como para duplicados y rechazados):

```json
{ "eventId": "evt_8f2a", "status": "approved", "credited": true, "duplicate": false, "transactionId": "txn_..." }
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
| `MISSING_SIGNATURE` | 401 | Webhook sin header `X-Signature` |
| `INVALID_SIGNATURE` | 401 | La firma no corresponde al body recibido |
| `IDEMPOTENCY_KEY_REQUIRED` | 400 | Depósito o retiro sin header `Idempotency-Key` |
| `IDEMPOTENCY_KEY_INVALID` | 400 | Llave vacía, con espacios o de más de 255 caracteres |
| `NOT_FOUND` | 404 | Ruta inexistente |
| `PAYLOAD_TOO_LARGE` | 413 | Body de más de 10 KB |
| `INVALID_AMOUNT` | 422 | Monto que no es positivo o tiene más de 2 decimales |
| `AMOUNT_LIMIT_EXCEEDED` | 422 | Monto mayor a 10000.00 USD |
| `UNSUPPORTED_CURRENCY` | 422 | Moneda distinta de `USD` |
| `INSUFFICIENT_FUNDS` | 422 | El retiro dejaría el saldo negativo |
| `IDEMPOTENCY_KEY_REUSED` | 422 | La llave ya se usó con otro body u otra operación |
| `UNKNOWN_USER` | 422 | El `user_id` del webhook no existe |
| `WEBHOOK_EVENT_CONFLICT` | 409 | El `event_id` ya llegó con otro contenido (monto, usuario o status) |
| `INTERNAL_ERROR` | 500 | Error inesperado (el detalle queda solo en el log del servidor) |

Regla general: **400** cuando la petición está mal formada (falta un campo, tipo incorrecto, header ausente) y **422** cuando está bien formada pero viola una regla de negocio.

Los tres códigos de 401 permiten que la pantalla explique al usuario por qué vuelve al login (por ejemplo, "tu sesión expiró").

## Decisiones

### Persistencia: SQLite (`better-sqlite3`)

- Corre sin Docker ni servicios externos: `npm install` y listo.
- Tiene lo que necesita un servicio de dinero: transacciones ACID, restricciones `CHECK`, `UNIQUE` y llaves foráneas. Las reglas críticas viven en la base, no solo en el código.
- Las tablas son `STRICT`, así que SQLite rechaza tipos incorrectos en lugar de convertirlos.
- El esquema se versiona con migraciones ordenadas (`PRAGMA user_version`), aplicadas al arrancar.
- **Límite conocido:** SQLite serializa las escrituras y vive en un solo archivo, así que no sirve para varias instancias de la API. En producción usaría PostgreSQL con el mismo diseño: el mismo update condicional, las mismas restricciones `CHECK` y `UNIQUE`, y `INSERT ... ON CONFLICT` sobre la llave de idempotencia para resolver la concurrencia entre instancias.

### Dinero

- **Centavos enteros en toda la cadena.** El string `"150.25"` se valida con una regex y se convierte a `15025` sumando la parte entera y la decimal como enteros; nunca pasa por `Number`, `parseFloat` ni `toFixed`. Por eso `0.10 + 0.20` da exactamente `0.30`.
- El máximo de 10000.00 USD es **inclusivo**. Montos como `"150.2"` se aceptan y equivalen a `"150.20"`.
- **El saldo nunca queda negativo, en tres capas:**
  1. El retiro es un update condicional: `UPDATE balances SET amount_cents = amount_cents - ? WHERE user_id = ? AND amount_cents >= ?`. La comprobación y la escritura son una sola sentencia, así que dos retiros simultáneos no pueden pasar ambos con una lectura vieja del saldo.
  2. Saldo, movimiento y respuesta idempotente se escriben en la misma transacción `BEGIN IMMEDIATE`.
  3. La base tiene `CHECK (amount_cents >= 0)`: aunque hubiera un bug en el código, SQLite rechazaría la escritura.
- Cada movimiento guarda el saldo resultante (`balanceAfter`), lo que permite auditar el historial.

### Idempotencia

- `Idempotency-Key` es obligatoria en depósitos y retiros, y su alcance es **por usuario**: la llave primaria de la tabla es `(user_id, key)`. La misma llave enviada por otro usuario es una petición nueva y nunca devuelve la respuesta de otro.
- Por cada llave se guarda: el hash SHA-256 de la petición canónica (operación, monto en centavos y moneda), el status y el body de la respuesta, y la fecha.
- **Misma llave y misma petición:** se devuelve la respuesta original (mismo status y body) sin mover dinero.
- **Misma llave con otro monto u otra operación:** 422 `IDEMPOTENCY_KEY_REUSED`, sin efectos.
- **Respuesta de fondos insuficientes:** también se guarda. Reintentar con la misma llave devuelve el mismo 422 aunque después haya fondos; para un intento nuevo se usa una llave nueva.
- **Errores de validación** (400 y 422 por monto o moneda): no se guardan. Se rechazan antes de tocar la base y la llave sigue disponible para enviar la petición corregida.
- **Concurrencia con la misma llave:** la búsqueda de la llave, la operación y el guardado de la respuesta ocurren en una sola transacción `IMMEDIATE`, que toma el lock de escritura de SQLite al empezar. Una segunda petición con la misma llave espera y encuentra la respuesta ya guardada. Si el proceso cae a mitad de camino, todo se revierte junto: no existe una ventana donde el dinero se movió pero la llave no quedó registrada.
- **Expiración:** las llaves expiran a las 24 horas (`IDEMPOTENCY_TTL_HOURS`). La llave vencida se borra al volver a usarla; en producción habría una limpieza periódica.

### Webhook de la pasarela

- **Firma sobre el body crudo.** La ruta lee el body como bytes (`express.raw`) y se monta antes de `express.json()`. El HMAC-SHA256 se calcula sobre esos bytes exactos: volver a serializar el JSON parseado cambiaría el espaciado o el orden de las llaves y rompería firmas válidas. La comparación usa `timingSafeEqual`, después de validar que la firma tenga 64 caracteres hexadecimales.
- **La firma se verifica antes de leer el contenido:** un body sin firma válida responde 401 aunque además sea JSON inválido, sin dar pistas sobre su formato.
- **Dedupe por `event_id` en la base.** `event_id` es la llave primaria de `webhook_events`, y el evento se registra con `INSERT ... ON CONFLICT DO NOTHING RETURNING`: la base decide si es la primera entrega, sin un paso previo de "leer y luego insertar". Registrar el evento, acreditar el saldo y crear el movimiento (`gateway_credit`) van en la misma transacción.
- **Duplicados:** responden 200 con `duplicate: true` y el resultado original, para que la pasarela deje de reintentar.
- **`rejected`:** se registra y responde 200 sin acreditar. Queda guardado, así que un `approved` posterior con el mismo `event_id` no puede convertirlo en un crédito.
- **Mismo `event_id` con otro contenido:** 409 `WEBHOOK_EVENT_CONFLICT`, sin efectos. Una reentrega legítima trae el mismo contenido; uno distinto indica un problema en la integración y no debe resolverse en silencio.
- **Usuario inexistente:** 422 `UNKNOWN_USER` y no se registra nada. No hay registro de usuarios, así que el evento no se puede aplicar.
- **Montos:** aplican las mismas reglas que en depósitos (positivos, 2 decimales, máximo 10000.00, solo USD).

### Historial

- Paginación por página (`page`, `pageSize` de 1 a 100, 10 por defecto) ordenada por una secuencia autoincremental, que es estable aunque dos movimientos tengan la misma fecha.
- Una página fuera de rango devuelve `data: []` con 200, no un error.

### Autenticación

- **Contraseñas con scrypt** (`node:crypto`, N=2^14, r=8, p=1, sal aleatoria de 16 bytes). No requiere dependencias nativas extra y el formato guardado (`scrypt$N$r$p$sal$hash`) permite subir el costo en el futuro sin invalidar los hashes existentes. La comparación usa `timingSafeEqual`.
- **Mismo error y mismo costo** si el email no existe o la contraseña es incorrecta: cuando el email no existe se verifica contra un hash ficticio, para que el tiempo de respuesta no revele qué emails están registrados.
- **JWT HS256 con expiración de 30 minutos** (configurable con `JWT_TTL_SECONDS`). Se eligió JWT porque la verificación no necesita estado ni una tabla de sesiones. La contrapartida es que no se puede revocar antes de que venza; por eso la duración es corta. El algoritmo se fija en la verificación para bloquear tokens `alg: none`.
- El middleware toma el usuario **solo del token** (`sub`) y verifica que siga existiendo. Las rutas protegidas no leen ningún id de usuario de headers, query ni body.
- Los secretos (`JWT_SECRET`, `WEBHOOK_SECRET`) vienen solo de variables de entorno; la API no arranca si faltan.

## Qué dejé fuera y qué haría con más tiempo

- **Paginación por cursor** (`?after=<seq>`) en lugar de por página: con offset, si llega un movimiento nuevo mientras el usuario navega, la página siguiente repite un elemento. Con el volumen de esta prueba, la paginación por página es más simple de usar desde la UI.
- **Limpieza periódica de llaves de idempotencia vencidas.** Hoy solo se borra una llave vencida cuando se vuelve a usar.
- **PostgreSQL** si la API corriera en varias instancias (ver "Persistencia").
- **Preguntas para el contrato con la pasarela.** El payload no trae un id de pago, solo `event_id`, así que un `rejected` y luego un `approved` del mismo pago con `event_id` distintos se tratan como eventos independientes y el `approved` acredita. No inventé una regla para esto: hay que acordarla con la pasarela. Tampoco está definido qué hacer con un pago aprobado por más de 10000.00 USD; hoy se rechaza con 422 igual que un depósito.
- **Protección contra replay en el webhook.** La firma no incluye un timestamp, así que un evento firmado capturado se podría reenviar. El dedupe por `event_id` impide que acredite dos veces, pero con un header de timestamp firmado se podrían rechazar los eventos viejos.
- **Usuario inexistente en el webhook.** En producción, en lugar de rechazarlo, lo guardaría en una cola de conciliación manual: es dinero que la pasarela ya cobró.

## Tiempo dedicado

_Pendiente._

## Uso de IA

_Pendiente._
