# Operar VoiceProvider

## Activación

Default `MIMIX_VOICE_PROVIDER=disabled`. No requiere claves ni cambia la UI.
Para activar deliberadamente síntesis en un único proceso:

1. Configurar Clerk y verificar permisos/sesión, CORS y UUID internos.
2. Crear clave ElevenLabs dedicada, restringida a TTS y con límite de créditos
   apropiado en el proveedor. Seleccionar una voz a la que la cuenta tenga acceso.
3. Guardar `ELEVENLABS_API_KEY` y `ELEVENLABS_VOICE_ID` solo en secretos servidor.
   Nunca prefijos VITE/NEXT_PUBLIC, cuerpo de petición, repositorio o logs.
4. Elegir `MIMIX_VOICE_RETENTION=standard` o `zero` (esta última requiere Enterprise
   ZRM habilitado). Revisar consentimiento y datos que se enviarán. Texto sensible
   no debe enviarse bajo una política que no lo admita.
5. Configurar `MIMIX_VOICE_PROVIDER=elevenlabs`, presupuesto y timeout. Reiniciar.
   No se cambian variables ni se activa una cuenta real desde este PR.

Variables y valores iniciales están en `server/.env.example`. Números positivos:
timeout máximo 30000 ms, concurrencia máxima 32, solicitudes/minuto máximo 60,
caracteres/minuto máximo 60000 y caracteres/día máximo 10000000. Límites duros de
contrato: 1000 unidades UTF-16 por texto y 1 MiB por audio. Ajustes al alza requieren
presupuesto y capacidad revisados. Un timeout corto puede causar fallback frecuente.

## Costos y retención

El 2026-10-05, [precios API oficiales](https://elevenlabs.io/pricing/api) publican
Flash/Turbo a USD 0,04 por 1000 caracteres. Como referencia, 50000 caracteres son
USD 2 a esa tarifa; no es una garantía de factura, ni contempla plan, impuestos,
créditos incluidos, descuentos o cambios de precio. [Facturación oficial](https://elevenlabs.io/docs/overview/administration/billing).
Mimix cuenta unidades UTF-16 de forma conservadora, no créditos exactos del proveedor.

Reservas no se devuelven tras fallo, interrupción o desconexión. No hay retries
automáticos; repetir solicitudes puede generar cobros adicionales. Reinicios y
réplicas hacen que el presupuesto local no sea un techo monetario. El límite de
la clave en ElevenLabs y las alertas de consumo son necesarios para operar.

Mimix no retiene audio/texto tras las peticiones ni ofrece historial. El proveedor
puede retenerlos bajo su política standard. Zero Retention no se promete fuera
del entitlement Enterprise: [política oficial](https://elevenlabs.io/docs/eleven-api/resources/zero-retention-mode).
Desactivar/revertir Mimix no elimina datos que ya haya retenido un tercero.

## Errores y rollback

Observar status/reason y contadores agregados sin registrar texto, audio, tokens,
claves o cuerpos upstream. Ante RATE_LIMITED revisar créditos y concurrencia;
PROVIDER_UNAVAILABLE puede incluir clave/voz/retención no autorizadas o red caída;
INVALID_AUDIO indica MIME, longitud o frames inesperados. Mostrar subtítulo como
texto y evitar loops de reintento. No se devuelve el detalle del proveedor.

Rollback inmediato: `MIMIX_VOICE_PROVIDER=disabled` y reiniciar; peticiones válidas
con Clerk siguen devolviendo texto. También se puede revertir el PR y reconstruir.
No hay migraciones de datos. Nest y `MIMIX_API_RUNTIME=express` soportan las mismas
rutas y política; auth legacy no puede habilitar ElevenLabs.

## Verificación reproducible

```sh
pnpm install --frozen-lockfile
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm test:smoke
pnpm check
docker build -t mimix:voice-provider .
MIMIX_TEST_IMAGE=mimix:voice-provider node --test test/smoke/container.test.js test/smoke/postgres-container.test.js
```

Tests locales usan fake y transporte inyectado; nunca consumen créditos. Cubren
schemas estrictos, SSRF/redirect, MIME/bytes/truncado, abort de body, errores limpios,
cuota atómica, interrupción con respuesta tardía, timeout, desconexión, shutdown,
propiedad y paridad HTTP. El fake es un marcador determinista, no audio de habla.
Resultados finales/revisión/CI se registran en el PR.

Handoff: esperar fusión y confirmación del coordinador antes de leer/ejecutar
prompt 13 desde main actualizado. Este PR no establece lease ni reproduce audio.

Revisión independiente: hallazgo de firmas MP3 truncadas sin Content-Length
corregido con regresión RED→GREEN, validación de frames completos y fixture real
de silencio generado localmente. No hay otros hallazgos accionables.
