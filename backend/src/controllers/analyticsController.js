

const asyncHandler = require('express-async-handler');
const { OnlineUser, Visitor, DailyStats, SiteStats } = require('../models/Analytics');
const { getOnlineStats } = require('../middleware/visitorTracking');
const User = require('../models/User');
const Student = require('../models/Student');
const News = require('../models/News');
const Gallery = require('../models/Gallery');

// @desc    Online kullanıcı sayısını getir
// @route   GET /api/analytics/online
// @access  Public
const getOnlineUsers = asyncHandler(async (req, res) => {
  const stats = await getOnlineStats();
  
  res.json({
    success: true,
    data: stats
  });
});


const getSiteStats = asyncHandler(async (req, res) => {
  try {
    console.log('Analytics site-stats endpoint called');
    
    // Toplam sayıları hesapla
    const [
      totalUsers,
      totalTeachers, 
      totalStudents,
      totalNews,
      totalGalleries,
      totalVisitors,
      onlineStats
    ] = await Promise.all([
      User.countDocuments().catch(err => { console.error('User count error:', err); return 0; }),
      User.countDocuments({ userType: 'teacher' }).catch(err => { console.error('Teacher count error:', err); return 0; }),
      Student.countDocuments().catch(err => { console.error('Student count error:', err); return 0; }),
      News.countDocuments().catch(err => { console.error('News count error:', err); return 0; }),
      Gallery.countDocuments().catch(err => { console.error('Gallery count error:', err); return 0; }),
      Visitor.countDocuments().catch(err => { console.error('Visitor count error:', err); return 0; }),
      getOnlineStats().catch(err => { console.error('Online stats error:', err); return { total: 0, guests: 0, students: 0, teachers: 0, admins: 0 }; })
    ]);

    console.log('Calculated stats:', {
      totalUsers,
      totalTeachers,
      totalStudents,
      totalNews,
      totalGalleries,
      totalVisitors
    });

    // Toplam sayfa görüntüleme
    const pageViewsResult = await Visitor.aggregate([
      {
        $group: {
          _id: null,
          totalPageViews: { $sum: { $size: '$pages' } }
        }
      }
    ]).catch(err => { 
      console.error('Page views error:', err); 
      return [{ totalPageViews: 0 }]; 
    });

    const totalPageViews = pageViewsResult[0]?.totalPageViews || 0;

    // Site istatistiklerini güncelle
    await SiteStats.findOneAndUpdate(
      { _id: 'site_stats' },
      {
        totalUsers,
        totalTeachers,
        totalStudents,
        totalNews,
        totalGalleries,
        totalVisitors,
        totalPageViews,
        lastUpdated: new Date()
      },
      { upsert: true }
    ).catch(err => {
      console.error('Site stats update error:', err);
    });

    res.json({
      success: true,
      data: {
        totalUsers,
        totalTeachers,
        totalStudents,
        totalNews,
        totalGalleries,
        totalVisitors,
        totalPageViews,
        onlineUsers: onlineStats,
        lastUpdated: new Date()
      }
    });
  } catch (error) {
    console.error('getSiteStats error:', error);
    res.status(500).json({
      success: false,
      message: 'Sunucu hatası',
      error: error.message
    });
  }
});

// @desc    Bugünün istatistiklerini getir
// @route   GET /api/analytics/today
// @access  Public
const getTodayStats = asyncHandler(async (req, res) => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  // Bugünün ziyaretçi istatistikleri
  const [todayStats] = await Visitor.getTodayStats();

  // Online kullanıcılar
  const onlineStats = await getOnlineStats();

  // Bugünün popüler sayfaları
  const popularPages = await Visitor.aggregate([
    {
      $match: {
        lastVisit: { $gte: today, $lt: tomorrow }
      }
    },
    {
      $unwind: '$pages'
    },
    {
      $match: {
        'pages.visitTime': { $gte: today, $lt: tomorrow }
      }
    },
    {
      $group: {
        _id: '$pages.url',
        title: { $first: '$pages.title' },
        views: { $sum: 1 }
      }
    },
    {
      $sort: { views: -1 }
    },
    {
      $limit: 10
    },
    {
      $project: {
        url: '$_id',
        title: 1,
        views: 1,
        _id: 0
      }
    }
  ]);

  // Cihaz istatistikleri
  const deviceStats = await Visitor.aggregate([
    {
      $match: {
        lastVisit: { $gte: today, $lt: tomorrow }
      }
    },
    {
      $group: {
        _id: '$device',
        count: { $sum: 1 }
      }
    }
  ]);

  // Tarayıcı istatistikleri
  const browserStats = await Visitor.aggregate([
    {
      $match: {
        lastVisit: { $gte: today, $lt: tomorrow }
      }
    },
    {
      $group: {
        _id: '$browser.name',
        count: { $sum: 1 }
      }
    }
  ]);

  // Lokasyon istatistikleri
  const locationStats = await Visitor.aggregate([
    {
      $match: {
        lastVisit: { $gte: today, $lt: tomorrow }
      }
    },
    {
      $group: {
        _id: '$location.country',
        count: { $sum: 1 }
      }
    },
    {
      $sort: { count: -1 }
    },
    {
      $limit: 10
    }
  ]);

  res.json({
    success: true,
    data: {
      ...todayStats,
      onlineUsers: onlineStats,
      popularPages,
      deviceStats,
      browserStats,
      locationStats
    }
  });
});

// @desc    Haftalık istatistikleri getir
// @route   GET /api/analytics/weekly
// @access  Admin/Teacher
const getWeeklyStats = asyncHandler(async (req, res) => {
  const endDate = new Date();
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - 7);

  const weeklyStats = await Visitor.aggregate([
    {
      $match: {
        lastVisit: { $gte: startDate, $lte: endDate }
      }
    },
    {
      $group: {
        _id: {
          year: { $year: '$lastVisit' },
          month: { $month: '$lastVisit' },
          day: { $dayOfMonth: '$lastVisit' }
        },
        visitors: { $sum: 1 },
        uniqueIPs: { $addToSet: '$ip' },
        pageViews: { $sum: { $size: '$pages' } }
      }
    },
    {
      $project: {
        date: {
          $dateFromParts: {
            year: '$_id.year',
            month: '$_id.month',
            day: '$_id.day'
          }
        },
        visitors: 1,
        uniqueVisitors: { $size: '$uniqueIPs' },
        pageViews: 1,
        _id: 0
      }
    },
    {
      $sort: { date: 1 }
    }
  ]);

  res.json({
    success: true,
    data: weeklyStats
  });
});

// @desc    Aylık istatistikleri getir
// @route   GET /api/analytics/monthly
// @access  Admin/Teacher
const getMonthlyStats = asyncHandler(async (req, res) => {
  const endDate = new Date();
  const startDate = new Date();
  startDate.setMonth(startDate.getMonth() - 1);

  const monthlyStats = await Visitor.aggregate([
    {
      $match: {
        lastVisit: { $gte: startDate, $lte: endDate }
      }
    },
    {
      $group: {
        _id: {
          year: { $year: '$lastVisit' },
          month: { $month: '$lastVisit' },
          day: { $dayOfMonth: '$lastVisit' }
        },
        visitors: { $sum: 1 },
        uniqueIPs: { $addToSet: '$ip' },
        pageViews: { $sum: { $size: '$pages' } },
        newVisitors: {
          $sum: {
            $cond: [{ $eq: ['$visitCount', 1] }, 1, 0]
          }
        }
      }
    },
    {
      $project: {
        date: {
          $dateFromParts: {
            year: '$_id.year',
            month: '$_id.month',
            day: '$_id.day'
          }
        },
        visitors: 1,
        uniqueVisitors: { $size: '$uniqueIPs' },
        pageViews: 1,
        newVisitors: 1,
        _id: 0
      }
    },
    {
      $sort: { date: 1 }
    }
  ]);

  res.json({
    success: true,
    data: monthlyStats
  });
});

// @desc    Sayfa popülerlik istatistikleri
// @route   GET /api/analytics/popular-pages
// @access  Admin/Teacher
const getPopularPages = asyncHandler(async (req, res) => {
  const days = parseInt(req.query.days) || 7;
  const limit = parseInt(req.query.limit) || 20;

  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);

  const popularPages = await Visitor.aggregate([
    {
      $match: {
        lastVisit: { $gte: startDate }
      }
    },
    {
      $unwind: '$pages'
    },
    {
      $match: {
        'pages.visitTime': { $gte: startDate }
      }
    },
    {
      $group: {
        _id: '$pages.url',
        title: { $first: '$pages.title' },
        views: { $sum: 1 },
        uniqueVisitors: { $addToSet: '$ip' }
      }
    },
    {
      $project: {
        url: '$_id',
        title: 1,
        views: 1,
        uniqueVisitors: { $size: '$uniqueVisitors' },
        _id: 0
      }
    },
    {
      $sort: { views: -1 }
    },
    {
      $limit: limit
    }
  ]);

  res.json({
    success: true,
    data: popularPages
  });
});

// @desc    Referrer istatistikleri
// @route   GET /api/analytics/referrers
// @access  Admin/Teacher
const getReferrerStats = asyncHandler(async (req, res) => {
  const days = parseInt(req.query.days) || 7;
  const limit = parseInt(req.query.limit) || 10;

  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);

  const referrerStats = await Visitor.aggregate([
    {
      $match: {
        lastVisit: { $gte: startDate },
        referrer: { $ne: 'direct' }
      }
    },
    {
      $group: {
        _id: '$referrer',
        visitors: { $sum: 1 },
        uniqueIPs: { $addToSet: '$ip' }
      }
    },
    {
      $project: {
        referrer: '$_id',
        visitors: 1,
        uniqueVisitors: { $size: '$uniqueIPs' },
        _id: 0
      }
    },
    {
      $sort: { visitors: -1 }
    },
    {
      $limit: limit
    }
  ]);

  res.json({
    success: true,
    data: referrerStats
  });
});

// @desc    Anlık online kullanıcı detayları
// @route   GET /api/analytics/online-details
// @access  Admin/Teacher
const getOnlineDetails = asyncHandler(async (req, res) => {
  const onlineUsers = await OnlineUser.find({
    lastActivity: { $gte: new Date(Date.now() - 30 * 60 * 1000) }
  })
  .populate('userId', 'name surname email')
  .populate('teacherId', 'ad soyad email')
  .populate('studentId', 'ad soyad numara')
  .sort({ lastActivity: -1 })
  .lean();

  const formattedUsers = onlineUsers.map(user => ({
    sessionId: user.sessionId,
    userRole: user.userRole,
    isAuthenticated: user.isAuthenticated,
    currentPage: user.currentPage,
    lastActivity: user.lastActivity,
    loginTime: user.loginTime,
    ip: user.ip,
    location: user.location,
    device: user.device,
    browser: user.browser,
    os: user.os,
    user: user.userId || user.teacherId || user.studentId || null
  }));

  res.json({
    success: true,
    data: formattedUsers
  });
});

// @desc    Dashboard özet istatistikleri
// @route   GET /api/analytics/dashboard
// @access  Admin/Teacher
const getDashboardStats = asyncHandler(async (req, res) => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  const [
    siteStats,
    todayStats,
    yesterdayStats,
    onlineStats
  ] = await Promise.all([
    SiteStats.findOne({ _id: 'site_stats' }) || {},
    Visitor.getTodayStats(),
    Visitor.aggregate([
      {
        $match: {
          lastVisit: { $gte: yesterday, $lt: today }
        }
      },
      {
        $group: {
          _id: null,
          totalVisitors: { $sum: 1 },
          uniqueIPs: { $addToSet: '$ip' },
          totalPageViews: { $sum: { $size: '$pages' } }
        }
      },
      {
        $project: {
          _id: 0,
          totalVisitors: 1,
          uniqueVisitors: { $size: '$uniqueIPs' },
          totalPageViews: 1
        }
      }
    ]),
    getOnlineStats()
  ]);

  const todayData = todayStats[0] || { totalVisitors: 0, uniqueVisitors: 0, totalPageViews: 0 };
  const yesterdayData = yesterdayStats[0] || { totalVisitors: 0, uniqueVisitors: 0, totalPageViews: 0 };

  // Değişim yüzdelerini hesapla
  const visitorChange = yesterdayData.totalVisitors > 0 
    ? ((todayData.totalVisitors - yesterdayData.totalVisitors) / yesterdayData.totalVisitors * 100).toFixed(1)
    : 0;

  const pageViewChange = yesterdayData.totalPageViews > 0
    ? ((todayData.totalPageViews - yesterdayData.totalPageViews) / yesterdayData.totalPageViews * 100).toFixed(1)
    : 0;

  res.json({
    success: true,
    data: {
      overview: {
        totalVisitors: siteStats.totalVisitors || 0,
        totalPageViews: siteStats.totalPageViews || 0,
        totalUsers: siteStats.totalUsers || 0,
        totalTeachers: siteStats.totalTeachers || 0,
        totalStudents: siteStats.totalStudents || 0
      },
      today: {
        ...todayData,
        visitorChange: parseFloat(visitorChange),
        pageViewChange: parseFloat(pageViewChange)
      },
      online: onlineStats
    }
  });
});

module.exports = {
  getOnlineUsers,
  getSiteStats,
  getTodayStats,
  getWeeklyStats,
  getMonthlyStats,
  getPopularPages,
  getReferrerStats,
  getOnlineDetails,
  getDashboardStats
}; 