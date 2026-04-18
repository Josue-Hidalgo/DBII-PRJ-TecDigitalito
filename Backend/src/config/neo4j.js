const neo4j = require('neo4j-driver');

const connectNeo4j = async () => {
    try {
        const driver = neo4j.driver(
            process.env.NEO4J_URI, // ej: bolt://neo4j:7687
            neo4j.auth.basic(
                process.env.NEO4J_USER,
                process.env.NEO4J_PASSWORD
            )
        );

        await driver.verifyConnectivity();

        console.log('Neo4j conectado');
        return driver;

    } catch (error) {
        console.error('Error conectando a Neo4j:', error.message);
        process.exit(1);
    }
};

module.exports = connectNeo4j;