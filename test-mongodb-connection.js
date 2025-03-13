const { MongoClient } = require('mongodb');

async function testConnection() {
  try {
    console.log('Intentando conectar a MongoDB...');
    const client = new MongoClient('mongodb://localhost:27017/whatsapp-bot');
    await client.connect();
    console.log('¡Conexión a MongoDB exitosa!');
    
    // Probar operaciones básicas
    const db = client.db('whatsapp-bot');
    const collection = db.collection('test');
    
    // Insertar un documento
    await collection.insertOne({ test: 'Documento de prueba', date: new Date() });
    console.log('Documento insertado correctamente');
    
    // Buscar documentos
    const docs = await collection.find({}).toArray();
    console.log('Documentos en la colección:', docs);
    
    await client.close();
    console.log('Conexión cerrada');
  } catch (error) {
    console.error('Error al conectar a MongoDB:', error);
  }
}

testConnection(); 