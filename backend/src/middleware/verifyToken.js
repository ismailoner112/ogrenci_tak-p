const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Student = require('../models/Student');

// Token doğrulama middleware'i
const verifyToken = async (req, res, next) => {
  let token;

  // Header'dan token al
  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    token = req.headers.authorization.split(' ')[1];
  }
  // Cookie'den token al
  else if (req.cookies.token) {
    token = req.cookies.token;
  }

  // Token kontrolü
  if (!token) {
    return res.status(401).json({
      success: false,
      message: 'Erişim reddedildi. Lütfen giriş yapınız.',
      code: 'NO_TOKEN'
    });
  }

  try {
    // Token'ı doğrula
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    let user;
    let userType = decoded.userType;

    // Kullanıcı tipine göre doğru modelden kullanıcıyı getir
    if (userType === 'student') {
      user = await Student.findById(decoded.id)
        .populate('teacher', 'name surname email phone');
      
      if (!user) {
        return res.status(401).json({
          success: false,
          message: 'Öğrenci bulunamadı',
          code: 'USER_NOT_FOUND'
        });
      }
    } else if (userType === 'teacher' || userType === 'admin') {
      user = await User.findById(decoded.id);
      
      if (!user) {
        return res.status(401).json({
          success: false,
          message: 'Kullanıcı bulunamadı',
          code: 'USER_NOT_FOUND'
        });
      }
    } else {
      return res.status(401).json({
        success: false,
        message: 'Geçersiz kullanıcı tipi',
        code: 'INVALID_USER_TYPE'
      });
    }

    // Kullanıcının aktif olup olmadığını kontrol et
    if (!user.isActive) {
      return res.status(401).json({
        success: false,
        message: 'Hesabınız deaktif durumda',
        code: 'ACCOUNT_DEACTIVATED'
      });
    }

    // User nesnesine userType ekle
    user.userType = userType;
    req.user = user;
    
    next();
  } catch (error) {
    let message = 'Token doğrulanamadı';
    let code = 'TOKEN_INVALID';

    if (error.name === 'TokenExpiredError') {
      message = 'Token süresi dolmuş';
      code = 'TOKEN_EXPIRED';
    } else if (error.name === 'JsonWebTokenError') {
      message = 'Geçersiz token';
      code = 'TOKEN_MALFORMED';
    }

    return res.status(401).json({
      success: false,
      message,
      code
    });
  }
};

// Belirli rollere erişim kontrolü
const authorizeRoles = (...allowedRoles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Önce giriş yapmalısınız',
        code: 'NOT_AUTHENTICATED'
      });
    }

    const userRole = req.user.userType;
    
    if (!allowedRoles.includes(userRole)) {
      return res.status(403).json({
        success: false,
        message: `Bu işlem için ${allowedRoles.join(' veya ')} yetkisi gereklidir. Mevcut yetki: ${userRole}`,
        code: 'INSUFFICIENT_PERMISSION'
      });
    }

    next();
  };
};

// Sadece öğretmen kontrolü
const teacherOnly = (req, res, next) => {
  return authorizeRoles('teacher', 'admin')(req, res, next);
};

// Sadece öğrenci kontrolü
const studentOnly = (req, res, next) => {
  return authorizeRoles('student')(req, res, next);
};

// Sadece admin kontrolü
const adminOnly = (req, res, next) => {
  return authorizeRoles('admin')(req, res, next);
};

// Kaynak sahipliği kontrolü
const checkOwnership = (resourceField = 'userId') => {
  return async (req, res, next) => {
    try {
      const userRole = req.user.userType;
      const userId = req.user._id.toString();

      // Admin her şeye erişebilir
      if (userRole === 'admin') {
        return next();
      }

      // Öğrenci sadece kendi kaynaklarına erişebilir
      if (userRole === 'student') {
        const resourceUserId = req.params.id || req.params.studentId;
        
        if (resourceUserId && resourceUserId !== userId) {
          return res.status(403).json({
            success: false,
            message: 'Bu kaynağa erişim yetkiniz bulunmamaktadır',
            code: 'ACCESS_DENIED'
          });
        }
      }

      // Öğretmen kendi kaynaklarına ve öğrencilerinin kaynaklarına erişebilir
      if (userRole === 'teacher') {
        // Bu kontrol, özel route'larda ayrıca yapılacak
        // Çünkü öğretmen-öğrenci ilişkisi karmaşık olabilir
      }

      next();
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: 'Yetkilendirme kontrol hatası',
        code: 'AUTHORIZATION_ERROR'
      });
    }
  };
};

// İsteğe bağlı kimlik doğrulama (token yoksa hata vermez)
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
      const userType = decoded.userType;

      if (userType === 'student') {
        user = await Student.findById(decoded.id)
          .populate('teacher', 'name surname email');
      } else if (userType === 'teacher' || userType === 'admin') {
        user = await User.findById(decoded.id);
      }

      if (user && user.isActive) {
        user.userType = userType;
        req.user = user;
      }
    } catch (error) {
      // İsteğe bağlı kimlik doğrulama için hataları yoksay
      console.log('Optional auth error:', error.message);
    }
  }

  next();
};

// Token'dan kullanıcı bilgisi çıkarma (middleware olmadan)
const extractUserFromToken = (token) => {
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    return {
      id: decoded.id,
      userType: decoded.userType
    };
  } catch (error) {
    return null;
  }
};

module.exports = {
  verifyToken,
  authorizeRoles,
  teacherOnly,
  studentOnly,
  adminOnly,
  checkOwnership,
  optionalAuth,
  extractUserFromToken
}; 