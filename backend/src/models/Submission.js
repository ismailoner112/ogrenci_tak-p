const mongoose = require('mongoose');

const submissionSchema = new mongoose.Schema({
  assignment: {
    type: mongoose.Schema.ObjectId,
    ref: 'Assignment',
    required: [true, 'Ödev referansı gereklidir']
  },
  student: {
    type: mongoose.Schema.ObjectId,
    ref: 'Student',
    required: [true, 'Öğrenci referansı gereklidir']
  },
  submissionDate: {
    type: Date,
    default: Date.now
  },
  files: [{
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
  content: {
    type: String,
    maxlength: [2000, 'İçerik 2000 karakterden fazla olamaz']
  },
  status: {
    type: String,
    enum: ['submitted', 'graded', 'returned', 'late'],
    default: 'submitted'
  },
  isLate: {
    type: Boolean,
    default: false
  },
  score: {
    type: Number,
    min: [0, 'Puan 0\'dan az olamaz']
  },
  gradedAt: {
    type: Date
  },
  gradedBy: {
    type: mongoose.Schema.ObjectId,
    ref: 'User'
  },
  feedback: {
    type: String,
    maxlength: [1000, 'Geri bildirim 1000 karakterden fazla olamaz']
  },
  teacherNotes: {
    type: String,
    maxlength: [500, 'Öğretmen notları 500 karakterden fazla olamaz']
  },
  resubmissionAllowed: {
    type: Boolean,
    default: false
  },
  resubmissionCount: {
    type: Number,
    default: 0
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Check if submission was late
submissionSchema.pre('save', async function(next) {
  if (this.isNew) {
    // Get the assignment to check due date
    const assignment = await mongoose.model('Assignment').findById(this.assignment);
    if (assignment && this.submissionDate > assignment.dueDate) {
      this.isLate = true;
      this.status = 'late';
    }
  }
  next();
});

// Update status when graded
submissionSchema.pre('save', function(next) {
  if (this.score !== undefined && this.gradedAt && this.status !== 'late') {
    this.status = 'graded';
  }
  next();
});

// Ensure unique submission per student per assignment
submissionSchema.index({ assignment: 1, student: 1 }, { unique: true });
submissionSchema.index({ submissionDate: 1 });
submissionSchema.index({ status: 1 });

module.exports = mongoose.model('Submission', submissionSchema); 