/**
 * Validation Middleware
 * Express-validator kullanarak form doğrulama kuralları
 */

const { body } = require('express-validator');

// Galeri doğrulama kuralları
const validateGallery = [
  body('title')
    .trim()
    .isLength({ min: 3, max: 100 })
    .withMessage('Başlık 3-100 karakter arasında olmalıdır')
    .matches(/^[a-zA-ZçğıöşüÇĞIİÖŞÜ0-9\s\-.,!?()]+$/)
    .withMessage('Başlık sadece harf, rakam ve temel noktalama işaretleri içerebilir'),

  body('description')
    .optional()
    .trim()
    .isLength({ max: 500 })
    .withMessage('Açıklama maksimum 500 karakter olabilir'),

  body('category')
    .optional()
    .isIn(['etkinlik', 'ders', 'geziler', 'proje', 'genel', 'diger'])
    .withMessage('Geçerli bir kategori seçiniz'),

  body('isPublic')
    .optional()
    .isBoolean()
    .withMessage('Herkese açık alanı true/false olmalıdır'),

  body('tags')
    .optional()
    .custom((value) => {
      if (typeof value === 'string') {
        const tags = value.split(',').map(tag => tag.trim());
        if (tags.length > 10) {
          throw new Error('Maksimum 10 etiket ekleyebilirsiniz');
        }
        for (const tag of tags) {
          if (tag.length > 20) {
            throw new Error('Her etiket maksimum 20 karakter olabilir');
          }
        }
      }
      return true;
    }),

  body('eventDate')
    .optional()
    .isISO8601()
    .withMessage('Geçerli bir tarih formatı giriniz')
];

// Haber doğrulama kuralları
const validateNews = [
  body('title')
    .trim()
    .isLength({ min: 5, max: 200 })
    .withMessage('Başlık 5-200 karakter arasında olmalıdır')
    .matches(/^[a-zA-ZçğıöşüÇĞIİÖŞÜ0-9\s\-.,!?()]+$/)
    .withMessage('Başlık sadece harf, rakam ve temel noktalama işaretleri içerebilir'),

  body('content')
    .trim()
    .isLength({ min: 20, max: 5000 })
    .withMessage('İçerik 20-5000 karakter arasında olmalıdır'),

  body('summary')
    .optional()
    .trim()
    .isLength({ max: 300 })
    .withMessage('Özet maksimum 300 karakter olabilir'),

  body('category')
    .isIn(['duyuru', 'etkinlik', 'onemli', 'genel'])
    .withMessage('Geçerli bir kategori seçiniz'),

  body('targetAudience')
    .optional()
    .isIn(['all', 'teachers', 'students', 'parents'])
    .withMessage('Geçerli bir hedef kitle seçiniz'),

  body('priority')
    .optional()
    .isIn(['low', 'medium', 'high', 'urgent'])
    .withMessage('Geçerli bir öncelik seviyesi seçiniz'),

  body('isPinned')
    .optional()
    .isBoolean()
    .withMessage('Sabitlenmiş alanı true/false olmalıdır'),

  body('isPublished')
    .optional()
    .isBoolean()
    .withMessage('Yayınlanmış alanı true/false olmalıdır'),

  body('allowComments')
    .optional()
    .isBoolean()
    .withMessage('Yorumlara izin ver alanı true/false olmalıdır'),

  body('publishDate')
    .optional()
    .isISO8601()
    .withMessage('Geçerli bir yayın tarihi formatı giriniz'),

  body('expiryDate')
    .optional()
    .isISO8601()
    .withMessage('Geçerli bir son geçerlilik tarihi formatı giriniz')
    .custom((value, { req }) => {
      if (value && req.body.publishDate) {
        const publishDate = new Date(req.body.publishDate);
        const expiryDate = new Date(value);
        if (expiryDate <= publishDate) {
          throw new Error('Son geçerlilik tarihi, yayın tarihinden sonra olmalıdır');
        }
      }
      return true;
    }),

  body('tags')
    .optional()
    .custom((value) => {
      if (typeof value === 'string') {
        const tags = value.split(',').map(tag => tag.trim());
        if (tags.length > 15) {
          throw new Error('Maksimum 15 etiket ekleyebilirsiniz');
        }
        for (const tag of tags) {
          if (tag.length > 30) {
            throw new Error('Her etiket maksimum 30 karakter olabilir');
          }
        }
      }
      return true;
    }),

  body('imageAlt')
    .optional()
    .trim()
    .isLength({ max: 100 })
    .withMessage('Resim alt metni maksimum 100 karakter olabilir')
];

// Yorum doğrulama kuralları
const validateComment = [
  body('content')
    .trim()
    .isLength({ min: 1, max: 500 })
    .withMessage('Yorum içeriği 1-500 karakter arasında olmalıdır')
    .matches(/^[a-zA-ZçğıöşüÇĞIİÖŞÜ0-9\s\-.,!?()@#]+$/)
    .withMessage('Yorum içeriği uygunsuz karakterler içeriyor')
];

// Galeri güncelleme doğrulama kuralları
const validateGalleryUpdate = [
  body('title')
    .optional()
    .trim()
    .isLength({ min: 3, max: 100 })
    .withMessage('Başlık 3-100 karakter arasında olmalıdır'),

  body('description')
    .optional()
    .trim()
    .isLength({ max: 500 })
    .withMessage('Açıklama maksimum 500 karakter olabilir'),

  body('category')
    .optional()
    .isIn(['etkinlik', 'ders', 'geziler', 'proje', 'diger'])
    .withMessage('Geçerli bir kategori seçiniz'),

  body('isPublic')
    .optional()
    .isBoolean()
    .withMessage('Herkese açık alanı true/false olmalıdır'),

  body('tags')
    .optional()
    .custom((value) => {
      if (typeof value === 'string') {
        const tags = value.split(',').map(tag => tag.trim());
        if (tags.length > 10) {
          throw new Error('Maksimum 10 etiket ekleyebilirsiniz');
        }
        for (const tag of tags) {
          if (tag.length > 20) {
            throw new Error('Her etiket maksimum 20 karakter olabilir');
          }
        }
      }
      return true;
    }),

  body('eventDate')
    .optional()
    .isISO8601()
    .withMessage('Geçerli bir tarih formatı giriniz')
];

// Haber güncelleme doğrulama kuralları
const validateNewsUpdate = [
  body('title')
    .optional()
    .trim()
    .isLength({ min: 5, max: 200 })
    .withMessage('Başlık 5-200 karakter arasında olmalıdır'),

  body('content')
    .optional()
    .trim()
    .isLength({ min: 20, max: 5000 })
    .withMessage('İçerik 20-5000 karakter arasında olmalıdır'),

  body('summary')
    .optional()
    .trim()
    .isLength({ max: 300 })
    .withMessage('Özet maksimum 300 karakter olabilir'),

  body('category')
    .optional()
    .isIn(['duyuru', 'etkinlik', 'onemli', 'genel'])
    .withMessage('Geçerli bir kategori seçiniz'),

  body('targetAudience')
    .optional()
    .isIn(['all', 'teachers', 'students', 'parents'])
    .withMessage('Geçerli bir hedef kitle seçiniz'),

  body('priority')
    .optional()
    .isIn(['low', 'medium', 'high', 'urgent'])
    .withMessage('Geçerli bir öncelik seviyesi seçiniz'),

  body('isPinned')
    .optional()
    .isBoolean()
    .withMessage('Sabitlenmiş alanı true/false olmalıdır'),

  body('isPublished')
    .optional()
    .isBoolean()
    .withMessage('Yayınlanmış alanı true/false olmalıdır'),

  body('allowComments')
    .optional()
    .isBoolean()
    .withMessage('Yorumlara izin ver alanı true/false olmalıdır'),

  body('publishDate')
    .optional()
    .isISO8601()
    .withMessage('Geçerli bir yayın tarihi formatı giriniz'),

  body('expiryDate')
    .optional()
    .isISO8601()
    .withMessage('Geçerli bir son geçerlilik tarihi formatı giriniz'),

  body('tags')
    .optional()
    .custom((value) => {
      if (typeof value === 'string') {
        const tags = value.split(',').map(tag => tag.trim());
        if (tags.length > 15) {
          throw new Error('Maksimum 15 etiket ekleyebilirsiniz');
        }
        for (const tag of tags) {
          if (tag.length > 30) {
            throw new Error('Her etiket maksimum 30 karakter olabilir');
          }
        }
      }
      return true;
    }),

  body('imageAlt')
    .optional()
    .trim()
    .isLength({ max: 100 })
    .withMessage('Resim alt metni maksimum 100 karakter olabilir')
];

module.exports = {
  validateGallery,
  validateNews,
  validateComment,
  validateGalleryUpdate,
  validateNewsUpdate
}; 