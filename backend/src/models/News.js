const mongoose = require('mongoose');
const slugify = require('slugify');

const newsSchema = new mongoose.Schema({
  title: {
    type: String,
    required: [true, 'Başlık gereklidir'],
    trim: true,
    maxlength: [200, 'Başlık 200 karakterden fazla olamaz']
  },
  content: {
    type: String,
    required: [true, 'İçerik gereklidir'],
    maxlength: [5000, 'İçerik 5000 karakterden fazla olamaz']
  },
  summary: {
    type: String,
    maxlength: [300, 'Özet 300 karakterden fazla olamaz']
  },
  category: {
    type: String,
    required: [true, 'Kategori gereklidir'],
    enum: ['duyuru', 'etkinlik', 'onemli', 'genel'],
    default: 'genel'
  },
  author: {
    type: mongoose.Schema.ObjectId,
    ref: 'User',
    required: [true, 'Yazar gereklidir']
  },
  featuredImage: {
    filename: String,
    originalName: String,
    path: String,
    alt: String
  },
  isPublished: {
    type: Boolean,
    default: true
  },
  isPinned: {
    type: Boolean,
    default: false
  },
  publishDate: {
    type: Date,
    default: Date.now
  },
  expiryDate: {
    type: Date
  },
  slug: {
    type: String,
    unique: true
  },
  tags: [String],
  viewCount: {
    type: Number,
    default: 0
  },
  targetAudience: {
    type: String,
    enum: ['all', 'teachers', 'students', 'parents'],
    default: 'all'
  },
  priority: {
    type: String,
    enum: ['low', 'medium', 'high', 'urgent'],
    default: 'medium'
  },
  comments: [{
    user: {
      type: mongoose.Schema.ObjectId,
      ref: 'User'
    },
    content: String,
    createdAt: {
      type: Date,
      default: Date.now
    }
  }],
  allowComments: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Create slug from title
newsSchema.pre('save', async function(next) {
  if (this.isModified('title')) {
    let baseSlug = slugify(this.title, { 
      lower: true, 
      strict: true,
      remove: /[*+~.()'"!:@]/g 
    });
    
    // Benzersizlik için kontrol et
    let slug = baseSlug;
    let counter = 1;
    
    while (await this.constructor.findOne({ slug, _id: { $ne: this._id } })) {
      slug = `${baseSlug}-${counter}`;
      counter++;
    }
    
    this.slug = slug;
  }
  next();
});

// Check if news is expired
newsSchema.virtual('isExpired').get(function() {
  return this.expiryDate && new Date() > this.expiryDate;
});

// Index for better performance
newsSchema.index({ category: 1 });
newsSchema.index({ author: 1 });
newsSchema.index({ isPublished: 1, publishDate: -1 });
newsSchema.index({ slug: 1 });
newsSchema.index({ isPinned: -1, publishDate: -1 });

module.exports = mongoose.model('News', newsSchema); 