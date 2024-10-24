export class RecommendationService {
    constructor(pool) {
        this.pool = pool;
    }
    async getRecommendationsForUser(userId) {
      try {
        // 1. Obtener ratings implícitos de la base de datos
        //const userRatings = await this.getUserImplicitRatings(userId);
        
        // 2. Encontrar usuarios similares usando correlación de Pearson
        const similarUsers = await this.findSimilarUsers(userId);
        console.log("Usuarios similares encontrados:", similarUsers);
        // 3. Obtener recomendaciones basadas en usuarios similares
        const recommendations = await this.getCollaborativeRecommendations(userId, similarUsers);

        console.log("Recomendaciones obtenidas:", recommendations);
        return recommendations;
      } catch (error) {
        console.error('Error en recomendaciones:', error);
        throw error;
      }
    }
  
    async getUserImplicitRatings(userId) {
      const query = `
        WITH user_rental_stats AS (
          SELECT 
            da.product_id,
            COUNT(*) as rental_frequency,
            AVG(CASE 
              WHEN a.estado = 'completado' THEN 1.0 
              ELSE 0.5 
            END) as completion_score,
            AVG(CASE 
              WHEN a.fecha_devolucion <= a.fecha_reserva THEN 1.0 
              ELSE 0.5 
            END) as return_score,
            AVG(da.cantidad) as quantity_score
          FROM alquiler a
          JOIN detalle_alquiler da ON a.id = da.alquiler_id
          WHERE a.user_id = $1
          GROUP BY da.product_id
        )
        SELECT 
          product_id,
          -- Calcular rating implícito basado en comportamiento
          LEAST(5.0, (
            rental_frequency * 0.3 + 
            completion_score * 0.3 + 
            return_score * 0.2 + 
            quantity_score * 0.2
          ) * 5.0) as implicit_rating
        FROM user_rental_stats;
      `;
      
      const result = await this.pool.query(query, [userId]);
      return result.rows;
    }
  
    async findSimilarUsers(userId) {
      // Implementación usando SQL puro para mejor rendimiento
      const query = `
        WITH user_ratings AS (
          -- Convertir historial de alquiler a ratings implícitos
          SELECT 
            a.user_id,
            da.product_id,
            LEAST(5.0, (
              COUNT(*) * 0.3 + 
              AVG(CASE WHEN a.estado = 'completado' THEN 1.0 ELSE 0.5 END) * 0.3 +
              AVG(CASE WHEN a.fecha_devolucion <= a.fecha_reserva THEN 1.0 ELSE 0.5 END) * 0.2 +
              AVG(da.cantidad) * 0.2
            ) * 5.0) as rating
          FROM alquiler a
          JOIN detalle_alquiler da ON a.id = da.alquiler_id
          GROUP BY a.user_id, da.product_id
        ),
        -- Calcular correlación de Pearson
        pearson_correlation AS (
          SELECT 
            ur2.user_id as similar_user_id,
            (
              SUM((ur1.rating - avg1.avg_rating) * (ur2.rating - avg2.avg_rating)) /
              NULLIF((
                SQRT(SUM(POW(ur1.rating - avg1.avg_rating, 2))) *
                SQRT(SUM(POW(ur2.rating - avg2.avg_rating, 2)))
              ),0)
            ) as similarity_score
          FROM user_ratings ur1
          CROSS JOIN (
            SELECT user_id, AVG(rating) as avg_rating
            FROM user_ratings
            GROUP BY user_id
          ) avg1
          JOIN user_ratings ur2 ON ur1.product_id = ur2.product_id
          JOIN (
            SELECT user_id, AVG(rating) as avg_rating
            FROM user_ratings
            GROUP BY user_id
          ) avg2 ON ur2.user_id = avg2.user_id
          WHERE ur1.user_id = $1
          AND ur2.user_id != $1
          GROUP BY ur2.user_id
          -- HAVING COUNT(*) >= 3  -- Mínimo de productos en común
        )
        SELECT 
          similar_user_id,
          similarity_score
        FROM pearson_correlation
        WHERE similarity_score > 0
        ORDER BY similarity_score DESC
        LIMIT 5;
      `;
      
      const result = await this.pool.query(query, [userId]);
      return result.rows;
    }
  
    async getCollaborativeRecommendations(userId, similarUsers) {
        const query = `
          WITH user_behavior_metrics AS (
            -- Primero calculamos las métricas de comportamiento por usuario y producto
            SELECT 
              a.user_id,
              da.product_id,
              COUNT(*) as rental_count,
              AVG(CASE WHEN a.estado = 'completado' THEN 1.0 ELSE 0.5 END) as completion_avg,
              AVG(CASE WHEN a.fecha_devolucion <= a.fecha_reserva THEN 1.0 ELSE 0.5 END) as return_avg,
              AVG(da.cantidad) as quantity_avg
            FROM alquiler a
            JOIN detalle_alquiler da ON a.id = da.alquiler_id
            GROUP BY a.user_id, da.product_id
          ),
          user_ratings AS (
            -- Luego calculamos el rating implícito
            SELECT DISTINCT ON (product_id)  -- Asegura un rating único por producto
              user_id,
              product_id,
              LEAST(5.0, (
                rental_count * 0.3 + 
                completion_avg * 0.3 +
                return_avg * 0.2 +
                quantity_avg * 0.2
              ) * 5.0) as rating
            FROM user_behavior_metrics
            ORDER BY product_id, rating DESC  -- Toma el rating más alto para cada producto
          ),
          weighted_recommendations AS (
            -- Finalmente calculamos las recomendaciones ponderadas
            SELECT DISTINCT ON (p.id)  -- Asegura productos únicos
              p.*,
              SUM(ur.rating * u.similarity_score) / SUM(u.similarity_score) as predicted_rating
            FROM user_ratings ur
            JOIN product p ON ur.product_id = p.id
            JOIN unnest($1::int[], $2::float[]) AS u(user_id, similarity_score)
              ON ur.user_id = u.user_id
            WHERE p.id NOT IN (
              -- Excluir productos ya alquilados por el usuario
              SELECT DISTINCT product_id 
              FROM detalle_alquiler da2 
              JOIN alquiler a2 ON da2.alquiler_id = a2.id 
              WHERE a2.user_id = $3
            )
            AND p.disponible = true  -- Solo productos disponibles
            GROUP BY 
              p.id,
              p.nombre,
              p.precio,
              p.disponible,
              p.imagen,
              p.modelo_url,
              p.color,
              p.talla,
              p.categoria_id
            ORDER BY p.id, predicted_rating DESC
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
            'collaborative' as recommendation_type
          FROM weighted_recommendations
          WHERE predicted_rating >= 3.5
          ORDER BY predicted_rating DESC
          LIMIT 10;
        `;
        
        const similarUserIds = similarUsers.map(u => u.similar_user_id);
        const similarityScores = similarUsers.map(u => u.similarity_score);
        
        const result = await this.pool.query(query, [similarUserIds, similarityScores, userId]);
        return result.rows;
      }
  }