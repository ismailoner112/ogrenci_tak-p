/**
 * News Controller
 * Haber yönetimi işlemleri
 */

const asyncHandler = require('express-async-handler');
const { validationResult } = require('express-validator');
const News = require('../models/News');
const { deleteFile, processFileInfo } = require('../middleware/upload');

// @desc    Tüm haberleri getir
// @route   GET /api/news
// @access  Public
const getNews = asyncHandler(async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;
  const category = req.query.category;
  const search = req.query.search;
  const audience = req.query.audience;

  const query = { isPublished: true };

  // Kategori filtresi
  if (category && category !== 'all') {
    query.category = category;
  }

  // Hedef kitle filtresi
  if (audience && audience !== 'all') {
    query.targetAudience = { $in: [audience, 'all'] };
  }

  // Arama filtresi
  if (search) {
    query.$or = [
      { title: { $regex: search, $options: 'i' } },
      { content: { $regex: search, $options: 'i' } },
      { summary: { $regex: search, $options: 'i' } },
      { tags: { $in: [new RegExp(search, 'i')] } }
    ];
  }

  // Süresi dolmamış haberler
  query.$or = [
    { expiryDate: { $exists: false } },
    { expiryDate: null },
    { expiryDate: { $gte: new Date() } }
  ];

  const skip = (page - 1) * limit;

  const [news, total] = await Promise.all([
    News.find(query)
      .populate('author', 'name surname fullName avatar')
      .sort({ isPinned: -1, publishDate: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    News.countDocuments(query)
  ]);

  // URL'leri düzenle
  news.forEach(item => {
    if (item.featuredImage && item.featuredImage.filename) {
      item.featuredImage.url = `/uploads/news/${item.featuredImage.filename}`;
    }
  });

  res.json({
    success: true,
    data: news,
    pagination: {
      current: page,
      pages: Math.ceil(total / limit),
      total,
      hasNext: page < Math.ceil(total / limit),
      hasPrev: page > 1
    }
  });
});

// @desc    Tekil haber getir
// @route   GET /api/news/:id
// @access  Public
const getSingleNews = asyncHandler(async (req, res) => {
  const { id } = req.params;

  // ID veya slug ile ara
  const query = id.match(/^[0-9a-fA-F]{24}$/) ? { _id: id } : { slug: id };
  query.isPublished = true;

  const news = await News.findOne(query)
    .populate('author', 'name surname fullName avatar')
    .populate('comments.user', 'name surname fullName avatar')
    .lean();

  if (!news) {
    return res.status(404).json({
      success: false,
      message: 'Haber bulunamadı'
    });
  }

  // Süre kontrolü
  if (news.expiryDate && new Date() > news.expiryDate) {
    return res.status(404).json({
      success: false,
      message: 'Bu haberin süresi dolmuş'
    });
  }

  // Görüntülenme sayısını artır
  await News.findByIdAndUpdate(news._id, { $inc: { viewCount: 1 } });

  // URL'leri düzenle
  if (news.featuredImage && news.featuredImage.filename) {
    news.featuredImage.url = `/uploads/news/${news.featuredImage.filename}`;
  }

  res.json({
    success: true,
    data: news
  });
});

// @desc    Yeni haber oluştur
// @route   POST /api/news
// @access  Özel (Teacher/Admin)
const createNews = asyncHandler(async (req, res) => {
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
    title,
    content,
    summary,
    category,
    targetAudience = 'all',
    isPinned = false,
    isPublished = true,
    publishDate,
    expiryDate,
    tags = [],
    priority = 'medium',
    allowComments = true
  } = req.body;

  // Kapak fotoğrafını işle
  let featuredImage = {};
  if (req.file) {
    const imageInfo = processFileInfo(req.file);
    featuredImage = {
      ...imageInfo,
      alt: req.body.imageAlt || title,
      url: `/uploads/news/${req.file.filename}`
    };
  }

  // Haber oluştur
  const news = await News.create({
    title,
    content,
    summary,
    category,
    author: req.user._id,
    featuredImage: Object.keys(featuredImage).length > 0 ? featuredImage : undefined,
    targetAudience,
    isPinned,
    isPublished,
    publishDate: publishDate || Date.now(),
    expiryDate,
    tags: Array.isArray(tags) ? tags : tags.split(',').map(tag => tag.trim()),
    priority,
    allowComments
  });

  // Populate edilmiş veriyi getir
  const populatedNews = await News.findById(news._id)
    .populate('author', 'name surname fullName');

  res.status(201).json({
    success: true,
    message: 'Haber başarıyla oluşturuldu',
    data: populatedNews
  });
});

// @desc    Haber güncelle
// @route   PUT /api/news/:id
// @access  Özel (Teacher/Admin - Kendi haberi)
const updateNews = asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: 'Girilen bilgilerde hata var',
      errors: errors.array()
    });
  }

  const news = await News.findById(req.params.id);

  if (!news) {
    return res.status(404).json({
      success: false,
      message: 'Haber bulunamadı'
    });
  }

  // Yetki kontrolü
  if (news.author.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
    return res.status(403).json({
      success: false,
      message: 'Bu haberi güncelleme yetkiniz yok'
    });
  }

  const {
    title,
    content,
    summary,
    category,
    targetAudience,
    isPinned,
    isPublished,
    publishDate,
    expiryDate,
    tags,
    priority,
    allowComments
  } = req.body;

  // Yeni kapak fotoğrafı varsa işle
  if (req.file) {
    // Eski fotoğrafı sil
    if (news.featuredImage && news.featuredImage.path) {
      deleteFile(news.featuredImage.path);
    }

    const imageInfo = processFileInfo(req.file);
    news.featuredImage = {
      ...imageInfo,
      alt: req.body.imageAlt || title || news.title,
      url: `/uploads/news/${req.file.filename}`
    };
  }

  // Güncelleme verilerini ayarla
  news.title = title || news.title;
  news.content = content || news.content;
  news.summary = summary || news.summary;
  news.category = category || news.category;
  news.targetAudience = targetAudience || news.targetAudience;
  news.isPinned = isPinned !== undefined ? isPinned : news.isPinned;
  news.isPublished = isPublished !== undefined ? isPublished : news.isPublished;
  news.publishDate = publishDate || news.publishDate;
  news.expiryDate = expiryDate || news.expiryDate;
  news.priority = priority || news.priority;
  news.allowComments = allowComments !== undefined ? allowComments : news.allowComments;

  if (tags) {
    news.tags = Array.isArray(tags) ? tags : tags.split(',').map(tag => tag.trim());
  }

  await news.save();

  const updatedNews = await News.findById(news._id)
    .populate('author', 'name surname fullName');

  res.json({
    success: true,
    message: 'Haber başarıyla güncellendi',
    data: updatedNews
  });
});

// @desc    Haber sil
// @route   DELETE /api/news/:id
// @access  Özel (Teacher/Admin - Kendi haberi)
const deleteNews = asyncHandler(async (req, res) => {
  const news = await News.findById(req.params.id);

  if (!news) {
    return res.status(404).json({
      success: false,
      message: 'Haber bulunamadı'
    });
  }

  // Yetki kontrolü
  if (news.author.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
    return res.status(403).json({
      success: false,
      message: 'Bu haberi silme yetkiniz yok'
    });
  }

  // Kapak fotoğrafını sil
  if (news.featuredImage && news.featuredImage.path) {
    deleteFile(news.featuredImage.path);
  }

  // Haberi sil
  await News.findByIdAndDelete(req.params.id);

  res.json({
    success: true,
    message: 'Haber başarıyla silindi'
  });
});

// @desc    Habere yorum ekle
// @route   POST /api/news/:id/comment
// @access  Özel (Giriş yapmış kullanıcılar)
const addComment = asyncHandler(async (req, res) => {
  const { content } = req.body;

  if (!content || content.trim().length === 0) {
    return res.status(400).json({
      success: false,
      message: 'Yorum içeriği gereklidir'
    });
  }

  const news = await News.findById(req.params.id);

  if (!news) {
    return res.status(404).json({
      success: false,
      message: 'Haber bulunamadı'
    });
  }

  if (!news.allowComments) {
    return res.status(403).json({
      success: false,
      message: 'Bu habere yorum yapılamaz'
    });
  }

  const comment = {
    user: req.user._id,
    content: content.trim(),
    createdAt: new Date()
  };

  news.comments.push(comment);
  await news.save();

  // Populate edilmiş yorumu getir
  const updatedNews = await News.findById(news._id)
    .populate('comments.user', 'name surname fullName avatar');

  const newComment = updatedNews.comments[updatedNews.comments.length - 1];

  res.status(201).json({
    success: true,
    message: 'Yorum başarıyla eklendi',
    data: newComment
  });
});

// @desc    Yorumu sil
// @route   DELETE /api/news/:id/comment/:commentId
// @access  Özel (Yorum sahibi veya admin)
const deleteComment = asyncHandler(async (req, res) => {
  const { id, commentId } = req.params;

  const news = await News.findById(id);

  if (!news) {
    return res.status(404).json({
      success: false,
      message: 'Haber bulunamadı'
    });
  }

  const commentIndex = news.comments.findIndex(comment => comment._id.toString() === commentId);

  if (commentIndex === -1) {
    return res.status(404).json({
      success: false,
      message: 'Yorum bulunamadı'
    });
  }

  const comment = news.comments[commentIndex];

  // Yetki kontrolü (yorum sahibi veya admin)
  if (comment.user.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
    return res.status(403).json({
      success: false,
      message: 'Bu yorumu silme yetkiniz yok'
    });
  }

  news.comments.splice(commentIndex, 1);
  await news.save();

  res.json({
    success: true,
    message: 'Yorum başarıyla silindi'
  });
});

// @desc    Kategorileri getir
// @route   GET /api/news/categories/list
// @access  Public
const getCategories = asyncHandler(async (req, res) => {
  const categories = [
    { value: 'duyuru', label: 'Duyurular', icon: '📢' },
    { value: 'etkinlik', label: 'Etkinlikler', icon: '🎉' },
    { value: 'onemli', label: 'Önemli', icon: '❗' },
    { value: 'genel', label: 'Genel', icon: '📰' }
  ];

  // Her kategoride kaç haber olduğunu say
  const categoryCounts = await News.aggregate([
    {
      $match: { isPublished: true }
    },
    {
      $group: {
        _id: '$category',
        count: { $sum: 1 }
      }
    }
  ]);

  const countMap = categoryCounts.reduce((acc, item) => {
    acc[item._id] = item.count;
    return acc;
  }, {});

  categories.forEach(category => {
    category.count = countMap[category.value] || 0;
  });

  res.json({
    success: true,
    data: categories
  });
});

// @desc    Öne çıkan haberleri getir
// @route   GET /api/news/featured
// @access  Public
const getFeaturedNews = asyncHandler(async (req, res) => {
  const limit = parseInt(req.query.limit) || 5;

  const featuredNews = await News.find({
    isPublished: true,
    isPinned: true,
    $or: [
      { expiryDate: { $exists: false } },
      { expiryDate: null },
      { expiryDate: { $gte: new Date() } }
    ]
  })
    .populate('author', 'name surname fullName')
    .sort({ publishDate: -1 })
    .limit(limit)
    .lean();

  // URL'leri düzenle
  featuredNews.forEach(item => {
    if (item.featuredImage && item.featuredImage.filename) {
      item.featuredImage.url = `/uploads/news/${item.featuredImage.filename}`;
    }
  });

  res.json({
    success: true,
    data: featuredNews
  });
});

module.exports = {
  getNews,
  getSingleNews,
  createNews,
  updateNews,
  deleteNews,
  addComment,
  deleteComment,
  getCategories,
  getFeaturedNews
}; 