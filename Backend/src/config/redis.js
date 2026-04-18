const { createClient } = require('redis');

let client;

const connectRedis = async () => {
    try {
        client = createClient({
            url: process.env.REDIS_URI || 'redis://redis:6379'
        });

        client.on('error', (err) => console.error('Redis error:', err));

        await client.connect();
        console.log('Redis conectado');
    } catch (error) {
        console.error('Error conectando a Redis: ', error.message);
        process.exit(1);
    }
};

const getClient = () => {
    if (!client) throw new Error('Redis no está conectado');
    return client;
};

module.exports = connectRedis;
module.exports.getClient = getClient;