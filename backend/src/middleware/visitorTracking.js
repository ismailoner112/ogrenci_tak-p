/**
 * Visitor Tracking Middleware
 * Her istek için ziyaretçi takibi yapar
 */

const geoip = require('geoip-lite');
const useragent = require('useragent');
const { OnlineUser, Visitor, SiteStats } = require('../models/Analytics');

// Bot listesi
const BOT_PATTERNS = [
  /bot/i, /crawler/i, /spider/i, /scraper/i,
  /googlebot/i, /bingbot/i, /slurp/i, /duckduckbot/i,
  /baiduspider/i, /yandexbot/i, /facebookexternalhit/i,
  /twitterbot/i, /linkedinbot/i, /whatsapp/i,
  /telegrambot/i, /applebot/i, /curl/i, /wget/i
];

// IP adresini al
const getClientIP = (req) => {
  return req.headers['x-forwarded-for'] ||
         req.headers['x-real-ip'] ||
         req.connection.remoteAddress ||
         req.socket.remoteAddress ||
         (req.connection.socket ? req.connection.socket.remoteAddress : null) ||
         req.ip ||
         '127.0.0.1';
};

// User agent analizi
const analyzeUserAgent = (userAgentString) => {
  const agent = useragent.parse(userAgentString);
  
  // Cihaz tipini belirle
  let device = 'unknown';
  if (userAgentString) {
    if (/Mobile|Android|iPhone|iPad/.test(userAgentString)) {
      device = /iPad/.test(userAgentString) ? 'tablet' : 'mobile';
    } else {
      device = 'desktop';
    }
  }

  return {
    browser: {
      name: agent.family || 'Unknown',
      version: agent.toVersion() || 'Unknown'
    },
    os: {
      name: agent.os.family || 'Unknown',
      version: agent.os.toVersion() || 'Unknown'
    },
    device
  };
};

// Lokasyon bilgisi al
const getLocationInfo = (ip) => {
  // Local IP'ler için varsayılan lokasyon
  if (ip === '127.0.0.1' || ip === '::1' || ip.startsWith('192.168.') || ip.startsWith('10.')) {
    return {
      country: 'Turkey',
      region: 'Local',
      city: 'Local',
      timezone: 'Europe/Istanbul',
      coordinates: [29.0, 41.0] // İstanbul koordinatları
    };
  }

  try {
    const geo = geoip.lookup(ip);
    if (geo) {
      return {
        country: geo.country || 'Unknown',
        region: geo.region || 'Unknown',
        city: geo.city || 'Unknown',
        timezone: geo.timezone || 'UTC',
        coordinates: geo.ll || [0, 0]
      };
    }
  } catch (error) {
    console.error('GeoIP lookup error:', error);
  }

  return {
    country: 'Unknown',
    region: 'Unknown',
    city: 'Unknown',
    timezone: 'UTC',
    coordinates: [0, 0]
  };
};

// Bot kontrolü
const isBot = (userAgentString) => {
  if (!userAgentString) return false;
  return BOT_PATTERNS.some(pattern => pattern.test(userAgentString));
};

// Kullanıcı rolünü belirle
const getUserRole = (req) => {
  if (req.user) {
    if (req.user.role === 'admin') return 'admin';
    if (req.user.role === 'teacher') return 'teacher';
    return 'teacher'; // User modeli teacher rolü için
  }
  if (req.student) return 'student';
  if (req.teacher) return 'teacher';
  return 'guest';
};

// Online kullanıcı takibi
const trackOnlineUser = async (req, res, next) => {
  try {
    // Statik dosyalar ve API health check'leri için skip
    if (req.path.startsWith('/uploads') || 
        req.path.startsWith('/favicon') ||
        req.path === '/api/health' ||
        req.path === '/robots.txt' ||
        req.path === '/sitemap.xml') {
      return next();
    }

    const ip = getClientIP(req);
    const userAgentString = req.get('User-Agent') || '';
    const sessionId = req.sessionID || `guest_${Date.now()}_${Math.random()}`;

    // Bot kontrolü
    if (isBot(userAgentString)) {
      return next();
    }

    const userAgentInfo = analyzeUserAgent(userAgentString);
    const location = getLocationInfo(ip);
    const userRole = getUserRole(req);
    const isAuthenticated = !!(req.user || req.student || req.teacher);

    // Kullanıcı ID'lerini belirle
    let userId = null, teacherId = null, studentId = null;
    
    if (req.user) {
      userId = req.user._id;
    } else if (req.teacher) {
      teacherId = req.teacher._id;
    } else if (req.student) {
      studentId = req.student._id;
    }

    // Online kullanıcı kaydını güncelle veya oluştur
    await OnlineUser.findOneAndUpdate(
      { sessionId },
      {
        $set: {
          sessionId,
          userId,
          teacherId,
          studentId,
          ip,
          userAgent: userAgentString,
          browser: userAgentInfo.browser,
          os: userAgentInfo.os,
          device: userAgentInfo.device,
          location,
          isAuthenticated,
          userRole,
          currentPage: req.path,
          lastActivity: new Date()
        },
        $setOnInsert: {
          loginTime: new Date()
        }
      },
      { 
        upsert: true, 
        new: true,
        setDefaultsOnInsert: true
      }
    );

    next();
  } catch (error) {
    console.error('Online user tracking error:', error);
    next(); // Hata olsa bile devam et
  }
};

// Ziyaretçi takibi
const trackVisitor = async (req, res, next) => {
  try {
    // API istekleri ve statik dosyalar için skip
    if (req.path.startsWith('/api') || 
        req.path.startsWith('/uploads') || 
        req.path.startsWith('/favicon') ||
        req.path === '/robots.txt' ||
        req.path === '/sitemap.xml') {
      return next();
    }

    const ip = getClientIP(req);
    const userAgentString = req.get('User-Agent') || '';
    const sessionId = req.sessionID || `guest_${Date.now()}_${Math.random()}`;
    const referrer = req.get('Referrer') || 'direct';

    // Bot kontrolü
    if (isBot(userAgentString)) {
      return next();
    }

    const userAgentInfo = analyzeUserAgent(userAgentString);
    const location = getLocationInfo(ip);

    // Kullanıcı ID'lerini belirle
    let userId = null, teacherId = null, studentId = null;
    
    if (req.user) {
      userId = req.user._id;
    } else if (req.teacher) {
      teacherId = req.teacher._id;
    } else if (req.student) {
      studentId = req.student._id;
    }

    // Mevcut ziyaretçi kaydını bul veya oluştur
    const visitor = await Visitor.findOneAndUpdate(
      { ip, sessionId },
      {
        $set: {
          lastVisit: new Date(),
          userAgent: userAgentString,
          browser: userAgentInfo.browser,
          os: userAgentInfo.os,
          device: userAgentInfo.device,
          location,
          userId,
          teacherId,
          studentId,
          isBot: false
        },
        $setOnInsert: {
          firstVisit: new Date(),
          visitCount: 0,
          referrer,
          pages: []
        }
      },
      { 
        upsert: true, 
        new: true,
        setDefaultsOnInsert: true
      }
    );

    // Sayfa ziyaretini ekle
    const pageTitle = req.get('X-Page-Title') || req.path;
    visitor.pages.push({
      url: req.path,
      title: pageTitle,
      visitTime: new Date()
    });

    // Ziyaret sayısını artır
    visitor.visitCount += 1;
    visitor.lastVisit = new Date();
    
    await visitor.save();

    // Genel site istatistiklerini güncelle
    await updateSiteStats();

    next();
  } catch (error) {
    console.error('Visitor tracking error:', error);
    next(); // Hata olsa bile devam et
  }
};

// Site istatistiklerini güncelle
const updateSiteStats = async () => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const todayVisitors = await Visitor.countDocuments({
      lastVisit: { $gte: today }
    });

    const totalPageViews = await Visitor.aggregate([
      {
        $group: {
          _id: null,
          total: { $sum: { $size: '$pages' } }
        }
      }
    ]);

    await SiteStats.findOneAndUpdate(
      { _id: 'site_stats' },
      {
        $set: {
          lastUpdated: new Date()
        },
        $inc: {
          totalPageViews: 1
        },
        $setOnInsert: {
          totalVisitors: todayVisitors,
          totalUsers: 0,
          totalTeachers: 0,
          totalStudents: 0,
          totalNews: 0,
          totalGalleries: 0
        }
      },
      { upsert: true }
    );
  } catch (error) {
    console.error('Site stats update error:', error);
  }
};

// Online kullanıcı sayısını al
const getOnlineStats = async () => {
  try {
    const totalOnline = await OnlineUser.getOnlineCount();
    const onlineByRole = await OnlineUser.getOnlineByRole();
    
    const stats = {
      total: totalOnline,
      guests: 0,
      students: 0,
      teachers: 0,
      admins: 0
    };

    onlineByRole.forEach(role => {
      stats[role._id + 's'] = role.count;
    });

    return stats;
  } catch (error) {
    console.error('Get online stats error:', error);
    return { total: 0, guests: 0, students: 0, teachers: 0, admins: 0 };
  }
};

// Günlük temizlik (eski kayıtları sil)
const cleanupOldRecords = async () => {
  try {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    // 30 gün önceki ziyaretçi kayıtlarını sil
    await Visitor.deleteMany({
      lastVisit: { $lt: thirtyDaysAgo }
    });

    // Online kullanıcılar otomatik TTL ile silinir
    console.log('Old visitor records cleaned up');
  } catch (error) {
    console.error('Cleanup error:', error);
  }
};

// Her gün çalıştır
setInterval(cleanupOldRecords, 24 * 60 * 60 * 1000); // 24 saat

module.exports = {
  trackOnlineUser,
  trackVisitor,
  getOnlineStats,
  updateSiteStats,
  cleanupOldRecords
}; 