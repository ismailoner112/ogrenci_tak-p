/**
 * Analytics Model
 * Ziyaretçi takibi ve analitik veriler
 */

const mongoose = require('mongoose');

// Online kullanıcılar şeması
const onlineUserSchema = new mongoose.Schema({
  sessionId: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  userId: {
    type: mongoose.Schema.ObjectId,
    ref: 'User',
    sparse: true // Anonim kullanıcılar için null olabilir
  },
  teacherId: {
    type: mongoose.Schema.ObjectId,
    ref: 'Teacher',
    sparse: true
  },
  studentId: {
    type: mongoose.Schema.ObjectId,
    ref: 'Student',
    sparse: true
  },
  ip: {
    type: String,
    required: true
  },
  userAgent: {
    type: String,
    required: true
  },
  browser: {
    name: String,
    version: String
  },
  os: {
    name: String,
    version: String
  },
  device: {
    type: String,
    enum: ['desktop', 'mobile', 'tablet', 'unknown'],
    default: 'unknown'
  },
  location: {
    country: String,
    region: String,
    city: String,
    timezone: String,
    coordinates: [Number] // [longitude, latitude]
  },
  isAuthenticated: {
    type: Boolean,
    default: false
  },
  userRole: {
    type: String,
    enum: ['admin', 'teacher', 'student', 'guest'],
    default: 'guest'
  },
  currentPage: {
    type: String,
    default: '/'
  },
  lastActivity: {
    type: Date,
    default: Date.now,
    expires: 1800 // 30 dakika sonra otomatik sil
  },
  loginTime: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Ziyaretçi takip şeması
const visitorSchema = new mongoose.Schema({
  ip: {
    type: String,
    required: true,
    index: true
  },
  sessionId: {
    type: String,
    required: true,
    index: true
  },
  firstVisit: {
    type: Date,
    default: Date.now
  },
  lastVisit: {
    type: Date,
    default: Date.now
  },
  visitCount: {
    type: Number,
    default: 1
  },
  totalDuration: {
    type: Number,
    default: 0 // saniye cinsinden
  },
  pages: [{
    url: String,
    title: String,
    visitTime: {
      type: Date,
      default: Date.now
    },
    duration: Number // saniye cinsinden
  }],
  referrer: {
    type: String,
    default: 'direct'
  },
  userAgent: {
    type: String,
    required: true
  },
  browser: {
    name: String,
    version: String
  },
  os: {
    name: String,
    version: String
  },
  device: {
    type: String,
    enum: ['desktop', 'mobile', 'tablet', 'unknown'],
    default: 'unknown'
  },
  location: {
    country: String,
    region: String,
    city: String,
    timezone: String,
    coordinates: [Number]
  },
  isBot: {
    type: Boolean,
    default: false
  },
  userId: {
    type: mongoose.Schema.ObjectId,
    ref: 'User',
    sparse: true
  },
  teacherId: {
    type: mongoose.Schema.ObjectId,
    ref: 'Teacher',
    sparse: true
  },
  studentId: {
    type: mongoose.Schema.ObjectId,
    ref: 'Student',
    sparse: true
  }
}, {
  timestamps: true
});

// Günlük istatistikler şeması
const dailyStatsSchema = new mongoose.Schema({
  date: {
    type: Date,
    required: true,
    unique: true,
    index: true
  },
  totalVisitors: {
    type: Number,
    default: 0
  },
  uniqueVisitors: {
    type: Number,
    default: 0
  },
  totalPageViews: {
    type: Number,
    default: 0
  },
  bounceRate: {
    type: Number,
    default: 0 // Yüzde olarak
  },
  avgSessionDuration: {
    type: Number,
    default: 0 // saniye cinsinden
  },
  newVisitors: {
    type: Number,
    default: 0
  },
  returningVisitors: {
    type: Number,
    default: 0
  },
  mobileVisitors: {
    type: Number,
    default: 0
  },
  desktopVisitors: {
    type: Number,
    default: 0
  },
  topPages: [{
    url: String,
    title: String,
    views: Number
  }],
  topReferrers: [{
    source: String,
    visitors: Number
  }],
  hourlyStats: [{
    hour: Number, // 0-23
    visitors: Number,
    pageViews: Number
  }]
}, {
  timestamps: true
});

// Genel site istatistikleri şeması
const siteStatsSchema = new mongoose.Schema({
  _id: {
    type: String,
    default: 'site_stats'
  },
  totalVisitors: {
    type: Number,
    default: 0
  },
  totalPageViews: {
    type: Number,
    default: 0
  },
  totalUsers: {
    type: Number,
    default: 0
  },
  totalTeachers: {
    type: Number,
    default: 0
  },
  totalStudents: {
    type: Number,
    default: 0
  },
  totalNews: {
    type: Number,
    default: 0
  },
  totalGalleries: {
    type: Number,
    default: 0
  },
  lastUpdated: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Indexler
onlineUserSchema.index({ lastActivity: 1 });
onlineUserSchema.index({ ip: 1, sessionId: 1 });
onlineUserSchema.index({ userId: 1 }, { sparse: true });
onlineUserSchema.index({ teacherId: 1 }, { sparse: true });
onlineUserSchema.index({ studentId: 1 }, { sparse: true });

visitorSchema.index({ ip: 1, sessionId: 1 }, { unique: true });
visitorSchema.index({ firstVisit: 1 });
visitorSchema.index({ lastVisit: 1 });
visitorSchema.index({ 'location.country': 1 });

dailyStatsSchema.index({ date: -1 });

// Virtual alanlar
visitorSchema.virtual('isNewVisitor').get(function() {
  return this.visitCount === 1;
});

visitorSchema.virtual('avgPageDuration').get(function() {
  if (this.pages.length === 0) return 0;
  const totalDuration = this.pages.reduce((sum, page) => sum + (page.duration || 0), 0);
  return Math.round(totalDuration / this.pages.length);
});

// Metodlar
onlineUserSchema.methods.updateActivity = function(page) {
  this.lastActivity = new Date();
  this.currentPage = page || this.currentPage;
  return this.save();
};

visitorSchema.methods.addPageVisit = function(url, title, duration) {
  this.pages.push({
    url,
    title,
    visitTime: new Date(),
    duration
  });
  this.lastVisit = new Date();
  this.visitCount += 1;
  if (duration) {
    this.totalDuration += duration;
  }
  return this.save();
};

// Static metodlar
onlineUserSchema.statics.getOnlineCount = function() {
  return this.countDocuments({
    lastActivity: { $gte: new Date(Date.now() - 30 * 60 * 1000) } // Son 30 dakika
  });
};

onlineUserSchema.statics.getOnlineByRole = function() {
  return this.aggregate([
    {
      $match: {
        lastActivity: { $gte: new Date(Date.now() - 30 * 60 * 1000) }
      }
    },
    {
      $group: {
        _id: '$userRole',
        count: { $sum: 1 }
      }
    }
  ]);
};

visitorSchema.statics.getTodayStats = function() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  return this.aggregate([
    {
      $match: {
        lastVisit: { $gte: today, $lt: tomorrow }
      }
    },
    {
      $group: {
        _id: null,
        totalVisitors: { $sum: 1 },
        uniqueIPs: { $addToSet: '$ip' },
        totalPageViews: { $sum: { $size: '$pages' } },
        avgDuration: { $avg: '$totalDuration' }
      }
    },
    {
      $project: {
        _id: 0,
        totalVisitors: 1,
        uniqueVisitors: { $size: '$uniqueIPs' },
        totalPageViews: 1,
        avgDuration: { $round: ['$avgDuration', 0] }
      }
    }
  ]);
};

module.exports = {
  OnlineUser: mongoose.model('OnlineUser', onlineUserSchema),
  Visitor: mongoose.model('Visitor', visitorSchema),
  DailyStats: mongoose.model('DailyStats', dailyStatsSchema),
  SiteStats: mongoose.model('SiteStats', siteStatsSchema)
}; 