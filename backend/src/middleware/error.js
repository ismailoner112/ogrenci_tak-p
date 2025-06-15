const errorHandler = (err, req, res, next) => {
  let error = { ...err };
  error.message = err.message;

  // Hatayı logla
  console.error(err);

  // Mongoose geçersiz ObjectId
  if (err.name === 'CastError') {
    const message = 'Kaynak bulunamadı';
    error = { message, statusCode: 404 };
  }

  // Mongoose benzersizlik hatası
  if (err.code === 11000) {
    const message = 'Bu bilgiler zaten kayıtlı';
    error = { message, statusCode: 400 };
  }

  // Mongoose doğrulama hatası
  if (err.name === 'ValidationError') {
    const message = Object.values(err.errors).map(val => val.message);
    error = { message, statusCode: 400 };
  }

  // JWT hataları
  if (err.name === 'JsonWebTokenError') {
    const message = 'Geçersiz token';
    error = { message, statusCode: 401 };
  }

  if (err.name === 'TokenExpiredError') {
    const message = 'Token süresi dolmuş';
    error = { message, statusCode: 401 };
  }

  res.status(error.statusCode || 500).json({
    success: false,
    error: error.message || 'Server Hatası'
  });
};

module.exports = errorHandler; 