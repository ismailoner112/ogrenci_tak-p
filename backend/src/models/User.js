const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const slugify = require('slugify');

const userSchema = new mongoose.Schema({
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
  email: {
    type: String,
    required: [true, 'Email gereklidir'],
    unique: true,
    lowercase: true,
    match: [
      /^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/,
      'Geçerli bir email adresi giriniz'
    ]
  },
  password: {
    type: String,
    required: [true, 'Şifre gereklidir'],
    minlength: [3, 'Şifre en az 3 karakter olmalıdır'],
    select: false
  },
  userType: {
    type: String,
    enum: ['teacher', 'admin', 'student'],
    default: 'teacher'
  },
  slug: {
    type: String,
    unique: true
  },
  avatar: {
    type: String,
    default: 'no-avatar.jpg'
  },
  phone: {
    type: String,
    validate: {
      validator: function(v) {
        // Boş olabilir veya 10-11 rakam olmalı
        return !v || /^[0-9]{10,11}$/.test(v);
      },
      message: 'Geçerli bir telefon numarası giriniz'
    }
  },
  address: {
    type: String,
    maxlength: [200, 'Adres 200 karakterden fazla olamaz']
  },
  department: {
    type: String,
    maxlength: [100, 'Bölüm 100 karakterden fazla olamaz']
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
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Tam ad sanal alanı
userSchema.virtual('fullName').get(function() {
  return `${this.name} ${this.surname}`;
});

// İsim ve soyisimden slug oluştur
userSchema.pre('save', function(next) {
  if (this.isModified('name') || this.isModified('surname')) {
    // Unique slug için timestamp ekliyoruz
    const timestamp = Date.now();
    this.slug = slugify(`${this.name}-${this.surname}-${timestamp}`, { lower: true });
  }
  next();
});

// Kaydetmeden önce şifreyi hashle
userSchema.pre('save', async function(next) {
  if (!this.isModified('password')) {
    next();
  }
  
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

// Şifre karşılaştırma metodu
userSchema.methods.matchPassword = async function(enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

// Bu öğretmene atanan öğrencileri getir (sanal)
userSchema.virtual('students', {
  ref: 'Student',
  localField: '_id',
  foreignField: 'teacher',
  justOne: false
});

module.exports = mongoose.model('User', userSchema); 