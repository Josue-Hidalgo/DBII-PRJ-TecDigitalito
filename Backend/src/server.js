require('dotenv').config();

const app = require('./app');
const connectMongoDB = require('./config/mongodb');

const PORT = process.env.PORT || 3000;

// Conectar a Mongo
connectMongoDB();

app.listen(PORT, () => {
    console.log(`Servidor corriendo en puerto ${PORT}`)
})

