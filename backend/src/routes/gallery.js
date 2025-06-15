/**
 * Gallery Routes
 * Galeri yönetimi endpoint'leri
 */

const express = require('express');
const router = express.Router();

// Middleware imports
const { teacherOnly, verifyToken, authorizeRoles } = require('../middleware/verifyToken');
const { uploadGallery, handleMulterError } = require('../middleware/upload');
const { 
  validateGallery, 
  validateGalleryUpdate 
} = require('../middleware/validation');

// Controller imports
const {
  getGalleries,
  getGallery,
  createGallery,
  updateGallery,
  deleteImage,
  deleteGallery,
  getCategories
} = require('../controllers/galleryController');

// @route   GET /api/gallery/categories/list
// @desc    Kategorileri getir
// @access  Public
router.get('/categories/list', getCategories);

// @route   GET /api/gallery
// @desc    Tüm galerileri getir
// @access  Public
router.get('/', getGalleries);

// @route   GET /api/gallery/:id
// @desc    Tekil galeri getir (ID veya slug ile)
// @access  Public
router.get('/:id', getGallery);

// @route   POST /api/gallery
// @desc    Yeni galeri oluştur
// @access  Özel (Teacher/Student/Admin)
router.post('/',
  verifyToken,
  authorizeRoles('teacher', 'student', 'admin'),
  uploadGallery.single('image'),
  handleMulterError,
  validateGallery,
  createGallery
);

// @route   PUT /api/gallery/:id
// @desc    Galeri güncelle
// @access  Özel (Teacher/Student/Admin - Kendi galerisi)
router.put('/:id',
  verifyToken,
  authorizeRoles('teacher', 'student', 'admin'),
  uploadGallery.single('image'),
  handleMulterError,
  validateGalleryUpdate,
  updateGallery
);

// @route   DELETE /api/gallery/:id/image/:imageId
// @desc    Galeriden resim sil
// @access  Özel (Teacher/Student/Admin - Kendi galerisi)
router.delete('/:id/image/:imageId',
  verifyToken,
  authorizeRoles('teacher', 'student', 'admin'),
  deleteImage
);

// @route   DELETE /api/gallery/:id
// @desc    Galeri sil
// @access  Özel (Teacher/Student/Admin - Kendi galerisi)
router.delete('/:id',
  verifyToken,
  authorizeRoles('teacher', 'student', 'admin'),
  deleteGallery
);

module.exports = router; 