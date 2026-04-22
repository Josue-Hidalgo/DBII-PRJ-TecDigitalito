const cassandra = require('cassandra-driver');

async function testCassandraConnection() {
    try {
        const client = new cassandra.Client({
            contactPoints: ['localhost:9042'],
            localDataCenter: 'datacenter1'
        });

        await client.connect();
        console.log('â\x9c\x85 Conexión a Cassandra exitosa');

        // Verificar keyspace
        const queryKeyspace = "SELECT keyspace_name FROM system_schema.keyspaces WHERE keyspace_name = 'tec_digitalito'";
        const resultKeyspace = await client.execute(queryKeyspace);
        
        if (resultKeyspace.rows.length > 0) {
            console.log('â\x9c\x85 Keyspace "tec_digitalito" existe');
        } else {
            console.log('â\x9d\x8c Keyspace "tec_digitalito" no existe');
            return;
        }

        // Verificar tablas
        const queryTables = "SELECT table_name FROM system_schema.tables WHERE keyspace_name = 'tec_digitalito'";
        const resultTables = await client.execute(queryTables);
        
        console.log('â\x9c\x85 Tablas encontradas:');
        resultTables.rows.forEach(row => {
            console.log(`   - ${row.table_name}`);
        });

        // Probar una inserción simple
        const testQuery = "INSERT INTO tec_digitalito.login_attempts_by_user (user_id, timestamp, ip, dispositivo, exitoso) VALUES (?, ?, ?, ?, ?)";
        const testParams = [
            cassandra.Uuid.random(),
            new Date(),
            '192.168.1.1',
            'test-device',
            false
        ];
        
        await client.execute(testQuery, testParams, { prepare: true });
        console.log('â\x9c\x85 Prueba de inserción exitosa');

        // Limpiar datos de prueba
        const deleteQuery = "DELETE FROM tec_digitalito.login_attempts_by_user WHERE user_id = ?";
        await client.execute(deleteQuery, [testParams[0]], { prepare: true });
        console.log('â\x9c\x85 Datos de prueba eliminados');

        await client.shutdown();
        console.log('â\x9c\x85 Conexión cerrada');
        console.log('\nâ\x9c\x85 Cassandra está listo para usar con la aplicación');

    } catch (error) {
        console.error('â\x9d\x8c Error:', error.message);
    }
}

testCassandraConnection();
