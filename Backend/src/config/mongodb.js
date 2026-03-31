const mongoose = require('mongoose');

const connectMongoDB = async () => {
    try {
        const conn = await mongoose.connect(process.env.MONGO_URI);

        console.log(`Mongo conectado: ${conn.connection.host}`);
    } catch (error) {
        console.error(`Error conectando a Mongo: `, error.message);
        process.exit(1);
    }
};

module.exports = connectMongoDB;