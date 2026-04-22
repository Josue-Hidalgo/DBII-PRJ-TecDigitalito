const mongoose = require('mongoose');
const { getClient: getRedis } = require('../config/redis');
const { getDriver: getNeo4j } = require('../config/neo4j');
const { getClient: getCassandra } = require('../config/cassandra');

const checkMongo = async () => {
    // 0 = desconectado, 1 = conectado
    return mongoose.connection.readyState === 1;
};

const checkRedis = async () => {
    const client = getRedis();
    await client.ping(); // lanza error si falla
    return true;
};

const checkNeo4j = async () => {
    const driver = getNeo4j();
    await driver.verifyConnectivity();
    return true;
};

const checkCassandra = async () => {
    const client = getCassandra();
    await client.execute('SELECT now() FROM system.local');
    return true;
};

const runHealthCheck = async () => {
    const checks = { mongo: false, redis: false, neo4j: false, cassandra: false };

    await Promise.allSettled([
        checkMongo().then(() => checks.mongo = true),
        checkRedis().then(() => checks.redis = true),
        checkNeo4j().then(() => checks.neo4j = true),
        checkCassandra().then(() => checks.cassandra = true),
    ]);

    const allOk = Object.values(checks).every(Boolean);
    return { status: allOk ? 'ok' : 'degraded', checks };
};

module.exports = runHealthCheck;