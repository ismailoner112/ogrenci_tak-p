const express = require('express');
const bcrypt = require('bcryptjs');
const { body, validationResult } = require('express-validator');
const User = require('../models/User');
const { sendTokenResponse } = require('../utils/jwtHelper');
const { verifyToken, teacherOnly } = require('../middleware/verifyToken');

const router = express.Router();

// @desc    Öğretmen kaydı
// @route   POST /api/auth/teacher/register
// @access  Genel (geliştirme) / Sadece Admin (production)
router.post('/register', [
  body('ad', 'İsim gereklidir').notEmpty().trim().escape(),
  body('soyad', 'Soyisim gereklidir').notEmpty().trim().escape(),
  body('email', 'Geçerli bir e-posta adresi giriniz').isEmail().normalizeEmail(),
  body('telefon', 'Geçerli bir telefon numarası giriniz').optional().matches(/^[0-9]{10,11}$/),
  body('password', 'Şifre en az 3 karakter olmalıdır').isLength({ min: 3 }),
  body('uzmanlikAlani').optional().trim().escape()
], async (req, res, next) => {
  try {

    
    // Doğrulama hatalarını kontrol et
    const errors = validationResult(req);
    if (!errors.isEmpty()) {

      return res.status(400).json({
        success: false,
        message: 'Girilen bilgilerde hata var',
        errors: errors.array()
      });
    }

    const { ad, soyad, email, telefon, password, uzmanlikAlani } = req.body;
    
    // Field mapping: Turkish frontend -> English backend
    const name = ad;
    const surname = soyad;
    const phone = telefon;
    const department = uzmanlikAlani;

    // Öğretmenin var olup olmadığını kontrol et
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: 'Bu e-posta adresi zaten kullanılıyor'
      });
    }

    // Öğretmen oluştur
    
    const user = await User.create({
      name,
      surname,
      email,
      phone,
      password,
      department,
      userType: 'teacher'
    });


    
    // Son giriş tarihini güncelle
    user.lastLogin = new Date();
    await user.save();

    // Token yanıtı gönder
    sendTokenResponse(user, 201, res, 'teacher');
    
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: 'Bu e-posta adresi zaten kullanılıyor'
      });
    }
    res.status(500).json({
      success: false,
      message: 'Sunucu hatası: ' + error.message
    });
  }
});

// @desc    Öğretmen girişi
// @route   POST /api/auth/teacher/login
// @access  Genel
router.post('/login', [
  body('email', 'Geçerli bir e-posta adresi giriniz').isEmail().normalizeEmail(),
  body('password', 'Şifre gereklidir').notEmpty()
], async (req, res, next) => {
  try {
    // Doğrulama hatalarını kontrol et
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'E-posta ve şifre gereklidir',
        errors: errors.array()
      });
    }

    const { email, password } = req.body;

    // Öğretmeni kontrol et (şifre ile birlikte) - hem eski role hem yeni userType field'larını kontrol et
    const user = await User.findOne({ 
      email, 
      $or: [
        { userType: { $in: ['teacher', 'admin'] } },
        { role: { $in: ['teacher', 'admin'] } }
      ]
    }).select('+password');

    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Geçersiz e-posta veya şifre'
      });
    }

    // Öğretmenin aktif olup olmadığını kontrol et
    if (!user.isActive) {
      return res.status(401).json({
        success: false,
        message: 'Hesabınız deaktif durumda'
      });
    }

    // Şifreyi kontrol et
    const isPasswordMatch = await user.matchPassword(password);
    if (!isPasswordMatch) {
      return res.status(401).json({
        success: false,
        message: 'Geçersiz e-posta veya şifre'
      });
    }

    // Son giriş tarihini güncelle
    user.lastLogin = new Date();
    await user.save();

    // Token yanıtı gönder
    sendTokenResponse(user, 200, res, user.userType || user.role || 'teacher');
    
  } catch (error) {
    next(error);
  }
});

// @desc    Öğrenci girişi
// @route   POST /api/auth/student-login
// @access  Genel
router.post('/student-login', [
  body('studentNumber', 'Öğrenci numarası gereklidir').notEmpty(),
  body('sifre', 'Şifre gereklidir').notEmpty()
], async (req, res, next) => {
  try {
    // Doğrulama hatalarını kontrol et
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Öğrenci numarası ve şifre gereklidir',
        errors: errors.array()
      });
    }

    const { studentNumber, sifre } = req.body;

    // Öğrenciyi numara ile bul
    const Student = require('../models/Student');
    const student = await Student.findOne({ studentNumber }).select('+password');

    if (!student) {
      return res.status(401).json({
        success: false,
        message: 'Geçersiz öğrenci numarası veya şifre'
      });
    }

    // Öğrencinin aktif olup olmadığını kontrol et
    if (!student.isActive) {
      return res.status(401).json({
        success: false,
        message: 'Hesabınız deaktif durumda'
      });
    }

    // Şifreyi kontrol et
    const isPasswordMatch = await student.matchPassword(sifre);
    if (!isPasswordMatch) {
      return res.status(401).json({
        success: false,
        message: 'Geçersiz öğrenci numarası veya şifre'
      });
    }

    // Student objesini User formatına dönüştür
    const studentData = {
      _id: student._id,
      name: student.name,
      surname: student.surname,
      studentNumber: student.studentNumber,
      class: student.class,
      userType: 'student',
      isActive: student.isActive
    };

    // Token yanıtı gönder
    sendTokenResponse(studentData, 200, res, 'student');
    
  } catch (error) {
    console.error('Student login error:', error);
    res.status(500).json({
      success: false,
      message: 'Sunucu hatası: ' + error.message
    });
  }
});

// @desc    Mevcut giriş yapmış öğretmeni getir
// @route   GET /api/auth/teacher/me
// @access  Özel (Sadece öğretmen)
router.get('/me', teacherOnly, async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id)
      .populate('students', 'name surname studentNumber class isActive')
      .populate('assignments', 'title description dueDate');

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Kullanıcı bulunamadı'
      });
    }

    res.status(200).json({
      success: true,
      data: {
        id: user._id,
        name: user.name,
        surname: user.surname,
        fullName: user.fullName,
        email: user.email,
        phone: user.phone,
        department: user.department,
        address: user.address,
        avatar: user.avatar,
        slug: user.slug,
        isActive: user.isActive,
        lastLogin: user.lastLogin,
        role: user.userType,
        students: user.students,
        assignments: user.assignments
      }
    });
    
  } catch (error) {
    next(error);
  }
});

// @desc    Şifre güncelle
// @route   PUT /api/auth/teacher/updatepassword
// @access  Özel (Sadece öğretmen)
router.put('/updatepassword', teacherOnly, [
  body('oldPassword', 'Mevcut şifre gereklidir').notEmpty(),
  body('newPassword', 'Yeni şifre en az 6 karakter olmalıdır').isLength({ min: 6 })
], async (req, res, next) => {
  try {
    // Doğrulama hatalarını kontrol et
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Girilen bilgilerde hata var',
        errors: errors.array()
      });
    }

    const { oldPassword, newPassword } = req.body;

    // Kullanıcıyı şifre ile birlikte getir
    const user = await User.findById(req.user._id).select('+password');

    // Mevcut şifreyi kontrol et
    const isCurrentPasswordValid = await user.matchPassword(oldPassword);
    if (!isCurrentPasswordValid) {
      return res.status(400).json({
        success: false,
        message: 'Mevcut şifre yanlış'
      });
    }

    // Yeni şifreyi ayarla
    user.password = newPassword;
    await user.save();

    // Token yanıtı gönder
    sendTokenResponse(user, 200, res, user.role);
    
  } catch (error) {
    next(error);
  }
});

// @desc    Çıkış yap
// @route   POST /api/auth/teacher/logout
// @access  Özel
router.post('/logout', verifyToken, (req, res) => {
  res.cookie('token', 'none', {
    expires: new Date(Date.now() + 10 * 1000),
    httpOnly: true
  });

  res.status(200).json({
    success: true,
    message: 'Başarıyla çıkış yapıldı'
  });
});

module.exports = router; 