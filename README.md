# Orbita · Servicio de saldo

Versión simplificada del servicio de saldo prepago (USD) de Orbita: una API en Node.js + TypeScript y una pantalla web en React que la consume.

## Resumen

Lo que protege el dinero, y dónde está en el código:

| Garantía | Cómo | Dónde |
|---|---|---|
| Montos sin float | String → centavos enteros con regex, sin `Number` ni `parseFloat` | [`money.ts`](apps/api/src/balances/money.ts) |
| El saldo nunca queda negativo, ni con concurrencia | `UPDATE ... WHERE amount_cents >= ?` + `CHECK (amount_cents >= 0)` en la base | [`balances.repository.ts`](apps/api/src/balances/balances.repository.ts), [`migrations.ts`](apps/api/src/db/migrations.ts) |
| Saldo, movimiento y respuesta idempotente juntos | Una sola transacción `BEGIN IMMEDIATE` | [`idempotency.ts`](apps/api/src/idempotency/idempotency.ts) |
| Idempotencia por usuario | Llave primaria `(user_id, key)` + hash de la petición; otro body con la misma llave → 422 | [`idempotency.ts`](apps/api/src/idempotency/idempotency.ts) |
| Webhook auténtico y sin duplicados | HMAC-SHA256 sobre el body crudo con `timingSafeEqual`; `event_id` como llave primaria | [`signature.ts`](apps/api/src/webhooks/signature.ts), [`webhooks.service.ts`](apps/api/src/webhooks/webhooks.service.ts) |
| El usuario sale solo del token | Middleware que ignora ids en headers, query y body | [`auth.middleware.ts`](apps/api/src/auth/auth.middleware.ts) |
| Sin depósitos duplicados desde la pantalla | `Idempotency-Key` por intento, reutilizada al reintentar; doble clic bloqueado | [`MovementForm.tsx`](apps/web/src/components/MovementForm.tsx) |

Cada garantía tiene pruebas de integración contra la API real (supertest), incluidas pruebas de concurrencia: [`balances.test.ts`](apps/api/test/balances.test.ts) y [`webhooks.test.ts`](apps/api/test/webhooks.test.ts).

## Estructura

```
apps/
  api/   Express 5 + TypeScript + SQLite (better-sqlite3)
  web/   React 19 + Vite + TypeScript + Tailwind CSS 4
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
- Web: http://localhost:5173 (entra con cualquiera de los [usuarios de prueba](#usuarios-de-prueba))

> `better-sqlite3` compila un binario nativo al instalarse. El `package.json` raíz lo autoriza en `allowScripts` (npm 11 bloquea los scripts de instalación por defecto).

**Puertos ocupados.** La web usa el puerto 5173 de forma estricta: si está ocupado, `npm run dev` falla con `Port 5173 is in use` en lugar de moverse a otro puerto, porque la API solo acepta peticiones (CORS) desde ese origen. Para usar otros puertos:

```bash
PORT=3100 CORS_ORIGIN=http://localhost:5180 npm run dev -w apps/api
VITE_API_URL=http://localhost:3100 npm run dev -w apps/web -- --port 5180
```

Para empezar con la base vacía, borra `apps/api/data/orbita.db`: se vuelve a crear con los usuarios de prueba al arrancar.

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

La pantalla de login muestra a Ana y Luis como usuarios de prueba, con un botón "Usar" que completa el formulario. Son credenciales públicas de demostración: en un entorno real esa sección no existiría.

```bash
curl -X POST http://localhost:3000/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"ana@orbita.test","password":"Orbita-Ana-2026"}'
```

## Endpoints

| Método | Ruta | Auth | Descripción |
|---|---|---|---|
| `POST` | `/auth/login` | No | `{ email, password }` → `{ accessToken, tokenType, expiresIn }`; además fija la cookie de sesión |
| `GET` | `/auth/me` | Bearer o cookie | `{ id, email }` del usuario de la sesión |
| `POST` | `/auth/logout` | No | Borra la cookie de sesión (204) |
| `GET` | `/balances/me` | Bearer | Saldo actual; si no existe, se crea en `0.00` |
| `POST` | `/balances/me/deposits` | Bearer + `Idempotency-Key` | `{ amount: "150.25", currency: "USD" }` → 201 con el movimiento y el saldo |
| `POST` | `/balances/me/withdrawals` | Bearer + `Idempotency-Key` | Igual que el depósito; nunca deja el saldo negativo |
| `GET` | `/balances/me/transactions?page=1&pageSize=10` | Bearer | Movimientos del más reciente al más antiguo, con `total` y `totalPages` |
| `POST` | `/webhooks/payment-gateway` | `X-Signature` (HMAC) | Evento de la pasarela; si está `approved`, acredita al `user_id` del evento |

"Bearer" significa `Authorization: Bearer <token>`, como pide el enunciado. La pantalla web no usa ese header: se autentica con la cookie `HttpOnly` que fija el login (ver "Autenticación"). Las dos formas sirven en todos los endpoints protegidos.

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
| `MISSING_TOKEN` | 401 | No llegó ni el header `Authorization` ni la cookie de sesión |
| `INVALID_TOKEN` | 401 | Token mal formado, con firma inválida o de un usuario que ya no existe |
| `TOKEN_EXPIRED` | 401 | Token vencido |
| `CSRF_REJECTED` | 403 | Escritura autenticada con la cookie desde un origen distinto al de la web |
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

- **Paginación por página** (`page` desde 1, `pageSize` de 1 a 100, 10 por defecto), ordenada por `seq`, una secuencia autoincremental que es estable aunque dos movimientos tengan la misma fecha. La respuesta incluye `total` y `totalPages`, que la pantalla necesita para mostrar los números de página.
- `LIMIT/OFFSET` y `COUNT(*)` usan el índice `(user_id, seq DESC)`, así que solo recorren los movimientos de ese usuario.
- Una página fuera de rango devuelve `data: []` con 200, no un error.
- La consulta se valida de forma estricta: un parámetro desconocido responde 400 en lugar de ignorarse en silencio.

### Autenticación

- **Contraseñas con scrypt** (`node:crypto`, N=2^14, r=8, p=1, sal aleatoria de 16 bytes). No requiere dependencias nativas extra y el formato guardado (`scrypt$N$r$p$sal$hash`) permite subir el costo en el futuro sin invalidar los hashes existentes. La comparación usa `timingSafeEqual`.
- **Mismo error y mismo costo** si el email no existe o la contraseña es incorrecta: cuando el email no existe se verifica contra un hash ficticio, para que el tiempo de respuesta no revele qué emails están registrados.
- **JWT HS256 con expiración de 30 minutos** (configurable con `JWT_TTL_SECONDS`). Se eligió JWT porque la verificación no necesita estado ni una tabla de sesiones. La contrapartida es que no se puede revocar antes de que venza; por eso la duración es corta. El algoritmo se fija en la verificación para bloquear tokens `alg: none`.
- El middleware toma el usuario **solo del token** (`sub`) y verifica que siga existiendo. El token llega en el header `Authorization: Bearer` (clientes de API, como pide el enunciado) o, si no hay header, en la cookie de sesión (la web). Las rutas protegidas no leen ningún id de usuario de headers, query ni body.
- **Cookie de sesión `HttpOnly`.** El login devuelve el token en el body, como pide el enunciado, y además lo fija en la cookie `orbita_session` con `HttpOnly`, `SameSite=Strict`, `Path=/` y la misma duración que el token. `Secure` se activa con `COOKIE_SECURE=true` (producción con HTTPS); en `http://localhost` queda apagado. Como JavaScript no puede leer ni borrar esa cookie, hay dos endpoints de apoyo: `GET /auth/me` (saber al recargar si hay sesión y de quién) y `POST /auth/logout` (borrarla).
- **Protección CSRF.** Una cookie la envía el navegador solo, así que una escritura autenticada con cookie podría venir de otro sitio. Hay dos defensas: `SameSite=Strict` impide que otros sitios la envíen, y además el middleware rechaza con 403 `CSRF_REJECTED` cualquier escritura con cookie cuyo `Origin` no sea el de la web (`CORS_ORIGIN`). Con el header `Bearer` no aplica, porque un navegador nunca lo agrega por su cuenta.
- Los secretos (`JWT_SECRET`, `WEBHOOK_SECRET`) vienen solo de variables de entorno; la API no arranca si faltan.

### Pantalla web

- **Sin router ni librería de componentes.** Son dos pantallas, login y saldo, que cambian según haya sesión. Estilos con **Tailwind CSS 4**: la paleta, la curva de easing y las animaciones están definidas como tokens en `@theme` (`src/styles.css`), y las combinaciones repetidas (tarjeta, botones, inputs) viven en `src/ui/classes.ts`. Mobile-first, con dos columnas desde 768 px. Tema oscuro basado en la paleta de vyrtium.com e íconos de `lucide-react`.
- **Transiciones** solo con `opacity` y `transform`, para que las resuelva la GPU sin recalcular el layout: los mensajes y los errores de campo entran con un fundido corto, el switch Depositar/Retirar desliza su indicador, el saldo hace un fundido cuando cambia y el movimiento recién creado entra deslizándose con un resaltado turquesa que se desvanece. Todas se desactivan con `prefers-reduced-motion`.
- **Autocompletado desactivado en el login** (`autocomplete="off"`). Algunos navegadores igual ofrecen contraseñas guardadas desde su gestor, porque ignoran ese atributo en campos de contraseña.
- **La sesión vive en una cookie `HttpOnly`**, no en `localStorage`: el código de la página nunca ve el token, así que un XSS no podría robarlo. `fetch` se hace con `credentials: 'include'` y la API permite credenciales solo desde `CORS_ORIGIN`. Al cargar, la pantalla consulta `GET /auth/me` (mientras tanto muestra "Verificando tu sesión…"); si la cookie venció o fue alterada, muestra el login con el motivo. Cerrar sesión llama a `POST /auth/logout`, porque solo el servidor puede borrar una cookie `HttpOnly`.
- **401 vuelve al login con el motivo.** Todas las llamadas autenticadas pasan por un mismo `request` del contexto de autenticación. Ante cualquier 401 cierra la sesión (y le pide a la API borrar la cookie) y muestra el motivo según el código de la API: "Tu sesión expiró" (`TOKEN_EXPIRED`) o "Tu sesión ya no es válida" (`INVALID_TOKEN`).
- **`Idempotency-Key` por intento.** La llave se genera con `crypto.randomUUID()` la primera vez que se envía una operación y queda asociada a esa operación (tipo + monto):
  - Si falla la red o la API responde 5xx, el resultado es incierto: se conserva la llave y el reintento envía la misma, así que la API no duplica el movimiento.
  - Si la operación termina (éxito o error de negocio como fondos insuficientes), o si el usuario cambia el monto o el tipo, el siguiente envío usa una llave nueva.
- **Doble clic.** El botón se deshabilita mientras se envía, pero además un `ref` bloquea el segundo envío de forma síncrona: un doble clic rápido dispara dos eventos antes de que React vuelva a renderizar el botón deshabilitado.
- **Máscara en el campo de monto.** Mientras se escribe solo se aceptan dígitos y un punto decimal, se descartan ceros a la izquierda y los miles se agrupan con coma (`1,234.50`). La máscara nunca cambia el monto que el usuario quiso escribir: un tercer decimal queda visible (`10.123`) para rechazarlo, en lugar de redondearlo en silencio a otro monto válido. Una coma escrita por el usuario se toma como punto decimal, porque es lo que muestra el teclado numérico en español; así `10,50` nunca se convierte en `1,050`. La parte entera admite hasta 5 dígitos, para que `10001` se pueda escribir y reciba el mensaje del máximo. El cursor se mantiene en el dígito editado cuando la máscara reagrupa los miles.
- **Validación antes de enviar** con las mismas reglas que la API (positivo, máximo 2 decimales, hasta 10,000.00), sobre el valor sin la máscara. Un monto inválido (`0`, `10.123`, `10001`, letras) muestra el error junto al campo y no genera ninguna petición.
- **Errores seguros se muestran mientras se escribe:** más de 2 decimales o más de 10,000.00 marcan el campo en rojo con su mensaje, que desaparece al corregir. Los demás (vacío, `0`) se muestran solo al enviar, porque mientras se escribe pueden ser estados intermedios, como `0.` antes de `0.50`.
- **Estados:** placeholders mientras carga, error con botón "Reintentar" (por ejemplo, con la API apagada) y estado vacío para un usuario sin movimientos. Al cambiar de página, la lista actual se atenúa hasta que llegan los datos nuevos. Después de cada operación se recargan el saldo y el historial, que vuelve a la página 1 sin desmontarse.
- **Paginación con números de página**: anterior y siguiente, la página actual y sus vecinas, y "…" cuando hay muchas; en pantallas angostas se muestran menos números para que el control quepa en una línea. Junto a ella, "41–50 de 96" y un selector de 5 o 10 movimientos por página. Usa el mismo control en forma de píldora que el switch Depositar/Retirar, y cada botón tiene un área táctil de unos 44 px aunque se vea más pequeño.
- **Notificaciones con toasts (`sonner`)** para el resultado de cada operación, ubicadas donde no tapan contenido (abajo a la derecha en escritorio, abajo al centro en móvil): éxito con el nuevo saldo, o el error de negocio en lenguaje claro. Un resultado nuevo reemplaza al anterior en lugar de apilarse. Si falla la red o la API responde 5xx, el toast trae un botón **"Reintentar"** que vuelve a enviar el formulario con la misma `Idempotency-Key`. Los mensajes del login (credenciales inválidas, sesión expirada) y los errores de campo se quedan junto al formulario: explican por qué el usuario está ahí y no deben desaparecer solos.
- **Accesibilidad:** todos los inputs tienen `<label>`, los errores están enlazados con `aria-describedby`, los toasts se anuncian en una región `aria-live`, el foco es visible, las áreas táctiles miden al menos 44 px y se respeta `prefers-reduced-motion`. En móvil, "Cerrar sesión" se muestra solo como ícono, con el texto disponible para lectores de pantalla.

## Qué dejé fuera y qué haría con más tiempo

- **Paginación por cursor (keyset)** en lugar de `OFFSET`: si llega un movimiento nuevo mientras el usuario navega, con `OFFSET` la página siguiente puede repetir un elemento, y con un cursor no. La descarté porque el cursor no conoce el total y la pantalla muestra números de página; además, el usuario vuelve a la página 1 después de cada operación propia. Si el historial creciera mucho o hubiera escrituras frecuentes de otros orígenes (como el webhook), cambiaría a cursor con "anterior/siguiente".
- **Limpieza periódica de llaves de idempotencia vencidas.** Hoy solo se borra una llave vencida cuando se vuelve a usar.
- **PostgreSQL** si la API corriera en varias instancias (ver "Persistencia").
- **Preguntas para el contrato con la pasarela.** El payload no trae un id de pago, solo `event_id`, así que un `rejected` y luego un `approved` del mismo pago con `event_id` distintos se tratan como eventos independientes y el `approved` acredita. No inventé una regla para esto: hay que acordarla con la pasarela. Tampoco está definido qué hacer con un pago aprobado por más de 10000.00 USD; hoy se rechaza con 422 igual que un depósito.
- **Protección contra replay en el webhook.** La firma no incluye un timestamp, así que un evento firmado capturado se podría reenviar. El dedupe por `event_id` impide que acredite dos veces, pero con un header de timestamp firmado se podrían rechazar los eventos viejos.
- **Usuario inexistente en el webhook.** En producción, en lugar de rechazarlo, lo guardaría en una cola de conciliación manual: es dinero que la pasarela ya cobró.
- **Revocación de sesiones.** El JWT no se puede invalidar antes de que venza: cerrar sesión borra la cookie, pero un token copiado antes seguiría sirviendo hasta su expiración (30 minutos). Con más tiempo agregaría una lista de revocación (por `jti`) o tokens de acceso más cortos con refresh token rotativo.
- **Pruebas end-to-end en CI** con Playwright contra la API real. Los flujos de la pantalla se verificaron manualmente con Playwright (390 px y escritorio, red lenta, doble clic, reintento tras fallo de red, token alterado, API apagada), pero las pruebas automáticas de la web simulan la API en la capa de `fetch`.

## Forma de trabajo

Cada parte se hizo en su propia rama y entró a `main` por pull request, con el CI (pruebas con cobertura, lint y typecheck) en verde:

| PR | Rama | Contenido |
|---|---|---|
| #1 | `feat/configuracion-ci` | Monorepo, CI, ESLint con tipos, cobertura mínima del 90% y plantilla de PR |
| #2 | `feat/db-auth` | SQLite con migraciones, seed, login con JWT y formato de errores |
| #3 | `feat/balances` | Saldo, depósitos y retiros idempotentes, concurrencia e historial |
| #5 | `feat/webhook` | Webhook con HMAC sobre el body crudo y dedupe por `event_id` |
| #6 | `feat/web-implementation` | Pantallas de login y saldo |
| — | `docs/readme-final` | Este README, la revisión final y la paginación con números de página |

El orden fue por riesgo para el dinero: primero lo que puede corromper el saldo (API, idempotencia, concurrencia, webhook) y después la pantalla.

Antes de entregar se clonó el repositorio en una carpeta limpia y se siguió solo este README (`npm install`, copiar los `.env`, `npm run dev`, `npm test`). Además se verificaron a mano, contra la API real, los casos borde: login con el mismo error para email y contraseña, token alterado y vencido (`JWT_TTL_SECONDS=2`), idempotencia con la misma llave y otro body o de otro usuario, montos inválidos y en el límite, precisión decimal, retiros concurrentes, la misma llave en paralelo, ids ajenos ignorados, paginación fuera de rango y todos los casos del webhook (válido, duplicado, firma inválida o ausente, `rejected`, otro espaciado, usuario inexistente). En la pantalla se revisaron con Playwright a 390 px y en escritorio: sesión, token alterado, montos inválidos sin petición, red lenta, doble clic, reintento tras fallo de red, API apagada, estado vacío y paginación.

## Tiempo dedicado

Unas **2 h 45 min**, entre las 22:30 y las 01:15 (hora de Colombia), según las horas de los commits:

| Etapa | Tiempo aproximado |
|---|---|
| Análisis del enunciado y plan | 15 min |
| Configuración del monorepo y CI | 20 min |
| Base de datos, autenticación y errores | 15 min |
| Saldo, depósitos, retiros e idempotencia | 15 min |
| Webhook | 10 min |
| Pantalla web, ajustes de diseño y pruebas | 1 h 05 min |
| Revisión final y README | 25 min |

## Uso de IA

El proyecto se construyó trabajando con **Claude Code** (modelo Claude Opus 5.5) como asistente de programación, en modo agente dentro del editor.

**Qué hizo la IA:** análisis del enunciado y propuesta del plan por riesgo; la mayor parte del código de la API, la web y las pruebas; la redacción inicial de este README y de las descripciones de las PR; y la verificación visual con Playwright (MCP) a 390 px y en escritorio.

**Qué decidí y revisé yo:** los estándares del repositorio (código en inglés, documentación y commits en español, Conventional Commits, una rama y una PR por parte, CI con cobertura mínima del 90%), las decisiones de producto de la pantalla (usuarios de prueba en el login, máscara en el monto, validación en vivo, toasts, Tailwind, tema oscuro, 10 movimientos por página) y la revisión de cada PR antes de hacer merge. Los commits los hice yo.

**Qué hubo que corregir** (lo encontrado en la revisión, no en la primera versión):

- **Máscara del monto:** la primera versión recortaba `10.123` a `10.12` y enviaba ese depósito, un monto distinto al que el usuario escribió. Ahora el tercer decimal queda visible y se rechaza sin enviar nada.
- **Hint del monto:** al escribir `22,300` el campo no avisaba nada hasta enviar. Ahora el límite se valida mientras se escribe.
- **CI en rojo con todas las pruebas pasando:** sonner usa `setPointerCapture`, que no existe en jsdom; el error no capturado hacía terminar Vitest con código 1. La verificación inicial solo miraba el contador de pruebas y no el código de salida.
- **CORS y puerto de Vite:** si el 5173 estaba ocupado, Vite se movía a otro puerto que la API rechazaba, y la pantalla solo mostraba "no pudimos conectar". Se corrigió con `strictPort`.
- **Diseño:** scroll horizontal a 390 px por dos utilidades de padding en conflicto en el mismo botón; toasts que tapaban el header y el historial; paginación cada 5 movimientos dejando media pantalla vacía.
- **Tooling:** npm resolvía TypeScript 7, que typescript-eslint no soporta (se fijó 6.0.x); y una línea del `.gitignore` sin salto de línea final unía dos reglas y anulaba ambas.
