const express = require('express');
const { body, validationResult } = require('express-validator');
const User = require('../models/User');
const { verifyToken, adminOnly } = require('../middleware/verifyToken');

const router = express.Router();

// @desc    Tüm kullanıcıları listele
// @route   GET /api/users
// @access  Sadece Admin
router.get('/', adminOnly, async (req, res, next) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const users = await User.find({ role: { $ne: 'admin' } })
      .select('-password')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const totalUsers = await User.countDocuments({ role: { $ne: 'admin' } });

    res.status(200).json({
      success: true,
      count: users.length,
      totalPages: Math.ceil(totalUsers / limit),
      currentPage: page,
      users
    });
  } catch (error) {
    next(error);
  }
});

// @desc    Kullanıcı detayını getir
// @route   GET /api/users/:id
// @access  Özel (kendi bilgilerini görme) / Admin (hepsini görme)
router.get('/:id', verifyToken, async (req, res, next) => {
  try {
    const user = await User.findById(req.params.id).select('-password');

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Kullanıcı bulunamadı'
      });
    }

    // Sadece kendi bilgilerini görebilir veya admin olmalı
    if (req.user._id.toString() !== user._id.toString() && req.user.userType !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Bu işlem için yetkiniz yok'
      });
    }

    res.status(200).json({
      success: true,
      user
    });
  } catch (error) {
    next(error);
  }
});

// @desc    Kullanıcı güncelle
// @route   PUT /api/users/:id
// @access  Özel (kendi bilgilerini güncelleme) / Admin (hepsini güncelleme)
router.put('/:id', verifyToken, [
  body('name').optional().trim().escape(),
  body('surname').optional().trim().escape(),
  body('email').optional().isEmail().normalizeEmail(),
  body('phone').optional().trim(),
  body('department').optional().trim().escape()
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Girilen bilgilerde hata var',
        errors: errors.array()
      });
    }

    let user = await User.findById(req.params.id);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Kullanıcı bulunamadı'
      });
    }

    // Sadece kendi bilgilerini güncelleyebilir veya admin olmalı
    if (req.user._id.toString() !== user._id.toString() && req.user.userType !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Bu işlem için yetkiniz yok'
      });
    }

    const { name, surname, email, phone, department, isActive } = req.body;

    // Email değiştiriliyorsa, başka kullanıcıda aynı email var mı kontrol et
    if (email && email !== user.email) {
      const existingUser = await User.findOne({ email });
      if (existingUser) {
        return res.status(400).json({
          success: false,
          message: 'Bu email adresi zaten kullanılıyor'
        });
      }
    }

    // Güncelleme verilerini hazırla
    const updateData = {};
    if (name) updateData.name = name;
    if (surname) updateData.surname = surname;
    if (email) updateData.email = email;
    if (phone) updateData.phone = phone;
    if (department) updateData.department = department;
    
    // Sadece admin isActive durumunu değiştirebilir
    if (req.user.userType === 'admin' && typeof isActive !== 'undefined') {
      updateData.isActive = isActive;
    }

    user = await User.findByIdAndUpdate(req.params.id, updateData, {
      new: true,
      runValidators: true
    }).select('-password');

    res.status(200).json({
      success: true,
      message: 'Kullanıcı başarıyla güncellendi',
      user
    });
  } catch (error) {
    next(error);
  }
});

// @desc    Kullanıcı sil
// @route   DELETE /api/users/:id
// @access  Sadece Admin
router.delete('/:id', adminOnly, async (req, res, next) => {
  try {
    const user = await User.findById(req.params.id);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Kullanıcı bulunamadı'
      });
    }

    // Admin kendini silemez
    if (user.role === 'admin') {
      return res.status(400).json({
        success: false,
        message: 'Admin kullanıcılar silinemez'
      });
    }

    await User.findByIdAndDelete(req.params.id);

    res.status(200).json({
      success: true,
      message: 'Kullanıcı başarıyla silindi'
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router; 