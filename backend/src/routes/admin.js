/**
 * Admin Routes
 * Admin yetkilendirmeli kullanıcı yönetimi route'ları
 */

const express = require('express');
const router = express.Router();
const {
  getAllUsers,
  getUserById,
  updateUser,
  deleteUser,
  bulkUserAction,
  getSystemStats
} = require('../controllers/adminController');

const { verifyToken, adminOnly } = require('../middleware/verifyToken');

// Tüm route'lar admin yetkisi gerektirir
router.use(verifyToken);
router.use(adminOnly);

// @route   GET /api/admin/stats
// @desc    Sistem istatistikleri
// @access  Özel (Admin only)
router.get('/stats', getSystemStats);

// @route   GET /api/admin/users
// @desc    Tüm kullanıcıları getir (sayfalama ve filtreleme ile)
// @access  Özel (Admin only)
router.get('/users', getAllUsers);

// @route   GET /api/admin/users/:id
// @desc    Kullanıcı detayını getir
// @access  Özel (Admin only)
router.get('/users/:id', getUserById);

// @route   PUT /api/admin/users/:id
// @desc    Kullanıcı bilgilerini güncelle (rol değiştirme dahil)
// @access  Özel (Admin only)
router.put('/users/:id', updateUser);

// @route   DELETE /api/admin/users/:id
// @desc    Kullanıcıyı sil
// @access  Özel (Admin only)
router.delete('/users/:id', deleteUser);

// @route   POST /api/admin/users/bulk-action
// @desc    Toplu kullanıcı işlemleri
// @access  Özel (Admin only)
router.post('/users/bulk-action', bulkUserAction);

module.exports = router; 