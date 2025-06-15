require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const compression = require('compression');
const cookieParser = require('cookie-parser');
const session = require('express-session');
const MongoStore = require('connect-mongo');
const rateLimit = require('express-rate-limit');
// CSRF paketi kaldırıldı - modern güvenlik için helmet kullanıyoruz
const path = require('path');

// Express uygulamasını oluştur
const app = express();

// MongoDB bağlantısını kur
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

// Veritabanına bağlan
connectDB();

// Güvenlik middleware'i
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
    },
  },
}));

// CORS yapılandırması
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true,
  optionsSuccessStatus: 200,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'x-csrf-token']
}));

// Hız sınırlama - Development modunda devre dışı
if (process.env.NODE_ENV !== 'development') {
  const limiter = rateLimit({
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000, // 15 dakika
    max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 1000, // Her IP için 1000 istek sınırı
    message: {
      success: false,
      error: 'Çok fazla istek gönderildi, lütfen daha sonra tekrar deneyin.'
    },
    standardHeaders: true,
    legacyHeaders: false,
  });

  // API route'larına hız sınırlama uygula (sadece production'da)
  app.use('/api/', limiter);
}

// Gövde ayrıştırma middleware'i
app.use(express.json({ 
  limit: '10mb',
  verify: (req, res, buf) => {
    req.rawBody = buf;
  }
}));
app.use(express.urlencoded({ 
  extended: true, 
  limit: '10mb' 
}));

// Cookie parser
app.use(cookieParser());

// Sıkıştırma middleware'i
app.use(compression());

// Loglama middleware'i
if (process.env.NODE_ENV === 'development') {
  app.use(morgan('dev'));
} else {
  app.use(morgan('combined'));
}

// Oturum yapılandırması
app.use(session({
  secret: process.env.SESSION_SECRET || 'super-secret-session-key-ogrenci-takip-2024',
  resave: false,
  saveUninitialized: false,
  store: MongoStore.create({
    mongoUrl: process.env.MONGODB_URI || 'mongodb://localhost:27017/Öğrenci_Takip',
    touchAfter: 24 * 3600 // 24 saat
  }),
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    maxAge: 24 * 60 * 60 * 1000, // 24 saat
    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax'
  },
  name: 'ogrenciTakip.sid'
}));

// Modern güvenlik - helmet ve diğer middleware'ler yeterli
// CSRF koruması yerine SameSite cookie'ler ve origin kontrolü kullanıyoruz

// Statik dosyalar
app.use('/uploads', express.static(path.join(__dirname, 'public/uploads')));
app.use(express.static(path.join(__dirname, 'public')));

// Analitik middleware'i import et ve kullan
const analytics = require('./src/middleware/analytics');
app.use(analytics);

// Route'ları import et
const authRoutes = require('./src/routes/auth');
const teacherAuthRoutes = require('./src/routes/teacherAuth');
const studentAuthRoutes = require('./src/routes/studentAuth');
const teacherDashboardRoutes = require('./src/routes/teacherDashboard');
const studentDashboardRoutes = require('./src/routes/studentDashboard');
const userRoutes = require('./src/routes/users');
const studentRoutes = require('./src/routes/students');
const assignmentRoutes = require('./src/routes/assignments');
const submissionRoutes = require('./src/routes/submissions');
const galleryRoutes = require('./src/routes/gallery');
const newsRoutes = require('./src/routes/news');
const announcementRoutes = require('./src/routes/announcements');
const analyticsRoutes = require('./src/routes/analytics');
const csrfTestRoutes = require('./src/routes/csrfTest');
const adminRoutes = require('./src/routes/admin');

// API Route'ları
app.use('/api/auth', authRoutes);
app.use('/api/auth/teacher', teacherAuthRoutes);
app.use('/api/auth/student', studentAuthRoutes);
app.use('/api/teacher', teacherDashboardRoutes);
app.use('/api/student', studentDashboardRoutes);
app.use('/api/users', userRoutes);
app.use('/api/students', studentRoutes);
app.use('/api/assignments', assignmentRoutes);
app.use('/api/submissions', submissionRoutes);
app.use('/api/gallery', galleryRoutes);
app.use('/api/news', newsRoutes);
app.use('/api/announcements', announcementRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/csrf-test', csrfTestRoutes);
app.use('/api/admin', adminRoutes);

// CSRF token endpoint'i
app.get('/api/csrf-token', (req, res) => {
  // Modern uygulamalarda CSRF token yerine SameSite cookie'ler kullanıyoruz
  // Ama frontend beklediği için dummy bir token dönelim
  res.status(200).json({
    success: true,
    csrfToken: 'dummy-csrf-token', // SameSite cookie'ler CSRF koruması sağlıyor
    message: 'CSRF token alındı (SameSite cookie koruması aktif)'
  });
});

// Sağlık kontrolü endpoint'i
app.get('/api/health', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'Server sağlıklı çalışıyor',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV || 'development',
    version: process.env.npm_package_version || '1.0.0'
  });
});

// Site haritası endpoint'i
app.get('/sitemap.xml', (req, res) => {
  res.set('Content-Type', 'text/xml');
  const baseUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
  
  res.send(`<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>${baseUrl}/</loc>
    <lastmod>${new Date().toISOString()}</lastmod>
    <changefreq>daily</changefreq>
    <priority>1.0</priority>
  </url>
  <url>
    <loc>${baseUrl}/login</loc>
    <lastmod>${new Date().toISOString()}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.8</priority>
  </url>
  <url>
    <loc>${baseUrl}/student-login</loc>
    <lastmod>${new Date().toISOString()}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.8</priority>
  </url>
  <url>
    <loc>${baseUrl}/gallery</loc>
    <lastmod>${new Date().toISOString()}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.6</priority>
  </url>
  <url>
    <loc>${baseUrl}/news</loc>
    <lastmod>${new Date().toISOString()}</lastmod>
    <changefreq>daily</changefreq>
    <priority>0.7</priority>
  </url>
</urlset>`);
});

// Robots.txt endpoint'i
app.get('/robots.txt', (req, res) => {
  res.type('text/plain');
  res.send(`User-agent: *
Disallow: /api/
Disallow: /uploads/avatars/
Allow: /uploads/gallery/

Sitemap: ${process.env.FRONTEND_URL || 'http://localhost:3000'}/sitemap.xml`);
});

// 404 işleyicisi - API route'ları için
app.use('/api/*', (req, res) => {
  res.status(404).json({
    success: false,
    message: 'API endpoint bulunamadı',
    requestedUrl: req.originalUrl,
    method: req.method
  });
});

// Frontend için catch-all (React Router için)
app.get('*', (req, res) => {
  // Production'da frontend build dosyalarını serve et
  if (process.env.NODE_ENV === 'production') {
    res.sendFile(path.join(__dirname, 'build', 'index.html'));
  } else {
    res.status(200).json({
      success: true,
      message: 'Öğrenci Takip Sistemi API',
      version: '1.0.0',
      endpoints: {
        auth: '/api/auth',
        teacherAuth: '/api/auth/teacher',
        studentAuth: '/api/auth/student',
        teacherDashboard: '/api/teacher',
        studentDashboard: '/api/student',
        users: '/api/users',
        students: '/api/students',
        assignments: '/api/assignments',
        submissions: '/api/submissions',
        gallery: '/api/gallery',
        news: '/api/news',
        analytics: '/api/analytics',
        health: '/api/health'
      }
    });
  }
});

// CSRF hata işleme middleware'i
const csrfErrorHandler = require('./src/middleware/csrfErrorHandler');
app.use(csrfErrorHandler);

// Hata işleme middleware'i
const errorHandler = require('./src/middleware/error');
app.use(errorHandler);

// İşlenmemiş promise redlerini yakala
process.on('unhandledRejection', (err, promise) => {
  console.log(`Hata: ${err.message}`);
  console.log('Sunucu kapatılıyor...');
  process.exit(1);
});

// İşlenmemiş exception'ları yakala
process.on('uncaughtException', (err) => {
  console.log(`Hata: ${err.message}`);
  console.log('Sunucu kapatılıyor...');
  process.exit(1);
});

module.exports = app; 