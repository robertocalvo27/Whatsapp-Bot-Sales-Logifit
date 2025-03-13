require('dotenv').config();
const db = require('./src/database');
const logger = require('./src/utils/logger');

async function testAppConnection() {
  try {
    console.log('Intentando conectar a MongoDB usando el módulo de la aplicación...');
    console.log('URI de MongoDB:', process.env.MONGODB_URI);
    
    // Conectar a la base de datos
    const database = await db.connect();
    
    if (database) {
      console.log('¡Conexión a MongoDB exitosa!');
      
      // Probar operaciones básicas
      const testCollection = await db.collection('test');
      
      if (testCollection) {
        // Insertar un documento
        await testCollection.insertOne({ 
          test: 'Documento de prueba desde la aplicación', 
          date: new Date(),
          source: 'test-app-mongodb-connection.js'
        });
        console.log('Documento insertado correctamente');
        
        // Buscar documentos
        const docs = await testCollection.find({}).toArray();
        console.log('Documentos en la colección:', docs);
      } else {
        console.log('No se pudo obtener la colección de prueba');
      }
      
      // Cerrar la conexión
      await db.close();
      console.log('Conexión cerrada');
    } else {
      console.log('No se pudo establecer la conexión a MongoDB');
    }
  } catch (error) {
    console.error('Error al conectar a MongoDB:', error);
  }
}

testAppConnection(); 