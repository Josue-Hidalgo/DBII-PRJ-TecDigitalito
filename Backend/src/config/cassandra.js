const cassandra = require('cassandra-driver');

let client;

const connectCassandra = async () => {
    try {
        client = new cassandra.Client({
            contactPoints: (process.env.CASSANDRA_HOST || 'cassandra').split(','),
            localDataCenter: process.env.CASSANDRA_DC || 'datacenter1',
            credentials: {
                username: process.env.CASSANDRA_USER || '',
                password: process.env.CASSANDRA_PASSWORD || '',
            },
            socketOptions: { connectTimeout: 10000 },
        });

        await client.connect();
        console.log('Cassandra conectado');

        // Inicializar keyspace y tablas (idempotente)
        const { initSchema } = require('../models/Cassandra.model');
        await initSchema();

    } catch (error) {
        console.error('Error conectando a Cassandra: ', error.message);
        process.exit(1);
    }
};

const getClient = () => {
    if (!client) throw new Error('Cassandra no está conectado');
    return client;
};

module.exports = connectCassandra;
module.exports.getClient = getClient;