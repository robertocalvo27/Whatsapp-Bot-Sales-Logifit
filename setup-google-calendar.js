/**
 * INSTRUCCIONES PARA CONFIGURAR GOOGLE CALENDAR
 * 
 * Este archivo contiene instrucciones paso a paso para configurar
 * correctamente Google Calendar para tu bot de WhatsApp.
 */

console.log('=== CONFIGURACIÓN DE GOOGLE CALENDAR PARA EL BOT DE WHATSAPP ===\n');
console.log('Sigue estos pasos para configurar correctamente Google Calendar:\n');

console.log('PASO 1: Crear un nuevo proyecto en Google Cloud');
console.log('1. Ve a https://console.cloud.google.com/');
console.log('2. Haz clic en "Seleccionar un proyecto" en la parte superior');
console.log('3. Haz clic en "Nuevo proyecto"');
console.log('4. Nombra tu proyecto (por ejemplo, "WhatsApp Bot Calendar")');
console.log('5. Haz clic en "Crear"\n');

console.log('PASO 2: Habilitar la API de Google Calendar');
console.log('1. En el menú de la izquierda, ve a "APIs y servicios" > "Biblioteca"');
console.log('2. Busca "Google Calendar API"');
console.log('3. Haz clic en "Google Calendar API"');
console.log('4. Haz clic en "Habilitar"\n');

console.log('PASO 3: Crear credenciales');
console.log('1. En el menú de la izquierda, ve a "APIs y servicios" > "Credenciales"');
console.log('2. Haz clic en "Crear credenciales" y selecciona "ID de cliente de OAuth"');
console.log('3. Si es la primera vez, configura la pantalla de consentimiento:');
console.log('   - Selecciona "Externo" como tipo de usuario');
console.log('   - Completa la información requerida (nombre de la aplicación, correo electrónico, etc.)');
console.log('   - En "Dominios autorizados", puedes dejar en blanco por ahora');
console.log('   - Haz clic en "Guardar y continuar"');
console.log('   - En "Permisos", busca y añade:');
console.log('     * https://www.googleapis.com/auth/calendar');
console.log('     * https://www.googleapis.com/auth/calendar.events');
console.log('   - Haz clic en "Guardar y continuar" y completa los pasos restantes\n');

console.log('4. Ahora crea el ID de cliente de OAuth:');
console.log('   - Selecciona "Aplicación web" como tipo de aplicación');
console.log('   - Nombra tu cliente (por ejemplo, "WhatsApp Bot Calendar Client")');
console.log('   - En "Orígenes de JavaScript autorizados", deja en blanco');
console.log('   - En "URIs de redirección autorizados", añade:');
console.log('     * http://localhost');
console.log('   - Haz clic en "Crear"\n');

console.log('5. Guarda las credenciales:');
console.log('   - Se te mostrarán el ID de cliente y el secreto de cliente');
console.log('   - Copia estos valores y actualiza tu archivo .env:');
console.log('     GOOGLE_CLIENT_ID=tu_id_de_cliente');
console.log('     GOOGLE_CLIENT_SECRET=tu_secreto_de_cliente');
console.log('     GOOGLE_REDIRECT_URI=http://localhost\n');

console.log('PASO 4: Obtener el token de actualización');
console.log('1. Actualiza tu archivo .env con las nuevas credenciales');
console.log('2. Ejecuta el siguiente comando:');
console.log('   node get-google-token.js');
console.log('3. Sigue las instrucciones en pantalla para obtener el token de actualización');
console.log('4. Actualiza tu archivo .env con el token de actualización obtenido\n');

console.log('PASO 5: Probar la conexión');
console.log('1. Ejecuta el siguiente comando:');
console.log('   node test-bot.js');
console.log('2. Verifica que la conexión con Google Calendar funcione correctamente\n');

console.log('=== FIN DE LAS INSTRUCCIONES ===');

// También vamos a actualizar el archivo get-google-token.js para usar la nueva URL de redirección
const fs = require('fs');
const path = require('path');

// Leer el archivo .env
const envPath = path.join(__dirname, '.env');
let envContent = fs.readFileSync(envPath, 'utf8');

// Actualizar la URL de redirección
envContent = envContent.replace(
  /GOOGLE_REDIRECT_URI=.*/,
  'GOOGLE_REDIRECT_URI=http://localhost'
);

// Guardar el archivo .env actualizado
fs.writeFileSync(envPath, envContent);

console.log('\nArchivo .env actualizado con la nueva URL de redirección: http://localhost');
console.log('Ahora puedes seguir los pasos anteriores para configurar Google Calendar.'); 