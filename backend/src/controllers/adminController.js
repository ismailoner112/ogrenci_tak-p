/**
 * Admin Controller
 * Kullanıcı yönetimi ve sistem yönetimi işlemleri
 */

const asyncHandler = require('express-async-handler');
const User = require('../models/User');
const Student = require('../models/Student');

// @desc    Tüm kullanıcıları getir
// @route   GET /api/admin/users
// @access  Özel (Admin only)
const getAllUsers = asyncHandler(async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 20;
  const skip = (page - 1) * limit;

  // Filtreleme
  const filter = {};
  if (req.query.userType) {
    filter.userType = req.query.userType;
  }
  if (req.query.isActive !== undefined) {
    filter.isActive = req.query.isActive === 'true';
  }

  const [users, totalUsers] = await Promise.all([
    User.find(filter)
      .select('-password')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    User.countDocuments(filter)
  ]);

  res.json({
    success: true,
    data: users,
    pagination: {
      current: page,
      pages: Math.ceil(totalUsers / limit),
      total: totalUsers,
      hasNext: page < Math.ceil(totalUsers / limit),
      hasPrev: page > 1
    }
  });
});

// @desc    Kullanıcı detayını getir
// @route   GET /api/admin/users/:id
// @access  Özel (Admin only)
const getUserById = asyncHandler(async (req, res) => {
  const user = await User.findById(req.params.id)
    .select('-password')
    .lean();

  if (!user) {
    return res.status(404).json({
      success: false,
      message: 'Kullanıcı bulunamadı'
    });
  }

  res.json({
    success: true,
    data: user
  });
});

// @desc    Kullanıcı bilgilerini güncelle (rol değiştirme dahil)
// @route   PUT /api/admin/users/:id
// @access  Özel (Admin only)
const updateUser = asyncHandler(async (req, res) => {
  const { userType, isActive, name, surname, email, phone, department } = req.body;

  const user = await User.findById(req.params.id);

  if (!user) {
    return res.status(404).json({
      success: false,
      message: 'Kullanıcı bulunamadı'
    });
  }

  // Güncellenebilir alanlar
  if (userType !== undefined) user.userType = userType;
  if (isActive !== undefined) user.isActive = isActive;
  if (name !== undefined) user.name = name;
  if (surname !== undefined) user.surname = surname;
  if (email !== undefined) user.email = email;
  if (phone !== undefined) user.phone = phone;
  if (department !== undefined) user.department = department;

  const updatedUser = await user.save();

  res.json({
    success: true,
    message: 'Kullanıcı başarıyla güncellendi',
    data: {
      _id: updatedUser._id,
      name: updatedUser.name,
      surname: updatedUser.surname,
      email: updatedUser.email,
      userType: updatedUser.userType,
      isActive: updatedUser.isActive
    }
  });
});

// @desc    Kullanıcıyı sil
// @route   DELETE /api/admin/users/:id
// @access  Özel (Admin only)
const deleteUser = asyncHandler(async (req, res) => {
  const user = await User.findById(req.params.id);

  if (!user) {
    return res.status(404).json({
      success: false,
      message: 'Kullanıcı bulunamadı'
    });
  }

  // Super admin koruması (ilk admin)
  if (user.email === process.env.SUPER_ADMIN_EMAIL) {
    return res.status(403).json({
      success: false,
      message: 'Super admin silinemez'
    });
  }

  await User.findByIdAndDelete(req.params.id);

  res.json({
    success: true,
    message: 'Kullanıcı başarıyla silindi'
  });
});

// @desc    Toplu kullanıcı işlemleri
// @route   POST /api/admin/users/bulk-action
// @access  Özel (Admin only)
const bulkUserAction = asyncHandler(async (req, res) => {
  const { userIds, action, value } = req.body;

  if (!userIds || !Array.isArray(userIds) || userIds.length === 0) {
    return res.status(400).json({
      success: false,
      message: 'Geçerli kullanıcı ID\'leri gereklidir'
    });
  }

  let updateQuery = {};
  let message = '';

  switch (action) {
    case 'activate':
      updateQuery = { isActive: true };
      message = 'Kullanıcılar aktif edildi';
      break;
    case 'deactivate':
      updateQuery = { isActive: false };
      message = 'Kullanıcılar pasif edildi';
      break;
    case 'changeRole':
      if (!value || !['teacher', 'student', 'admin'].includes(value)) {
        return res.status(400).json({
          success: false,
          message: 'Geçerli bir rol belirtiniz'
        });
      }
      updateQuery = { userType: value };
      message = `Kullanıcı rolleri ${value} olarak değiştirildi`;
      break;
    default:
      return res.status(400).json({
        success: false,
        message: 'Geçersiz işlem'
      });
  }

  const result = await User.updateMany(
    { _id: { $in: userIds } },
    updateQuery
  );

  res.json({
    success: true,
    message,
    modifiedCount: result.modifiedCount
  });
});

// @desc    Sistem istatistikleri
// @route   GET /api/admin/stats
// @access  Özel (Admin only)
const getSystemStats = asyncHandler(async (req, res) => {
  const [
    totalUsers,
    totalTeachers,
    totalStudents,
    totalAdmins,
    activeUsers,
    recentUsers
  ] = await Promise.all([
    User.countDocuments(),
    User.countDocuments({ userType: 'teacher' }),
    User.countDocuments({ userType: 'student' }),
    User.countDocuments({ userType: 'admin' }),
    User.countDocuments({ isActive: true }),
    User.find()
      .select('name surname email userType createdAt')
      .sort({ createdAt: -1 })
      .limit(5)
      .lean()
  ]);

  res.json({
    success: true,
    data: {
      users: {
        total: totalUsers,
        teachers: totalTeachers,
        students: totalStudents,
        admins: totalAdmins,
        active: activeUsers,
        inactive: totalUsers - activeUsers
      },
      recentUsers
    }
  });
});

module.exports = {
  getAllUsers,
  getUserById,
  updateUser,
  deleteUser,
  bulkUserAction,
  getSystemStats
}; 