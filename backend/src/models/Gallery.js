const mongoose = require('mongoose');
const slugify = require('slugify');

const gallerySchema = new mongoose.Schema({
  title: {
    type: String,
    required: [true, 'Başlık gereklidir'],
    trim: true,
    maxlength: [100, 'Başlık 100 karakterden fazla olamaz']
  },
  description: {
    type: String,
    maxlength: [500, 'Açıklama 500 karakterden fazla olamaz']
  },
  images: [{
    filename: String,
    originalName: String,
    path: String,
    size: Number,
    mimeType: String,
    alt: String,
    caption: String,
    uploadDate: {
      type: Date,
      default: Date.now
    }
  }],
  category: {
    type: String,
    required: [true, 'Kategori gereklidir'],
    enum: ['etkinlik', 'ders', 'geziler', 'proje', 'genel', 'diger'],
    default: 'genel'
  },
  uploadedBy: {
    type: mongoose.Schema.ObjectId,
    ref: 'User',
    required: [true, 'Yükleyen kullanıcı gereklidir']
  },
  uploadedByName: {
    type: String,
    trim: true
  },
  userType: {
    type: String,
    enum: ['teacher', 'student', 'admin'],
    default: 'teacher'
  },
  isPublic: {
    type: Boolean,
    default: true
  },
  isActive: {
    type: Boolean,
    default: true
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
  eventDate: {
    type: Date
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Create slug from title
gallerySchema.pre('save', async function(next) {
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

// Index for better performance
gallerySchema.index({ category: 1 });
gallerySchema.index({ uploadedBy: 1 });
gallerySchema.index({ isPublic: 1, isActive: 1 });
gallerySchema.index({ slug: 1 });

module.exports = mongoose.model('Gallery', gallerySchema); 