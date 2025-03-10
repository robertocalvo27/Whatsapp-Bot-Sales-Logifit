const { MongoClient } = require('mongodb');
const logger = require('./utils/logger');

// Variable para almacenar la conexión
let db = null;
// Variable para controlar si se debe intentar conectar a MongoDB
let shouldUseDatabase = true;

/**
 * Inicializa la conexión a la base de datos
 * @returns {Promise<Object>} - Cliente de MongoDB
 */
async function connect() {
  try {
    // Si ya se determinó que no se debe usar la base de datos, retornar null
    if (!shouldUseDatabase) {
      return null;
    }
    
    // Si ya hay una conexión, retornarla
    if (db) {
      return db;
    }
    
    const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/whatsapp-bot';
    const client = new MongoClient(uri, {
      serverSelectionTimeoutMS: 5000, // 5 segundos de timeout para selección de servidor
      connectTimeoutMS: 10000, // 10 segundos de timeout para conexión
    });
    
    await client.connect();
    
    // Obtener nombre de la base de datos desde la URI
    const dbName = uri.split('/').pop().split('?')[0];
    db = client.db(dbName);
    
    logger.info('Conexión a MongoDB establecida correctamente');
    console.log('Conexión a MongoDB establecida correctamente');
    
    return db;
  } catch (error) {
    logger.error('Error al conectar a MongoDB:', error);
    console.error('Error al conectar a MongoDB:', error.message);
    
    // Marcar que no se debe usar la base de datos después de un intento fallido
    shouldUseDatabase = false;
    console.log('Continuando sin persistencia de datos. El bot funcionará en modo memoria.');
    
    return null;
  }
}

/**
 * Obtiene una colección de la base de datos
 * @param {string} collectionName - Nombre de la colección
 * @returns {Promise<Object>} - Colección de MongoDB o null si no hay conexión
 */
async function collection(collectionName) {
  try {
    // Si no se debe usar la base de datos, retornar null
    if (!shouldUseDatabase) {
      return null;
    }
    
    const database = await connect();
    if (!database) {
      return null;
    }
    
    return database.collection(collectionName);
  } catch (error) {
    logger.error(`Error al obtener colección ${collectionName}:`, error);
    return null;
  }
}

/**
 * Cierra la conexión a la base de datos
 * @returns {Promise<void>}
 */
async function close() {
  try {
    if (db) {
      await db.client.close();
      db = null;
      logger.info('Conexión a MongoDB cerrada correctamente');
    }
  } catch (error) {
    logger.error('Error al cerrar conexión a MongoDB:', error);
  }
}

// Manejar cierre de la aplicación
process.on('SIGINT', async () => {
  await close();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  await close();
  process.exit(0);
});

module.exports = {
  connect,
  collection,
  close
}; 