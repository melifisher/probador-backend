const express = require('express');
const { pool } = require('./db');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const NodeCache = require('node-cache');
const { RecommendationForUser } = require('./recommendation_for_user');
const { RecommendationForItem } = require('./recommendation_for_item');

const app = express();
const port = 3000;

app.use(cors());
app.use(express.json());

const SECRET_KEY = 'token';

app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;
  try {
    const result = await pool.query('SELECT * FROM "user" WHERE username = $1', [username]);
    if (result.rows.length > 0) {
      const user = result.rows[0];
      if (await bcrypt.compare(password, user.password)) {
        console.log('Contraseña coincide');
        // Convertimos el id a string
        const token = jwt.sign({ id: user.id.toString(), username: user.username, rol: user.rol }, SECRET_KEY);
        res.json({ id: user.id.toString(), username: user.username, rol: user.rol, email: user.email, token });
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
    console.log('New user created:', newUser);
     // Convertimos el id a string
     const token = jwt.sign({ id: newUser.id.toString(), username: newUser.username, rol: newUser.rol }, SECRET_KEY);
    // Devolvemos el id como string
    res.status(201).json({ ...newUser, id: newUser.id.toString(), token });
  } catch (error) {
    if (error.constraint === 'user_nombre_key') {
      console.log('Username already exists');
      res.status(400).json({ error: 'Username already exists' });
    } else {
      console.log('Server error: ' + error.message);
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

app.get('/api/products/disponibles', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM product WHERE disponible = true');
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/products/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { rows } = await pool.query('SELECT * FROM product WHERE id = $1', [id]);
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Product not found' });
    }
    res.json(rows[0]);
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
    const categoria_id_int = parseInt(categoria_id, 10);  // Convertir categoria_id a entero si es necesario
   // console.log("Recibido desde frontend:", req.body);  // Loguea lo que recibes del frontend
    const { rows } = await pool.query(
      'INSERT INTO product (nombre, talla, color, precio, imagen, disponible, modelo_url, categoria_id) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *',
      [nombre, talla, color, precio, imagen, disponible, modelo_url, categoria_id_int]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error('Error al insertar producto:', err);
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
    // Convertimos los IDs a string
    const categories = rows.map(category => ({
      ...category,
      id: category.id.toString()
    }));
    res.json(categories);
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

//Alquiler
// GET all rentals
app.get('/api/rentals', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM alquiler');
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET a specific rental
app.get('/api/rentals/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { rows } = await pool.query('SELECT * FROM alquiler WHERE id = $1', [id]);
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Rental not found' });
    }
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET rentals by user_id
app.get('/api/rentals/user/:user_id', async (req, res) => {
  try {
    const { user_id } = req.params;
    const { rows } = await pool.query('SELECT * FROM alquiler WHERE user_id = $1', [user_id]);
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST a new rental
app.post('/api/rentals', async (req, res) => {
  try {
    const { estado, fecha_devolucion, fecha_reserva, precio_total, user_id } = req.body;
    const { rows } = await pool.query(
      'INSERT INTO alquiler (estado, fecha_devolucion, fecha_reserva, precio_total, user_id) VALUES ($1, $2, $3, $4, $5) RETURNING *',
      [estado, fecha_devolucion, fecha_reserva, precio_total, user_id]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT (update) a rental
app.put('/api/rentals/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { estado, fecha_devolucion, fecha_reserva, precio_total, user_id } = req.body;
    const { rows } = await pool.query(
      'UPDATE alquiler SET estado = $1, fecha_devolucion = $2, fecha_reserva = $3, precio_total = $4, user_id = $5 WHERE id = $6 RETURNING *',
      [estado, fecha_devolucion, fecha_reserva, precio_total, user_id, id]
    );
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Rental not found' });
    }
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE a rental
app.delete('/api/rentals/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { rows } = await pool.query('DELETE FROM alquiler WHERE id = $1 RETURNING *', [id]);
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Rental not found' });
    }
    res.status(204).send();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET all rental details
app.get('/api/rental-details', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM detalle_alquiler');
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET rental details by alquiler_id
app.get('/api/rental-details/rental/:alquiler_id', async (req, res) => {
  try {
    const { alquiler_id } = req.params;
    const { rows } = await pool.query('SELECT * FROM detalle_alquiler WHERE alquiler_id = $1', [alquiler_id]);
    //console.log(rows);
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET a specific rental detail
app.get('/api/rental-details/:alquiler_id/:product_id', async (req, res) => {
  try {
    const { alquiler_id, product_id } = req.params;
    const { rows } = await pool.query('SELECT * FROM detalle_alquiler WHERE alquiler_id = $1 AND product_id = $2', [alquiler_id, product_id]);
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Rental detail not found' });
    }
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST a new rental detail
app.post('/api/rental-details', async (req, res) => {
  try {
    const { alquiler_id, product_id, cantidad, precio, talla, color  } = req.body;
    const { rows } = await pool.query(
      'INSERT INTO detalle_alquiler (alquiler_id, product_id, cantidad, precio, talla, color) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
      [alquiler_id, product_id, cantidad, precio, talla, color]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT (update) a rental detail
app.put('/api/rental-details/:alquiler_id/:product_id', async (req, res) => {
  try {
    const { alquiler_id, product_id } = req.params;
    const { cantidad, precio, talla, color } = req.body;
    const { rows } = await pool.query(
      'UPDATE detalle_alquiler SET cantidad = $1 AND precio = $2 AND talla = $3 AND color = $4 WHERE alquiler_id = $5 AND product_id = $6 RETURNING *',
      [cantidad, precio, talla, color, alquiler_id, product_id]
    );
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Rental detail not found' });
    }
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE a rental detail
app.delete('/api/rental-details/:alquiler_id/:product_id', async (req, res) => {
  try {
    const { alquiler_id, product_id } = req.params;
    const { rows } = await pool.query('DELETE FROM detalle_alquiler WHERE alquiler_id = $1 AND product_id = $1 RETURNING *', [alquiler_id, product_id]);
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Rental detail not found' });
    }
    res.status(204).send();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});


//Carrito
app.post('/api/cart', async (req, res) => {
  try {
    const { user_id, product_id, cantidad, talla, color, rental_days } = req.body;

    console.log("Datos recibidos: ", req.body);
    const result = await pool.query(
      `INSERT INTO cart (user_id, product_id, cantidad, talla, color, rental_days)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (user_id, product_id) DO UPDATE SET
       cantidad = cart.cantidad + EXCLUDED.cantidad,
       rental_days = EXCLUDED.rental_days
       RETURNING *`,
      [user_id, product_id, cantidad, talla, color, rental_days]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error adding product to cart' });
  }
});


//obtener los productos segun id usuario 
app.get('/api/cart/:user_id', async (req, res) => {
  try {
    const { user_id } = req.params;
    const result = await pool.query(
      'SELECT cart.*, product.nombre, product.precio, product.imagen FROM cart JOIN product ON cart.product_id = product.id WHERE cart.user_id = $1',
      [user_id]
    );
    res.status(200).json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error fetching cart items' });
  }
});
//Eliminar producto del carrito 
app.delete('/api/cart/:user_id/:product_id', async (req, res) => {
  try {
    const { user_id, product_id } = req.params;
    await pool.query('DELETE FROM cart WHERE user_id = $1 AND product_id = $2', [user_id, product_id]);
    res.status(204).send();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error removing product from cart' });
  }
});

const cache = new NodeCache({ stdTTL: 3600 }); // Cache for 1 hour

app.get('/api/products/:id/full', async (req, res) => {
  try {
    const { id } = req.params;
    
    // Check cache first
    const cachedData = cache.get(`product:${id}:full`);
    if (cachedData) {
      return res.json(cachedData);
    }

    // Get all data in parallel
    const [product, similarProducts, categoryProducts, popularInCategory] = await Promise.all([
      pool.query('SELECT * FROM product_category_view WHERE id = $1', [id]),
      pool.query('SELECT * FROM product WHERE categoria_id = (SELECT categoria_id FROM product WHERE id = $1) LIMIT 5', [id]),
      pool.query('SELECT * FROM product WHERE categoria_id = (SELECT categoria_id FROM product WHERE id = $1) LIMIT 10', [id]),
      pool.query('SELECT * FROM popular_products_view WHERE categoria_id = (SELECT categoria_id FROM product WHERE id = $1) ORDER BY rental_count DESC LIMIT 5', [id])
    ]);

    const response = {
      product: product.rows[0],
      similarProducts: similarProducts.rows,
      categoryProducts: categoryProducts.rows,
      popularInCategory: popularInCategory.rows
    };

    // Cache the response
    cache.set(`product:${id}:full`, response);

    res.json(response);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/recommendations/:user_id/:type', async (req, res) => {
  try {
    const { user_id, type } = req.params;
    var recommendationService;
    if(type == 1){
      recommendationService = new RecommendationForUser(pool);
      console.log("recomendación por usuario");
    }else{
      recommendationService = new RecommendationForItem(pool);
      console.log("recomendación por producto");
    }
      const recommendations = await recommendationService.getRecommendations(user_id);
      console.log(recommendations);
      res.status(200).json(recommendations);
  } catch (error) {
    console.error('Error en recomendaciones:', error);
    res.status(500).json({ error: 'Error al obtener recomendaciones' });
  }
});

app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});