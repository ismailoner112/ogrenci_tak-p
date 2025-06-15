/**
 * CSRF Token Yardımcı Fonksiyonları
 */

const axios = require('axios');

class CSRFHelper {
  constructor(baseURL = 'http://localhost:5000') {
    this.baseURL = baseURL;
    this.token = null;
  }

  /**
   * CSRF token'ı sunucudan al
   */
  async getToken() {
    try {
      const response = await axios.get(`${this.baseURL}/api/csrf-token`, {
        withCredentials: true
      });
      
      if (response.data.success) {
        this.token = response.data.csrfToken;
        return this.token;
      }
      
      throw new Error('CSRF token alınamadı');
    } catch (error) {
      console.error('CSRF token alma hatası:', error.message);
      throw error;
    }
  }

  /**
   * Mevcut token'ı döndür veya yoksa al
   */
  async ensureToken() {
    if (!this.token) {
      await this.getToken();
    }
    return this.token;
  }

  /**
   * Token'ı temizle
   */
  clearToken() {
    this.token = null;
  }

  /**
   * CSRF token ile birlikte HTTP header'ları oluştur
   */
  async getHeaders(additionalHeaders = {}) {
    const token = await this.ensureToken();
    
    return {
      'Content-Type': 'application/json',
      'X-CSRF-Token': token,
      ...additionalHeaders
    };
  }

  /**
   * CSRF token ile birlikte form data oluştur
   */
  async getFormData(data = {}) {
    const token = await this.ensureToken();
    
    const formData = new FormData();
    formData.append('_csrf', token);
    
    // Diğer verileri ekle
    Object.keys(data).forEach(key => {
      if (data[key] instanceof File) {
        formData.append(key, data[key]);
      } else if (Array.isArray(data[key])) {
        data[key].forEach(item => formData.append(`${key}[]`, item));
      } else if (typeof data[key] === 'object' && data[key] !== null) {
        formData.append(key, JSON.stringify(data[key]));
      } else {
        formData.append(key, data[key]);
      }
    });
    
    return formData;
  }

  /**
   * Güvenli axios request yapıcı
   */
  async makeRequest(method, url, data = null, config = {}) {
    try {
      const headers = await this.getHeaders(config.headers);
      
      const requestConfig = {
        method,
        url: `${this.baseURL}${url}`,
        headers,
        withCredentials: true,
        ...config
      };

      if (data) {
        if (method.toLowerCase() === 'get') {
          requestConfig.params = data;
        } else {
          requestConfig.data = data;
        }
      }

      const response = await axios(requestConfig);
      return response.data;
    } catch (error) {
      // CSRF token hatası durumunda token'ı yenile ve tekrar dene
      if (error.response?.status === 403 && error.response?.data?.error?.includes('CSRF')) {
        this.clearToken();
        const headers = await this.getHeaders(config.headers);
        
        const requestConfig = {
          method,
          url: `${this.baseURL}${url}`,
          headers,
          withCredentials: true,
          ...config
        };

        if (data) {
          if (method.toLowerCase() === 'get') {
            requestConfig.params = data;
          } else {
            requestConfig.data = data;
          }
        }

        const retryResponse = await axios(requestConfig);
        return retryResponse.data;
      }
      
      throw error;
    }
  }
}

module.exports = CSRFHelper; 