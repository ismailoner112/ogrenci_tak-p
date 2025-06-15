/**
 * CSRF Test Routes
 * CSRF korumasının çalışıp çalışmadığını test etmek için
 */

const express = require('express');
const router = express.Router();

// @desc    CSRF korumalı POST endpoint testi
// @route   POST /api/csrf-test/protected
// @access  Public (ama CSRF token gerekli)
router.post('/protected', (req, res) => {
  res.json({
    success: true,
    message: 'CSRF koruması başarıyla geçildi!',
    timestamp: new Date().toISOString(),
    receivedData: req.body
  });
});

// @desc    CSRF korumasız GET endpoint testi
// @route   GET /api/csrf-test/unprotected
// @access  Public
router.get('/unprotected', (req, res) => {
  res.json({
    success: true,
    message: 'Bu endpoint CSRF koruması gerektirmiyor',
    timestamp: new Date().toISOString()
  });
});

// @desc    Form data testi
// @route   POST /api/csrf-test/form-data
// @access  Public (ama CSRF token gerekli)
router.post('/form-data', (req, res) => {
  res.json({
    success: true,
    message: 'Form data ile CSRF koruması başarıyla geçildi!',
    timestamp: new Date().toISOString(),
    receivedData: req.body,
    files: req.files ? Object.keys(req.files) : []
  });
});

// @desc    JSON data testi
// @route   PUT /api/csrf-test/json-data
// @access  Public (ama CSRF token gerekli)
router.put('/json-data', (req, res) => {
  res.json({
    success: true,
    message: 'JSON data ile CSRF koruması başarıyla geçildi!',
    timestamp: new Date().toISOString(),
    receivedData: req.body
  });
});

module.exports = router; 