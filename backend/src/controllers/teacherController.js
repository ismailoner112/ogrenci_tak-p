// Express async handler (custom implementation)
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};
const User = require('../models/User');
const Student = require('../models/Student');
const Assignment = require('../models/Assignment');
const { validationResult, body } = require('express-validator');

// @desc    Öğretmen dashboard bilgilerini getir
// @route   GET /api/teacher/dashboard
// @access  Özel (Teacher/Admin)
const getDashboard = asyncHandler(async (req, res) => {
  const teacherId = req.user._id;

  // Öğretmene bağlı öğrencileri getir
  const students = await Student.find({ ogretmenId: teacherId })
    .select('ad soyad numara sinif aktif ortalamaNot')
    .sort({ ad: 1 });

  // Öğretmenin verdiği ödevleri getir
  const assignments = await Assignment.find({ teacher: teacherId })
    .populate('students', 'ad soyad numara')
    .sort({ createdAt: -1 })
    .limit(10);

  // İstatistikler
  const stats = {
    totalStudents: students.length,
    activeStudents: students.filter(s => s.aktif).length,
    totalAssignments: assignments.length,
    pendingAssignments: assignments.filter(a => a.dueDate > new Date()).length,
    averageGrade: students.length > 0 
      ? students.reduce((acc, s) => acc + (s.ortalamaNot || 0), 0) / students.length 
      : 0
  };

  // Son eklenen öğrenciler (5 tane)
  const recentStudents = await Student.find({ ogretmenId: teacherId })
    .sort({ createdAt: -1 })
    .limit(5)
    .select('ad soyad numara sinif createdAt');

  res.status(200).json({
    success: true,
    data: {
      teacher: {
        id: req.user._id,
        ad: req.user.ad,
        soyad: req.user.soyad,
        tamAd: req.user.tamAd,
        brans: req.user.brans
      },
      stats,
      students,
      assignments,
      recentStudents
    }
  });
});

// @desc    Öğretmene bağlı tüm öğrencileri getir
// @route   GET /api/teacher/students
// @access  Özel (Teacher/Admin)
const getMyStudents = asyncHandler(async (req, res) => {
  const teacherId = req.user._id;
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;
  const skip = (page - 1) * limit;

  // Filtreleme seçenekleri
  const filter = { teacher: teacherId };
  
  if (req.query.class) {
    filter.class = req.query.class;
  }
  
  if (req.query.active !== undefined) {
    filter.isActive = req.query.active === 'true';
  }

  if (req.query.search) {
    filter.$or = [
      { name: { $regex: req.query.search, $options: 'i' } },
      { surname: { $regex: req.query.search, $options: 'i' } },
      { studentNumber: { $regex: req.query.search, $options: 'i' } }
    ];
  }

  const students = await Student.find(filter)
    .select('name surname studentNumber class email phone isActive averageGrade createdAt')
    .sort({ name: 1 })
    .skip(skip)
    .limit(limit);

  const totalStudents = await Student.countDocuments(filter);

  res.status(200).json({
    success: true,
    count: students.length,
    totalCount: totalStudents,
    totalPages: Math.ceil(totalStudents / limit),
    currentPage: page,
    data: students
  });
});

// @desc    Yeni öğrenci ekle
// @route   POST /api/teacher/students
// @access  Özel (Teacher/Admin)
const addStudent = asyncHandler(async (req, res) => {
  // Doğrulama hatalarını kontrol et
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: 'Girilen bilgilerde hata var',
      errors: errors.array()
    });
  }

  const teacherId = req.user._id;
  const { 
    name, surname, studentNumber, password, class: studentClass, 
    email, phone, address, birthDate, parentInfo 
  } = req.body;

  // Öğrenci numarasının benzersiz olup olmadığını kontrol et
  const existingStudent = await Student.findOne({ studentNumber });
  if (existingStudent) {
    return res.status(400).json({
      success: false,
      message: 'Bu öğrenci numarası zaten kullanılıyor'
    });
  }

  // Öğrenci oluştur
  const student = await Student.create({
    name,
    surname,
    studentNumber,
    password,
    class: studentClass,
    teacher: teacherId,
    email,
    phone,
    address,
    birthDate,
    parentInfo
  });

  res.status(201).json({
    success: true,
    message: 'Öğrenci başarıyla eklendi',
    data: {
      id: student._id,
      name: student.name,
      surname: student.surname,
      fullName: student.fullName,
      studentNumber: student.studentNumber,
      class: student.class,
      slug: student.slug
    }
  });
});

// @desc    Öğrenci bilgilerini güncelle
// @route   PUT /api/teacher/students/:id
// @access  Özel (Teacher/Admin)
const updateStudent = asyncHandler(async (req, res) => {
  const teacherId = req.user._id;
  const studentId = req.params.id;

  // Öğrencinin bu öğretmene ait olup olmadığını kontrol et
  const student = await Student.findOne({ 
    _id: studentId, 
    teacher: teacherId 
  });

  if (!student) {
    return res.status(404).json({
      success: false,
      message: 'Öğrenci bulunamadı veya bu öğrenci size ait değil'
    });
  }

  // Güncelleme verilerini hazırla
  const allowedFields = ['name', 'surname', 'email', 'phone', 'class', 'address', 'parentInfo', 'isActive'];
  const updateData = {};
  
  allowedFields.forEach(field => {
    if (req.body[field] !== undefined) {
      updateData[field] = req.body[field];
    }
  });

  const updatedStudent = await Student.findByIdAndUpdate(
    studentId,
    updateData,
    { new: true, runValidators: true }
  ).select('name surname studentNumber class email phone isActive');

  res.status(200).json({
    success: true,
    message: 'Öğrenci bilgileri güncellendi',
    data: updatedStudent
  });
});

// @desc    Öğrenci sil
// @route   DELETE /api/teacher/students/:id
// @access  Özel (Teacher/Admin)
const deleteStudent = asyncHandler(async (req, res) => {
  const teacherId = req.user._id;
  const studentId = req.params.id;

  // Öğrencinin bu öğretmene ait olup olmadığını kontrol et
  const student = await Student.findOne({ 
    _id: studentId, 
    teacher: teacherId 
  });

  if (!student) {
    return res.status(404).json({
      success: false,
      message: 'Öğrenci bulunamadı veya bu öğrenci size ait değil'
    });
  }

  // Öğrenciyi sil
  await Student.findByIdAndDelete(studentId);

  res.status(200).json({
    success: true,
    message: 'Öğrenci başarıyla silindi'
  });
});

// @desc    Öğrenciye not ver
// @route   POST /api/teacher/students/:id/grades
// @access  Özel (Teacher/Admin)
const addGradeToStudent = asyncHandler(async (req, res) => {
  // Doğrulama hatalarını kontrol et
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: 'Girilen bilgilerde hata var',
      errors: errors.array()
    });
  }

  const teacherId = req.user._id;
  const studentId = req.params.id;
  const { ders, not, aciklama, sinavTuru } = req.body;

  // Öğrencinin bu öğretmene ait olup olmadığını kontrol et
  const student = await Student.findOne({ 
    _id: studentId, 
    ogretmenId: teacherId 
  });

  if (!student) {
    return res.status(404).json({
      success: false,
      message: 'Öğrenci bulunamadı veya bu öğrenci size ait değil'
    });
  }

  // Not ekle
  await student.notEkle(ders, not, aciklama, teacherId, sinavTuru);

  // Güncellenmiş öğrenciyi getir
  const updatedStudent = await Student.findById(studentId)
    .select('ad soyad numara notlar ortalamaNot');

  res.status(201).json({
    success: true,
    message: 'Not başarıyla eklendi',
    data: {
      student: {
        id: updatedStudent._id,
        ad: updatedStudent.ad,
        soyad: updatedStudent.soyad,
        numara: updatedStudent.numara,
        ortalamaNot: updatedStudent.ortalamaNot
      },
      newGrade: {
        ders,
        not,
        aciklama,
        sinavTuru,
        tarih: new Date()
      }
    }
  });
});

// @desc    Öğrencinin notlarını getir
// @route   GET /api/teacher/students/:id/grades
// @access  Özel (Teacher/Admin)
const getStudentGrades = asyncHandler(async (req, res) => {
  const teacherId = req.user._id;
  const studentId = req.params.id;

  // Öğrencinin bu öğretmene ait olup olmadığını kontrol et
  const student = await Student.findOne({ 
    _id: studentId, 
    ogretmenId: teacherId 
  }).select('ad soyad numara notlar ortalamaNot')
    .populate('notlar.ogretmenId', 'ad soyad');

  if (!student) {
    return res.status(404).json({
      success: false,
      message: 'Öğrenci bulunamadı veya bu öğrenci size ait değil'
    });
  }

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
      grades: student.notlar.sort((a, b) => new Date(b.tarih) - new Date(a.tarih))
    }
  });
});

// @desc    Yeni ödev oluştur
// @route   POST /api/teacher/assignments
// @access  Özel (Teacher/Admin)
const createAssignment = asyncHandler(async (req, res) => {
  // Doğrulama hatalarını kontrol et
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: 'Girilen bilgilerde hata var',
      errors: errors.array()
    });
  }

  const teacherId = req.user._id;
  const { 
    title, description, subject, class: sinif, 
    dueDate, instructions, maxScore, allowLateSubmission,
    studentIds, priority 
  } = req.body;

  // Seçilen öğrencilerin bu öğretmene ait olup olmadığını kontrol et
  if (studentIds && studentIds.length > 0) {
    const studentsCheck = await Student.find({
      _id: { $in: studentIds },
      ogretmenId: teacherId
    });

    if (studentsCheck.length !== studentIds.length) {
      return res.status(400).json({
        success: false,
        message: 'Bazı öğrenciler size ait değil'
      });
    }
  }

  // Ödev oluştur
  const assignment = await Assignment.create({
    title,
    description,
    subject,
    teacher: teacherId,
    targetStudents: studentIds || [],
    class: sinif,
    dueDate,
    instructions,
    maxScore: maxScore || 100,
    allowLateSubmission: allowLateSubmission || false,
    priority: priority || 'medium'
  });

  // Öğrencilere ödev ata
  if (studentIds && studentIds.length > 0) {
    await Student.updateMany(
      { _id: { $in: studentIds } },
      { 
        $push: { 
          verilenOdevler: {
            odevId: assignment._id,
            bitisTarihi: dueDate
          }
        }
      }
    );
  }

  // Oluşturulan ödevi populate ederek getir
  const populatedAssignment = await Assignment.findById(assignment._id)
    .populate('targetStudents', 'name surname studentNumber')
    .populate('teacher', 'name surname');

  res.status(201).json({
    success: true,
    message: 'Ödev başarıyla oluşturuldu',
    data: populatedAssignment
  });
});

// @desc    Öğretmenin ödevlerini getir
// @route   GET /api/teacher/assignments
// @access  Özel (Teacher/Admin)
const getMyAssignments = asyncHandler(async (req, res) => {
  const teacherId = req.user._id;
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;
  const skip = (page - 1) * limit;

  // Filtreleme seçenekleri
  const filter = { teacher: teacherId };
  
  if (req.query.subject) {
    filter.subject = req.query.subject;
  }

  if (req.query.class) {
    filter.class = req.query.class;
  }

  if (req.query.status) {
    if (req.query.status === 'active') {
      filter.dueDate = { $gte: new Date() };
    } else if (req.query.status === 'expired') {
      filter.dueDate = { $lt: new Date() };
    }
  }

  const assignments = await Assignment.find(filter)
    .populate('targetStudents', 'name surname studentNumber')
    .populate('teacher', 'name surname')
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit);

  const totalAssignments = await Assignment.countDocuments(filter);

  res.status(200).json({
    success: true,
    count: assignments.length,
    totalCount: totalAssignments,
    totalPages: Math.ceil(totalAssignments / limit),
    currentPage: page,
    data: assignments
  });
});

// @desc    Ödev güncelle
// @route   PUT /api/teacher/assignments/:id
// @access  Özel (Teacher/Admin)
const updateAssignment = asyncHandler(async (req, res) => {
  const teacherId = req.user._id;
  const assignmentId = req.params.id;

  // Ödevin bu öğretmene ait olup olmadığını kontrol et
  const assignment = await Assignment.findOne({ 
    _id: assignmentId, 
    teacher: teacherId 
  });

  if (!assignment) {
    return res.status(404).json({
      success: false,
      message: 'Ödev bulunamadı veya bu ödev size ait değil'
    });
  }

  // Güncelleme verilerini hazırla
  const allowedFields = ['title', 'description', 'instructions', 'dueDate', 'maxScore', 'allowLateSubmission', 'priority', 'isActive'];
  const updateData = {};
  
  allowedFields.forEach(field => {
    if (req.body[field] !== undefined) {
      updateData[field] = req.body[field];
    }
  });

  const updatedAssignment = await Assignment.findByIdAndUpdate(
    assignmentId,
    updateData,
    { new: true, runValidators: true }
  ).populate('targetStudents', 'name surname studentNumber')
   .populate('teacher', 'name surname');

  res.status(200).json({
    success: true,
    message: 'Ödev güncellendi',
    data: updatedAssignment
  });
});

// @desc    Öğrencilere ödev ata
// @route   POST /api/teacher/assignments/:id/assign
// @access  Özel (Teacher/Admin)
const assignToStudents = asyncHandler(async (req, res) => {
  const teacherId = req.user._id;
  const assignmentId = req.params.id;
  const { studentIds } = req.body;

  if (!studentIds || !Array.isArray(studentIds) || studentIds.length === 0) {
    return res.status(400).json({
      success: false,
      message: 'En az bir öğrenci seçmelisiniz'
    });
  }

  // Ödevin bu öğretmene ait olup olmadığını kontrol et
  const assignment = await Assignment.findOne({ 
    _id: assignmentId, 
    teacher: teacherId 
  });

  if (!assignment) {
    return res.status(404).json({
      success: false,
      message: 'Ödev bulunamadı veya bu ödev size ait değil'
    });
  }

  // Seçilen öğrencilerin bu öğretmene ait olup olmadığını kontrol et
  const students = await Student.find({
    _id: { $in: studentIds },
    ogretmenId: teacherId
  });

  if (students.length !== studentIds.length) {
    return res.status(400).json({
      success: false,
      message: 'Bazı öğrenciler size ait değil'
    });
  }

  // Ödev'e öğrencileri ekle (mevcut olanları koruyarak)
  const currentStudentIds = assignment.targetStudents.map(s => s.toString());
  const newStudentIds = studentIds.filter(id => !currentStudentIds.includes(id));

  if (newStudentIds.length > 0) {
    assignment.targetStudents.push(...newStudentIds);
    await assignment.save();

    // Öğrencilere ödev ata
    await Student.updateMany(
      { _id: { $in: newStudentIds } },
      { 
        $push: { 
          verilenOdevler: {
            odevId: assignment._id,
            bitisTarihi: assignment.dueDate
          }
        }
      }
    );
  }

  const updatedAssignment = await Assignment.findById(assignmentId)
    .populate('targetStudents', 'name surname studentNumber')
    .populate('teacher', 'name surname');

  res.status(200).json({
    success: true,
    message: `Ödev ${newStudentIds.length} öğrenciye atandı`,
    data: updatedAssignment
  });
});

module.exports = {
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
}; 