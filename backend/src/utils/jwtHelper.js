const jwt = require('jsonwebtoken');

// JWT Token oluştur
const generateToken = (user, userType = 'teacher') => {
  return jwt.sign(
    { 
      id: user._id,
      userType: userType
    },
    process.env.JWT_SECRET,
    {
      expiresIn: process.env.JWT_EXPIRE || '7d'
    }
  );
};

// Token yanıtı gönder
const sendTokenResponse = (user, statusCode, res, userType = 'teacher') => {
  // Token oluştur
  const token = generateToken(user, userType);

  const options = {
    expires: new Date(
      Date.now() + (process.env.JWT_COOKIE_EXPIRE || 7) * 24 * 60 * 60 * 1000
    ),
    httpOnly: true,
    sameSite: 'lax'
  };

  if (process.env.NODE_ENV === 'production') {
    options.secure = true;
  }

  // Şifreyi çıktıdan kaldır
  user.sifre = undefined;
  user.password = undefined;

  // Yanıt verisi kullanıcı tipine göre düzenle
  let userData = {
    id: user._id,
    userType: userType,
    avatar: user.avatar,
    slug: user.slug,
    isActive: user.isActive,
    lastLogin: user.lastLogin
  };

  // Öğrenci için özel alanlar
  if (userType === 'student') {
    userData = {
      ...userData,
      ad: user.ad,
      soyad: user.soyad,
      tamAd: user.tamAd,
      numara: user.numara,
      sinif: user.sinif,
      email: user.email,
      telefon: user.telefon,
      ogretmenId: user.ogretmenId,
      ortalamaNot: user.ortalamaNot,
      tamamlananOdevSayisi: user.tamamlananOdevSayisi,
      bekleyenOdevSayisi: user.bekleyenOdevSayisi
    };
  }
  // Öğretmen için özel alanlar
  else if (userType === 'teacher' || userType === 'admin') {
    userData = {
      ...userData,
      name: user.name,
      surname: user.surname,
      fullName: user.fullName,
      email: user.email,
      phone: user.phone,
      department: user.department,
      address: user.address,
      userType: userType,
      isActive: user.isActive,
      lastLogin: user.lastLogin
    };
  }

  const responseData = {
    success: true,
    message: userType === 'student' ? 'Öğrenci girişi başarılı' : 'Öğretmen girişi başarılı',
    data: {
      token,
      user: userData
    }
  };

  res
    .status(statusCode)
    .cookie('token', token, options)
    .json(responseData);
};

// Token'ı doğrula
const verifyToken = (token) => {
  try {
    return jwt.verify(token, process.env.JWT_SECRET);
  } catch (error) {
    return null;
  }
};

// Token'ı doğrulamadan çöz (süresi dolmuş token'lar için)
const decodeToken = (token) => {
  try {
    return jwt.decode(token);
  } catch (error) {
    return null;
  }
};

module.exports = {
  generateToken,
  sendTokenResponse,
  verifyToken,
  decodeToken
}; 