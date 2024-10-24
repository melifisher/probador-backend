const RecommendationService = require('./recommendations.service');

class RecommendationController {
  constructor() {
    this.recommendationService = new RecommendationService();
  }

  async getRecommendations(req, res) {
    try {
      const { userId } = req.params;
      const recommendations = await this.recommendationService.getRecommendationsForUser(parseInt(userId));
      res.json(recommendations);
    } catch (error) {
      console.error('Error en controller:', error);
      res.status(500).json({ error: 'Error al obtener recomendaciones' });
    }
  }
}
