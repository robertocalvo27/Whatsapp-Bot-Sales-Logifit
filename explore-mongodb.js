const { MongoClient } = require('mongodb');

async function exploreDatabase() {
  try {
    console.log('Conectando a MongoDB...');
    const client = new MongoClient('mongodb://localhost:27017/');
    await client.connect();
    console.log('Conexión exitosa a MongoDB');

    // Listar todas las bases de datos
    const adminDb = client.db('admin');
    const dbs = await adminDb.admin().listDatabases();
    
    console.log('\n=== BASES DE DATOS ===');
    dbs.databases.forEach(db => {
      console.log(`- ${db.name} (${db.sizeOnDisk} bytes)`);
    });

    // Para cada base de datos, listar sus colecciones
    for (const db of dbs.databases) {
      if (db.name !== 'admin' && db.name !== 'local' && db.name !== 'config') {
        const database = client.db(db.name);
        const collections = await database.listCollections().toArray();
        
        if (collections.length > 0) {
          console.log(`\n=== COLECCIONES EN ${db.name} ===`);
          for (const collection of collections) {
            console.log(`- ${collection.name}`);
            
            // Mostrar un ejemplo de documento para entender la estructura
            const docs = await database.collection(collection.name).find().limit(1).toArray();
            if (docs.length > 0) {
              console.log(`  Ejemplo de documento:`);
              console.log(JSON.stringify(docs[0], null, 2));
            }
          }
        }
      }
    }

    await client.close();
    console.log('\nConexión cerrada');
  } catch (error) {
    console.error('Error al explorar la base de datos:', error);
  }
}

exploreDatabase(); 