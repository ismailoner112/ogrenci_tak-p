// Ana Express uygulamasını import et
const app = require('../app');

const PORT = process.env.PORT || 5000;

const server = app.listen(PORT, () => {
  console.log(`Server ${process.env.NODE_ENV} modunda ${PORT} portunda çalışıyor`);
});

// İşlenmemiş promise redlerini yakala
process.on('unhandledRejection', (err, promise) => {
  console.log(`Hata: ${err.message}`);
  // Sunucuyu kapat ve işlemi sonlandır
  server.close(() => {
    process.exit(1);
  });
});

module.exports = app; 