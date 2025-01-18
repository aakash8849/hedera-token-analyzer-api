import mongoose from 'mongoose';

const connections = new Map();

export async function connectDB() {
  try {
    if (!process.env.MONGODB_URI) {
      throw new Error('MONGODB_URI environment variable is not defined');
    }

    const mainConn = await mongoose.createConnection(process.env.MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true
    });

    console.log(`Main MongoDB Connected: ${mainConn.host}`);
    return mainConn;
  } catch (error) {
    console.error('Error connecting to MongoDB:', error.message);
    process.exit(1);
  }
}

export async function getTokenConnection(tokenId) {
  try {
    if (connections.has(tokenId)) {
      return connections.get(tokenId);
    }

    const dbName = `token_${tokenId.replace(/\./g, '_')}`;
    const uri = `${process.env.MONGODB_URI}/${dbName}`;
    
    const conn = await mongoose.createConnection(uri, {
      useNewUrlParser: true,
      useUnifiedTopology: true
    });

    // Import models dynamically
    const Token = (await import('../models/Token.js')).default;
    const Holder = (await import('../models/Holder.js')).default;
    const Transaction = (await import('../models/Transaction.js')).default;

    // Create models specific to this connection
    conn.model('Token', Token.schema);
    conn.model('Holder', Holder.schema);
    conn.model('Transaction', Transaction.schema);

    connections.set(tokenId, conn);
    console.log(`Connected to database for token ${tokenId}`);
    
    return conn;
  } catch (error) {
    console.error(`Error connecting to token database ${tokenId}:`, error);
    throw error;
  }
}

// Cleanup connections on application shutdown
process.on('SIGINT', async () => {
  for (const [tokenId, conn] of connections) {
    await conn.close();
    console.log(`Closed connection for token ${tokenId}`);
  }
  process.exit(0);
});
