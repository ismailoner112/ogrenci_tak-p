/**
 * Analytics Middleware
 * Yeni ziyaretçi takip sistemi ile entegrasyon
 */

const { trackOnlineUser, trackVisitor } = require('./visitorTracking');

// Ana analytics middleware - yeni sistem kullanır
const analytics = async (req, res, next) => {
  try {
    // Online kullanıcı takibi
    await trackOnlineUser(req, res, () => {});
    
    // Ziyaretçi takibi
    await trackVisitor(req, res, () => {});
    
    next();
  } catch (error) {
    console.error('Analytics middleware error:', error);
    next(); // Hata olsa bile devam et
  }
};

module.exports = analytics; 