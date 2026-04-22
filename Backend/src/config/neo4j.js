const neo4j = require('neo4j-driver');

let driver;

const connectNeo4j = async () => {
    try {
        driver = neo4j.driver(
            process.env.NEO4J_URI,
            neo4j.auth.basic(
                process.env.NEO4J_USER,
                process.env.NEO4J_PASSWORD
            )
        );

        await driver.verifyConnectivity();
        console.log('Neo4j conectado');

        // Crear índices y constraints al conectar
        await initSchema();

    } catch (error) {
        console.error('Error conectando a Neo4j:', error.message);
        process.exit(1);
    }
};

/**
 * Crea los índices y constraints necesarios para las consultas de grafos.
 * Se ejecuta una sola vez al arrancar el servidor.
 */
const initSchema = async () => {
    const session = driver.session();
    try {
        const constraints = [
            // Unicidad
            'CREATE CONSTRAINT user_id_unique IF NOT EXISTS FOR (u:User) REQUIRE u.userId IS UNIQUE',
            'CREATE CONSTRAINT course_id_unique IF NOT EXISTS FOR (c:Course) REQUIRE c.courseId IS UNIQUE',
            // Índices de búsqueda
            'CREATE INDEX user_username IF NOT EXISTS FOR (u:User) ON (u.username)',
            'CREATE INDEX user_fullname IF NOT EXISTS FOR (u:User) ON (u.fullName)',
        ];

        for (const cql of constraints) {
            await session.run(cql);
        }

        console.log('Neo4j: schema inicializado');
    } catch (err) {
        // Los constraints ya pueden existir; no es error fatal
        console.warn('Neo4j initSchema (advertencia):', err.message);
    } finally {
        await session.close();
    }
};

const getDriver = () => {
    if (!driver) throw new Error('Neo4j no está conectado');
    return driver;
};

module.exports = connectNeo4j;
module.exports.getDriver = getDriver;