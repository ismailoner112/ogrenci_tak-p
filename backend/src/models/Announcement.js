const mongoose = require('mongoose');

const announcementSchema = new mongoose.Schema({
  title: {
    type: String,
    required: [true, 'Başlık gereklidir'],
    trim: true,
    maxlength: [200, 'Başlık 200 karakterden fazla olamaz']
  },
  content: {
    type: String,
    required: [true, 'İçerik gereklidir'],
    trim: true,
    maxlength: [5000, 'İçerik 5000 karakterden fazla olamaz']
  },
  author: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'Yazar gereklidir']
  },
  targetAudience: {
    type: String,
    enum: ['all', 'students', 'teachers', 'class'],
    default: 'all'
  },
  targetClass: {
    type: String,
    trim: true
  },
  priority: {
    type: String,
    enum: ['low', 'medium', 'high'],
    default: 'medium'
  },
  isActive: {
    type: Boolean,
    default: true
  },
  publishDate: {
    type: Date,
    default: Date.now
  },
  expiryDate: {
    type: Date
  },
  tags: [{
    type: String,
    trim: true
  }],
  attachments: [{
    filename: String,
    originalName: String,
    path: String,
    size: Number,
    mimetype: String
  }],
  viewCount: {
    type: Number,
    default: 0
  },
  likes: [{
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    date: {
      type: Date,
      default: Date.now
    }
  }],
  comments: [{
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    content: {
      type: String,
      required: true,
      maxlength: [500, 'Yorum 500 karakterden fazla olamaz']
    },
    date: {
      type: Date,
      default: Date.now
    }
  }]
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Virtual: Yorum sayısı
announcementSchema.virtual('commentCount').get(function() {
  return this.comments ? this.comments.length : 0;
});

// Virtual: Beğeni sayısı
announcementSchema.virtual('likeCount').get(function() {
  return this.likes ? this.likes.length : 0;
});

// Virtual: Süreli mi kontrol
announcementSchema.virtual('isExpired').get(function() {
  if (this.expiryDate) {
    return new Date() > this.expiryDate;
  }
  return false;
});

// Index'ler
announcementSchema.index({ publishDate: -1 });
announcementSchema.index({ author: 1 });
announcementSchema.index({ targetAudience: 1, targetClass: 1 });
announcementSchema.index({ isActive: 1, publishDate: -1 });

// Middleware: Görüntüleme sayısını artır
announcementSchema.methods.incrementViewCount = function() {
  this.viewCount += 1;
  return this.save();
};

// Middleware: Yorum ekle
announcementSchema.methods.addComment = function(userId, content) {
  this.comments.push({
    user: userId,
    content: content
  });
  return this.save();
};

// Middleware: Beğeni ekle/kaldır
announcementSchema.methods.toggleLike = function(userId) {
  const existingLike = this.likes.find(like => like.user.toString() === userId.toString());
  
  if (existingLike) {
    // Beğeniyi kaldır
    this.likes = this.likes.filter(like => like.user.toString() !== userId.toString());
  } else {
    // Beğeni ekle
    this.likes.push({ user: userId });
  }
  
  return this.save();
};

module.exports = mongoose.model('Announcement', announcementSchema); 