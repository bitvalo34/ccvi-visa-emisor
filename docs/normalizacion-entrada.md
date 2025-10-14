# Documento de Normalización de Entrada — Emisor Visa

**Proyecto:** CCVI – Emisor de Tarjetas (Visa)  
**Ámbito:** API REST (legacy `GET /VISA/autorizacion` y moderno `POST /VISA/api/v1/authorizations`)  
**DB:** PostgreSQL, esquema `emisor`  
**Estado:** Versión final para entrega

---

## 1. Objetivo

Establecer reglas **determinísticas** de normalización y validación de datos de entrada antes de procesar una autorización o pago.  
Estas reglas garantizan interoperabilidad con el CRS/Aerolíneas, motores de reserva y reproducibilidad en UAT (sin ambigüedades por tildes, espacios, formatos, moneda, etc.).

---

## 2. Alcance

Se normalizan y validan los campos:

- **tarjeta** / **numero** (PAN 16 dígitos + Luhn) — en el endpoint moderno se prefiere `numero`.
- **nombre** (titular)
- **fecha_venc** (`YYYYMM`; admite `MM/YY` y `MMYY` → se convierte a `YYYYMM`)
- **cvv**/**num_seguridad** (3 dígitos)
- **monto** (decimal > 0 con hasta 2 decimales)
- **tienda** (comercio)
- **Idempotency-Key** (header; opcional)

Aplicación:

- Legacy `GET /VISA/autorizacion`: toma **query params** y responde **JSON** o **XML** según `formato`.
- Moderno `POST /VISA/api/v1/authorizations`: toma **JSON** en el **body**; responde **JSON** o **XML** según cabecera `Accept`.
- En ambos, la API usa el middleware `normalize.js` y valida con `validateAuthorizationInput`.

---

## 3. Reglas de normalización

### 3.1 Nombre del titular (`nombre`)

- **Unicode NFD** y eliminación de **diacríticos** (tildes).
- Eliminar **espacios** y separadores (`' - . , ·`), y todo carácter **no alfanumérico**.
- Convertir a **MAYÚSCULAS**.
- Longitud final esperada: **2–60**; si queda vacío, es error.

**Ejemplos**  
`" Juán  PéRez "` → **`JUANPEREZ`**  
`"Muñoz  Vergüenza"` → **`MUNOZVERGUENZA`**  
`"Ana-María O’Neill"` → **`ANAMARIAONEILL`**

> En la BD existe la columna **GENERADA** `tarjetas.nombre_titular_normalizado` con las mismas reglas; la API compara contra ella.

### 3.2 Número de tarjeta (`tarjeta`)

- Eliminar espacios/guiones; debe quedar **exactamente 16 dígitos**.
- Validar **algoritmo de Luhn (mod 10)**.
- Si falla formato o Luhn → **422**.

### 3.3 CVV / `num_seguridad`

- Solo **3 dígitos**.
- **No** se persiste el valor plano; se valida contra `cvv_hmac` (HMAC-SHA256 con _pepper_).
- **Nunca** se loguea.

### 3.4 Fecha de vencimiento (`fecha_venc`)

- Formato objetivo: **`YYYYMM`**.
- Si llega `MM/YY` o `MMYY`, convertir a `YYYYMM`:
  - `YY 00–79 → 20YY`
  - `YY 80–99 → 19YY` (solo para datasets históricos / no productivo)
- Validar que `MM` ∈ `01..12`.
- Debe ser **≥** mes actual (en DB ya hay checks/trigger; aquí validamos formato).

### 3.5 Monto (`monto`)

- Cadena `^\d+(\.\d{1,2})?$`; luego convertir a número.
- **> 0** y con **hasta 2 decimales**.

### 3.6 Comercio (`tienda`)

- Quitar espacios; dejar `A–Z0–9_`; **MAYÚSCULAS**.
- Longitud sugerida: **3–32**.
- Ej.: `"My Booking"` → **`MYBOOKING`**.

### 3.7 Idempotency-Key (header)

- `trim`; ASCII visible; **longitud ≤ 255**.
- Si supera el límite → **400**.
- Debe devolver **la misma autorización** si se repite la misma solicitud con la misma clave.

### 3.8 Moneda (`moneda`) — solo endpoint moderno

- Opcional. Si no se especifica se asume moneda base (p.e. `USD`).
- Código ISO 4217 de 3 letras en MAYÚSCULAS (`USD`, `EUR`, `MXN`).
- Validar pertenencia a lista soportada (configurable). No soportada → error `INVALID_CURRENCY`.

---

## 4. Contrato de error (422)

Siempre **JSON**:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Formato inválido",
    "fields": [
      { "field": "tarjeta", "reason": "INVALID_FORMAT_OR_LUHN" },
      { "field": "cvv", "reason": "INVALID_FORMAT" }
    ]
  }
}
```

**Motivos posibles por campo (actualizado):**

- tarjeta/numero: `INVALID_FORMAT_OR_LUHN`
- nombre: `EMPTY_AFTER_NORMALIZATION`
- fecha_venc: `INVALID_FORMAT`
- cvv: `INVALID_FORMAT`
- monto: `INVALID_AMOUNT`
- tienda/comercio: `INVALID_FORMAT`
- moneda: `INVALID_CURRENCY`
- Idempotency-Key: `INVALID_LENGTH`

## 5. Implementación en la API

### 5.1 Middleware (`src/middleware/normalize.js`)

- `normalizeAuthorizationInput` → normaliza y guarda en `req.normalized`.
- `validateAuthorizationInput` → valida; si hay errores, responde **422**.

### 5.2 Conexión en `app.js`

app.get('/VISA/autorizacion', normalizeAuthorizationInput, validateAuthorizationInput, handler);
app.post('/VISA/api/v1/authorizations', normalizeAuthorizationInput, validateAuthorizationInput, handler);

_Mientras se implementa la autorización real, el handler devuelve el payload normalizado (stub)._

---

## 6. Compatibilidad con la BD

- Comparar `req.normalized.nombre` con `tarjetas.nombre_titular_normalizado` (columna **GENERADA**).
- `fecha_venc` como `CHAR(6)` (`YYYYMM`).
  -- CVV: comparar HMAC con `tarjetas.cvv_hmac` usando Pepper `CVV_PEPPER`; **no** almacenar CVV plano.
- Idempotencia: índice único parcial sobre `(tarjeta_numero, comercio, monto, idempotency_key)` cuando `idempotency_key` **no** es `NULL`.
  -- `autorizacion_numero`: índice único parcial cuando `status='APROBADO'`.
  -- Moneda (si se guarda en transacciones modernas) normalizada a ISO 4217.

---

## 7. Ejemplos tras normalizar

### 7.1 Legacy (GET)

    /autorizacion?tarjeta=4111 1111 1111 1111
    &nombre=Juán  PéRez
    &fecha_venc=07/27
    &num_seguridad=123
    &monto=1200
    &tienda=My Booking
    &formato=JSON

**Normalizado:**

    {
      "tarjeta": "4111111111111111",
      "nombre": "JUANPEREZ",
      "fecha_venc": "202707",
      "cvv": "123",
      "monto": "1200",
      "tienda": "MYBOOKING"
    }

### 7.2 Moderno (POST)

**Request:**

    {
      "tarjeta": "4111111111111111",
      "nombre": "Ana-María O’Neill",
      "fecha_venc": "202701",
      "cvv": "123",
      "monto": 50.75,
      "tienda": "My Booking"
    }

**Normalizado:**

    {
      "tarjeta": "4111111111111111",
      "nombre": "ANAMARIAONEILL",
      "fecha_venc": "202701",
      "cvv": "123",
      "monto": "50.75",
      "tienda": "MYBOOKING"
    }

### 7.3 Moderno con Moneda e Idempotencia

    POST /VISA/api/v1/authorizations
    Headers:
      Content-Type: application/json
      x-api-key: <API_KEY>
      Idempotency-Key: 55c9ef1b-1c3b-4b1b-9e55-987654321000
      Accept: application/json
    Body:
    {
      "numero": "4111111111111111",
      "nombre": "Muñoz Vergüenza",
      "fecha_venc": "07/27",
      "cvv": "123",
      "monto": 600.00,
      "comercio": "My Booking",
      "moneda": "USD"
    }

**Normalizado:**
{
"numero": "4111111111111111",
"nombre": "MUNOZVERGUENZA",
"fecha_venc": "202707",
"cvv": "123",
"monto": "600.00",
"comercio": "MYBOOKING",
"moneda": "USD",
"idempotencyKey": "55c9ef1b-1c3b-4b1b-9e55-987654321000"
}

---

## 8. Pruebas mínimas

- **Nombre:** tildes/ñ/ü/espacios/símbolos → valor esperado; vacío → error.
- **PAN:** válidos Luhn e inválidos; 16 dígitos exactos.
- **CVV:** `123` ok; `12`, `abc`, `1234` error.
- **Fecha:** `202701`, `07/27`, `0727` ok; mes `00/13` o formato incorrecto error.
- **Monto:** `1`, `1.0`, `1.23` ok; `0`, `-1`, `1.234`, `abc` error.
- **Tienda:** `"My Booking"` → `MYBOOKING`.
- **Idempotency-Key:** ≤ 255 ok; > 255 error.
- Moneda: soportadas (`USD`, `EUR`, `MXN`) ok; `USDX`, numérico o vacía error.
- Idempotency-Key: ≤ 255 ok; > 255 error.

---

## 9. Seguridad

- **CVV:** dato sensible. Se usa solo para autorización; **no** se almacena ni se loguea.
- **PAN:** en logs, solo **últimos 4**.
- **Headers:** soporta `Idempotency-Key` (≤ 255).
- **Rate limiting** recomendado en `/autorizacion`.
- **PAN:** en autorizaciones modernas puede anonimizarse más en nivel debug.
- **Pepper CVV:** variable `CVV_PEPPER` centralizada.
- **Rate limiting** recomendado también en `/VISA/autorizacion` y `/VISA/api/v1/authorizations`.

---

## 10. Anexo — Interfaces

### 10.1 Middleware (referencia)

`src/middleware/normalize.js` expone:

    normalizeAuthorizationInput(req, res, next)
    validateAuthorizationInput(req, res, next)

**Resultado de normalización (`req.normalized`):**

```ts
type NormalizedInput = {
  numero?: string; // alias moderno de tarjeta
  tarjeta?: string; // legado
  nombre: string; // mayúsculas, sin tildes/espacios
  fecha_venc: string; // YYYYMM
  cvv: string; // 3 dígitos
  monto: string; // decimal positivo en string
  tienda?: string; // MAYÚSCULAS A–Z0–9_ (legacy)
  comercio?: string; // moderno
  moneda?: string; // ISO 4217
  idempotencyKey?: string; // opcional, <= 255
};
```
