const express = require('express');
const bcrypt = require('bcryptjs');
const { body, validationResult } = require('express-validator');
const Student = require('../models/Student');
const User = require('../models/User');
const { sendTokenResponse } = require('../utils/jwtHelper');
const { protect, authorize } = require('../middleware/auth');

const router = express.Router();

// @desc    Öğrenci kaydı (Öğretmen tarafından)
// @route   POST /api/auth/student/register
// @access  Özel (Sadece öğretmen ve admin)
router.post('/register', protect, authorize('teacher', 'admin'), [
  body('ad', 'Ad gereklidir').notEmpty().trim().escape(),
  body('soyad', 'Soyad gereklidir').notEmpty().trim().escape(),
  body('numara', 'Öğrenci numarası gereklidir').notEmpty().trim().isNumeric().withMessage('Öğrenci numarası sadece rakam içermelidir'),
  body('sifre', 'Şifre en az 6 karakter olmalıdır').isLength({ min: 6 }),
  body('sinif', 'Sınıf bilgisi gereklidir').notEmpty().trim().escape(),
  body('ogretmenId', 'Öğretmen ID gereklidir').notEmpty().isMongoId(),
  body('email').optional().isEmail().normalizeEmail(),
  body('telefon').optional().matches(/^[0-9]{10,11}$/),
  body('adres').optional().trim().escape(),
  body('dogumTarihi').optional().isISO8601().toDate(),
  body('veliUyeBilgisi.anneAdi').optional().trim().escape(),
  body('veliUyeBilgisi.babaAdi').optional().trim().escape(),
  body('veliUyeBilgisi.veliTelefonu').optional().matches(/^[0-9]{10,11}$/),
  body('veliUyeBilgisi.veliEmail').optional().isEmail().normalizeEmail()
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

    const { 
      ad, soyad, numara, sifre, sinif, ogretmenId, 
      email, telefon, adres, dogumTarihi, veliUyeBilgisi 
    } = req.body;

    // Öğrenci numarasının benzersiz olup olmadığını kontrol et
    const existingStudent = await Student.findOne({ numara });
    if (existingStudent) {
      return res.status(400).json({
        success: false,
        message: 'Bu öğrenci numarası zaten kullanılıyor'
      });
    }

    // Öğretmenin var olup olmadığını kontrol et
    const teacher = await Teacher.findById(ogretmenId);
    if (!teacher) {
      return res.status(400).json({
        success: false,
        message: 'Geçersiz öğretmen ID'
      });
    }

    // Sadece öğretmen kendi öğrencilerini kaydedebilir (admin hariç)
    if (req.user.userType === 'teacher' && req.user._id.toString() !== ogretmenId) {
      return res.status(403).json({
        success: false,
        message: 'Sadece kendi sınıfınıza öğrenci ekleyebilirsiniz'
      });
    }

    // Öğrenci oluştur
    const student = await Student.create({
      ad,
      soyad,
      numara,
      sifre,
      sinif,
      ogretmenId,
      email,
      telefon,
      adres,
      dogumTarihi,
      veliUyeBilgisi
    });

    res.status(201).json({
      success: true,
      message: 'Öğrenci başarıyla oluşturuldu',
      data: {
        id: student._id,
        ad: student.ad,
        soyad: student.soyad,
        tamAd: student.tamAd,
        numara: student.numara,
        sinif: student.sinif,
        ogretmenId: student.ogretmenId,
        slug: student.slug
      }
    });
    
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: 'Bu öğrenci numarası zaten kullanılıyor'
      });
    }
    next(error);
  }
});

// @desc    Öğrenci girişi
// @route   POST /api/auth/student/login
// @access  Genel
router.post('/login', [
  body('numara', 'Öğrenci numarası gereklidir').notEmpty().trim().isNumeric(),
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

    const { numara, sifre } = req.body;

    // Öğrenciyi kontrol et (şifre ile birlikte)
    const student = await Student.findOne({ numara })
      .select('+sifre')
      .populate('ogretmenId', 'ad soyad email telefon');

    if (!student) {
      return res.status(401).json({
        success: false,
        message: 'Geçersiz öğrenci numarası veya şifre'
      });
    }

    // Öğrencinin aktif olup olmadığını kontrol et
    if (!student.aktif) {
      return res.status(401).json({
        success: false,
        message: 'Hesabınız deaktif durumda'
      });
    }

    // Şifreyi kontrol et
    const isPasswordMatch = await student.sifreKarsilastir(sifre);
    if (!isPasswordMatch) {
      return res.status(401).json({
        success: false,
        message: 'Geçersiz öğrenci numarası veya şifre'
      });
    }

    // Son giriş tarihini güncelle
    student.sonGiris = new Date();
    await student.save();

    // Token yanıtı gönder
    sendTokenResponse(student, 200, res, 'student');
    
  } catch (error) {
    next(error);
  }
});

// @desc    Mevcut giriş yapmış öğrenciyi getir
// @route   GET /api/auth/student/me
// @access  Özel (Sadece öğrenci)
router.get('/me', protect, authorize('student'), async (req, res, next) => {
  try {
    const student = await Student.findById(req.user._id)
      .populate('ogretmenId', 'ad soyad email telefon brans')
      .populate('verilenOdevler.odevId', 'baslik aciklama bitisTarihi konusu');

    if (!student) {
      return res.status(404).json({
        success: false,
        message: 'Öğrenci bulunamadı'
      });
    }

    res.status(200).json({
      success: true,
      data: {
        id: student._id,
        ad: student.ad,
        soyad: student.soyad,
        tamAd: student.tamAd,
        numara: student.numara,
        email: student.email,
        telefon: student.telefon,
        sinif: student.sinif,
        adres: student.adres,
        dogumTarihi: student.dogumTarihi,
        yas: student.yas,
        avatar: student.avatar,
        slug: student.slug,
        aktif: student.aktif,
        sonGiris: student.sonGiris,
        kayitTarihi: student.kayitTarihi,
        ogretmeni: student.ogretmenId,
        verilenOdevler: student.verilenOdevler,
        notlar: student.notlar,
        ortalamaNot: student.ortalamaNot,
        tamamlananOdevSayisi: student.tamamlananOdevSayisi,
        bekleyenOdevSayisi: student.bekleyenOdevSayisi,
        veliUyeBilgisi: student.veliUyeBilgisi
      }
    });
    
  } catch (error) {
    next(error);
  }
});

// @desc    Öğrenci şifre güncelle
// @route   PUT /api/auth/student/updatepassword
// @access  Özel (Sadece öğrenci)
router.put('/updatepassword', protect, authorize('student'), [
  body('eskiSifre', 'Mevcut şifre gereklidir').notEmpty(),
  body('yeniSifre', 'Yeni şifre en az 6 karakter olmalıdır').isLength({ min: 6 })
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

    const { eskiSifre, yeniSifre } = req.body;

    // Öğrenciyi şifre ile birlikte getir
    const student = await Student.findById(req.user._id).select('+sifre');

    // Mevcut şifreyi kontrol et
    const isCurrentPasswordValid = await student.sifreKarsilastir(eskiSifre);
    if (!isCurrentPasswordValid) {
      return res.status(400).json({
        success: false,
        message: 'Mevcut şifre yanlış'
      });
    }

    // Yeni şifreyi ayarla
    student.sifre = yeniSifre;
    await student.save();

    // Token yanıtı gönder
    sendTokenResponse(student, 200, res, 'student');
    
  } catch (error) {
    next(error);
  }
});

// @desc    Öğrenci bilgilerini güncelle (kısıtlı)
// @route   PUT /api/auth/student/updateprofile
// @access  Özel (Sadece öğrenci)
router.put('/updateprofile', protect, authorize('student'), [
  body('email').optional().isEmail().normalizeEmail(),
  body('telefon').optional().matches(/^[0-9]{10,11}$/),
  body('adres').optional().trim().escape(),
  body('veliUyeBilgisi.veliTelefonu').optional().matches(/^[0-9]{10,11}$/),
  body('veliUyeBilgisi.veliEmail').optional().isEmail().normalizeEmail()
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

    // Sadece belirli alanların güncellenmesine izin ver
    const allowedFields = ['email', 'telefon', 'adres', 'veliUyeBilgisi'];
    const updateData = {};
    
    allowedFields.forEach(field => {
      if (req.body[field] !== undefined) {
        updateData[field] = req.body[field];
      }
    });

    const student = await Student.findByIdAndUpdate(
      req.user._id,
      updateData,
      { new: true, runValidators: true }
    ).populate('ogretmenId', 'ad soyad email');

    res.status(200).json({
      success: true,
      message: 'Profil bilgileri güncellendi',
      data: student
    });
    
  } catch (error) {
    next(error);
  }
});

// @desc    Çıkış yap
// @route   POST /api/auth/student/logout
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

module.exports = router; 