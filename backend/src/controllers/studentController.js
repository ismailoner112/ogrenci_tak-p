// Express async handler (custom implementation)
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

const Student = require('../models/Student');
const Assignment = require('../models/Assignment');
const Submission = require('../models/Submission');
const User = require('../models/User');
const { validationResult } = require('express-validator');

// @desc    Öğrenci dashboard bilgilerini getir
// @route   GET /api/student/dashboard
// @access  Özel (Student)
const getDashboard = asyncHandler(async (req, res) => {
  const studentId = req.user._id;

  // Öğrenci bilgilerini getir
  const student = await Student.findById(studentId)
    .populate('ogretmenId', 'ad soyad email telefon brans')
    .select('ad soyad numara sinif email telefon ortalamaNot verilenOdevler notlar');

  if (!student) {
    return res.status(404).json({
      success: false,
      message: 'Öğrenci bulunamadı'
    });
  }

  // Öğrenciye atanan ödevleri getir
  const assignments = await Assignment.find({ 
    targetStudents: studentId 
  })
  .populate('teacher', 'name surname')
  .sort({ dueDate: 1 })
  .limit(10);

  // Öğrencinin teslim ettiği ödevleri getir
  const submissions = await Submission.find({ 
    student: studentId 
  })
  .populate('assignment', 'title subject dueDate')
  .sort({ submittedAt: -1 })
  .limit(5);

  // İstatistikler
  const stats = {
    totalAssignments: assignments.length,
    completedAssignments: submissions.filter(s => s.status === 'submitted' || s.status === 'graded').length,
    pendingAssignments: assignments.filter(a => a.dueDate > new Date()).length,
    lateSubmissions: submissions.filter(s => s.isLate).length,
    averageGrade: student.ortalamaNot || 0,
    totalGrades: student.notlar ? student.notlar.length : 0
  };

  // Yaklaşan ödevler (7 gün içinde)
  const upcomingDeadlines = assignments.filter(a => {
    const daysLeft = Math.ceil((new Date(a.dueDate) - new Date()) / (1000 * 60 * 60 * 24));
    return daysLeft <= 7 && daysLeft > 0;
  });

  // Son notlar (5 tane)
  const recentGrades = student.notlar 
    ? student.notlar
        .sort((a, b) => new Date(b.tarih) - new Date(a.tarih))
        .slice(0, 5)
    : [];

  res.status(200).json({
    success: true,
    data: {
      student: {
        id: student._id,
        ad: student.ad,
        soyad: student.soyad,
        tamAd: student.tamAd,
        numara: student.numara,
        sinif: student.sinif,
        email: student.email,
        telefon: student.telefon,
        ortalamaNot: student.ortalamaNot,
        ogretmeni: student.ogretmenId
      },
      stats,
      assignments,
      submissions,
      upcomingDeadlines,
      recentGrades
    }
  });
});

// @desc    Öğrencinin ödevlerini getir
// @route   GET /api/student/assignments
// @access  Özel (Student)
const getMyAssignments = asyncHandler(async (req, res) => {
  const studentId = req.user._id;
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;
  const skip = (page - 1) * limit;

  // Filtreleme seçenekleri
  const filter = { targetStudents: studentId };
  
  if (req.query.subject) {
    filter.subject = req.query.subject;
  }

  if (req.query.status) {
    if (req.query.status === 'pending') {
      filter.dueDate = { $gte: new Date() };
    } else if (req.query.status === 'overdue') {
      filter.dueDate = { $lt: new Date() };
    }
  }

  const assignments = await Assignment.find(filter)
    .populate('teacher', 'name surname email')
    .sort({ dueDate: 1 })
    .skip(skip)
    .limit(limit);

  // Her ödev için teslim durumunu kontrol et
  const assignmentsWithStatus = await Promise.all(
    assignments.map(async (assignment) => {
      const submission = await Submission.findOne({
        assignment: assignment._id,
        student: studentId
      });

      return {
        ...assignment.toObject(),
        submissionStatus: submission ? submission.status : 'not_submitted',
        submissionDate: submission ? submission.submittedAt : null,
        isLate: submission ? submission.isLate : false,
        grade: submission ? submission.grade : null,
        isOverdue: new Date() > assignment.dueDate,
        daysRemaining: Math.ceil((new Date(assignment.dueDate) - new Date()) / (1000 * 60 * 60 * 24))
      };
    })
  );

  const totalAssignments = await Assignment.countDocuments(filter);

  res.status(200).json({
    success: true,
    count: assignments.length,
    totalCount: totalAssignments,
    totalPages: Math.ceil(totalAssignments / limit),
    currentPage: page,
    data: assignmentsWithStatus
  });
});

// @desc    Tek bir ödevin detaylarını getir
// @route   GET /api/student/assignments/:id
// @access  Özel (Student)
const getAssignmentDetail = asyncHandler(async (req, res) => {
  const studentId = req.user._id;
  const assignmentId = req.params.id;

  // Ödevin öğrenciye atanmış olup olmadığını kontrol et
  const assignment = await Assignment.findOne({
    _id: assignmentId,
    targetStudents: studentId
  }).populate('teacher', 'name surname email phone');

  if (!assignment) {
    return res.status(404).json({
      success: false,
      message: 'Ödev bulunamadı veya size atanmamış'
    });
  }

  // Öğrencinin bu ödev için teslimini kontrol et
  const submission = await Submission.findOne({
    assignment: assignmentId,
    student: studentId
  });

  const assignmentDetail = {
    ...assignment.toObject(),
    submissionStatus: submission ? submission.status : 'not_submitted',
    submission: submission || null,
    isOverdue: new Date() > assignment.dueDate,
    daysRemaining: Math.ceil((new Date(assignment.dueDate) - new Date()) / (1000 * 60 * 60 * 24)),
    canSubmit: !submission || (submission && assignment.allowLateSubmission && submission.resubmissionAllowed)
  };

  res.status(200).json({
    success: true,
    data: assignmentDetail
  });
});

// @desc    Ödev teslim et
// @route   POST /api/student/assignments/:id/submit
// @access  Özel (Student)
const submitAssignment = asyncHandler(async (req, res) => {
  // Doğrulama hatalarını kontrol et
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: 'Girilen bilgilerde hata var',
      errors: errors.array()
    });
  }

  const studentId = req.user._id;
  const assignmentId = req.params.id;
  const { content } = req.body;

  // Ödevin öğrenciye atanmış olup olmadığını kontrol et
  const assignment = await Assignment.findOne({
    _id: assignmentId,
    targetStudents: studentId
  });

  if (!assignment) {
    return res.status(404).json({
      success: false,
      message: 'Ödev bulunamadı veya size atanmamış'
    });
  }

  // Mevcut teslimi kontrol et
  const existingSubmission = await Submission.findOne({
    assignment: assignmentId,
    student: studentId
  });

  // Eğer zaten teslim edilmişse ve yeniden teslime izin verilmiyorsa
  if (existingSubmission && !assignment.allowLateSubmission) {
    return res.status(400).json({
      success: false,
      message: 'Bu ödev zaten teslim edilmiş ve yeniden teslime izin verilmiyor'
    });
  }

  // Yeni teslim oluştur veya mevcut teslimi güncelle
  let submission;
  
  if (existingSubmission && existingSubmission.resubmissionAllowed) {
    // Yeniden teslim
    existingSubmission.content = content;
    existingSubmission.submittedAt = new Date();
    existingSubmission.resubmissionCount += 1;
    existingSubmission.status = new Date() > assignment.dueDate ? 'late' : 'submitted';
    
    // Dosyalar varsa ekle
    if (req.files && req.files.length > 0) {
      const newFiles = req.files.map(file => ({
        filename: file.filename,
        originalName: file.originalname,
        path: file.path,
        size: file.size,
        mimeType: file.mimetype
      }));
      existingSubmission.files.push(...newFiles);
    }

    submission = await existingSubmission.save();
  } else {
    // İlk teslim
    const submissionData = {
      assignment: assignmentId,
      student: studentId,
      content,
      submittedAt: new Date()
    };

    // Dosyalar varsa ekle
    if (req.files && req.files.length > 0) {
      submissionData.files = req.files.map(file => ({
        filename: file.filename,
        originalName: file.originalname,
        path: file.path,
        size: file.size,
        mimeType: file.mimetype
      }));
    }

    submission = await Submission.create(submissionData);
  }

  // Öğrencinin ödev durumunu güncelle
  await Student.findByIdAndUpdate(studentId, {
    $set: {
      'verilenOdevler.$[elem].durum': submission.isLate ? 'gecikti' : 'teslim_edildi',
      'verilenOdevler.$[elem].teslimTarihi': submission.submittedAt
    }
  }, {
    arrayFilters: [{ 'elem.odevId': assignmentId }]
  });

  const populatedSubmission = await Submission.findById(submission._id)
    .populate('assignment', 'title subject dueDate maxScore');

  res.status(201).json({
    success: true,
    message: existingSubmission ? 'Ödev yeniden teslim edildi' : 'Ödev başarıyla teslim edildi',
    data: populatedSubmission
  });
});

// @desc    Öğrencinin teslimlerini getir
// @route   GET /api/student/submissions
// @access  Özel (Student)
const getMySubmissions = asyncHandler(async (req, res) => {
  const studentId = req.user._id;
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;
  const skip = (page - 1) * limit;

  // Filtreleme seçenekleri
  const filter = { student: studentId };
  
  if (req.query.status) {
    filter.status = req.query.status;
  }

  if (req.query.graded !== undefined) {
    if (req.query.graded === 'true') {
      filter['grade.score'] = { $exists: true };
    } else {
      filter['grade.score'] = { $exists: false };
    }
  }

  const submissions = await Submission.find(filter)
    .populate('assignment', 'title subject dueDate maxScore teacher')
    .populate('assignment.teacher', 'ad soyad')
    .sort({ submittedAt: -1 })
    .skip(skip)
    .limit(limit);

  const totalSubmissions = await Submission.countDocuments(filter);

  res.status(200).json({
    success: true,
    count: submissions.length,
    totalCount: totalSubmissions,
    totalPages: Math.ceil(totalSubmissions / limit),
    currentPage: page,
    data: submissions
  });
});

// @desc    Öğrencinin notlarını getir
// @route   GET /api/student/grades
// @access  Özel (Student)
const getMyGrades = asyncHandler(async (req, res) => {
  const studentId = req.user._id;

  const student = await Student.findById(studentId)
    .select('ad soyad numara notlar ortalamaNot')
    .populate('notlar.ogretmenId', 'ad soyad');

  if (!student) {
    return res.status(404).json({
      success: false,
      message: 'Öğrenci bulunamadı'
    });
  }

  // Notları ders bazında gruplandır
  const gradesBySubject = {};
  student.notlar.forEach(grade => {
    if (!gradesBySubject[grade.ders]) {
      gradesBySubject[grade.ders] = [];
    }
    gradesBySubject[grade.ders].push(grade);
  });

  // Her ders için ortalama hesapla
  const subjectAverages = Object.keys(gradesBySubject).map(subject => {
    const grades = gradesBySubject[subject];
    const average = grades.reduce((sum, grade) => sum + grade.not, 0) / grades.length;
    return {
      ders: subject,
      ortalama: Math.round(average * 100) / 100,
      notSayisi: grades.length,
      sonNot: grades.sort((a, b) => new Date(b.tarih) - new Date(a.tarih))[0]
    };
  });

  res.status(200).json({
    success: true,
    data: {
      student: {
        id: student._id,
        ad: student.ad,
        soyad: student.soyad,
        tamAd: student.tamAd,
        numara: student.numara,
        ortalamaNot: student.ortalamaNot
      },
      allGrades: student.notlar.sort((a, b) => new Date(b.tarih) - new Date(a.tarih)),
      gradesBySubject,
      subjectAverages,
      totalGrades: student.notlar.length
    }
  });
});

// @desc    Öğrencinin profil bilgilerini getir (sadece okuma)
// @route   GET /api/student/profile
// @access  Özel (Student)
const getProfile = asyncHandler(async (req, res) => {
  const studentId = req.user._id;

  const student = await Student.findById(studentId)
    .populate('ogretmenId', 'ad soyad email telefon brans')
    .select('-sifre -verilenOdevler');

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
});

module.exports = {
  getDashboard,
  getMyAssignments,
  getAssignmentDetail,
  submitAssignment,
  getMySubmissions,
  getMyGrades,
  getProfile
}; 