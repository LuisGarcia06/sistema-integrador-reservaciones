const express = require('express');
const path = require('path');
const pool = require('./config/database');
const authRoutes = require('./routes/auth.routes');
const bitacoraRoutes = require('./routes/bitacora.routes');
const dailyRoutes = require('./routes/daily.routes');
const reservacionesRoutes = require('./routes/reservaciones.routes');

const app = express();
const frontendPath = path.join(__dirname, '..', 'frontend');

app.use(express.json());
app.use('/app', express.static(frontendPath));

app.use('/api/auth', authRoutes);
app.use('/api/bitacora', bitacoraRoutes);
app.use('/api/daily', dailyRoutes);
app.use('/api/reservaciones', reservacionesRoutes);

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
