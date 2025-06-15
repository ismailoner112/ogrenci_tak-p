/**
 * Analytics Routes
 * Analitik ve istatistik endpoint'leri
 */

const express = require('express');
const router = express.Router();
const {
  getOnlineUsers,
  getSiteStats,
  getTodayStats,
  getWeeklyStats,
  getMonthlyStats,
  getPopularPages,
  getReferrerStats,
  getOnlineDetails,
  getDashboardStats
} = require('../controllers/analyticsController');

const { verifyToken, teacherOnly } = require('../middleware/verifyToken');

// Public routes - herkese açık istatistikler
router.get('/online', getOnlineUsers);
router.get('/site-stats', getSiteStats);
router.get('/today', getTodayStats);

// Teacher/Admin only routes - detaylı istatistikler
router.get('/weekly', teacherOnly, getWeeklyStats);
router.get('/monthly', teacherOnly, getMonthlyStats);
router.get('/popular-pages', teacherOnly, getPopularPages);
router.get('/referrers', teacherOnly, getReferrerStats);
router.get('/online-details', teacherOnly, getOnlineDetails);
router.get('/dashboard', teacherOnly, getDashboardStats);

module.exports = router; 