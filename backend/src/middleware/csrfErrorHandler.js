/**
 * CSRF Hata Yönetimi Middleware
 */

const csrfErrorHandler = (err, req, res, next) => {
  // CSRF hatası kontrolü
  if (err.code === 'EBADCSRFTOKEN') {
    return res.status(403).json({
      success: false,
      error: 'Geçersiz CSRF token. Lütfen sayfayı yenileyin ve tekrar deneyin.',
      code: 'CSRF_TOKEN_INVALID',
      message: 'CSRF token doğrulaması başarısız oldu'
    });
  }

  // Diğer hataları bir sonraki middleware'e aktar
  next(err);
};

module.exports = csrfErrorHandler; 