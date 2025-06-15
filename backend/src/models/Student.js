const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const slugify = require('slugify');

const studentSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'İsim gereklidir'],
    trim: true,
    maxlength: [50, 'İsim 50 karakterden fazla olamaz']
  },
  surname: {
    type: String,
    required: [true, 'Soyisim gereklidir'],
    trim: true,
    maxlength: [50, 'Soyisim 50 karakterden fazla olamaz']
  },
  studentNumber: {
    type: String,
    required: [true, 'Öğrenci numarası gereklidir'],
    unique: true,
    trim: true,
    validate: {
      validator: function(v) {
        return /^\d+$/.test(v);
      },
      message: 'Öğrenci numarası sadece rakamlardan oluşmalıdır'
    }
  },
  password: {
    type: String,
    required: [true, 'Şifre gereklidir'],
    minlength: [6, 'Şifre en az 6 karakter olmalıdır'],
    select: false // Şifreyi varsayılan sorgularda getirme
  },
  teacher: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'Bağlı öğretmen gereklidir']
  },
  assignments: [{
    assignmentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Assignment'
    },
    assignedDate: {
      type: Date,
      default: Date.now
    },
    dueDate: {
      type: Date
    },
    status: {
      type: String,
      enum: ['pending', 'submitted', 'late', 'graded', 'completed'],
      default: 'pending'
    },
    submissionDate: {
      type: Date
    }
  }],
  grades: [{
    subject: {
      type: String,
      required: [true, 'Ders adı gereklidir']
    },
    grade: {
      type: Number,
      required: [true, 'Not değeri gereklidir'],
      min: [0, 'Not 0\'dan küçük olamaz'],
      max: [100, 'Not 100\'den büyük olamaz']
    },
    date: {
      type: Date,
      default: Date.now
    },
    description: {
      type: String,
      maxlength: [200, 'Açıklama 200 karakterden fazla olamaz']
    },
    teacher: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    examType: {
      type: String,
      enum: ['written', 'oral', 'project', 'homework', 'performance'],
      default: 'written'
    }
  }],
  email: {
    type: String,
    lowercase: true,
    match: [
      /^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/,
      'Geçerli bir e-posta adresi giriniz'
    ]
  },
  phone: {
    type: String,
    match: [/^[0-9]{10,11}$/, 'Geçerli bir telefon numarası giriniz']
  },
  class: {
    type: String,
    required: [true, 'Sınıf bilgisi gereklidir'],
    trim: true,
    maxlength: [20, 'Sınıf bilgisi 20 karakterden fazla olamaz']
  },
  address: {
    type: String,
    maxlength: [200, 'Adres 200 karakterden fazla olamaz']
  },
  parentInfo: {
    motherName: {
      type: String,
      maxlength: [100, 'Anne adı 100 karakterden fazla olamaz']
    },
    fatherName: {
      type: String,
      maxlength: [100, 'Baba adı 100 karakterden fazla olamaz']
    },
    parentPhone: {
      type: String,
      match: [/^[0-9]{10,11}$/, 'Geçerli bir telefon numarası giriniz']
    },
    parentEmail: {
      type: String,
      lowercase: true,
      match: [
        /^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/,
        'Geçerli bir e-posta adresi giriniz'
      ]
    }
  },
  birthDate: {
    type: Date
  },
  avatar: {
    type: String,
    default: 'default-student-avatar.jpg'
  },
  isActive: {
    type: Boolean,
    default: true
  },
  lastLogin: {
    type: Date
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  slug: {
    type: String,
    unique: true
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Tam ad sanal alanı
studentSchema.virtual('fullName').get(function() {
  return `${this.name} ${this.surname}`;
});

// Yaş sanal alanı
studentSchema.virtual('age').get(function() {
  if (this.birthDate) {
    return Math.floor((new Date() - this.birthDate) / (365.25 * 24 * 60 * 60 * 1000));
  }
  return null;
});

// Ortalama not sanal alanı
studentSchema.virtual('averageGrade').get(function() {
  if (this.grades && this.grades.length > 0) {
    const total = this.grades.reduce((acc, curr) => acc + curr.grade, 0);
    return Math.round((total / this.grades.length) * 100) / 100;
  }
  return 0;
});

// Tamamlanan ödev sayısı sanal alanı
studentSchema.virtual('completedAssignments').get(function() {
  if (this.assignments) {
    return this.assignments.filter(assignment => assignment.status === 'completed').length;
  }
  return 0;
});

// Bekleyen ödev sayısı sanal alanı
studentSchema.virtual('pendingAssignments').get(function() {
  if (this.assignments) {
    return this.assignments.filter(assignment => 
      assignment.status === 'pending' || assignment.status === 'graded'
    ).length;
  }
  return 0;
});

// İsim, soyisim ve numaradan slug oluştur
studentSchema.pre('save', function(next) {
  if (this.isModified('name') || this.isModified('surname') || this.isModified('studentNumber')) {
    this.slug = slugify(`${this.name}-${this.surname}-${this.studentNumber}`, { lower: true });
  }
  next();
});

// Kaydetmeden önce şifreyi bcrypt ile hashle
studentSchema.pre('save', async function(next) {
  if (!this.isModified('password')) {
    return next();
  }
  
  try {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error);
  }
});

// Şifre karşılaştırma metodu
studentSchema.methods.matchPassword = async function(enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

// Not ekleme metodu
studentSchema.methods.addGrade = function(subject, grade, description, teacher, examType = 'written') {
  this.grades.push({
    subject,
    grade,
    description,
    teacher,
    examType
  });
  return this.save();
};

// Ödev atama metodu
studentSchema.methods.assignHomework = function(assignmentId, dueDate) {
  const existingAssignment = this.assignments.find(
    assignment => assignment.assignmentId.toString() === assignmentId.toString()
  );
  
  if (!existingAssignment) {
    this.assignments.push({
      assignmentId,
      dueDate
    });
    return this.save();
  }
  
  return Promise.resolve(this);
};

// Ödev durumu güncelleme metodu
studentSchema.methods.updateAssignmentStatus = function(assignmentId, newStatus, submissionDate = null) {
  const assignment = this.assignments.find(
    a => a.assignmentId.toString() === assignmentId.toString()
  );
  
  if (assignment) {
    assignment.status = newStatus;
    if (submissionDate) {
      assignment.submissionDate = submissionDate;
    }
    return this.save();
  }
  
  return Promise.resolve(this);
};

// İndeksler - performans için
studentSchema.index({ studentNumber: 1 });
studentSchema.index({ teacher: 1 });
studentSchema.index({ slug: 1 });
studentSchema.index({ isActive: 1 });
studentSchema.index({ class: 1 });
studentSchema.index({ 'grades.subject': 1 });

module.exports = mongoose.model('Student', studentSchema); 