const cassandra = require('cassandra-driver');

const connectCassandra = async () => {
    try {
        const client = new cassandra.Client({
            contactPoints: [process.env.CASSANDRA_HOST],
            localDataCenter: 'datacenter1',
            keyspace: process.env.CASSANDRA_KEYSPACE
        });

        await client.connect();

        console.log('Cassandra conectado');
        return client;

    } catch (error) {
        console.error('Error conectando a Cassandra:', error.message);
        process.exit(1);
    }
};

module.exports = connectCassandra;