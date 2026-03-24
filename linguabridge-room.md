# LinguaBridge Room
### App 02 — Sala de traducción simultánea con IA

---

## El problema que resuelve

Organizar una reunión con personas de distintos idiomas requiere hoy:

```
Contratar intérpretes profesionales
        +
Alquilar cabinas de traducción simultánea
        +
Distribuir auriculares a cada asistente
        +
Coordinar infraestructura logística
        +
Coste elevado
        =
Barrera real para la mayoría de empresas y eventos
```

LinguaBridge Room elimina todo eso. Una sala lista en 30 segundos, solo con el móvil Android, sin equipamiento adicional, sin técnicos y sin coste de infraestructura.

---

## El concepto

```
┌──────────────────────────────────────────────────────────┐
│                                                          │
│   Anfitrión habla en su idioma                           │
│            │                                             │
│            │  IA traduce en tiempo real                  │
│            │  latencia < 1 segundo                       │
│            │                                             │
│     ┌──────┴──────┬──────────────┬──────────┐            │
│     ▼             ▼              ▼          ▼            │
│  Japonés       Inglés         Francés     Árabe  ...     │
│  Hiroshi       Sarah          Marie       Ahmed          │
│  subtítulos    subtítulos     subtítulos  subtítulos      │
│  + audio       + audio        + audio     + audio        │
│                                                          │
└──────────────────────────────────────────────────────────┘
```

Cada participante habla y escucha en su propio idioma. Sin auriculares. Sin equipamiento. Solo su móvil.

---

## Los dos roles

```
┌──────────────────────────────────┐  ┌────────────────────────────────┐
│  ANFITRIÓN                       │  │  PARTICIPANTE                  │
│                                  │  │                                │
│  ✓ Crea y gestiona la sala       │  │  ✓ Entra escaneando el QR      │
│  ✓ Elige el modo de comunicación │  │  ✓ No necesita instalar app    │
│  ✓ Controla los micrófonos       │  │  ✓ Elige su idioma al entrar   │
│  ✓ Puede silenciar participantes │  │  ✓ Recibe traducción en        │
│  ✓ Cierra la sesión              │  │    tiempo real: texto + audio  │
│  ✓ Descarga la transcripción     │  │  ✓ Puede hablar si el          │
│                                  │  │    anfitrión lo permite        │
│  Necesita la app instalada       │  │  Solo necesita el navegador    │
└──────────────────────────────────┘  └────────────────────────────────┘
```

---

## Pantalla principal de la app

```
┌──────────────────────────────────────┐
│  LinguaBridge Room                   │
│                                      │
│  MIS SALAS                           │
│  ┌────────────────────────────────┐  │
│  │ 📁 Reunión clientes Asia       │  │
│  │    Última sesión: 04/03/2025   │  │  ← toca para entrar
│  │    12 participantes            │  │
│  └────────────────────────────────┘  │
│  ┌────────────────────────────────┐  │
│  │ 📁 Congreso anual 2025         │  │
│  │    Última sesión: 01/03/2025   │  │
│  │    48 participantes            │  │
│  └────────────────────────────────┘  │
│  ┌────────────────────────────────┐  │
│  │ 📁 Formación equipo EMEA       │  │
│  │    Última sesión: 22/02/2025   │  │
│  │    9 participantes             │  │
│  └────────────────────────────────┘  │
│                                      │
│  [＋ NUEVA SALA]                     │
└──────────────────────────────────────┘
```

Cada sala guarda el historial completo de todas las sesiones realizadas con ella y sus transcripciones.

---

## Crear y guardar una sala

```
Toca [＋ NUEVA SALA]
        ↓
Escribe el nombre: "Reunión clientes Asia"
        ↓
La sala se crea en segundos
        ↓
QR generado automáticamente
        │
        └── siempre el mismo QR para esta sala
        ↓
Sala guardada en MIS SALAS de forma permanente
        ↓
Reutilizable indefinidamente sin volver a configurar nada
```

---

## El QR — el elemento central

```
┌──────────────────────────────────────────────────────────┐
│                                                          │
│   Cada sala tiene SIEMPRE el mismo QR                    │
│                                                          │
│   ┌──────────┐                                           │
│   │ ██ ░░ ██ │  ← mismo QR en cada sesión               │
│   │ ░░ ██ ░░ │                                           │
│   │ ██ ░░ ██ │                                           │
│   └──────────┘                                           │
│                                                          │
│   Dónde usarlo:                                          │
│                                                          │
│   → Impreso en la mesa de reuniones                      │
│     Los asistentes lo escanean al sentarse               │
│                                                          │
│   → Primera diapositiva del PowerPoint                   │
│     Visible desde el primer momento                      │
│                                                          │
│   → Enviado por email antes del evento                   │
│     Los asistentes entran antes de llegar                │
│                                                          │
│   → En la puerta de la sala del evento                   │
│     Se escanea al entrar                                 │
│                                                          │
│   Participante escanea → navegador se abre → elige       │
│   idioma → dentro en 3 segundos. Sin apps. Sin cuenta.   │
│                                                          │
└──────────────────────────────────────────────────────────┘
```

---

## Los dos modos de comunicación

### Modo Solo Anfitrión

```
┌──────────────────────────────────────────────────────┐
│                                                      │
│   Anfitrión habla                                    │
│        │                                             │
│        └─────────────────────────────────────────► Todos escuchan
│                                                      en su idioma
│                                                      │
│   Anfitrión toca nombre de participante              │
│        │                                             │
│        └──► Da micrófono a Hiroshi ───────────────► Hiroshi habla
│                                                      │
│   Anfitrión toca Silenciar ───────────────────────► Hiroshi escucha
│                                                      │
└──────────────────────────────────────────────────────┘
```

Ideal para: ponencias, presentaciones, eventos con muchos asistentes.

### Modo Todos — Comunicación bidireccional

```
┌──────────────────────────────────────────────────────┐
│                                                      │
│   Anfitrión toca [🎤 TODOS]                          │
│        │                                             │
│        └──► Notificación a todos:                    │
│             "Ahora puedes hablar"                    │
│                                                      │
│   Carlos habla en ES ──────────────────────────────► Hiroshi recibe en JA
│                                                      Sarah   recibe en EN
│                                                      Marie   recibe en FR
│                                                      │
│   Hiroshi habla en JA ─────────────────────────────► Carlos recibe en ES
│                                                      Sarah   recibe en EN
│                                                      Marie   recibe en FR
│                                                      │
│   Sarah habla en EN ───────────────────────────────► Carlos recibe en ES
│                                                      Hiroshi recibe en JA
│                                                      Marie   recibe en FR
│                                                      │
└──────────────────────────────────────────────────────┘
```

Funciona como una llamada de grupo multiidioma. Cada persona habla en el suyo y entiende a todos en el propio. Ideal para reuniones de trabajo, negociaciones y sesiones de formación participativas.

---

## Interfaz del anfitrión durante la sesión

```
┌────────────────────────────────────────────┐
│  Reunión clientes Asia    🔴 EN DIRECTO    │
│  12 participantes conectados               │
├────────────────────────────────────────────┤
│  ┌──────────────────────────────────────┐  │
│  │  [QR]  Código para unirse            │  │  ← siempre visible
│  └──────────────────────────────────────┘  │
├────────────────────────────────────────────┤
│  MODO                                      │
│  [ Solo anfitrión ]   [ 🎤 TODOS ← activo] │
├────────────────────────────────────────────┤
│  PARTICIPANTES                             │
│  👤 Carlos (Anfitrión)  ES  🎤            │
│  👤 Hiroshi              JA  🎤            │
│  👤 Sarah                EN  🎤            │
│  👤 Marie                FR  🔇 silenciada │
│  👤 Ahmed                AR  🎤            │
│  + 7 más...                                │
├────────────────────────────────────────────┤
│  [🎤 HABLAR]  [🎤 TODOS]  [⏸ PAUSAR]      │
└────────────────────────────────────────────┘
```

---

## Pantalla del participante

```
┌──────────────────────────────────────────┐
│  LinguaBridge Room                       │
│  Reunión clientes Asia  🔴 EN DIRECTO    │
│  Tu idioma: 日本語                        │
├──────────────────────────────────────────┤
│                                          │
│  "本日はご参加いただき                    │
│   ありがとうございます。                  │  ← subtítulos en tiempo real
│   第三四半期の結果を                      │
│   ご報告いたします..."                    │
│                                          │
├──────────────────────────────────────────┤
│  🔊 Audio activo                         │
│  [🔇 Silenciar audio]                    │
│                                          │
│  [🎤 HABLAR]  ← visible en modo todos    │
└──────────────────────────────────────────┘
```

La pantalla puede apagarse y el audio sigue funcionando en segundo plano.

---

## La transcripción automática

Todo lo que se dice queda grabado desde que empieza la sesión. No hay que activar nada.

```
Transcripción — Reunión clientes Asia
04/03/2025  10:30 — 11:45
──────────────────────────────────────────────────────

[10:30] Carlos (ES)
"Buenos días a todos. Vamos a repasar los resultados
del tercer trimestre."

[10:31] Hiroshi (JA)
"おはようございます。資料を確認しました。"

[10:32] Sarah (EN)
"Good morning. I have a question about the Q3 figures."

[10:33] Carlos (ES)
"Claro Sarah, adelante."

[10:34] Marie (FR)
"Bonjour. Je suis d'accord avec Sarah sur ce point."

──────────────────────────────────────────────────────
Duración: 1h 15min  ·  Participantes: 12
Idiomas activos: ES · JA · EN · FR · AR · NL · DE
```

### Cada participante descarga en su idioma

```
Carlos descarga  →  transcripción completa en Español
Hiroshi descarga →  transcripción completa en Japonés
Sarah descarga   →  transcripción completa en Inglés
Marie descarga   →  transcripción completa en Francés
Ahmed descarga   →  transcripción completa en Árabe

Anfitrión        →  puede descargar también la versión
                    original con cada intervención en
                    el idioma en que se pronunció
```

### Pantalla de fin de sesión

```
┌──────────────────────────────────────────┐
│  Sesión finalizada                       │
│  ──────────────────────────────────      │
│  Reunión clientes Asia                   │
│  Duración:       1h 15min                │
│  Participantes:  12                      │
│  Idiomas:        ES · JA · EN · FR · AR  │
│                                          │
│  [📄 DESCARGAR TRANSCRIPCIÓN]            │
│  [🔄 NUEVA SESIÓN]                       │
│  [← MIS SALAS]                          │
└──────────────────────────────────────────┘
```

---

## Flujo completo de una sesión

```
Anfitrión                              Participantes
    │                                        │
    │  Abre la app                           │
    │  Entra a "Reunión clientes Asia"        │
    │  Toca INICIAR SESIÓN                   │
    │  Transcripción empieza sola ─────────► │
    │                                        │
    │  Muestra QR               ───────────► Escanean el QR
    │                                        │  Eligen idioma
    │                                        │  Entran a la sala
    │  Ve 12 conectados                      │
    │                                        │
    │  Modo SOLO ANFITRIÓN                   │
    │  Toca HABLAR                           │
    │  Habla en español         ───────────► Subtítulos + audio
    │                                        │  en su idioma
    │                                        │
    │  Toca TODOS 🎤                         │
    │                           ───────────► Todos pueden hablar
    │                           ◄──────────── Hiroshi habla en JA
    │  Recibe en español                     │  Carlos recibe en ES
    │                           ◄──────────── Sarah habla en EN
    │  Recibe en español                     │  Todos reciben en su idioma
    │                                        │
    │  Toca FINALIZAR SESIÓN                 │
    │                           ───────────► Pantalla de sesión finalizada
    │  Descarga transcripción                │  Cada uno descarga
    │                           ◄──────────── en su idioma
    │  Sala guardada para                    │
    │  próxima vez                           │
```

---

## Idiomas disponibles

```
🇪🇸 Español    🇬🇧 Inglés     🇫🇷 Francés    🇩🇪 Alemán
🇮🇹 Italiano   🇵🇹 Portugués  🇨🇳 Chino      🇯🇵 Japonés
🇰🇷 Coreano    🇸🇦 Árabe      🇷🇺 Ruso       🇳🇱 Neerlandés
🇮🇳 Hindi      🇵🇱 Polaco     🇹🇷 Turco
```

Motor: **Groq AI** — latencia inferior a 1 segundo.

---

## Resumen

```
┌──────────────────────────────────────────────────────────────┐
│                                                              │
│  Una sala de traducción simultánea que se crea en            │
│  30 segundos, se reutiliza indefinidamente con el            │
│  mismo QR y permite comunicación unidireccional o            │
│  bidireccional multiidioma en tiempo real, donde             │
│  cada participante habla y escucha en su propio              │
│  idioma simultáneamente en texto y audio.                    │
│                                                              │
│  Toda sesión queda grabada automáticamente. Cada             │
│  participante descarga la transcripción completa             │
│  en su propio idioma al finalizar. El historial              │
│  queda archivado en la sala para consulta futura.            │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```
