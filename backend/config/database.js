const { Pool } = require('pg');
const dotenv = require('dotenv');

if (process.env.APP_CONFIG_PATH) {
    dotenv.config({ path: process.env.APP_CONFIG_PATH });
} else {
    dotenv.config();
}

const pool = new Pool({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD
});

module.exports = pool;


