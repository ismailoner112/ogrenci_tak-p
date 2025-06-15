const mongoose = require('mongoose');
require('dotenv').config();

const connectDB = async () => {
  try {
    const mongoURI = process.env.MONGODB_URI || 'mongodb://localhost:27017/Öğrenci_Takip';
    
    const conn = await mongoose.connect(mongoURI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });

    console.log(`MongoDB Bağlandı: ${conn.connection.host}`);
    
    // Bağlantı olaylarını dinle
    mongoose.connection.on('error', (err) => {
      console.log('MongoDB bağlantı hatası:', err);
    });

    mongoose.connection.on('disconnected', () => {
      console.log('MongoDB bağlantısı kesildi');
    });

    // Uygulamanın düzgün kapatılması
    process.on('SIGINT', async () => {
      await mongoose.connection.close();
      console.log('MongoDB bağlantısı kapatıldı');
      process.exit(0);
    });

  } catch (error) {
    console.error('MongoDB bağlantı hatası:', error);
    process.exit(1);
  }
};

module.exports = connectDB; 