/**
 * News Routes
 * Haber yönetimi endpoint'leri
 */

const express = require('express');
const router = express.Router();

// Middleware imports
const { verifyToken, teacherOnly } = require('../middleware/verifyToken');
const { uploadNews, handleMulterError } = require('../middleware/upload');
const { 
  validateNews, 
  validateNewsUpdate,
  validateComment 
} = require('../middleware/validation');

// Controller imports
const {
  getNews,
  getSingleNews,
  createNews,
  updateNews,
  deleteNews,
  addComment,
  deleteComment,
  getCategories,
  getFeaturedNews
} = require('../controllers/newsController');

// @route   GET /api/news/categories/list
// @desc    Kategorileri getir
// @access  Public
router.get('/categories/list', getCategories);

// @route   GET /api/news/featured
// @desc    Öne çıkan haberleri getir
// @access  Public
router.get('/featured', getFeaturedNews);

// @route   GET /api/news
// @desc    Tüm haberleri getir
// @access  Public
router.get('/', getNews);

// @route   GET /api/news/:id
// @desc    Tekil haber getir (ID veya slug ile)
// @access  Public
router.get('/:id', getSingleNews);

// @route   POST /api/news
// @desc    Yeni haber oluştur
// @access  Özel (Teacher/Admin)
router.post('/',
  teacherOnly,
  uploadNews.single('featuredImage'),
  handleMulterError,
  validateNews,
  createNews
);

// @route   PUT /api/news/:id
// @desc    Haber güncelle
// @access  Özel (Teacher/Admin - Kendi haberi)
router.put('/:id',
  teacherOnly,
  uploadNews.single('featuredImage'),
  handleMulterError,
  validateNewsUpdate,
  updateNews
);

// @route   DELETE /api/news/:id
// @desc    Haber sil
// @access  Özel (Teacher/Admin - Kendi haberi)
router.delete('/:id',
  teacherOnly,
  deleteNews
);

// @route   POST /api/news/:id/comment
// @desc    Habere yorum ekle
// @access  Özel (Giriş yapmış kullanıcılar)
router.post('/:id/comment',
  verifyToken,
  validateComment,
  addComment
);

// @route   DELETE /api/news/:id/comment/:commentId
// @desc    Yorumu sil
// @access  Özel (Yorum sahibi veya admin)
router.delete('/:id/comment/:commentId',
  verifyToken,
  deleteComment
);

module.exports = router; 