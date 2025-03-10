# Whatsapp-Bot-Sales-Logifit

Bot de WhatsApp para marketing, calificación de prospectos y agendamiento de citas para Logifit.

## Descripción

Este proyecto implementa un bot de WhatsApp inteligente para Logifit, especializado en la calificación de prospectos interesados en sistemas de control de fatiga y somnolencia. El bot utiliza inteligencia artificial para analizar el interés de los prospectos, responder preguntas y programar demostraciones del producto.

## Características

- 🤖 **Conversación Natural**: Utiliza OpenAI para mantener conversaciones naturales y fluidas.
- 📅 **Integración con Google Calendar**: Programa citas automáticamente en el calendario del vendedor.
- 🔍 **Calificación de Prospectos**: Evalúa el nivel de interés de los prospectos mediante preguntas específicas.
- 🎯 **Personalización por Campaña**: Adapta el flujo según el origen del prospecto (Facebook, Google Ads, etc.).
- 🔊 **Procesamiento de Audio**: Transcribe mensajes de voz para mantener la conversación fluida.
- 🏢 **Búsqueda de Información de Empresas**: Obtiene datos de empresas mediante su RUC.
- 📊 **Integración con CRM**: Envía prospectos calificados al CRM para seguimiento.
- 📝 **Registro Detallado**: Mantiene un historial completo de las conversaciones.

## Requisitos

- Node.js v16 o superior
- MongoDB
- Cuenta de OpenAI con API key
- Cuenta de Google Cloud con Google Calendar API habilitada
- Cuenta de WhatsApp Business API

## Instalación

1. Clonar el repositorio:
   ```
   git clone https://github.com/robertocalvo27/Whatsapp-Bot-Sales-Logifit.git
   cd Whatsapp-Bot-Sales-Logifit
   ```

2. Instalar dependencias:
   ```
   npm install
   ```

3. Configurar variables de entorno:
   ```
   cp .env.example .env
   ```
   Editar el archivo `.env` con tus credenciales.

4. Obtener token de Google Calendar:
   ```
   node get-google-token.js
   ```

5. Iniciar el bot:
   ```
   npm start
   ```

## Estructura del Proyecto

- `src/flows/`: Flujos de conversación para diferentes escenarios.
- `src/services/`: Servicios para integración con APIs externas.
- `src/utils/`: Utilidades y funciones auxiliares.
- `src/database.js`: Conexión a la base de datos MongoDB.
- `src/whatsappHandler.js`: Manejador principal de mensajes de WhatsApp.

## Flujo de Conversación

1. **Saludo Inicial**: El bot se presenta y solicita información básica.
2. **Calificación**: Realiza preguntas para evaluar el interés y las necesidades.
3. **Análisis de Interés**: Utiliza IA para determinar el nivel de interés.
4. **Oferta de Reunión**: Si hay interés, ofrece una demostración de 20 minutos.
5. **Programación**: Sugiere horarios disponibles y crea la cita en Google Calendar.
6. **Seguimiento**: Envía confirmación y detalles de la reunión.

## Scripts Disponibles

- `npm start`: Inicia el bot en modo producción.
- `npm run dev`: Inicia el bot en modo desarrollo con recarga automática.
- `npm run test:campaign`: Ejecuta una simulación del flujo de campaña.

## Configuración de Google Calendar

Para configurar Google Calendar, sigue estos pasos:

1. Crea un proyecto en Google Cloud Console.
2. Habilita la API de Google Calendar.
3. Configura la pantalla de consentimiento OAuth.
4. Crea credenciales OAuth (ID de cliente y secreto).
5. Configura `http://localhost` como URI de redirección.
6. Ejecuta `node get-google-token.js` para obtener el token de actualización.

## Licencia

Este proyecto es propiedad de Logifit y está protegido por derechos de autor.

## Contacto

Para más información, contacta a:
- Roberto Calvo - roberto.calvo@logifit.pe 