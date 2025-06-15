/**
 * Dosya Yükleme Middleware (Multer)
 */

const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Yükleme klasörlerini oluştur
const createUploadDirs = () => {
  const dirs = [
    'public/uploads',
    'public/uploads/gallery',
    'public/uploads/news',
    'public/uploads/avatars',
    'public/uploads/submissions'
  ];

  dirs.forEach(dir => {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  });
};

// Klasörleri oluştur
createUploadDirs();

// Galeri için storage
const galleryStorage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, 'public/uploads/gallery');
  },
  filename: function (req, file, cb) {
    // Dosya adını benzersiz yap
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    const name = path.basename(file.originalname, ext);
    const safeName = name.replace(/[^a-zA-Z0-9]/g, '-').toLowerCase();
    cb(null, `gallery-${safeName}-${uniqueSuffix}${ext}`);
  }
});

// Haber için storage
const newsStorage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, 'public/uploads/news');
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    const name = path.basename(file.originalname, ext);
    const safeName = name.replace(/[^a-zA-Z0-9]/g, '-').toLowerCase();
    cb(null, `news-${safeName}-${uniqueSuffix}${ext}`);
  }
});

// Avatar için storage
const avatarStorage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, 'public/uploads/avatars');
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    cb(null, `avatar-${uniqueSuffix}${ext}`);
  }
});

// Ödev teslimi için storage
const submissionsStorage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, 'public/uploads/submissions');
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    const name = path.basename(file.originalname, ext);
    const safeName = name.replace(/[^a-zA-Z0-9]/g, '-').toLowerCase();
    cb(null, `submission-${safeName}-${uniqueSuffix}${ext}`);
  }
});

// Dosya filtresi
const fileFilter = (req, file, cb) => {
  // İzin verilen dosya türleri
  const allowedTypes = {
    image: ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'],
    document: ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document']
  };

  const allAllowedTypes = [...allowedTypes.image, ...allowedTypes.document];

  if (allAllowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Desteklenmeyen dosya türü. Sadece resim ve PDF dosyaları kabul edilir.'), false);
  }
};

// Galeri upload konfigürasyonu
const uploadGallery = multer({
  storage: galleryStorage,
  fileFilter: (req, file, cb) => {
    // Sadece resim dosyaları
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Galeri için sadece resim dosyaları kabul edilir.'), false);
    }
  },
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB
    files: 10 // Maksimum 10 dosya
  }
});

// Haber upload konfigürasyonu
const uploadNews = multer({
  storage: newsStorage,
  fileFilter: (req, file, cb) => {
    // Sadece resim dosyaları (haber kapak fotoğrafı için)
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Haber için sadece resim dosyaları kabul edilir.'), false);
    }
  },
  limits: {
    fileSize: 3 * 1024 * 1024, // 3MB
    files: 1 // Tek dosya (kapak fotoğrafı)
  }
});

// Avatar upload konfigürasyonu
const uploadAvatar = multer({
  storage: avatarStorage,
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Avatar için sadece resim dosyaları kabul edilir.'), false);
    }
  },
  limits: {
    fileSize: 2 * 1024 * 1024, // 2MB
    files: 1
  }
});

// Ödev teslimi upload konfigürasyonu
const uploadSubmissions = multer({
  storage: submissionsStorage,
  fileFilter: fileFilter, // Hem resim hem dokuman kabul eder
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB
    files: 5 // Maksimum 5 dosya
  }
});

// Hata yönetimi middleware
const handleMulterError = (err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    switch (err.code) {
      case 'LIMIT_FILE_SIZE':
        return res.status(400).json({
          success: false,
          error: 'Dosya boyutu çok büyük',
          message: 'Maksimum dosya boyutu: 5MB'
        });
      case 'LIMIT_FILE_COUNT':
        return res.status(400).json({
          success: false,
          error: 'Çok fazla dosya',
          message: 'Maksimum dosya sayısı aşıldı'
        });
      case 'LIMIT_UNEXPECTED_FILE':
        return res.status(400).json({
          success: false,
          error: 'Beklenmeyen dosya alanı',
          message: 'Geçersiz dosya alanı'
        });
      default:
        return res.status(400).json({
          success: false,
          error: 'Dosya yükleme hatası',
          message: err.message
        });
    }
  }

  if (err.message.includes('Desteklenmeyen dosya türü') || 
      err.message.includes('sadece resim dosyaları')) {
    return res.status(400).json({
      success: false,
      error: 'Geçersiz dosya türü',
      message: err.message
    });
  }

  next(err);
};

// Dosya silme yardımcı fonksiyonu
const deleteFile = (filePath) => {
  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      return true;
    }
    return false;
  } catch (error) {
    console.error('Dosya silme hatası:', error);
    return false;
  }
};

// Dosya bilgilerini düzenleme fonksiyonu
const processFileInfo = (file) => {
  return {
    filename: file.filename,
    originalName: file.originalname,
    path: file.path.replace(/\\/g, '/'), // Windows path düzeltmesi
    size: file.size,
    mimeType: file.mimetype,
    url: `/uploads/${file.destination.split('/').pop()}/${file.filename}`
  };
};

module.exports = {
  uploadGallery,
  uploadNews,
  uploadAvatar,
  uploadSubmissions,
  handleMulterError,
  deleteFile,
  processFileInfo,
  createUploadDirs
}; 