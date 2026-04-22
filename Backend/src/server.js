require('dotenv').config();

const app = require('./app');
const connectMongoDB = require('./config/mongodb');
const connectCassandra = require('./config/cassandra');
const connectRedis = require('./config/redis');
const connectNeo4j = require('./config/neo4j');

const PORT = process.env.PORT || 3000;

// Conectar a Mongo
connectMongoDB();
connectRedis();
connectNeo4j();
connectCassandra();


app.listen(PORT, () => {
    console.log(`Servidor corriendo en puerto ${PORT}`)
})