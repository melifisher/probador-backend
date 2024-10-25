export class RecommendationForUser {
  constructor(pool) {
      this.pool = pool;
      this.MINIMUM_SIMILARITY_SCORE = 0.3;
      this.MINIMUM_COMMON_ITEMS = 3;
      this.MINIMUM_RATING_THRESHOLD = 3.5;
  }

  async getRecommendations(userId) {
      try {
          const [userRatings, similarUsers] = await Promise.all([
              this.getUserImplicitRatings(userId),
              this.findSimilarUsers(userId)
          ]);

          if (!similarUsers.length) {
              return await this.getFallbackRecommendations(userId);
          }

          const recommendations = await this.getCollaborativeRecommendations(userId, similarUsers);
          return recommendations;
      } catch (error) {
          console.error('Error in recommendations:', error);
          throw error;
      }
  }

  async getUserImplicitRatings(userId) {
      const query = `
          WITH user_interactions AS (
              SELECT 
                  da.product_id,
                  COUNT(*) as rental_count,
                  SUM(da.cantidad) as total_quantity,
                  COUNT(CASE WHEN a.estado = 'completado' THEN 1 END) as completed_rentals,
                  COUNT(CASE WHEN a.fecha_devolucion <= a.fecha_reserva THEN 1 END) as on_time_returns,
                  COUNT(DISTINCT DATE_TRUNC('month', a.fecha_reserva)) as rental_months
              FROM alquiler a
              JOIN detalle_alquiler da ON a.id = da.alquiler_id
              WHERE a.user_id = $1
              GROUP BY da.product_id
          )
          SELECT 
              product_id,
              LEAST(5.0, (
                  -- Frecuencia de alquiler normalizada (30%)
                  LEAST(1.0, (rental_count::float / NULLIF(rental_months, 0)) / 3.0) * 0.3 +
                  -- Tasa de finalización (30%)
                  (completed_rentals::float / NULLIF(rental_count, 0)) * 0.3 +
                  -- Devoluciones a tiempo (20%)
                  (on_time_returns::float / NULLIF(rental_count, 0)) * 0.2 +
                  -- Cantidad promedio normalizada (20%)
                  LEAST(1.0, (total_quantity::float / NULLIF(rental_count, 0)) / 5.0) * 0.2
              ) * 5.0) as implicit_rating
          FROM user_interactions
          WHERE rental_count > 0;
      `;
      
      const result = await this.pool.query(query, [userId]);
      return result.rows;
  }

  async findSimilarUsers(userId) {
      const query = `
          WITH user_ratings AS (
              SELECT 
                  a.user_id,
                  da.product_id,
                  COUNT(*) as interactions,
                  LEAST(5.0, (
                      COUNT(*)::float * 0.3 + 
                      COUNT(CASE WHEN a.estado = 'completado' THEN 1 END)::float / NULLIF(COUNT(*), 0) * 0.3 +
                      COUNT(CASE WHEN a.fecha_devolucion <= a.fecha_reserva THEN 1 END)::float / NULLIF(COUNT(*), 0) * 0.2 +
                      AVG(da.cantidad) * 0.2
                  ) * 5.0) as rating
              FROM alquiler a
              JOIN detalle_alquiler da ON a.id = da.alquiler_id
              GROUP BY a.user_id, da.product_id
          ),
          user_avg_ratings AS (
              SELECT 
                  user_id,
                  AVG(rating) as avg_rating,
                  COUNT(DISTINCT product_id) as rated_products
              FROM user_ratings
              GROUP BY user_id
          ),
          pearson_correlation AS (
              SELECT 
                  ur2.user_id as similar_user_id,
                  COUNT(DISTINCT ur1.product_id) as common_products,
                  CORR(ur1.rating, ur2.rating) as similarity_score
              FROM user_ratings ur1
              JOIN user_ratings ur2 ON ur1.product_id = ur2.product_id
              WHERE ur1.user_id = $1
              AND ur2.user_id != $1
              GROUP BY ur2.user_id
              HAVING COUNT(DISTINCT ur1.product_id) >= $2
          )
          SELECT 
              pc.similar_user_id,
              pc.similarity_score,
              pc.common_products,
              uar.rated_products as total_products
          FROM pearson_correlation pc
          JOIN user_avg_ratings uar ON pc.similar_user_id = uar.user_id
          WHERE pc.similarity_score > $3
          ORDER BY 
              pc.similarity_score * LN(pc.common_products) DESC,
              uar.rated_products DESC
          LIMIT 10;
      `;
      
      const result = await this.pool.query(query, [
          userId, 
          this.MINIMUM_COMMON_ITEMS,
          this.MINIMUM_SIMILARITY_SCORE
      ]);
      return result.rows;
  }

  async getCollaborativeRecommendations(userId, similarUsers) {
      const query = `
          WITH similar_user_ratings AS (
              SELECT 
                  da.product_id,
                  a.user_id,
                  COUNT(*) as interactions,
                  LEAST(5.0, (
                      COUNT(*)::float * 0.3 + 
                      COUNT(CASE WHEN a.estado = 'completado' THEN 1 END)::float / NULLIF(COUNT(*), 0) * 0.3 +
                      COUNT(CASE WHEN a.fecha_devolucion <= a.fecha_reserva THEN 1 END)::float / NULLIF(COUNT(*), 0) * 0.2 +
                      AVG(da.cantidad) * 0.2
                  ) * 5.0) as rating
              FROM alquiler a
              JOIN detalle_alquiler da ON a.id = da.alquiler_id
              WHERE a.user_id = ANY($1::int[])
              GROUP BY da.product_id, a.user_id
          ),
          weighted_predictions AS (
              SELECT 
                  p.id,
                  p.nombre,
                  p.precio,
                  p.disponible,
                  p.imagen,
                  p.color,
                  p.talla,
                  p.modelo_url,
                  p.categoria_id,
                  SUM(sur.rating * u.similarity_score) / NULLIF(SUM(ABS(u.similarity_score)), 0) as predicted_rating,
                  COUNT(DISTINCT sur.user_id) as recommending_users
              FROM product p
              JOIN similar_user_ratings sur ON p.id = sur.product_id
              JOIN unnest($1::int[], $2::float[]) AS u(user_id, similarity_score)
                  ON sur.user_id = u.user_id
              WHERE p.id NOT IN (
                  SELECT DISTINCT product_id 
                  FROM detalle_alquiler da
                  JOIN alquiler a ON da.alquiler_id = a.id 
                  WHERE a.user_id = $3
              )
              AND p.disponible = true
              GROUP BY 
                  p.id, p.nombre, p.precio, p.disponible, 
                  p.imagen, p.color, p.talla, p.modelo_url, 
                  p.categoria_id
          )
          SELECT 
              id,
              nombre,
              precio,
              disponible,
              imagen,
              color,
              talla,
              modelo_url,
              categoria_id,
              predicted_rating as score,
              recommending_users,
              'collaborative' as recommendation_type
          FROM weighted_predictions
          WHERE predicted_rating >= $4
          ORDER BY 
              predicted_rating * LN(recommending_users) DESC,
              predicted_rating DESC
          LIMIT 10;
      `;
      
      const similarUserIds = similarUsers.map(u => u.similar_user_id);
      const similarityScores = similarUsers.map(u => u.similarity_score);
      
      const result = await this.pool.query(query, [
          similarUserIds,
          similarityScores,
          userId,
          this.MINIMUM_RATING_THRESHOLD
      ]);
      return result.rows;
  }

  async getFallbackRecommendations(userId) {
      // Implementación de recomendaciones populares cuando no hay usuarios similares
      const query = `
          WITH popular_products AS (
              SELECT 
                  p.id,
                  p.nombre,
                  p.precio,
                  p.disponible,
                  p.imagen,
                  p.color,
                  p.talla,
                  p.modelo_url,
                  p.categoria_id,
                  COUNT(DISTINCT a.user_id) as unique_users,
                  COUNT(*) as total_rentals,
                  AVG(CASE WHEN a.estado = 'completado' THEN 1.0 ELSE 0.5 END) as completion_rate
              FROM product p
              JOIN detalle_alquiler da ON p.id = da.product_id
              JOIN alquiler a ON da.alquiler_id = a.id
              WHERE p.disponible = true
              AND p.id NOT IN (
                  SELECT DISTINCT product_id 
                  FROM detalle_alquiler da2
                  JOIN alquiler a2 ON da2.alquiler_id = a2.id 
                  WHERE a2.user_id = $1
              )
              GROUP BY 
                  p.id, p.nombre, p.precio, p.disponible,
                  p.imagen, p.color, p.talla, p.modelo_url,
                  p.categoria_id
          )
          SELECT 
              id,
              nombre,
              precio,
              disponible,
              imagen,
              color,
              talla,
              modelo_url,
              categoria_id,
              (completion_rate * 2.5 + LN(unique_users + 1) * 2.5) as score,
              'popularity' as recommendation_type
          FROM popular_products
          ORDER BY score DESC
          LIMIT 10;
      `;
      
      const result = await this.pool.query(query, [userId]);
      return result.rows;
  }
}