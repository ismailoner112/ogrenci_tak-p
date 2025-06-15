/**
 * Gallery Controller
 * Galeri yönetimi işlemleri
 */

const asyncHandler = require('express-async-handler');
const { validationResult } = require('express-validator');
const Gallery = require('../models/Gallery');
const { deleteFile, processFileInfo } = require('../middleware/upload');

// @desc    Tüm galerileri getir
// @route   GET /api/gallery
// @access  Public
const getGalleries = asyncHandler(async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 12;
  const category = req.query.category;
  const search = req.query.search;

  const query = { isActive: true };

  // Kategori filtresi
  if (category && category !== 'all') {
    query.category = category;
  }

  // Arama filtresi
  if (search) {
    query.$or = [
      { title: { $regex: search, $options: 'i' } },
      { description: { $regex: search, $options: 'i' } },
      { tags: { $in: [new RegExp(search, 'i')] } }
    ];
  }

  // Sadece public galeriler (anonim kullanıcılar için)
  if (!req.user) {
    query.isPublic = true;
  }

  const skip = (page - 1) * limit;

  const [galleries, total] = await Promise.all([
    Gallery.find(query)
      .populate('uploadedBy', 'name surname fullName')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    Gallery.countDocuments(query)
  ]);

  // URL'leri düzenle - tam URL oluştur
  const baseUrl = process.env.BACKEND_URL || `${req.protocol}://${req.get('host')}`;
  galleries.forEach(gallery => {
    gallery.images.forEach(image => {
      image.url = `${baseUrl}/uploads/gallery/${image.filename}`;
    });
  });

  res.json({
    success: true,
    data: galleries,
    pagination: {
      current: page,
      pages: Math.ceil(total / limit),
      total,
      hasNext: page < Math.ceil(total / limit),
      hasPrev: page > 1
    }
  });
});

// @desc    Tekil galeri getir
// @route   GET /api/gallery/:id
// @access  Public
const getGallery = asyncHandler(async (req, res) => {
  const { id } = req.params;

  // ID veya slug ile ara
  const query = id.match(/^[0-9a-fA-F]{24}$/) ? { _id: id } : { slug: id };

  const gallery = await Gallery.findOne(query)
    .populate('uploadedBy', 'name surname fullName avatar')
    .lean();

  if (!gallery) {
    return res.status(404).json({
      success: false,
      message: 'Galeri bulunamadı'
    });
  }

  // Yetki kontrolü (private galeriler için)
  if (!gallery.isPublic && (!req.user || gallery.uploadedBy._id.toString() !== req.user._id.toString())) {
    return res.status(403).json({
      success: false,
      message: 'Bu galeriye erişim yetkiniz yok'
    });
  }

  // Görüntülenme sayısını artır
  await Gallery.findByIdAndUpdate(gallery._id, { $inc: { viewCount: 1 } });

  // URL'leri düzenle - tam URL oluştur
  const baseUrl = process.env.BACKEND_URL || `${req.protocol}://${req.get('host')}`;
  gallery.images.forEach(image => {
    image.url = `${baseUrl}/uploads/gallery/${image.filename}`;
  });

  res.json({
    success: true,
    data: gallery
  });
});

// @desc    Yeni galeri oluştur
// @route   POST /api/gallery
// @access  Özel (Teacher/Student/Admin)
const createGallery = asyncHandler(async (req, res) => {
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
    description,
    category = 'genel',
    isPublic = true,
    tags = [],
    eventDate
  } = req.body;

  // Tek dosya yükleme (req.file) - array yerine single kullanıyoruz
  const images = [];
  if (req.file) {
    const imageInfo = processFileInfo(req.file);
    // Tam URL oluştur
    const baseUrl = process.env.BACKEND_URL || `${req.protocol}://${req.get('host')}`;
    images.push({
      ...imageInfo,
      alt: title,
      caption: description,
      url: `${baseUrl}/uploads/gallery/${req.file.filename}`
    });
  }

  if (images.length === 0) {
    return res.status(400).json({
      success: false,
      message: 'En az bir resim yüklemelisiniz'
    });
  }

  // Yükleme yapan kişinin adını al
  let uploadedByName = 'Bilinmeyen';
  if (req.user.userType === 'student') {
    uploadedByName = `${req.user.name || req.user.ad} ${req.user.surname || req.user.soyad} (Öğrenci)`;
  } else {
    uploadedByName = `${req.user.name || req.user.ad} ${req.user.surname || req.user.soyad} (Öğretmen)`;
  }

  // Galeri oluştur
  const gallery = await Gallery.create({
    title,
    description,
    category,
    images,
    uploadedBy: req.user._id,
    uploadedByName,
    userType: req.user.userType,
    isPublic,
    tags: Array.isArray(tags) ? tags : (tags ? tags.split(',').map(tag => tag.trim()) : []),
    eventDate
  });

  res.status(201).json({
    success: true,
    message: 'Galeri başarıyla oluşturuldu',
    data: gallery
  });
});

// @desc    Galeri güncelle
// @route   PUT /api/gallery/:id
// @access  Özel (Teacher/Admin - Kendi galerisi)
const updateGallery = asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: 'Girilen bilgilerde hata var',
      errors: errors.array()
    });
  }

  const gallery = await Gallery.findById(req.params.id);

  if (!gallery) {
    return res.status(404).json({
      success: false,
      message: 'Galeri bulunamadı'
    });
  }

  // Yetki kontrolü - kullanıcı kendi galerisini güncelleyebilir ya da admin olabilir
  if (gallery.uploadedBy.toString() !== req.user._id.toString() && req.user.userType !== 'admin') {
    return res.status(403).json({
      success: false,
      message: 'Bu galeriyi güncelleme yetkiniz yok'
    });
  }

  const {
    title,
    description,
    category,
    isPublic,
    tags,
    eventDate
  } = req.body;

  // Yeni resim varsa ekle (tek dosya)
  if (req.file) {
    const imageInfo = processFileInfo(req.file);
    // Tam URL oluştur
    const baseUrl = process.env.BACKEND_URL || `${req.protocol}://${req.get('host')}`;
    const newImage = {
      ...imageInfo,
      alt: title || gallery.title,
      caption: description || gallery.description,
      url: `${baseUrl}/uploads/gallery/${req.file.filename}`
    };
    gallery.images.push(newImage);
  }

  // Güncelleme verilerini ayarla
  gallery.title = title || gallery.title;
  gallery.description = description || gallery.description;
  gallery.category = category || gallery.category;
  gallery.isPublic = isPublic !== undefined ? isPublic : gallery.isPublic;
  gallery.eventDate = eventDate || gallery.eventDate;

  if (tags) {
    gallery.tags = Array.isArray(tags) ? tags : tags.split(',').map(tag => tag.trim());
  }

  await gallery.save();

  const updatedGallery = await Gallery.findById(gallery._id)
    .populate('uploadedBy', 'name surname fullName');

  res.json({
    success: true,
    message: 'Galeri başarıyla güncellendi',
    data: updatedGallery
  });
});

// @desc    Galeriden resim sil
// @route   DELETE /api/gallery/:id/image/:imageId
// @access  Özel (Teacher/Admin - Kendi galerisi)
const deleteImage = asyncHandler(async (req, res) => {
  const { id, imageId } = req.params;

  const gallery = await Gallery.findById(id);

  if (!gallery) {
    return res.status(404).json({
      success: false,
      message: 'Galeri bulunamadı'
    });
  }

  // Yetki kontrolü
  if (gallery.uploadedBy.toString() !== req.user._id.toString() && req.user.userType !== 'admin') {
    return res.status(403).json({
      success: false,
      message: 'Bu galeriden resim silme yetkiniz yok'
    });
  }

  const imageIndex = gallery.images.findIndex(img => img._id.toString() === imageId);

  if (imageIndex === -1) {
    return res.status(404).json({
      success: false,
      message: 'Resim bulunamadı'
    });
  }

  const image = gallery.images[imageIndex];

  // Dosyayı diskten sil
  deleteFile(image.path);

  // Resmi array'den çıkar
  gallery.images.splice(imageIndex, 1);

  // Eğer hiç resim kalmadıysa galeriyi pasif yap
  if (gallery.images.length === 0) {
    gallery.isActive = false;
  }

  await gallery.save();

  res.json({
    success: true,
    message: 'Resim başarıyla silindi'
  });
});

// @desc    Galeri sil
// @route   DELETE /api/gallery/:id
// @access  Özel (Teacher/Admin - Kendi galerisi)
const deleteGallery = asyncHandler(async (req, res) => {
  const gallery = await Gallery.findById(req.params.id);

  if (!gallery) {
    return res.status(404).json({
      success: false,
      message: 'Galeri bulunamadı'
    });
  }

  // Yetki kontrolü
  if (gallery.uploadedBy.toString() !== req.user._id.toString() && req.user.userType !== 'admin') {
    return res.status(403).json({
      success: false,
      message: 'Bu galeriyi silme yetkiniz yok'
    });
  }

  // Tüm resimleri diskten sil
  gallery.images.forEach(image => {
    deleteFile(image.path);
  });

  // Galeriyi sil
  await Gallery.findByIdAndDelete(req.params.id);

  res.json({
    success: true,
    message: 'Galeri başarıyla silindi'
  });
});

// @desc    Kategorileri getir
// @route   GET /api/gallery/categories/list
// @access  Public
const getCategories = asyncHandler(async (req, res) => {
  const categories = [
    { value: 'etkinlik', label: 'Etkinlikler', icon: '🎉' },
    { value: 'ders', label: 'Ders Fotoğrafları', icon: '📚' },
    { value: 'geziler', label: 'Geziler', icon: '🏔️' },
    { value: 'proje', label: 'Projeler', icon: '🔬' },
    { value: 'diger', label: 'Diğer', icon: '📸' }
  ];

  // Her kategoride kaç galeri olduğunu say
  const categoryCounts = await Gallery.aggregate([
    {
      $match: { isActive: true, isPublic: true }
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

module.exports = {
  getGalleries,
  getGallery,
  createGallery,
  updateGallery,
  deleteImage,
  deleteGallery,
  getCategories
}; 