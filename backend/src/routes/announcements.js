const express = require('express');
const { body } = require('express-validator');
const { verifyToken, teacherOnly } = require('../middleware/verifyToken');
const {
  getAnnouncements,
  getAnnouncementById,
  createAnnouncement,
  updateAnnouncement,
  deleteAnnouncement,
  addComment,
  toggleLike,
  getMyAnnouncements
} = require('../controllers/announcementController');

const router = express.Router();

// Public routes
// @desc    Tüm duyuruları getir
// @route   GET /api/announcements
// @access  Public
router.get('/', getAnnouncements);

// @desc    Duyuru detayını getir
// @route   GET /api/announcements/:id
// @access  Public
router.get('/:id', getAnnouncementById);

// Protected routes
router.use(verifyToken);

// @desc    Yeni duyuru oluştur
// @route   POST /api/announcements
// @access  Özel (Teacher/Admin)
router.post('/', teacherOnly, [
  body('title', 'Başlık gereklidir')
    .notEmpty()
    .trim()
    .isLength({ max: 200 })
    .withMessage('Başlık 200 karakterden fazla olamaz')
    .escape(),
  body('content', 'İçerik gereklidir')
    .notEmpty()
    .trim()
    .isLength({ max: 5000 })
    .withMessage('İçerik 5000 karakterden fazla olamaz')
    .escape(),
  body('targetAudience')
    .optional()
    .isIn(['all', 'students', 'teachers', 'class'])
    .withMessage('Geçersiz hedef kitle'),
  body('targetClass')
    .optional()
    .trim()
    .escape(),
  body('priority')
    .optional()
    .isIn(['low', 'medium', 'high'])
    .withMessage('Geçersiz öncelik seviyesi'),
  body('expiryDate')
    .optional()
    .isISO8601()
    .withMessage('Geçerli bir tarih giriniz')
    .toDate(),
  body('tags')
    .optional()
    .isArray()
    .withMessage('Etiketler dizi olmalıdır')
], createAnnouncement);

// @desc    Duyuru güncelle
// @route   PUT /api/announcements/:id
// @access  Özel (Teacher/Admin - Sadece kendi duyuruları)
router.put('/:id', teacherOnly, [
  body('title')
    .optional()
    .trim()
    .isLength({ max: 200 })
    .withMessage('Başlık 200 karakterden fazla olamaz')
    .escape(),
  body('content')
    .optional()
    .trim()
    .isLength({ max: 5000 })
    .withMessage('İçerik 5000 karakterden fazla olamaz')
    .escape(),
  body('targetAudience')
    .optional()
    .isIn(['all', 'students', 'teachers', 'class'])
    .withMessage('Geçersiz hedef kitle'),
  body('priority')
    .optional()
    .isIn(['low', 'medium', 'high'])
    .withMessage('Geçersiz öncelik seviyesi'),
  body('isActive')
    .optional()
    .isBoolean()
    .withMessage('Aktiflik durumu boolean olmalıdır')
], updateAnnouncement);

// @desc    Duyuru sil
// @route   DELETE /api/announcements/:id
// @access  Özel (Teacher/Admin - Sadece kendi duyuruları)
router.delete('/:id', teacherOnly, deleteAnnouncement);

// @desc    Duyuruya yorum ekle
// @route   POST /api/announcements/:id/comments
// @access  Özel (User)
router.post('/:id/comments', [
  body('content', 'Yorum içeriği gereklidir')
    .notEmpty()
    .trim()
    .isLength({ max: 500 })
    .withMessage('Yorum 500 karakterden fazla olamaz')
    .escape()
], addComment);

// @desc    Duyuruyu beğen/beğenme
// @route   POST /api/announcements/:id/like
// @access  Özel (User)
router.post('/:id/like', toggleLike);

// Teacher routes
// @desc    Öğretmenin duyurularını getir
// @route   GET /api/teacher/announcements
// @access  Özel (Teacher)
router.get('/teacher/my-announcements', teacherOnly, getMyAnnouncements);

module.exports = router; 