const express = require('express');
const { body, validationResult } = require('express-validator');
const Submission = require('../models/Submission');
const Assignment = require('../models/Assignment');
const { verifyToken, teacherOnly, studentOnly } = require('../middleware/verifyToken');
const { uploadSubmissions, handleMulterError } = require('../middleware/upload');

const router = express.Router();

// @desc    Tüm ödev teslimlerini listele
// @route   GET /api/submissions
// @access  Öğretmen ve Admin
router.get('/', teacherOnly, async (req, res, next) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    let query = {};
    
    // Ödev ID'si verilmişse sadece o ödeve ait teslimleri getir
    if (req.query.assignmentId) {
      query.assignment = req.query.assignmentId;
    }

    // Öğretmen sadece kendi ödevlerine ait teslimleri görebilir
    if (req.user.userType === 'teacher') {
      const teacherAssignments = await Assignment.find({ teacher: req.user._id }).select('_id');
      const assignmentIds = teacherAssignments.map(a => a._id);
      query.assignment = { $in: assignmentIds };
    }

    // Durum filtresi
    if (req.query.status) {
      query.status = req.query.status;
    }

    const submissions = await Submission.find(query)
      .populate('student', 'name surname studentNumber')
      .populate('assignment', 'title subject dueDate')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const totalSubmissions = await Submission.countDocuments(query);

    res.status(200).json({
      success: true,
      count: submissions.length,
      totalPages: Math.ceil(totalSubmissions / limit),
      currentPage: page,
      submissions
    });
  } catch (error) {
    next(error);
  }
});

// @desc    Ödev teslimi detayını getir
// @route   GET /api/submissions/:id
// @access  Öğretmen, Admin ve ilgili öğrenci
router.get('/:id', verifyToken, async (req, res, next) => {
  try {
    let submission = await Submission.findById(req.params.id)
      .populate('student', 'name surname studentNumber')
      .populate('assignment', 'title subject dueDate teacher');

    if (!submission) {
      return res.status(404).json({
        success: false,
        message: 'Ödev teslimi bulunamadı'
      });
    }

    // Yetki kontrolü
    const isTeacher = req.user.userType === 'teacher' && submission.assignment.teacher.toString() === req.user._id.toString();
    const isAdmin = req.user.userType === 'admin';
    const isStudent = req.user.userType === 'student' && submission.student._id.toString() === req.user._id.toString();

    if (!isTeacher && !isAdmin && !isStudent) {
      return res.status(403).json({
        success: false,
        message: 'Bu teslimi görme yetkiniz yok'
      });
    }

    res.status(200).json({
      success: true,
      submission
    });
  } catch (error) {
    next(error);
  }
});

// @desc    Yeni ödev teslimi oluştur (Öğrenci)
// @route   POST /api/submissions
// @access  Öğrenci
router.post('/', 
  studentOnly,
  uploadSubmissions.array('files', 5), // En fazla 5 dosya
  handleMulterError,
  [
    body('assignmentId', 'Ödev ID gereklidir').notEmpty(),
    body('content', 'Teslim içeriği gereklidir').notEmpty().trim()
  ],
  async (req, res, next) => {
  try {
    // Sadece öğrenciler teslim yapabilir
    if (req.user.userType !== 'student') {
      return res.status(403).json({
        success: false,
        message: 'Sadece öğrenciler ödev teslimi yapabilir'
      });
    }

    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Girilen bilgilerde hata var',
        errors: errors.array()
      });
    }

    const { assignmentId, content } = req.body;
    
    // Yüklenen dosyaları işle
    const files = [];
    if (req.files && req.files.length > 0) {
      req.files.forEach(file => {
        files.push({
          originalName: file.originalname,
          filename: file.filename,
          path: file.path,
          size: file.size,
          mimeType: file.mimetype,
          url: `/uploads/submissions/${file.filename}`
        });
      });
    }

    // Ödev var mı kontrol et
    const assignment = await Assignment.findById(assignmentId);
    if (!assignment) {
      return res.status(404).json({
        success: false,
        message: 'Ödev bulunamadı'
      });
    }

    // Öğrenci bu ödevi yapabilir mi kontrol et
    if (!assignment.targetStudents.includes(req.user._id)) {
      return res.status(403).json({
        success: false,
        message: 'Bu ödevi yapma yetkiniz yok'
      });
    }

    // Teslim tarihi geçmiş mi kontrol et
    if (new Date() > new Date(assignment.dueDate)) {
      return res.status(400).json({
        success: false,
        message: 'Teslim tarihi geçmiş'
      });
    }

    // Daha önce teslim yapmış mı kontrol et
    const existingSubmission = await Submission.findOne({
      assignment: assignmentId,
      student: req.user._id
    });

    if (existingSubmission) {
      return res.status(400).json({
        success: false,
        message: 'Bu ödev için zaten teslim yapmışsınız'
      });
    }

    // Teslim oluştur
    const submission = await Submission.create({
      assignment: assignmentId,
      student: req.user._id,
      content,
      files: files,
      submissionDate: new Date()
    });

    // Populate edilmiş halini döndür
    const populatedSubmission = await Submission.findById(submission._id)
      .populate('student', 'name surname studentNumber')
      .populate('assignment', 'title subject dueDate');

    res.status(201).json({
      success: true,
      message: 'Ödev başarıyla teslim edildi',
      submission: populatedSubmission
    });
  } catch (error) {
    next(error);
  }
});

// @desc    Ödev teslimini güncelle (Öğrenci)
// @route   PUT /api/submissions/:id
// @access  Öğrenci (sadece kendi teslimi)
router.put('/:id', studentOnly, [
  body('content').optional().trim()
], async (req, res, next) => {
  try {
    // Sadece öğrenciler güncelleme yapabilir
    if (req.user.userType !== 'student') {
      return res.status(403).json({
        success: false,
        message: 'Sadece öğrenciler teslimlerini güncelleyebilir'
      });
    }

    let submission = await Submission.findById(req.params.id)
      .populate('assignment', 'dueDate');

    if (!submission) {
      return res.status(404).json({
        success: false,
        message: 'Teslim bulunamadı'
      });
    }

    // Sadece kendi teslimini güncelleyebilir
    if (submission.student.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Sadece kendi tesliminizi güncelleyebilirsiniz'
      });
    }

    // Teslim tarihi geçmiş mi kontrol et
    if (new Date() > new Date(submission.assignment.dueDate)) {
      return res.status(400).json({
        success: false,
        message: 'Teslim tarihi geçtiği için güncelleme yapamazsınız'
      });
    }

    // Notlandırılmış teslimleri güncelleme yapılamaz
    if (submission.status === 'graded') {
      return res.status(400).json({
        success: false,
        message: 'Notlandırılmış teslimlerde değişiklik yapamazsınız'
      });
    }

    const { content, files } = req.body;

    // Güncelleme verilerini hazırla
    const updateData = {};
    if (content) updateData.content = content;
    if (files) updateData.files = files;
    updateData.submissionDate = new Date();

    submission = await Submission.findByIdAndUpdate(req.params.id, updateData, {
      new: true,
      runValidators: true
    }).populate('student', 'name surname studentNumber')
      .populate('assignment', 'title subject dueDate');

    res.status(200).json({
      success: true,
      message: 'Teslim başarıyla güncellendi',
      submission
    });
  } catch (error) {
    next(error);
  }
});

// @desc    Ödev teslimini notlandır (Öğretmen)
// @route   PATCH /api/submissions/:id/grade
// @access  Öğretmen ve Admin
router.patch('/:id/grade', teacherOnly, [
  body('score', 'Puan gereklidir').isNumeric().withMessage('Puan sayısal olmalıdır'),
  body('feedback').optional().trim()
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

    let submission = await Submission.findById(req.params.id)
      .populate('assignment', 'teacher maxScore');

    if (!submission) {
      return res.status(404).json({
        success: false,
        message: 'Teslim bulunamadı'
      });
    }

    // Öğretmen sadece kendi ödevlerine ait teslimleri notlandırabilir
    if (req.user.userType === 'teacher' && submission.assignment.teacher.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Bu teslimi notlandırma yetkiniz yok'
      });
    }

    const { score, feedback } = req.body;

    // Puan kontrolleri
    if (score < 0) {
      return res.status(400).json({
        success: false,
        message: 'Puan 0\'dan küçük olamaz'
      });
    }

    if (score > submission.assignment.maxScore) {
      return res.status(400).json({
        success: false,
        message: `Puan maksimum ${submission.assignment.maxScore} olabilir`
      });
    }

    // Notlandır
    submission = await Submission.findByIdAndUpdate(req.params.id, {
      score,
      feedback,
      status: 'graded',
      gradedAt: new Date(),
      gradedBy: req.user._id
    }, {
      new: true,
      runValidators: true
    }).populate('student', 'name surname studentNumber')
      .populate('assignment', 'title subject maxScore')
      .populate('gradedBy', 'name surname');

    res.status(200).json({
      success: true,
      message: 'Teslim başarıyla notlandırıldı',
      submission
    });
  } catch (error) {
    next(error);
  }
});

// @desc    Ödev teslimini sil
// @route   DELETE /api/submissions/:id
// @access  Öğrenci (kendi teslimi) ve Öğretmen/Admin
router.delete('/:id', verifyToken, async (req, res, next) => {
  try {
    let submission = await Submission.findById(req.params.id)
      .populate('assignment', 'teacher dueDate');

    if (!submission) {
      return res.status(404).json({
        success: false,
        message: 'Teslim bulunamadı'
      });
    }

    // Yetki kontrolü
    const isTeacher = req.user.userType === 'teacher' && submission.assignment.teacher.toString() === req.user._id.toString();
    const isAdmin = req.user.userType === 'admin';
    const isStudent = req.user.userType === 'student' && submission.student.toString() === req.user._id.toString();

    if (!isTeacher && !isAdmin && !isStudent) {
      return res.status(403).json({
        success: false,
        message: 'Bu teslimi silme yetkiniz yok'
      });
    }

    // Öğrenci kendi teslimini sadece teslim tarihi geçmemişse silebilir
    if (isStudent && new Date() > new Date(submission.assignment.dueDate)) {
      return res.status(400).json({
        success: false,
        message: 'Teslim tarihi geçtiği için silme yapamazsınız'
      });
    }

    await Submission.findByIdAndDelete(req.params.id);

    res.status(200).json({
      success: true,
      message: 'Teslim başarıyla silindi'
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router; 