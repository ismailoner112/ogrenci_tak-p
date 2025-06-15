const express = require('express');
const { body, validationResult } = require('express-validator');
const Student = require('../models/Student');
const { protect, authorize } = require('../middleware/auth');

const router = express.Router();

// @desc    Get student profile (for logged in student)
// @route   GET /api/students/profile
// @access  Private (students only)
router.get('/profile', protect, authorize('student'), async (req, res) => {
  try {
    const student = await Student.findById(req.user._id).select('-password');
    
    if (!student) {
      return res.status(404).json({
        success: false,
        message: 'Öğrenci bulunamadı'
      });
    }

    res.status(200).json({
      success: true,
      data: student
    });
  } catch (error) {
    console.error('Get student profile error:', error);
    res.status(500).json({
      success: false,
      message: 'Sunucu hatası'
    });
  }
});

// @desc    Tüm öğrencileri listele
// @route   GET /api/students
// @access  Öğretmen ve Admin
router.get('/', protect, authorize('teacher', 'admin'), async (req, res, next) => {
  try {

    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    let query = {};
    
    // Öğretmen sadece kendi öğrencilerini görebilir
    if (req.user.userType === 'teacher') {
      query.teacher = req.user._id;
    }

    // Arama filtresi
    if (req.query.search) {
      query.$or = [
        { name: { $regex: req.query.search, $options: 'i' } },
        { surname: { $regex: req.query.search, $options: 'i' } },
        { studentNumber: { $regex: req.query.search, $options: 'i' } }
      ];
    }

    // Aktiflik durumu filtresi
    if (req.query.isActive !== undefined) {
      query.isActive = req.query.isActive === 'true';
    }

    const students = await Student.find(query)
      .populate('teacher', 'name surname')
      .select('-password')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const totalStudents = await Student.countDocuments(query);

    res.status(200).json({
      success: true,
      count: students.length,
      totalPages: Math.ceil(totalStudents / limit),
      currentPage: page,
      data: students
    });
  } catch (error) {
    next(error);
  }
});

// @desc    Öğrenci detayını getir
// @route   GET /api/students/:id
// @access  Öğretmen ve Admin
router.get('/:id', protect, authorize('teacher', 'admin'), async (req, res, next) => {
  try {
    let query = { _id: req.params.id };
    
    // Öğretmen sadece kendi öğrencilerini görebilir
    if (req.user.userType === 'teacher') {
      query.teacher = req.user._id;
    }

    const student = await Student.findOne(query)
      .populate('teacher', 'name surname')
      .select('-password');

    if (!student) {
      return res.status(404).json({
        success: false,
        message: 'Öğrenci bulunamadı'
      });
    }

    res.status(200).json({
      success: true,
      student
    });
  } catch (error) {
    next(error);
  }
});

// @desc    Yeni öğrenci oluştur
// @route   POST /api/students
// @access  Öğretmen ve Admin
router.post('/', protect, authorize('teacher', 'admin'), [
  body('name', 'İsim gereklidir').notEmpty().trim().escape(),
  body('surname', 'Soyisim gereklidir').notEmpty().trim().escape(),
  body('class', 'Sınıf gereklidir').notEmpty().trim(),
  body('studentNumber', 'Öğrenci numarası gereklidir').notEmpty().trim().isNumeric().withMessage('Öğrenci numarası sadece rakam içermelidir'),
  body('password', 'Şifre gereklidir').isLength({ min: 6 }).withMessage('Şifre en az 6 karakter olmalıdır')
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Girilen bilgilerde hata var',
        errors: errors.array()
      });
    }

    const { name, surname, class: studentClass, studentNumber, password } = req.body;

    // Öğrenci numarasının benzersiz olup olmadığını kontrol et
    const existingStudentByNumber = await Student.findOne({ studentNumber });
    if (existingStudentByNumber) {
      return res.status(400).json({
        success: false,
        message: 'Bu öğrenci numarası zaten kullanılıyor'
      });
    }

    // Aynı öğretmende aynı isim+soyisim+sınıf kontrolü
    const existingStudent = await Student.findOne({ 
      name, 
      surname, 
      class: studentClass,
      teacher: req.user._id 
    });
    
    if (existingStudent) {
      return res.status(400).json({
        success: false,
        message: 'Bu öğrenci zaten kayıtlı'
      });
    }
    
    // Öğrenciyi oluştur
    const student = await Student.create({
      name,
      surname,
      class: studentClass,
      studentNumber,
      teacher: req.user._id,
      password: password
    });



    // Şifreyi gizle
    student.password = undefined;

    res.status(201).json({
      success: true,
      message: 'Öğrenci başarıyla oluşturuldu',
      student
    });
  } catch (error) {
    next(error);
  }
});

// @desc    Öğrenci güncelle
// @route   PUT /api/students/:id
// @access  Öğretmen ve Admin
router.put('/:id', protect, authorize('teacher', 'admin'), [
  body('name').optional().trim().escape(),
  body('surname').optional().trim().escape(),
  body('studentNumber').optional().trim(),
  body('email').optional().isEmail().normalizeEmail(),
  body('phone').optional().trim(),
  body('parentPhone').optional().trim(),
  body('address').optional().trim(),
  body('birthDate').optional().isISO8601().withMessage('Geçerli bir tarih giriniz')
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Girilen bilgilerde hata var',
        errors: errors.array()
      });
    }

    let query = { _id: req.params.id };
    
    // Öğretmen sadece kendi öğrencilerini güncelleyebilir
    if (req.user.userType === 'teacher') {
      query.teacher = req.user._id;
    }

    let student = await Student.findOne(query);

    if (!student) {
      return res.status(404).json({
        success: false,
        message: 'Öğrenci bulunamadı'
      });
    }

    const { name, surname, studentNumber, email, phone, parentPhone, address, birthDate, isActive } = req.body;

    // Öğrenci numarası değiştiriliyorsa benzersizlik kontrolü
    if (studentNumber && studentNumber !== student.studentNumber) {
      const existingStudent = await Student.findOne({ studentNumber });
      if (existingStudent) {
        return res.status(400).json({
          success: false,
          message: 'Bu öğrenci numarası zaten kullanılıyor'
        });
      }
    }

    // Email değiştiriliyorsa benzersizlik kontrolü
    if (email && email !== student.email) {
      const existingEmail = await Student.findOne({ email });
      if (existingEmail) {
        return res.status(400).json({
          success: false,
          message: 'Bu email adresi zaten kullanılıyor'
        });
      }
    }

    // Güncelleme verilerini hazırla
    const updateData = {};
    if (name) updateData.name = name;
    if (surname) updateData.surname = surname;
    if (studentNumber) updateData.studentNumber = studentNumber;
    if (email) updateData.email = email;
    if (phone) updateData.phone = phone;
    if (parentPhone) updateData.parentPhone = parentPhone;
    if (address) updateData.address = address;
    if (birthDate) updateData.birthDate = birthDate;
    
    // Aktiflik durumunu değiştirme yetkisi
    if (typeof isActive !== 'undefined') {
      updateData.isActive = isActive;
    }

    student = await Student.findOneAndUpdate(query, updateData, {
      new: true,
      runValidators: true
    }).populate('teacher', 'name surname').select('-password');

    res.status(200).json({
      success: true,
      message: 'Öğrenci başarıyla güncellendi',
      student
    });
  } catch (error) {
    next(error);
  }
});

// @desc    Öğrenci sil
// @route   DELETE /api/students/:id
// @access  Öğretmen ve Admin
router.delete('/:id', protect, authorize('teacher', 'admin'), async (req, res, next) => {
  try {
    let query = { _id: req.params.id };
    
    // Öğretmen sadece kendi öğrencilerini silebilir
    if (req.user.userType === 'teacher') {
      query.teacher = req.user._id;
    }

    const student = await Student.findOne(query);

    if (!student) {
      return res.status(404).json({
        success: false,
        message: 'Öğrenci bulunamadı'
      });
    }

    await Student.findOneAndDelete(query);

    res.status(200).json({
      success: true,
      message: 'Öğrenci başarıyla silindi'
    });
  } catch (error) {
    next(error);
  }
});

// @desc    Öğrenci şifresini sıfırla
// @route   PUT /api/students/:id/reset-password
// @access  Öğretmen ve Admin
router.put('/:id/reset-password', protect, authorize('teacher', 'admin'), async (req, res, next) => {
  try {
    let query = { _id: req.params.id };
    
    // Öğretmen sadece kendi öğrencilerinin şifresini sıfırlayabilir
    if (req.user.userType === 'teacher') {
      query.teacher = req.user._id;
    }

    const student = await Student.findOne(query);

    if (!student) {
      return res.status(404).json({
        success: false,
        message: 'Öğrenci bulunamadı'
      });
    }

    // Şifreyi öğrenci numarasına sıfırla
    student.password = student.studentNumber;
    await student.save();

    res.status(200).json({
      success: true,
      message: 'Öğrenci şifresi başarıyla sıfırlandı (yeni şifre: öğrenci numarası)'
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router; 