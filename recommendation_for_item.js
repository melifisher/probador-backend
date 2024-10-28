export class RecommendationForItem {
  constructor(pool) {
    this.pool = pool;
  }
  // Obtiene el historial de alquileres de un usuario
  async getUserRentalHistory(userId) {
    const query = `
      SELECT DISTINCT p.id, p.nombre, p.categoria_id, p.color, p.talla
      FROM product p
      JOIN detalle_alquiler da ON p.id = da.product_id
      JOIN alquiler a ON da.alquiler_id = a.id
      WHERE a.user_id = $1
    `;
    const result = await this.pool.query(query, [userId]);
    return result.rows;
  }

  // Calcula las características del producto como vector
  createProductVector(product) {
    return {
      categoria: product.categoria_id,
      color: new Set(product.color),
      talla: new Set(product.talla),
    };
  }

  // Calcula la similitud de coseno entre dos productos
  calculateCosineSimilarity(product1, product2) {
    let similarity = 0;
    
    // Peso para cada característica
    const weights = {
      categoria: 0.4,
      color: 0.3,
      talla: 0.3,
    };

    // Similitud de categoría
    if (product1.categoria === product2.categoria) {
      similarity += weights.categoria;
    }

    // Similitud de colores
    const colorIntersection = new Set(
      [...product1.color].filter(color => product2.color.has(color))
    );
    const colorSimilarity = 
      colorIntersection.size / 
      Math.sqrt(product1.color.size * product2.color.size);
    similarity += weights.color * colorSimilarity;

    // Similitud de tallas
    const tallaIntersection = new Set(
      [...product1.talla].filter(talla => product2.talla.has(talla))
    );
    const tallaSimilarity = 
      tallaIntersection.size / 
      Math.sqrt(product1.talla.size * product2.talla.size);
    similarity += weights.talla * tallaSimilarity;

    return similarity;
  }

  // Obtiene productos similares basados en el historial del usuario
  async getRecommendations(userId, limit = 10) {
    try {
      // 1. Obtener historial del usuario
      const userHistory = await this.getUserRentalHistory(userId);
      
      if (userHistory.length === 0) {
        // Si no hay historial, recomendar productos populares
        return this.getPopularProducts(limit);
      }

      // 2. Obtener todos los productos disponibles
      const availableProducts = await this.pool.query(
        'SELECT * FROM product WHERE disponible = true'
      );

      // 3. Calcular similitud para cada producto
      const recommendations = [];
      for (const candidate of availableProducts.rows) {
        // No recomendar productos que ya alquiló
        if (userHistory.some(p => p.id === candidate.id)) {
          continue;
        }

        let maxSimilarity = 0;
        // Comparar con cada producto del historial
        for (const historicProduct of userHistory) {
          const similarity = this.calculateCosineSimilarity(
            this.createProductVector(candidate),
            this.createProductVector(historicProduct)
          );
          maxSimilarity = Math.max(maxSimilarity, similarity);
        }

        recommendations.push({
          product: candidate,
          similarity: maxSimilarity
        });
      }

      // 4. Ordenar por similitud y retornar los top N
      return recommendations
        .sort((a, b) => b.similarity - a.similarity)
        .slice(0, limit)
        .map(rec => rec.product);

    } catch (error) {
      console.error('Error getting recommendations:', error);
      throw error;
    }
  }

  // Obtener productos populares (fallback cuando no hay historial)
  async getPopularProducts(limit) {
    const query = `
      SELECT p.*, COUNT(da.product_id) as rental_count
      FROM product p
      LEFT JOIN detalle_alquiler da ON p.id = da.product_id
      WHERE p.disponible = true
      GROUP BY p.id
      ORDER BY rental_count DESC
      LIMIT $1
    `;
    const result = await this.pool.query(query, [limit]);
    return result.rows;
  }
}