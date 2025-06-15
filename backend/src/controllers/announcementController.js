const Announcement = require('../models/Announcement');
const User = require('../models/User');
const Student = require('../models/Student');
const { validationResult } = require('express-validator');

// Helper function for error handling
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

// @desc    Tüm duyuruları getir (public)
// @route   GET /api/announcements
// @access  Public
const getAnnouncements = asyncHandler(async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;
  const skip = (page - 1) * limit;

  // Filtreleme seçenekleri
  const filter = { 
    isActive: true,
    publishDate: { $lte: new Date() }
  };

  // Süresi geçmemiş duyurular
  filter.$or = [
    { expiryDate: { $exists: false } },
    { expiryDate: null },
    { expiryDate: { $gte: new Date() } }
  ];

  if (req.query.priority) {
    filter.priority = req.query.priority;
  }

  if (req.query.search) {
    filter.$and = filter.$and || [];
    filter.$and.push({
      $or: [
        { title: { $regex: req.query.search, $options: 'i' } },
        { content: { $regex: req.query.search, $options: 'i' } }
      ]
    });
  }

  const announcements = await Announcement.find(filter)
    .populate('author', 'name surname email')
    .sort({ publishDate: -1, priority: -1 })
    .skip(skip)
    .limit(limit);

  const totalAnnouncements = await Announcement.countDocuments(filter);

  res.status(200).json({
    success: true,
    count: announcements.length,
    totalCount: totalAnnouncements,
    totalPages: Math.ceil(totalAnnouncements / limit),
    currentPage: page,
    data: announcements
  });
});

// @desc    Duyuru detayını getir
// @route   GET /api/announcements/:id
// @access  Public
const getAnnouncementById = asyncHandler(async (req, res) => {
  const announcement = await Announcement.findById(req.params.id)
    .populate('author', 'name surname email')
    .populate('comments.user', 'name surname')
    .populate('likes.user', 'name surname');

  if (!announcement) {
    return res.status(404).json({
      success: false,
      message: 'Duyuru bulunamadı'
    });
  }

  // Görüntüleme sayısını artır
  await announcement.incrementViewCount();

  res.status(200).json({
    success: true,
    data: announcement
  });
});

// @desc    Yeni duyuru oluştur
// @route   POST /api/announcements
// @access  Özel (Teacher/Admin)
const createAnnouncement = asyncHandler(async (req, res) => {
  // Doğrulama hatalarını kontrol et
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: 'Girilen bilgilerde hata var',
      errors: errors.array()
    });
  }

  const { 
    title, content, targetAudience, targetClass, 
    priority, expiryDate, tags 
  } = req.body;

  // Duyuru oluştur
  const announcement = await Announcement.create({
    title,
    content,
    author: req.user._id,
    targetAudience: targetAudience || 'all',
    targetClass,
    priority: priority || 'medium',
    expiryDate,
    tags: tags || []
  });

  const populatedAnnouncement = await Announcement.findById(announcement._id)
    .populate('author', 'name surname email');

  res.status(201).json({
    success: true,
    message: 'Duyuru başarıyla oluşturuldu',
    data: populatedAnnouncement
  });
});

// @desc    Duyuru güncelle
// @route   PUT /api/announcements/:id
// @access  Özel (Teacher/Admin)
const updateAnnouncement = asyncHandler(async (req, res) => {
  const announcement = await Announcement.findById(req.params.id);

  if (!announcement) {
    return res.status(404).json({
      success: false,
      message: 'Duyuru bulunamadı'
    });
  }

  // Yetki kontrolü: Sadece duyuru sahibi veya admin güncelleyebilir
  if (announcement.author.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
    return res.status(403).json({
      success: false,
      message: 'Bu duyuruyu güncelleme yetkiniz yok'
    });
  }

  // Güncellenebilir alanlar
  const allowedFields = ['title', 'content', 'targetAudience', 'targetClass', 'priority', 'expiryDate', 'tags', 'isActive'];
  const updateData = {};
  
  allowedFields.forEach(field => {
    if (req.body[field] !== undefined) {
      updateData[field] = req.body[field];
    }
  });

  const updatedAnnouncement = await Announcement.findByIdAndUpdate(
    req.params.id,
    updateData,
    { new: true, runValidators: true }
  ).populate('author', 'name surname email');

  res.status(200).json({
    success: true,
    message: 'Duyuru güncellendi',
    data: updatedAnnouncement
  });
});

// @desc    Duyuru sil
// @route   DELETE /api/announcements/:id
// @access  Özel (Teacher/Admin)
const deleteAnnouncement = asyncHandler(async (req, res) => {
  const announcement = await Announcement.findById(req.params.id);

  if (!announcement) {
    return res.status(404).json({
      success: false,
      message: 'Duyuru bulunamadı'
    });
  }

  // Yetki kontrolü: Sadece duyuru sahibi veya admin silebilir
  if (announcement.author.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
    return res.status(403).json({
      success: false,
      message: 'Bu duyuruyu silme yetkiniz yok'
    });
  }

  await Announcement.findByIdAndDelete(req.params.id);

  res.status(200).json({
    success: true,
    message: 'Duyuru silindi'
  });
});

// @desc    Duyuruya yorum ekle
// @route   POST /api/announcements/:id/comments
// @access  Özel (User)
const addComment = asyncHandler(async (req, res) => {
  const { content } = req.body;

  if (!content || content.trim().length === 0) {
    return res.status(400).json({
      success: false,
      message: 'Yorum içeriği gereklidir'
    });
  }

  const announcement = await Announcement.findById(req.params.id);

  if (!announcement) {
    return res.status(404).json({
      success: false,
      message: 'Duyuru bulunamadı'
    });
  }

  await announcement.addComment(req.user._id, content.trim());

  const updatedAnnouncement = await Announcement.findById(req.params.id)
    .populate('comments.user', 'name surname');

  res.status(200).json({
    success: true,
    message: 'Yorum eklendi',
    data: updatedAnnouncement
  });
});

// @desc    Duyuruyu beğen/beğenme
// @route   POST /api/announcements/:id/like
// @access  Özel (User)
const toggleLike = asyncHandler(async (req, res) => {
  const announcement = await Announcement.findById(req.params.id);

  if (!announcement) {
    return res.status(404).json({
      success: false,
      message: 'Duyuru bulunamadı'
    });
  }

  await announcement.toggleLike(req.user._id);

  const updatedAnnouncement = await Announcement.findById(req.params.id)
    .populate('likes.user', 'name surname');

  const isLiked = updatedAnnouncement.likes.some(
    like => like.user._id.toString() === req.user._id.toString()
  );

  res.status(200).json({
    success: true,
    message: isLiked ? 'Duyuru beğenildi' : 'Beğeni kaldırıldı',
    data: {
      likeCount: updatedAnnouncement.likeCount,
      isLiked
    }
  });
});

// @desc    Öğretmenin duyurularını getir
// @route   GET /api/teacher/announcements
// @access  Özel (Teacher)
const getMyAnnouncements = asyncHandler(async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;
  const skip = (page - 1) * limit;

  const filter = { author: req.user._id };

  if (req.query.isActive !== undefined) {
    filter.isActive = req.query.isActive === 'true';
  }

  const announcements = await Announcement.find(filter)
    .populate('author', 'name surname email')
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit);

  const totalAnnouncements = await Announcement.countDocuments(filter);

  res.status(200).json({
    success: true,
    count: announcements.length,
    totalCount: totalAnnouncements,
    totalPages: Math.ceil(totalAnnouncements / limit),
    currentPage: page,
    data: announcements
  });
});

module.exports = {
  getAnnouncements,
  getAnnouncementById,
  createAnnouncement,
  updateAnnouncement,
  deleteAnnouncement,
  addComment,
  toggleLike,
  getMyAnnouncements
}; 