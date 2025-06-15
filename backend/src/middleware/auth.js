const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Student = require('../models/Student');

// Route'ları koru - JWT token doğrulaması
const protect = async (req, res, next) => {
  let token;

  // Header'larda token kontrolü
  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    token = req.headers.authorization.split(' ')[1];
  }
  // Cookie'lerde token kontrolü
  else if (req.cookies.token) {
    token = req.cookies.token;
  }

  // Token'ın var olduğundan emin ol
  if (!token) {
    return res.status(401).json({
      success: false,
      message: 'Erişim reddedildi. Lütfen giriş yapın.'
    });
  }

  try {
    // Token'ı doğrula
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Token'dan kullanıcıyı al
    let user;
    if (decoded.userType === 'student') {
      user = await Student.findById(decoded.id).select('-password');
      user.userType = 'student';
    } else if (decoded.userType === 'teacher' || decoded.userType === 'admin') {
      user = await User.findById(decoded.id).select('-password');
      user.userType = decoded.userType || 'teacher';
    }

    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Kullanıcı bulunamadı'
      });
    }

    if (!user.isActive) {
      return res.status(401).json({
        success: false,
        message: 'Hesap deaktif durumda'
      });
    }

    req.user = user;
    next();
  } catch (error) {
    return res.status(401).json({
      success: false,
      message: 'Geçersiz token'
    });
  }
};

// Belirli rollere erişim ver
const authorize = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Erişim reddedildi'
      });
    }

    const userRole = req.user.userType || req.user.role;
    
    if (!roles.includes(userRole)) {
      return res.status(403).json({
        success: false,
        message: 'Bu işlem için yetkiniz yok'
      });
    }
    next();
  };
};

// Kullanıcının kaynağa sahip olup olmadığını veya admin olup olmadığını kontrol et
const ownershipOrAdmin = (resourceField = 'user') => {
  return async (req, res, next) => {
    try {
      const userRole = req.user.userType || req.user.role;
      
      // Admin her şeye erişebilir
      if (userRole === 'admin') {
        return next();
      }

      // Öğrenciler için kaynak sahipliği kontrolü
      if (userRole === 'student') {
        // Öğrenciler sadece kendi kaynaklarına erişebilir
        if (req.params.id && req.params.id !== req.user._id.toString()) {
          return res.status(403).json({
            success: false,
            message: 'Bu kaynağa erişim yetkiniz yok'
          });
        }
      }

      // Öğretmenler için, sahip oldukları veya öğrencilerinin kaynaklarına erişebilirler
      if (userRole === 'teacher') {
        // Öğretmenler kendi kaynaklarına ve öğrencilerinin kaynaklarına erişebilir
        // Bu, kaynak türüne göre bireysel route handler'larda işlenecek
      }

      next();
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: 'Yetkilendirme hatası'
      });
    }
  };
};

// İsteğe bağlı kimlik doğrulama - token yoksa hata vermez
const optionalAuth = async (req, res, next) => {
  let token;

  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    token = req.headers.authorization.split(' ')[1];
  } else if (req.cookies.token) {
    token = req.cookies.token;
  }

  if (token) {
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      
      let user;
      if (decoded.userType === 'student') {
        user = await Student.findById(decoded.id).select('-password');
        user.userType = 'student';
      } else if (decoded.userType === 'teacher' || decoded.userType === 'admin') {
        user = await User.findById(decoded.id).select('-password');
        user.userType = decoded.userType || 'teacher';
      }

      if (user && user.isActive) {
        req.user = user;
      }
    } catch (error) {
      // İsteğe bağlı kimlik doğrulama için token hatalarını yoksay
    }
  }

  next();
};

module.exports = {
  protect,
  authorize,
  ownershipOrAdmin,
  optionalAuth
}; 