const express = require('express');
const { body } = require('express-validator');
const { verifyToken, teacherOnly } = require('../middleware/verifyToken');
const {
  getDashboard,
  getMyStudents,
  addStudent,
  updateStudent,
  deleteStudent,
  addGradeToStudent,
  getStudentGrades,
  createAssignment,
  getMyAssignments,
  updateAssignment,
  assignToStudents
} = require('../controllers/teacherController');

const router = express.Router();

router.use(verifyToken);
router.use(teacherOnly);

// @desc    Öğretmen dashboard'u
// @route   GET /api/teacher/dashboard
// @access  Özel (Teacher/Admin)
router.get('/dashboard', getDashboard);

// ============ ÖĞRENCİ YÖNETİMİ ============

// @desc    Öğretmene bağlı öğrencileri getir
// @route   GET /api/teacher/students
// @access  Özel (Teacher/Admin)
router.get('/students', getMyStudents);

// @desc    Yeni öğrenci ekle
// @route   POST /api/teacher/students
// @access  Özel (Teacher/Admin)
router.post('/students', [
  body('name', 'İsim gereklidir').notEmpty().trim().escape(),
  body('surname', 'Soyisim gereklidir').notEmpty().trim().escape(),
  body('studentNumber', 'Öğrenci numarası gereklidir')
    .notEmpty()
    .trim()
    .matches(/^[0-9]+$/)
    .withMessage('Öğrenci numarası sadece rakam içermelidir'),
  body('password', 'Şifre en az 6 karakter olmalıdır').isLength({ min: 6 }),
  body('class', 'Sınıf bilgisi gereklidir').notEmpty().trim().escape(),
  body('email')
    .optional()
    .isEmail()
    .withMessage('Geçerli bir e-posta adresi giriniz')
    .normalizeEmail(),
  body('phone')
    .optional()
    .matches(/^[0-9]{10,11}$/)
    .withMessage('Geçerli bir telefon numarası giriniz'),
  body('address').optional().trim().escape(),
  body('birthDate').optional().isISO8601().toDate(),
  body('parentInfo.motherName').optional().trim().escape(),
  body('parentInfo.fatherName').optional().trim().escape(),
  body('parentInfo.parentPhone')
    .optional()
    .matches(/^[0-9]{10,11}$/)
    .withMessage('Geçerli bir veli telefon numarası giriniz'),
  body('parentInfo.parentEmail')
    .optional()
    .isEmail()
    .withMessage('Geçerli bir veli e-posta adresi giriniz')
    .normalizeEmail()
], addStudent);

// @desc    Öğrenci bilgilerini güncelle
// @route   PUT /api/teacher/students/:id
// @access  Özel (Teacher/Admin)
router.put('/students/:id', [
  body('name').optional().trim().escape(),
  body('surname').optional().trim().escape(),
  body('email')
    .optional()
    .isEmail()
    .withMessage('Geçerli bir e-posta adresi giriniz')
    .normalizeEmail(),
  body('phone')
    .optional()
    .matches(/^[0-9]{10,11}$/)
    .withMessage('Geçerli bir telefon numarası giriniz'),
  body('class').optional().trim().escape(),
  body('address').optional().trim().escape(),
  body('isActive').optional().isBoolean()
], updateStudent);

// @desc    Öğrenci sil
// @route   DELETE /api/teacher/students/:id
// @access  Özel (Teacher/Admin)
router.delete('/students/:id', deleteStudent);

// ============ NOT YÖNETİMİ ============

// @desc    Öğrencinin notlarını getir
// @route   GET /api/teacher/students/:id/grades
// @access  Özel (Teacher/Admin)
router.get('/students/:id/grades', getStudentGrades);

// @desc    Öğrenciye not ver
// @route   POST /api/teacher/students/:id/grades
// @access  Özel (Teacher/Admin)
router.post('/students/:id/grades', [
  body('ders', 'Ders adı gereklidir').notEmpty().trim().escape(),
  body('not', 'Not değeri gereklidir')
    .isNumeric()
    .withMessage('Not sayısal bir değer olmalıdır')
    .isFloat({ min: 0, max: 100 })
    .withMessage('Not 0-100 arasında olmalıdır'),
  body('aciklama')
    .optional()
    .trim()
    .isLength({ max: 200 })
    .withMessage('Açıklama 200 karakterden fazla olamaz')
    .escape(),
  body('sinavTuru')
    .optional()
    .isIn(['yazili', 'sozlu', 'proje', 'odev', 'performans'])
    .withMessage('Geçersiz sınav türü')
], addGradeToStudent);

// ============ ÖDEV YÖNETİMİ ============

// @desc    Öğretmenin ödevlerini getir
// @route   GET /api/teacher/assignments
// @access  Özel (Teacher/Admin)
router.get('/assignments', getMyAssignments);

// @desc    Yeni ödev oluştur
// @route   POST /api/teacher/assignments
// @access  Özel (Teacher/Admin)
router.post('/assignments', [
  body('title', 'Ödev başlığı gereklidir')
    .notEmpty()
    .trim()
    .isLength({ max: 100 })
    .withMessage('Başlık 100 karakterden fazla olamaz')
    .escape(),
  body('description', 'Ödev açıklaması gereklidir')
    .notEmpty()
    .trim()
    .isLength({ max: 1000 })
    .withMessage('Açıklama 1000 karakterden fazla olamaz')
    .escape(),
  body('subject', 'Ders adı gereklidir')
    .notEmpty()
    .trim()
    .isLength({ max: 50 })
    .withMessage('Ders adı 50 karakterden fazla olamaz')
    .escape(),
  body('class', 'Sınıf bilgisi gereklidir').notEmpty().trim().escape(),
  body('dueDate', 'Teslim tarihi gereklidir')
    .isISO8601()
    .withMessage('Geçerli bir tarih giriniz')
    .toDate()
    .custom((value) => {
      if (new Date(value) <= new Date()) {
        throw new Error('Teslim tarihi gelecekte olmalıdır');
      }
      return true;
    }),
  body('instructions')
    .optional()
    .trim()
    .isLength({ max: 2000 })
    .withMessage('Talimatlar 2000 karakterden fazla olamaz')
    .escape(),
  body('maxScore')
    .optional()
    .isNumeric()
    .withMessage('Maksimum puan sayısal olmalıdır')
    .isInt({ min: 1 })
    .withMessage('Maksimum puan en az 1 olmalıdır'),
  body('allowLateSubmission').optional().isBoolean(),
  body('priority')
    .optional()
    .isIn(['low', 'medium', 'high'])
    .withMessage('Geçersiz öncelik seviyesi'),
  body('studentIds')
    .optional()
    .isArray()
    .withMessage('Öğrenci ID\'leri dizi olmalıdır')
    .custom((value) => {
      if (value && value.length > 0) {
        const isValidIds = value.every(id => /^[0-9a-fA-F]{24}$/.test(id));
        if (!isValidIds) {
          throw new Error('Geçersiz öğrenci ID formatı');
        }
      }
      return true;
    })
], createAssignment);

// @desc    Ödev güncelle
// @route   PUT /api/teacher/assignments/:id
// @access  Özel (Teacher/Admin)
router.put('/assignments/:id', [
  body('title')
    .optional()
    .trim()
    .isLength({ max: 100 })
    .withMessage('Başlık 100 karakterden fazla olamaz')
    .escape(),
  body('description')
    .optional()
    .trim()
    .isLength({ max: 1000 })
    .withMessage('Açıklama 1000 karakterden fazla olamaz')
    .escape(),
  body('instructions')
    .optional()
    .trim()
    .isLength({ max: 2000 })
    .withMessage('Talimatlar 2000 karakterden fazla olamaz')
    .escape(),
  body('dueDate')
    .optional()
    .isISO8601()
    .withMessage('Geçerli bir tarih giriniz')
    .toDate(),
  body('maxScore')
    .optional()
    .isNumeric()
    .withMessage('Maksimum puan sayısal olmalıdır')
    .isInt({ min: 1 })
    .withMessage('Maksimum puan en az 1 olmalıdır'),
  body('allowLateSubmission').optional().isBoolean(),
  body('priority')
    .optional()
    .isIn(['low', 'medium', 'high'])
    .withMessage('Geçersiz öncelik seviyesi'),
  body('isActive').optional().isBoolean()
], updateAssignment);

// @desc    Öğrencilere ödev ata
// @route   POST /api/teacher/assignments/:id/assign
// @access  Özel (Teacher/Admin)
router.post('/assignments/:id/assign', [
  body('studentIds', 'Öğrenci ID\'leri gereklidir')
    .isArray({ min: 1 })
    .withMessage('En az bir öğrenci seçmelisiniz')
    .custom((value) => {
      const isValidIds = value.every(id => /^[0-9a-fA-F]{24}$/.test(id));
      if (!isValidIds) {
        throw new Error('Geçersiz öğrenci ID formatı');
      }
      return true;
    })
], assignToStudents);

module.exports = router; 