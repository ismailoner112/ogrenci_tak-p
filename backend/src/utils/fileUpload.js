const multer = require('multer');
const path = require('path');
const sharp = require('sharp');
const fs = require('fs').promises;

// Dosya filtreleme fonksiyonu
const fileFilter = (req, file, cb) => {
  const allowedTypes = (process.env.ALLOWED_FILE_TYPES || 'pdf,doc,docx,jpg,jpeg,png,gif').split(',');
  const fileExtension = path.extname(file.originalname).toLowerCase().slice(1);
  
  if (allowedTypes.includes(fileExtension)) {
    cb(null, true);
  } else {
    cb(new Error(`Desteklenmeyen dosya türü: ${fileExtension}. İzin verilen türler: ${allowedTypes.join(', ')}`), false);
  }
};

// Farklı türler için depolama yapılandırması
const createStorage = (uploadPath) => {
  return multer.diskStorage({
    destination: (req, file, cb) => {
      cb(null, uploadPath);
    },
    filename: (req, file, cb) => {
      const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
      const extension = path.extname(file.originalname);
      cb(null, file.fieldname + '-' + uniqueSuffix + extension);
    }
  });
};

// Ödev dosyası yükleme
const assignmentUpload = multer({
  storage: createStorage('./uploads/assignments'),
  limits: {
    fileSize: parseInt(process.env.MAX_FILE_SIZE) || 10 * 1024 * 1024 // 10MB
  },
  fileFilter: fileFilter
});

// Galeri resim yükleme
const galleryUpload = multer({
  storage: createStorage('./uploads/gallery'),
  limits: {
    fileSize: parseInt(process.env.MAX_FILE_SIZE) || 10 * 1024 * 1024 // 10MB
  },
  fileFilter: (req, file, cb) => {
    // Galeri için sadece resim dosyalarına izin ver
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Galeri için sadece resim dosyaları yüklenebilir'), false);
    }
  }
});

// Avatar yükleme
const avatarUpload = multer({
  storage: createStorage('./uploads/avatars'),
  limits: {
    fileSize: 2 * 1024 * 1024 // Avatar'lar için 2MB
  },
  fileFilter: (req, file, cb) => {
    // Avatar'lar için sadece resim dosyalarına izin ver
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Avatar için sadece resim dosyaları yüklenebilir'), false);
    }
  }
});

// Resim boyutlandırma fonksiyonu
const resizeImage = async (inputPath, outputPath, width, height) => {
  try {
    await sharp(inputPath)
      .resize(width, height, {
        fit: 'cover',
        position: 'center'
      })
      .jpeg({ quality: 90 })
      .toFile(outputPath);
    
    return outputPath;
  } catch (error) {
    throw new Error(`Resim boyutlandırma hatası: ${error.message}`);
  }
};

// Avatar resmini işle
const processAvatar = async (filePath) => {
  try {
    const filename = path.basename(filePath, path.extname(filePath));
    const directory = path.dirname(filePath);
    
    // Farklı boyutlar oluştur
    const sizes = [
      { suffix: '_small', width: 50, height: 50 },
      { suffix: '_medium', width: 150, height: 150 },
      { suffix: '_large', width: 300, height: 300 }
    ];

    const processedFiles = [];

    for (const size of sizes) {
      const outputPath = path.join(directory, `${filename}${size.suffix}.jpg`);
      await resizeImage(filePath, outputPath, size.width, size.height);
      processedFiles.push({
        size: size.suffix.slice(1), // alt çizgiyi kaldır
        path: outputPath,
        width: size.width,
        height: size.height
      });
    }

    // Orijinal dosyayı sil
    await fs.unlink(filePath);

    return processedFiles;
  } catch (error) {
    throw new Error(`Avatar işleme hatası: ${error.message}`);
  }
};

// Galeri resimlerini işle
const processGalleryImage = async (filePath) => {
  try {
    const filename = path.basename(filePath, path.extname(filePath));
    const directory = path.dirname(filePath);
    
    // Küçük resim ve sıkıştırılmış versiyon oluştur
    const sizes = [
      { suffix: '_thumb', width: 300, height: 200 },
      { suffix: '_medium', width: 800, height: 600 },
      { suffix: '_large', width: 1200, height: 900 }
    ];

    const processedFiles = [];

    for (const size of sizes) {
      const outputPath = path.join(directory, `${filename}${size.suffix}.jpg`);
      await resizeImage(filePath, outputPath, size.width, size.height);
      processedFiles.push({
        size: size.suffix.slice(1), // alt çizgiyi kaldır
        path: outputPath,
        width: size.width,
        height: size.height
      });
    }

    // Eğer zaten işlenmiş bir dosya değilse orijinal dosyayı sil
    if (!filename.includes('_thumb') && !filename.includes('_medium') && !filename.includes('_large')) {
      await fs.unlink(filePath);
    }

    return processedFiles;
  } catch (error) {
    throw new Error(`Galeri resmi işleme hatası: ${error.message}`);
  }
};

// Dosya sil
const deleteFile = async (filePath) => {
  try {
    await fs.unlink(filePath);
    return true;
  } catch (error) {
    console.error(`Dosya silme hatası: ${error.message}`);
    return false;
  }
};

// Dosya boyutunu doğrula
const validateFileSize = (file, maxSize = null) => {
  const max = maxSize || parseInt(process.env.MAX_FILE_SIZE) || 10 * 1024 * 1024;
  return file.size <= max;
};

module.exports = {
  assignmentUpload,
  galleryUpload,
  avatarUpload,
  resizeImage,
  processAvatar,
  processGalleryImage,
  deleteFile,
  validateFileSize
}; 