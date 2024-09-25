const express = require('express');
const { Pool } = require('pg');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const cors = require('cors');

const app = express();
const port = 3000;

app.use(cors());
app.use(express.json());

const pool = new Pool({
  user: 'postgres',
  host: 'localhost',
  database: 'probador',
  password: '1999',
  port: 5432,
});

const SECRET_KEY = 'token';

app.post('/api/login', async (req, res) => {
  const { nombre, password } = req.body;
  try {
    const result = await pool.query('SELECT * FROM "user" WHERE nombre = $1', [nombre]);
    if (result.rows.length > 0) {
      const user = result.rows[0];
      if (await bcrypt.compare(password, user.password)) {
        const token = jwt.sign({ id: user.id, nombre: user.nombre, rol: user.rol }, SECRET_KEY);
        res.json({ id: user.id.toString(), nombre: user.nombre, rol: user.rol,token });
      } else {
        res.status(400).json({ error: 'Invalid credentials' });
      }
    } else {
      res.status(400).json({ error: 'User not found' });
    }
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/register', async (req, res) => {
  try {
    const { nombre, password, rol } = req.body;
    const hashedPassword = await bcrypt.hash(password, 10);
    const result = await pool.query(
      'INSERT INTO "user" (nombre, password, rol) VALUES ($1, $2, $3) returning id, nombre, rol',
      [nombre, hashedPassword, rol]
    );
    const newUser = result.rows[0];
    const token = jwt.sign({ id: newUser.id, nombre: newUser.nombre, rol: newUser.rol }, SECRET_KEY);
    res.status(201).json({ ...newUser, token });
  } catch (error) {
    if (error.constraint === 'user_nombre_key') {
      res.status(400).json({ error: 'Username already exists' });
    } else {
      res.status(500).json({ error: 'Server error: ' + error.message });
    }
  }
});

app.get('/api/products', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM product');
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/api/products', async (req, res) => {
  try {
    const { nombre, descripcion, talla, precio, imagen, disponible, modelo_url } = req.body;
    const { rows } = await pool.query(
      'INSERT INTO product (nombre, descripcion, talla, precio, imagen, disponible, modelo_url) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *',
      [nombre, descripcion, talla, precio, imagen, disponible, modelo_url]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.put('/api/products/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { nombre, descripcion, talla, precio, imagen, disponible, modelo_url } = req.body;
    const { rows } = await pool.query(
      'UPDATE product SET nombre = $1, descripcion = $2, talla = $3, precio = $4, imagen = $5, disponible = $6, modelo_url = $7 WHERE id = $8 RETURNING *',
      [nombre, descripcion, talla, precio, imagen, disponible, modelo_url, id]
    );
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Product not found' });
    }
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.delete('/api/products/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { rows } = await pool.query('DELETE FROM product WHERE id = $1 RETURNING *', [id]);
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Product not found' });
    }
    res.json({ message: 'Product deleted successfully' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});
