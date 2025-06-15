const mongoose = require('mongoose');
const slugify = require('slugify');

const assignmentSchema = new mongoose.Schema({
  title: {
    type: String,
    required: [true, 'Ödev başlığı gereklidir'],
    trim: true,
    maxlength: [100, 'Başlık 100 karakterden fazla olamaz']
  },
  description: {
    type: String,
    required: [true, 'Ödev açıklaması gereklidir'],
    maxlength: [1000, 'Açıklama 1000 karakterden fazla olamaz']
  },
  subject: {
    type: String,
    required: [true, 'Ders adı gereklidir'],
    trim: true,
    maxlength: [50, 'Ders adı 50 karakterden fazla olamaz']
  },
  teacher: {
    type: mongoose.Schema.ObjectId,
    ref: 'User',
    required: [true, 'Öğretmen gereklidir']
  },
  targetStudents: [{
    type: mongoose.Schema.ObjectId,
    ref: 'Student'
  }],
  class: {
    type: String,
    required: [true, 'Sınıf bilgisi gereklidir'],
    trim: true
  },

  dueDate: {
    type: Date,
    required: [true, 'Teslim tarihi gereklidir']
  },
  assignedDate: {
    type: Date,
    default: Date.now
  },
  attachments: [{
    filename: String,
    originalName: String,
    path: String,
    size: Number,
    mimeType: String,
    uploadDate: {
      type: Date,
      default: Date.now
    }
  }],
  instructions: {
    type: String,
    maxlength: [2000, 'Talimatlar 2000 karakterden fazla olamaz']
  },
  maxScore: {
    type: Number,
    default: 100,
    min: [1, 'Maksimum puan en az 1 olmalıdır']
  },
  allowLateSubmission: {
    type: Boolean,
    default: false
  },
  status: {
    type: String,
    enum: ['active', 'completed', 'cancelled'],
    default: 'active'
  },
  isActive: {
    type: Boolean,
    default: true
  },
  slug: {
    type: String,
    unique: true
  },
  priority: {
    type: String,
    enum: ['low', 'medium', 'high'],
    default: 'medium'
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Check if assignment is overdue
assignmentSchema.virtual('isOverdue').get(function() {
  return new Date() > this.dueDate;
});

// Days remaining until due date
assignmentSchema.virtual('daysRemaining').get(function() {
  const now = new Date();
  const dueDate = new Date(this.dueDate);
  const diffTime = dueDate - now;
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  return diffDays;
});

// Create slug from title and teacher
assignmentSchema.pre('save', function(next) {
  if (this.isModified('title')) {
    this.slug = slugify(`${this.title}-${Date.now()}`, { lower: true });
  }
  next();
});

// Get submissions for this assignment (virtual)
assignmentSchema.virtual('submissions', {
  ref: 'Submission',
  localField: '_id',
  foreignField: 'assignment',
  justOne: false
});

// Index for better performance
assignmentSchema.index({ teacher: 1, class: 1, grade: 1 });
assignmentSchema.index({ dueDate: 1 });
assignmentSchema.index({ slug: 1 });

module.exports = mongoose.model('Assignment', assignmentSchema); 