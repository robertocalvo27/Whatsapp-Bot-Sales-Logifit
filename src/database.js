const { MongoClient } = require('mongodb');
const logger = require('./utils/logger');

// Variable para almacenar la conexión
let db = null;

/**
 * Inicializa la conexión a la base de datos
 * @returns {Promise<Object>} - Cliente de MongoDB
 */
async function connect() {
  try {
    if (db) {
      return db;
    }
    
    const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/whatsapp-bot';
    const client = new MongoClient(uri);
    
    await client.connect();
    
    // Obtener nombre de la base de datos desde la URI
    const dbName = uri.split('/').pop().split('?')[0];
    db = client.db(dbName);
    
    logger.info('Conexión a MongoDB establecida correctamente');
    
    return db;
  } catch (error) {
    logger.error('Error al conectar a MongoDB:', error);
    throw error;
  }
}

/**
 * Obtiene una colección de la base de datos
 * @param {string} collectionName - Nombre de la colección
 * @returns {Promise<Object>} - Colección de MongoDB
 */
async function collection(collectionName) {
  const database = await connect();
  return database.collection(collectionName);
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