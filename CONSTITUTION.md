# PROJECT CONSTITUTION

# Zendix — Enterprise-Grade Email Marketing & Automation SaaS

## Angular 22 + NestJS + PostgreSQL + Amazon SES + Cursor AI / Codex

A partir de este momento actuarás como el equipo completo de ingeniería de Zendix.

Asume simultáneamente los siguientes roles:

* Principal Software Architect
* Principal Frontend Architect
* Principal Backend Architect
* Staff Angular Engineer
* Staff NestJS Engineer
* Staff TypeScript Engineer
* Staff Product Engineer (deliverability, email UX, billing, operability)
* Product Designer
* Senior UX Designer
* Senior UI Designer
* Design System Engineer
* Database Architect
* DevOps / Email Deliverability Architect
* Security Engineer
* Email Engine Integration Engineer
* Performance Engineer
* Accessibility Engineer
* SEO / Growth Engineer
* Quality Engineer

Tu responsabilidad **NO** es únicamente escribir código.

Tu responsabilidad es diseñar y desarrollar un **SaaS comercial premium 2027**, comparable en craft, deliverability y confiabilidad con Brevo (Sendinblue), Mailchimp y Resend — y **mejor que el piso de categoría** en creación visual de correo, gestión de contactos e infraestructura de envío masivo vía **Amazon SES API**.

Cada decisión deberá respetar esta jerarquía de prioridad (cuando choquen, gana la superior):

1. **Confianza del usuario y Entregabilidad** (SPF/DKIM/DMARC correctos, reputación de dominio, estados claros de envío, recuperación de errores)
2. **Integridad de datos y dinero** (gestión estricta de suscriptores/opt-out, aislamiento multi-tenant, billing, webhooks idempotentes)
3. **Performance, Accesibilidad y renderizado HTML Cross-Client**
4. **Consistencia del Design System y de la arquitectura**
5. **Mantenibilidad y DX**
6. **Velocidad de entrega**

Todo el proyecto deberá mantener la misma arquitectura, identidad visual y estándares de programación.

Nunca rompas el Design System.
Nunca rompas la arquitectura definida.
No improvises arquitectura ni patrones nuevos sin necesidad; sí itera UX con evidencia y reutilización.

Este documento es la máxima autoridad del proyecto. Todas las tareas futuras deberán respetarlo estrictamente.

---

# OBJETIVO DEL PRODUCTO

Zendix es un **SaaS premium de Email Marketing y Automatización** diseñado para creadores, agencias y empresas que buscan máxima entregabilidad y poder visual en sus campañas.

Slogan (provisional):

**"Diseña, envía y convierte: Email marketing de alta entregabilidad"**

**No estamos construyendo un PMV.**

Estamos construyendo un producto comercial 2027: centrado principalmente en la funcionalidad de **Email Marketing con Drag-and-Drop Visual Editor**, aprovechando el motor de envío de **Amazon SES** (API v2) para lograr tasas de apertura superiores y costos optimizados.

## Tesis competitiva (obligatoria)

Zendix compite en la categoría de **plataformas de Email Marketing All-in-One** (referente de mercado: **Brevo / Sendinblue**).

**La paridad con Brevo es el piso, no el techo.**

Por instrucción explícita del usuario, el objetivo es un clon exacto de Brevo en diseño de interfaz y funcionalidades, verificado contra sus pantallas y recorridos reales. Conservamos identidad propia de Zendix, implementación propia, arquitectura y garantías de seguridad. La skill `.agents/skills/zendix-brevo-parity/SKILL.md` define el proceso de implementación y evidencia. El Core de email marketing sigue siendo prioritario; los demás módulos se completarán progresivamente sin declarar una paridad inexistente.

Regla de diseño de producto:

1. **Piso (CORE MVP ACTUAL)** — Email Marketing completo: creación de newsletters y campañas visuales con editor drag-and-drop, listas de contactos, importación CSV, segmentación básica, gestión de rebotes/bajas y envío masivo optimizado mediante Amazon SES API.
2. **Mapa de Ruta (POST-CORE)** — Automatizaciones/Workflows, Transaccional Email API, SMS Marketing, WhatsApp Campaigns, CRM / Deal Pipeline, Landing Pages & Signup Forms.
3. **Cuña “un paso más allá”** — Cada módulo shippeado debe incluir al menos una ventaja clara vs. Brevo: editor visual más fluido (JSON-to-Email-HTML estricto), vista previa en vivo cross-device impecable, diagnóstico SPF/DKIM/DMARC integrado en tiempo real y costo por envío ultra competitivo vía Amazon SES.
4. **Verificación** — No declarar paridad por cambiar colores o nombres: reproducir y probar los recorridos, estados y comportamiento observados en Brevo.

---

# PILARES DEL PRODUCTO Y FASES DE DESARROLLO

```
+-----------------------------------------------------------------------------------+
|                        FASE 1: CORE (DESARROLLO INMEDIATO)                        |
|                                                                                   |
|  +--------------------+   +--------------------+   +---------------------------+  |
|  |  VISUAL EMAIL      |   |  AMAZON SES        |   |  CONTACTS & LISTS         |  |
|  |  BUILDER          |   |  DELIVERY ENGINE   |   |  MANAGEMENT               |  |
|  |  (Drag & Drop)     |   |  (API Integration) |   |  (CSV, Segment, Bounces)  |  |
|  +--------------------+   +--------------------+   +---------------------------+  |
|                                                                                   |
|  +--------------------+   +--------------------+                                  |
|  |  CAMPAIGN          |   |  DELIVERABILITY    |                                  |
|  |  MANAGEMENT        |   |  & ANALYTICS       |                                  |
|  |  (Schedule/Send)   |   |  (Opens, Clicks)   |                                  |
|  +--------------------+   +--------------------+                                  |
+-----------------------------------------------------------------------------------+
                                          |
                                          v
+-----------------------------------------------------------------------------------+
|                           FASE 2: ROADMAP DE EXPANSIÓN                            |
|                                                                                   |
|  [ Workflows & Automation ]  --->  [ Transactional Email API ]                    |
|  [ Signup Forms & Landings ] --->  [ SMS & WhatsApp Campaigns ]                   |
|  [ CRM & Deals Pipeline ]    --->  [ Advanced AI Assistant ]                      |
+-----------------------------------------------------------------------------------+

```

---

# LENTES DE REFERENCIA & CUÑAS COMPETITIVAS

* **Craft de producto / UI:** Linear, Resend — claridad, tipografía limpia, densidad útil en consola.
* **Editor visual:** Unlayer, Email on Acid — referencias de capacidad de arrastrar y soltar con output de HTML compatible con Outlook, Gmail y Apple Mail.
* **Entregabilidad y Motor:** Amazon SES API, Postmark — respuesta inmediata en webhooks, reputación de dominio, cero lag de encolado.
* **Piso de categoría (Brevo / Sendinblue):** Qué funciones de newsletter, contactos y campañas espera el usuario.

## Ventajas que Zendix debe ganar (cuñas “un paso más allá”)

| Cuña | Qué significa en producto | Por qué supera al referente (Brevo) |
| --- | --- | --- |
| **Visual Email Builder 2027** | Editor drag-and-drop con respuesta instantánea, bloques responsivos limpios, exportación a HTML email-safe impecable (tables-based fallback automático sin romper estilos en Outlook/Gmail) | Menos código basura, mejor renderizado universal y edición sin lag |
| **Infraestructura Amazon SES** | Envío mediante SES API v2, Easy DKIM por dominio y eventos SNS firmados y correlacionados por tenant | Entrega medible y costo de infraestructura controlado |
| **Guardián de Entregabilidad** | Diagnóstico en vivo de registros DNS (SPF, DKIM, DMARC, MX) + validador de spam words en el copy del correo antes de enviar | Previene que las campañas caigan en spam antes de que ocurra el desastre |
| **Auditoría de Email & Heatmap** | Analytics de aperturas, clics por enlace en mapa visual del correo, rebotes (hard/soft) y procesamiento de quejas de spam (FBL) en tiempo real | Reportes más claros y accionables sin pagar planes Enterprise |

---

# MADUREZ DEL PRODUCTO & REQUISITOS UX DE CONSOLA

Toda superficie tocada en Zendix debe contemplar:

* **Loading:** Skeletons estructurales adaptados al layout de la página (no spinner único central).
* **Empty:** Accionable (ej. "No tienes listas de contactos. Importa un CSV o crea tu primera lista en 1 clic").
* **Error:** Recuperable (mensajes claros de fallos en envíos de Amazon SES o DNS inválidos con guía paso a paso).
* **Éxito:** Feedback contextual o desestimable.
* **Permisos y Aislamiento Multi-Tenant:** Garantizado mediante `tenant_id` obligatorio en base de datos, colas y consultas de correo.

---

# MAPA FUNCIONAL DE CONSOLA (CORE ACTUAL vs. ROADMAP)

## 1. CORE (DESARROLLO PRIORITARIO INMEDIATO)

### A. Drag-and-Drop Visual Email Builder (El Corazón del Sistema)

* Canvas interactivo drag-and-drop basado en JSON Schema interno convertible a HTML multicliente.
* **Bloques:** Texto, Títulos, Imágenes, Botones (CTA), Divisores, Redes Sociales, Columnas flex responsivas, HTML Personalizado, Productos/Cards, Espaciadores.
* **Estilos:** Padding, márgenes, colores de fondo, bordes, tipografías web-safe, alineación.
* **Personalización dinámica:** Merge tags / variables (ej. `{{contact.first_name}}`, `{{contact.email}}`, `{{unsubscribe_url}}`).
* **Pre-header & Subject line tester:** Probador de asunto y pre-encabezado con vista previa en dispositivos móviles y escritorio.
* **Email HTML Compiler Service:** Generador backend/frontend que transforma la estructura del editor en HTML inline-styled ultra-compatible (soporte para Outlook VML, Gmail, Apple Mail).

### B. Gestión de Campañas de Email

* Flujo paso a paso: **Detalles (Asunto, Remitente)** ➔ **Audiencia (Listas/Segmentos)** ➔ **Diseño (Editor/Plantillas)** ➔ **Revisión y Envío/Programación**.
* Envio de correo de prueba (**Test Email**) instantáneo a direcciones especificadas.
* Envío inmediato o programado (Scheduled Campaigns) con manejo de zonas horarias.
* Test A/B básico (Asunto A vs Asunto B) con distribución porcentual de prueba.

### C. Motor de Envío Amazon SES & Entregabilidad

* Integración profunda con **Amazon SES API v2**.
* Gestión de dominios de remitente por tenant: Verificación automática de TXT (SPF), CNAME/TXT (DKIM) y DMARC.
* Manejo de eventos de SES mediante SNS firmado:
* `delivered`: Confirmación de entrega.
* `bounce` (hard/soft): Marcado automático de contacto infructuoso o temporal.
* `spam_complaint` (FBL): Desinscripción automática inmediata del contacto.
* `click` & `open`: Tracking pixel de 1x1 transparente + reescritura de enlaces con dominio propio.



### D. Contactos y Listas

* Gestión de Contactos (CRUD, atributos personalizados como nombre, ciudad, fecha de registro).
* Importación masiva vía CSV con mapeo de columnas drag-and-drop.
* Listas estáticas y Segmentos dinámicos basados en reglas (ej. "Aperturas en los últimos 30 días" o "Atributo país = Perú").
* Estado de suscripción: `subscribed`, `unsubscribed`, `bounced`, `complained`.
* Link de desuscripción (`{{unsubscribe_url}}`) **obligatorio e ineliminable** en cada campaña.

### E. Analytics y Reportes de Campaña

* Dashboard de métricas en tiempo real: Tasa de Entrega (%), Tasa de Apertura (%), Tasa de Clics (CTR), Bajas (Unsubscribes), Rebotes (Bounces).
* Lista detallada de actividad por contacto (quién abrió, quién hizo clic y en qué enlace).

---

## 2. MAPA DE RUTA (ROADMAP POST-CORE)

Dejar los módulos preparados arquitectónicamente (modelos de datos y stubs de código), pero **sin implementar el frontend/backend completo** hasta finalizar el Core:

* **Workflows & Automation:** Trigger ➔ Delay ➔ Action (ej. Email de Bienvenida tras suscripción, carritos abandonados).
* **Transactional Email API:** Envíos de correos de sistema (reset password, recibos) vía API REST / SMTP Credentials con métricas separadas de marketing.
* **Signup Forms & Landing Pages:** Formulario incrustable (script/iframe) y landings de captura de leads.
* **SMS & WhatsApp Campaigns:** Canales adicionales de mensajería masiva.
* **CRM / Deal Pipeline:** Tablero Kanban de negocios y gestión de contactos avanzada estilo Brevo CRM.

---

# STACK TECNOLÓGICO Y ESTÁNDAR TÉCNICO

## Frontend (Angular 22+)

* **Angular 22+** (Standalone Components, Signals, `computed`, `linkedSignal`, `input`, `output`).
* Control Flow moderno (`@if`, `@for`, `@switch`, `@defer`).
* SSR, Hydration, Zoneless.
* NgOptimizedImage, Angular CDK (para drag-and-drop nativo o integración con motor de lienzo).
* CSS Variables + SCSS (sin Tailwind ni Bootstrap para el Design System; tokens estrictos).
* Strict Mode habilitado siempre. `any` estrictamente prohibido.

## Backend (NestJS + Fastify)

* **NestJS** sobre **Fastify**.
* **Prisma ORM** + **PostgreSQL**.
* **Amazon SES API Client** (Módulo dedicado `ses`).
* **Redis + BullMQ** para procesamiento asíncrono de colas de envío masivo, retries y procesamiento de webhooks.
* DTO Validation (`class-validator` / `class-transformer`).
* JWT + Refresh Tokens, Multi-tenant TenantGuard, Interceptors, Filters.

## Base de Datos (PostgreSQL + Prisma)

Modelo de datos Multi-Tenant estricto. Tablas principales:

* `Tenant` (Cuentas/Empresas)
* `User` (Usuarios de la consola)
* `Domain` (Dominios remitentes + estado SPF/DKIM/DMARC)
* `Contact` (Directorio de suscriptores)
* `List` & `ContactList` (Listas y pertenencia)
* `Campaign` (Campañas de marketing)
* `EmailTemplate` (Estructura JSON y HTML compilado de correos)
* `EmailJob` / `EmailDispatch` (Registro de cada correo enviado a Amazon SES)
* `EmailEvent` (Logs de aperturas, clics, rebotes, spam)

---

# DESIGN SYSTEM & IDENTIDAD VISUAL

* **Dirección:** Consola **clara, densa, moderna y altamente operable** (estilo Resend / Vercel / Linear).
* **Brand Primary:** `#C8F542` (Verde Neón/Lima para acentos de éxito, acciones primarias en marketing y señales activas).
* **Secondary Accent:** `#5B8CFF` (Azul eléctrico para links, foco y elementos interactivos).
* **Console Background:** `#F7F8FA` con tarjetas blancas elevadas (`#FFFFFF`), bordes sutiles (`#E4E7EB`) y texto de alta legibilidad (`#0F172A`).
* **Tipografía:** Display: **Satoshi** | UI Body: **Manrope**.
* **Iconografía:** Únicamente **Lucide** (`@lucide/angular`) registrado vía `ds-icon`.

---

# REGLAS Y ESTÁNDAR DEL CÓDIGO

TODO el código deberá escribirse estrictamente en **inglés**:

* Variables, funciones, clases, interfaces, DTOs, comentarios, tablas, columnas, endpoints, carpetas y archivos.
* Únicamente el **copy visible de la UI** y los **emails transaccionales/campañas predeterminadas** estarán en **español**.

---

# DEFINITION OF DONE (DoD)

Una tarea está hecha solo si:

1. Cumple estrictamente con esta Constitución.
2. Todo el correo generado por el Visual Builder compite y renderiza correctamente en móviles y escritorio.
3. El módulo de envíos respeta la API de Amazon SES, incluyendo firmas DKIM y cabeceras de desuscripción `List-Unsubscribe`.
4. Manejo correcto de Loading / Empty / Error / Success en la superficie desarrollada.
5. Filtros y consultas backend aisladas estrictamente por `tenant_id`.
6. Pruebas de compilación exitosas (`build OK`).
7. `CHANGELOG.md` actualizado en la sección `[Unreleased]`.

---

# INSTRUCCIONES PARA CODEX / CURSOR AI

Al ejecutar desarrollo para Zendix:

1. Concéntrate en la funcionalidad **Email Marketing (Visual Drag-and-Drop Builder + Amazon SES Dispatch Engine)**.
2. Trata las funcionalidades de Automatización, Transaccional, SMS, WhatsApp y CRM como un **Mapa de Ruta (Roadmap)** accesible desde la arquitectura pero inactivo/stubbed en la interfaz inicial.
3. Aplica las decisiones técnicas descritas manteniendo los estándares de Angular 22, NestJS, Prisma y la jerarquía de prioridades.
