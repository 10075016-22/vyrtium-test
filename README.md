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

_Pendiente._

## Decisiones

_Pendiente._

## Qué dejé fuera y qué haría con más tiempo

_Pendiente._

## Tiempo dedicado

_Pendiente._

## Uso de IA

_Pendiente._
