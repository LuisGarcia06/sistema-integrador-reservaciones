const express = require('express');
const path = require('path');
const pool = require('./config/database');
const authRoutes = require('./routes/auth.routes');
const bitacoraRoutes = require('./routes/bitacora.routes');
const dailyRoutes = require('./routes/daily.routes');
const guiasRoutes = require('./routes/guias.routes');
const operadoresRoutes = require('./routes/operadores.routes');
const operacionesRoutes = require('./routes/operaciones.routes');
const reservacionesRoutes = require('./routes/reservaciones.routes');
const transportesRoutes = require('./routes/transportes.routes');
const vehiculosRoutes = require('./routes/vehiculos.routes');

const app = express();
const frontendPath = path.join(__dirname, '..', 'frontend');

app.use(express.json());
app.use('/app', express.static(frontendPath));

app.use('/api/auth', authRoutes);
app.use('/api/bitacora', bitacoraRoutes);
app.use('/api/daily', dailyRoutes);
app.use('/api/guias', guiasRoutes);
app.use('/api/operadores', operadoresRoutes);
app.use('/api/operaciones', operacionesRoutes);
app.use('/api/reservaciones', reservacionesRoutes);
app.use('/api/transportes', transportesRoutes);
app.use('/api/vehiculos', vehiculosRoutes);

const PORT = 3000;

app.get('/', (req, res) => {
    res.send('API del Sistema Integrador de Reservaciones funcionando');
});

app.get('/api/test-db', async (req, res) => {
    try {
        const result = await pool.query('SELECT current_database(), NOW()');

        res.json({
            mensaje: 'Conexión con PostgreSQL correcta',
            datos: result.rows[0]
        });
    } catch (error) {
        console.error('Error de conexión:', error);

        res.status(500).json({
            mensaje: 'Error al conectar con PostgreSQL'
        });
    }
});

app.listen(PORT, () => {
    console.log(`Servidor ejecutándose en http://localhost:${PORT}`);
});
