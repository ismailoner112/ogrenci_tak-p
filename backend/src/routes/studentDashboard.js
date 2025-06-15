const express = require('express');
const { body } = require('express-validator');
const { verifyToken, studentOnly } = require('../middleware/verifyToken');
const {
  getDashboard,
  getMyAssignments,
  getAssignmentDetail,
  submitAssignment,
  getMySubmissions,
  getMyGrades,
  getProfile
} = require('../controllers/studentController');

const router = express.Router();

// Tüm route'lar için token doğrulama ve öğrenci yetkisi gerekli
router.use(verifyToken);
router.use(studentOnly);

// @desc    Öğrenci dashboard'u
// @route   GET /api/student/dashboard
// @access  Özel (Student)
router.get('/dashboard', getDashboard);

// ============ ÖDEV YÖNETİMİ (SADECE OKUMA VE TESLİM) ============

// @desc    Öğrencinin ödevlerini getir
// @route   GET /api/student/assignments
// @access  Özel (Student)
router.get('/assignments', getMyAssignments);

// @desc    Tek bir ödevin detaylarını getir
// @route   GET /api/student/assignments/:id
// @access  Özel (Student)
router.get('/assignments/:id', getAssignmentDetail);

// @desc    Ödev teslim et
// @route   POST /api/student/assignments/:id/submit
// @access  Özel (Student)
router.post('/assignments/:id/submit', [
  body('content')
    .optional()
    .trim()
    .isLength({ max: 2000 })
    .withMessage('İçerik 2000 karakterden fazla olamaz')
    .escape()
], submitAssignment);

// ============ TESLİM YÖNETİMİ (SADECE OKUMA) ============

// @desc    Öğrencinin teslimlerini getir
// @route   GET /api/student/submissions
// @access  Özel (Student)
router.get('/submissions', getMySubmissions);

// ============ NOT YÖNETİMİ (SADECE OKUMA) ============

// @desc    Öğrencinin notlarını getir
// @route   GET /api/student/grades
// @access  Özel (Student)
router.get('/grades', getMyGrades);

// ============ PROFİL (SADECE OKUMA) ============

// @desc    Öğrencinin profil bilgilerini getir
// @route   GET /api/student/profile
// @access  Özel (Student)
router.get('/profile', getProfile);

// ============ YASAK İŞLEMLER ============
// Öğrenciler aşağıdaki işlemleri YAPAMAZLAR:

// - Profil bilgilerini değiştirme (PUT/PATCH /profile) - YOK
// - Şifre değiştirme (Bu /api/auth/student/updatepassword'da)
// - Not ekleme/değiştirme - YOK  
// - Ödev oluşturma/değiştirme - YOK
// - Başka öğrencilerin bilgilerine erişim - YOK
// - Öğretmen işlemleri - YOK

module.exports = router; 