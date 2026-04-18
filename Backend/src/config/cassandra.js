const cassandra = require('cassandra-driver');

let client;

const connectCassandra = async () => {
    try {
        client = new cassandra.Client({
            contactPoints: [process.env.CASSANDRA_HOST || 'cassandra'],
            localDataCenter: process.env.CASSANDRA_DC || 'datacenter1',
            credentials: {
                username: process.env.CASSANDRA_USER || '',
                password: process.env.CASSANDRA_PASSWORD || ''
            }
        });

        await client.connect();
        console.log('Cassandra conectado');
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