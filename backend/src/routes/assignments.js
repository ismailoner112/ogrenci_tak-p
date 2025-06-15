const express = require('express');
const { body, validationResult } = require('express-validator');
const Assignment = require('../models/Assignment');
const { verifyToken, teacherOnly } = require('../middleware/verifyToken');

const router = express.Router();

// @desc    Tüm ödevleri listele
// @route   GET /api/assignments
// @access  Öğretmen ve Admin
router.get('/', verifyToken, teacherOnly, async (req, res, next) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    let query = {};
    
    // Öğretmen sadece kendi ödevlerini görebilir
    if (req.user.userType === 'teacher') {
      query.teacher = req.user._id;
    }

    // Arama filtresi
    if (req.query.search) {
      query.$or = [
        { title: { $regex: req.query.search, $options: 'i' } },
        { description: { $regex: req.query.search, $options: 'i' } },
        { subject: { $regex: req.query.search, $options: 'i' } }
      ];
    }

    // Konu filtresi
    if (req.query.subject) {
      query.subject = req.query.subject;
    }

    // Durum filtresi
    if (req.query.status) {
      query.status = req.query.status;
    }

    const assignments = await Assignment.find(query)
      .populate('teacher', 'name surname')
      .populate('targetStudents', 'name surname studentNumber')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const totalAssignments = await Assignment.countDocuments(query);

    res.status(200).json({
      success: true,
      count: assignments.length,
      totalPages: Math.ceil(totalAssignments / limit),
      currentPage: page,
      assignments
    });
  } catch (error) {
    next(error);
  }
});

// @desc    Ödev detayını getir
// @route   GET /api/assignments/:id
// @access  Öğretmen ve Admin
router.get('/:id', verifyToken, teacherOnly, async (req, res, next) => {
  try {
    let query = { _id: req.params.id };
    
    // Öğretmen sadece kendi ödevlerini görebilir
    if (req.user.userType === 'teacher') {
      query.teacher = req.user._id;
    }

    const assignment = await Assignment.findOne(query)
      .populate('teacher', 'name surname')
      .populate('targetStudents', 'name surname studentNumber')
      .populate({
        path: 'submissions',
        populate: {
          path: 'student',
          select: 'name surname studentNumber'
        }
      });

    if (!assignment) {
      return res.status(404).json({
        success: false,
        message: 'Ödev bulunamadı'
      });
    }

    res.status(200).json({
      success: true,
      assignment
    });
  } catch (error) {
    next(error);
  }
});

// @desc    Yeni ödev oluştur
// @route   POST /api/assignments
// @access  Öğretmen ve Admin
router.post('/', verifyToken, teacherOnly, [
  body('title', 'Ödev başlığı gereklidir').notEmpty().trim().escape(),
  body('description', 'Ödev açıklaması gereklidir').notEmpty().trim(),
  body('subject', 'Ders konusu gereklidir').notEmpty().trim().escape(),
  body('class', 'Sınıf bilgisi gereklidir').notEmpty().trim().escape(),
  body('dueDate', 'Teslim tarihi gereklidir').isISO8601().withMessage('Geçerli bir tarih giriniz'),
  body('targetStudents').optional().isArray().withMessage('Hedef öğrenciler bir dizi olmalıdır'),
  body('maxScore').optional().isNumeric().withMessage('Maksimum puan sayısal olmalıdır')
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

    const { title, description, subject, class: className, dueDate, targetStudents, maxScore, instructions } = req.body;

    // Teslim tarihi gelecekte olmalı
    if (new Date(dueDate) <= new Date()) {
      return res.status(400).json({
        success: false,
        message: 'Teslim tarihi gelecekte bir tarih olmalıdır'
      });
    }

    // Ödev oluştur
    const assignment = await Assignment.create({
      title,
      description,
      subject,
      class: className,
      dueDate,
      targetStudents,
      maxScore: maxScore || 100,
      instructions,
      teacher: req.user._id
    });

    // Populate edilmiş halini döndür
    const populatedAssignment = await Assignment.findById(assignment._id)
      .populate('teacher', 'name surname')
      .populate('targetStudents', 'name surname studentNumber');

    res.status(201).json({
      success: true,
      message: 'Ödev başarıyla oluşturuldu',
      assignment: populatedAssignment
    });
  } catch (error) {
    next(error);
  }
});

// @desc    Ödev güncelle
// @route   PUT /api/assignments/:id
// @access  Öğretmen ve Admin
router.put('/:id', verifyToken, teacherOnly, [
  body('title').optional().trim().escape(),
  body('description').optional().trim(),
  body('subject').optional().trim().escape(),
  body('dueDate').optional().isISO8601().withMessage('Geçerli bir tarih giriniz'),
  body('targetStudents').optional().isArray().withMessage('Hedef öğrenciler bir dizi olmalıdır'),
  body('maxScore').optional().isNumeric().withMessage('Maksimum puan sayısal olmalıdır'),
  body('status').optional().isIn(['active', 'completed', 'cancelled']).withMessage('Geçersiz durum')
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
    
    // Öğretmen sadece kendi ödevlerini güncelleyebilir
    if (req.user.userType === 'teacher') {
      query.teacher = req.user._id;
    }

    let assignment = await Assignment.findOne(query);

    if (!assignment) {
      return res.status(404).json({
        success: false,
        message: 'Ödev bulunamadı'
      });
    }

    const { title, description, subject, dueDate, targetStudents, maxScore, instructions, status } = req.body;

    // Teslim tarihi güncelleniyorsa gelecekte olmalı
    if (dueDate && new Date(dueDate) <= new Date()) {
      return res.status(400).json({
        success: false,
        message: 'Teslim tarihi gelecekte bir tarih olmalıdır'
      });
    }

    // Güncelleme verilerini hazırla
    const updateData = {};
    if (title) updateData.title = title;
    if (description) updateData.description = description;
    if (subject) updateData.subject = subject;
    if (dueDate) updateData.dueDate = dueDate;
    if (targetStudents) updateData.targetStudents = targetStudents;
    if (maxScore) updateData.maxScore = maxScore;
    if (instructions) updateData.instructions = instructions;
    if (status) updateData.status = status;

    assignment = await Assignment.findOneAndUpdate(query, updateData, {
      new: true,
      runValidators: true
    }).populate('teacher', 'name surname')
      .populate('targetStudents', 'name surname studentNumber');

    res.status(200).json({
      success: true,
      message: 'Ödev başarıyla güncellendi',
      assignment
    });
  } catch (error) {
    next(error);
  }
});

// @desc    Ödev sil
// @route   DELETE /api/assignments/:id
// @access  Öğretmen ve Admin
router.delete('/:id', verifyToken, teacherOnly, async (req, res, next) => {
  try {
    let query = { _id: req.params.id };
    
    // Öğretmen sadece kendi ödevlerini silebilir
    if (req.user.userType === 'teacher') {
      query.teacher = req.user._id;
    }

    const assignment = await Assignment.findOne(query);

    if (!assignment) {
      return res.status(404).json({
        success: false,
        message: 'Ödev bulunamadı'
      });
    }

    await Assignment.findOneAndDelete(query);

    res.status(200).json({
      success: true,
      message: 'Ödev başarıyla silindi'
    });
  } catch (error) {
    next(error);
  }
});

// @desc    Ödev durumunu güncelle
// @route   PATCH /api/assignments/:id/status
// @access  Öğretmen ve Admin
router.patch('/:id/status', verifyToken, teacherOnly, [
  body('status', 'Durum gereklidir').isIn(['active', 'completed', 'cancelled']).withMessage('Geçersiz durum')
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
    
    // Öğretmen sadece kendi ödevlerini güncelleyebilir
    if (req.user.userType === 'teacher') {
      query.teacher = req.user._id;
    }

    const assignment = await Assignment.findOneAndUpdate(
      query,
      { status: req.body.status },
      { new: true, runValidators: true }
    ).populate('teacher', 'name surname')
     .populate('targetStudents', 'name surname studentNumber');

    if (!assignment) {
      return res.status(404).json({
        success: false,
        message: 'Ödev bulunamadı'
      });
    }

    res.status(200).json({
      success: true,
      message: 'Ödev durumu başarıyla güncellendi',
      assignment
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router; 