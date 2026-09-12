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
const toursRoutes = require('./routes/tours.routes');
const usuariosRoutes = require('./routes/usuarios.routes');
const vehiculosRoutes = require('./routes/vehiculos.routes');

const app = express();
const frontendPath = path.join(__dirname, '..', 'frontend');
const PORT = 3000;
const HOST = '127.0.0.1';
const CONTENT_SECURITY_POLICY = [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self'",
    "img-src 'self' data:",
    "font-src 'self' data:",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "frame-ancestors 'none'",
    "form-action 'self'"
].join('; ');

app.disable('x-powered-by');

app.use(express.json());

app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    next();
});

app.use('/app', (req, res, next) => {
    res.setHeader('Content-Security-Policy', CONTENT_SECURITY_POLICY);
    next();
});

app.use('/app', express.static(frontendPath, {
    setHeaders: (res, filePath) => {
        if (path.basename(filePath).toLowerCase() === 'index.html') {
            res.setHeader('Cache-Control', 'no-store');
        }
    }
}));

app.use('/api/auth', authRoutes);
app.use('/api/bitacora', bitacoraRoutes);
app.use('/api/daily', dailyRoutes);
app.use('/api/guias', guiasRoutes);
app.use('/api/operadores', operadoresRoutes);
app.use('/api/operaciones', operacionesRoutes);
app.use('/api/reservaciones', reservacionesRoutes);
app.use('/api/transportes', transportesRoutes);
app.use('/api/tours', toursRoutes);
app.use('/api/usuarios', usuariosRoutes);
app.use('/api/vehiculos', vehiculosRoutes);

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

app.listen(PORT, HOST, () => {
    console.log(`Servidor ejecutándose en http://${HOST}:${PORT}`);
});
