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
  password: 'password',
  port: 5432,
});

const SECRET_KEY = 'token';

app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;
  try {
    const result = await pool.query('SELECT * FROM "user" WHERE username = $1', [username]);
    if (result.rows.length > 0) {
      const user = result.rows[0];
      if (await bcrypt.compare(password, user.password)) {
        const token = jwt.sign({ id: user.id, username: user.username, rol: user.rol }, SECRET_KEY);
        res.json({ id: user.id, username: user.username, rol: user.rol, email: user.email, token });
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
    const { username, password, rol } = req.body;
    const hashedPassword = await bcrypt.hash(password, 10);
    const result = await pool.query(
      'INSERT INTO "user" (username, password, rol) VALUES ($1, $2, $3) returning id, username, rol',
      [username, hashedPassword, rol]
    );
    const newUser = result.rows[0];
    const token = jwt.sign({ id: newUser.id, username: newUser.username, rol: newUser.rol }, SECRET_KEY);
    res.status(201).json({ ...newUser, token });
  } catch (error) {
    if (error.constraint === 'user_nombre_key') {
      res.status(400).json({ error: 'Username already exists' });
    } else {
      res.status(500).json({ error: 'Server error: ' + error.message });
    }
  }
});

//PRODUCTS
app.get('/api/products', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM product');
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/products/category/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { rows } = await pool.query('SELECT * FROM product WHERE categoria_id = $1', [id]);
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/api/products', async (req, res) => {
  try {
    const { nombre, talla, color, precio, imagen, disponible, modelo_url, categoria_id } = req.body;
    const { rows } = await pool.query(
      'INSERT INTO product (nombre, talla, color, precio, imagen, disponible, modelo_url, categoria_id) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *',
      [nombre, talla, color, precio, imagen, disponible, modelo_url, categoria_id]
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
    const { nombre, talla, color, precio, imagen, disponible, modelo_url, categoria_id} = req.body;
    const { rows } = await pool.query(
      'UPDATE product SET nombre = $1, talla = $2, color = $3, precio = $4, imagen = $5, disponible = $6, modelo_url = $7, categoria_id = $8 WHERE id = $9 RETURNING *',
      [ nombre, talla, color, precio, imagen, disponible, modelo_url, categoria_id, id]
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
    res.status(204).json(rows[0]);
    //res.json({ message: 'Product deleted successfully' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

//CATEGORY
app.get('/api/categories', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM categoria');
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/categories/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { rows } = await pool.query('SELECT * FROM categoria WHERE id = $1', [id]);
    console.log(rows[0]);
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Category not found' });
    }
    res.status(200).json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/api/categories', async (req, res) => {
  try {
    const { nombre } = req.body;
    const { rows } = await pool.query(
      'INSERT INTO categoria (nombre) VALUES ($1) RETURNING *',
      [nombre]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.put('/api/categories/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { nombre } = req.body;
    const { rows } = await pool.query(
      'UPDATE categoria SET nombre = $1 WHERE id = $2 RETURNING *',
      [nombre, id]
    );
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Category not found' });
    }
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.delete('/api/categories/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { rows } = await pool.query('DELETE FROM categoria WHERE id = $1 RETURNING *', [id]);
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Category not found' });
    }
    res.status(204).json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});
