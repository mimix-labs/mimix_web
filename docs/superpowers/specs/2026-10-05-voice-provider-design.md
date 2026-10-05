# VoiceProvider — prompt 12

Base exacta: `1f7469d8bebf9e2a6cf4ab065a878654c3dd9063`.
Rama `feat/voice-provider-elevenlabs`. No prompt 13 ni merge.

Contrato neutral v1: solicitud UUID + texto (1–1000 caracteres UTF-16), resultado
ready con MP3 base64 o text_only con motivo; subtítulo exacto no sincronizado en
ambos estados. Puerto VoiceProvider.synthesize(text, {signal}) devuelve bytes MP3.
Ninguna dependencia de personajes ni Agent Core. Fake solo en tests.

Adaptador servidor ElevenLabs: URL HTTPS fija, voice ID alfanumérico de config,
modelo fijo eleven_flash_v2_5, output_format mp3_44100_128, sin redirects/retries,
Content-Type audio/mpeg, máximo 1 MiB acumulado leyendo stream, validar cabecera
MP3 y rechazar cuerpo vacío/truncado. Nunca devolver errores upstream ni claves.
Retención explícita standard o zero al habilitar; zero usa enable_logging=false
(requiere entitlement Enterprise). Mimix no persiste payloads ni los registra.

API opt-in mediante MIMIX_VOICE_PROVIDER=elevenlabs; default disabled. Rutas
POST /api/voice/utterances y DELETE /api/voice/utterances/:id requieren Clerk,
incluso con voz desactivada. Legacy auth no expone rutas de voz. POST devuelve
texto sin audio cuando está desactivado, limitado o falla; entrada inválida 400.
Clave/voice ID no vienen del cliente. DELETE solo cancela UUID activo del usuario.
Nueva solicitud admitida interrumpe la anterior del mismo usuario; la solicitud
interrumpida termina en text_only. Disconnect aborta; shutdown cancela todos.
El futuro cliente debe detener audio ya recibido e ignorar respuestas obsoletas.
No reproducción ni memoria conversacional nuevas en este PR.

Límites iniciales por proceso: timeout 15 s; 4 generaciones activas; 6 solicitudes
y 3000 caracteres por usuario/minuto; 50000 caracteres por ventana de 24 h;
1000 buckets de usuario activos. Reservar antes de llamar, sin reembolso por
fallo/cancelación. Reinicios/réplicas reinician/multiplican presupuesto local:
para dinero real se requiere también límite de créditos de la clave del proveedor.
No reusar IDs activos; los IDs son correlación, no idempotencia durable.

Pruebas deterministas: contratos, HTTP externo inyectado sin red, MIME/tamaño/SSRF,
timeout en headers y body, cancelación/interrupción, cuotas y aislamiento entre
usuarios, paridad Nest/Express, redacción y default seguro. CI y Docker completos.
