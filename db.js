const { Pool } = require('pg');

const pool = new Pool({
  user: 'postgres',
  host: 'localhost',
  database: 'probador',
  password: '1999',
  port: 5432,
});

module.exports = {
  pool,
};