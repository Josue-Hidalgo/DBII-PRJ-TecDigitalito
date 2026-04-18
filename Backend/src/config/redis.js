const { createClient } = require('redis');

const connectRedis = async () => {
    try {
        const client = createClient({
            url: process.env.REDIS_URL
        });

        client.on('error', (err) => {
            console.error('Error en Redis:', err);
        });

        await client.connect();

        console.log('Redis conectado');
        return client;

    } catch (error) {
        console.error('Error conectando a Redis:', error.message);
        process.exit(1);
    }
};

module.exports = connectRedis;