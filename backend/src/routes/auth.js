const express = require('express');
const bcrypt = require('bcryptjs');
const { body, validationResult } = require('express-validator');
const User = require('../models/User');
const Student = require('../models/Student');
const { sendTokenResponse } = require('../utils/jwtHelper');
const { protect, authorize } = require('../middleware/auth');

const router = express.Router();

// @desc    Öğretmen/admin kaydı
// @route   POST /api/auth/register
// @access  Genel (geliştirme) / Sadece Admin (production)
router.post('/register', [
  body('name', 'İsim gereklidir').notEmpty().trim().escape(),
  body('surname', 'Soyisim gereklidir').notEmpty().trim().escape(),
  body('email', 'Geçerli bir email adresi giriniz').isEmail().normalizeEmail(),
  body('password', 'Şifre en az 6 karakter olmalıdır').isLength({ min: 6 }),
  body('role').optional().isIn(['teacher', 'admin']).withMessage('Geçersiz rol')
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

    const { name, surname, email, password, role, phone, department } = req.body;

    // Kullanıcının var olup olmadığını kontrol et
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: 'Bu email adresi zaten kullanılıyor'
      });
    }

    // Kullanıcı oluştur
    const user = await User.create({
      name,
      surname,
      email,
      password,
      role: role || 'teacher',
      phone,
      department
    });

    // Son giriş tarihini güncelle
    user.lastLogin = new Date();
    await user.save();

    sendTokenResponse(user, 201, res, user.role);
  } catch (error) {
    next(error);
  }
});

// @desc    Öğretmen/admin girişi
// @route   POST /api/auth/login
// @access  Genel
router.post('/login', [
  body('email', 'Geçerli bir email adresi giriniz').isEmail().normalizeEmail(),
  body('password', 'Şifre gereklidir').notEmpty()
], async (req, res, next) => {
  try {
    // Validation errors check
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Email ve şifre gereklidir',
        errors: errors.array()
      });
    }

    const { email, password } = req.body;

    // Kullanıcıyı kontrol et (şifre karşılaştırması için dahil et)
    const user = await User.findOne({ email }).select('+password');

    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Geçersiz email veya şifre'
      });
    }

    // Kullanıcının aktif olup olmadığını kontrol et
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
        message: 'Geçersiz email veya şifre'
      });
    }

    // Son giriş tarihini güncelle
    user.lastLogin = new Date();
    await user.save();

    sendTokenResponse(user, 200, res, user.role);
  } catch (error) {
    next(error);
  }
});

// @desc    Öğrenci girişi
// @route   POST /api/auth/student-login
// @access  Genel
router.post('/student-login', [
  body('studentNumber', 'Öğrenci numarası gereklidir').notEmpty().trim(),
  body('password', 'Şifre gereklidir').notEmpty()
], async (req, res, next) => {
  try {
    // Validation errors check
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Öğrenci numarası ve şifre gereklidir',
        errors: errors.array()
      });
    }

    const { studentNumber, password } = req.body;

    // Öğrenciyi kontrol et (şifre karşılaştırması için dahil et)
    const student = await Student.findOne({ studentNumber }).select('+password').populate('teacher', 'name surname');

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
    const isPasswordMatch = await student.matchPassword(password);
    if (!isPasswordMatch) {
      return res.status(401).json({
        success: false,
        message: 'Geçersiz öğrenci numarası veya şifre'
      });
    }

    // Son giriş tarihini güncelle
    student.lastLogin = new Date();
    await student.save();

    sendTokenResponse(student, 200, res, 'student');
  } catch (error) {
    next(error);
  }
});

// @desc    Mevcut giriş yapmış kullanıcıyı getir
// @route   GET /api/auth/me
// @access  Özel
router.get('/me', protect, async (req, res, next) => {
  try {
    const userType = req.user.userType || req.user.role;
    let user;

    if (userType === 'student') {
      user = await Student.findById(req.user._id).populate('teacher', 'name surname');
    } else {
      user = await User.findById(req.user._id);
    }

    res.status(200).json({
      success: true,
      user: {
        id: user._id,
        name: user.name,
        surname: user.surname,
        email: user.email,
        role: user.role || userType,
        userType: userType,
        avatar: user.avatar,
        slug: user.slug,
        studentNumber: user.studentNumber, // for students
        teacher: user.teacher, // for students
        phone: user.phone,
        lastLogin: user.lastLogin
      }
    });
  } catch (error) {
    next(error);
  }
});

// @desc    Kullanıcı çıkışı / cookie temizle
// @route   POST /api/auth/logout
// @access  Özel
router.post('/logout', protect, (req, res) => {
  res.cookie('token', 'none', {
    expires: new Date(Date.now() + 10 * 1000),
    httpOnly: true
  });

  res.status(200).json({
    success: true,
    message: 'Başarıyla çıkış yapıldı'
  });
});

// @desc    Şifre güncelle
// @route   PUT /api/auth/update-password
// @access  Özel
router.put('/update-password', protect, [
  body('currentPassword', 'Mevcut şifre gereklidir').notEmpty(),
  body('newPassword', 'Yeni şifre en az 6 karakter olmalıdır').isLength({ min: 6 })
], async (req, res, next) => {
  try {
    // Validation errors check
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Girilen bilgilerde hata var',
        errors: errors.array()
      });
    }

    const { currentPassword, newPassword } = req.body;
    const userType = req.user.userType || req.user.role;

    let user;
    if (userType === 'student') {
      user = await Student.findById(req.user._id).select('+password');
    } else {
      user = await User.findById(req.user._id).select('+password');
    }

    // Mevcut şifreyi kontrol et
    const isPasswordMatch = await user.matchPassword(currentPassword);
    if (!isPasswordMatch) {
      return res.status(400).json({
        success: false,
        message: 'Mevcut şifre yanlış'
      });
    }

    user.password = newPassword;
    await user.save();

    res.status(200).json({
      success: true,
      message: 'Şifre başarıyla güncellendi'
    });
  } catch (error) {
    next(error);
  }
});

// @desc    Kullanıcının kimlik doğrulaması yapılıp yapılmadığını kontrol et
// @route   GET /api/auth/check
// @access  Genel
router.get('/check', async (req, res) => {
  let token;

  // Header'larda veya cookie'lerde token kontrol et
  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    token = req.headers.authorization.split(' ')[1];
  } else if (req.cookies.token) {
    token = req.cookies.token;
  }

  if (!token) {
    return res.status(200).json({
      success: true,
      authenticated: false
    });
  }

  try {
    const jwt = require('jsonwebtoken');
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    let user;
    if (decoded.userType === 'student') {
      user = await Student.findById(decoded.id);
    } else {
      user = await User.findById(decoded.id);
    }

    if (!user || !user.isActive) {
      return res.status(200).json({
        success: true,
        authenticated: false
      });
    }

    res.status(200).json({
      success: true,
      authenticated: true,
      userType: decoded.userType
    });
  } catch (error) {
    res.status(200).json({
      success: true,
      authenticated: false
    });
  }
});

module.exports = router; 