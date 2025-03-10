require('dotenv').config();
const { google } = require('googleapis');
const readline = require('readline');
const http = require('http');
const url = require('url');

// Crear interfaz de línea de comandos
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

// Configurar cliente de OAuth2
const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI
);

// Definir los permisos que necesitamos
const scopes = [
  'https://www.googleapis.com/auth/calendar',
  'https://www.googleapis.com/auth/calendar.events'
];

// Generar URL de autorización
const authUrl = oauth2Client.generateAuthUrl({
  access_type: 'offline',
  scope: scopes,
  prompt: 'consent'  // Forzar a que siempre pida consentimiento para obtener refresh_token
});

console.log('=== OBTENER TOKEN DE ACTUALIZACIÓN DE GOOGLE CALENDAR ===\n');
console.log('Este script te ayudará a obtener un token de actualización para Google Calendar.\n');

console.log('1. Copia y pega esta URL en tu navegador:');
console.log('\x1b[36m%s\x1b[0m', authUrl);  // Color azul para la URL

if (process.env.GOOGLE_REDIRECT_URI === 'http://localhost') {
  console.log('\n2. Después de autorizar, serás redirigido a http://localhost. Copia el código de la URL (parámetro "code").');
  
  // Solicitar el código de autorización
  rl.question('\n3. Pega el código aquí: ', async (code) => {
    await getTokens(code);
  });
} else {
  // Solicitar el código de autorización directamente
  rl.question('\n2. Después de autorizar, Google te mostrará un código. Copia ese código y pégalo aquí: ', async (code) => {
    await getTokens(code);
  });
}

async function getTokens(code) {
  try {
    console.log('\nObteniendo tokens...');
    
    // Obtener tokens
    const { tokens } = await oauth2Client.getToken(code);
    
    console.log('\n=== TOKENS OBTENIDOS ===');
    console.log('Access Token:', tokens.access_token);
    console.log('Refresh Token:', tokens.refresh_token);
    console.log('\nAhora debes actualizar tu archivo .env con el Refresh Token obtenido:');
    console.log('\x1b[32m%s\x1b[0m', 'GOOGLE_REFRESH_TOKEN=' + tokens.refresh_token);  // Color verde para el token
    
    console.log('\n=== INSTRUCCIONES ===');
    console.log('1. Copia el Refresh Token mostrado arriba');
    console.log('2. Abre el archivo .env');
    console.log('3. Reemplaza el valor de GOOGLE_REFRESH_TOKEN con el token copiado');
    console.log('4. Guarda el archivo .env');
    console.log('5. Reinicia el bot');
    
    rl.close();
  } catch (error) {
    console.error('\nError al obtener tokens:', error.message);
    if (error.response) {
      console.error('Detalles del error:', error.response.data);
    }
    console.log('\nSugerencias:');
    console.log('- Verifica que el código de autorización sea correcto');
    console.log('- Asegúrate de que la URL de redirección configurada en Google Cloud coincida con la del archivo .env');
    console.log('- La URL de redirección actual es:', process.env.GOOGLE_REDIRECT_URI);
    console.log('- Intenta nuevamente ejecutando este script');
    
    rl.close();
  }
}

// Manejar cierre de la interfaz
rl.on('close', () => {
  console.log('\n=== FIN DEL SCRIPT ===');
  process.exit(0);
}); 