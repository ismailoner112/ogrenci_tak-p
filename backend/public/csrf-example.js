/**
 * CSRF Token Kullanım Örneği
 * Frontend tarafında CSRF token'larını nasıl kullanacağınızı gösteren örnekler
 */

class CSRFManager {
  constructor() {
    this.token = null;
    this.baseURL = '/api';
  }

  /**
   * CSRF token'ı al
   */
  async getToken() {
    try {
      const response = await fetch(`${this.baseURL}/csrf-token`, {
        method: 'GET',
        credentials: 'include'
      });
      
      const data = await response.json();
      
      if (data.success) {
        this.token = data.csrfToken;
        console.log('CSRF token alındı:', this.token);
        return this.token;
      }
      
      throw new Error(data.error || 'CSRF token alınamadı');
    } catch (error) {
      console.error('CSRF token alma hatası:', error);
      throw error;
    }
  }

  /**
   * Token'ı kontrol et ve yoksa al
   */
  async ensureToken() {
    if (!this.token) {
      await this.getToken();
    }
    return this.token;
  }

  /**
   * Güvenli fetch wrapper
   */
  async secureFetch(url, options = {}) {
    await this.ensureToken();
    
    const defaultOptions = {
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        'X-CSRF-Token': this.token,
        ...options.headers
      }
    };

    const mergedOptions = { ...defaultOptions, ...options };
    
    try {
      const response = await fetch(`${this.baseURL}${url}`, mergedOptions);
      
      // CSRF hatası durumunda token'ı yenile ve tekrar dene
      if (response.status === 403) {
        const errorData = await response.json();
        if (errorData.code === 'CSRF_TOKEN_INVALID') {
          console.log('CSRF token geçersiz, yenileniyor...');
          this.token = null;
          await this.getToken();
          
          // Yeni token ile tekrar dene
          mergedOptions.headers['X-CSRF-Token'] = this.token;
          return await fetch(`${this.baseURL}${url}`, mergedOptions);
        }
      }
      
      return response;
    } catch (error) {
      console.error('Secure fetch hatası:', error);
      throw error;
    }
  }

  /**
   * Form submit için token ekle
   */
  async addTokenToForm(formElement) {
    await this.ensureToken();
    
    // Varolan CSRF input'unu kaldır
    const existingInput = formElement.querySelector('input[name="_csrf"]');
    if (existingInput) {
      existingInput.remove();
    }
    
    // Yeni token input'u ekle
    const csrfInput = document.createElement('input');
    csrfInput.type = 'hidden';
    csrfInput.name = '_csrf';
    csrfInput.value = this.token;
    formElement.appendChild(csrfInput);
  }

  /**
   * Axios interceptor kurulumu
   */
  setupAxiosInterceptor(axiosInstance) {
    // Request interceptor
    axiosInstance.interceptors.request.use(async (config) => {
      await this.ensureToken();
      config.headers['X-CSRF-Token'] = this.token;
      return config;
    });

    // Response interceptor
    axiosInstance.interceptors.response.use(
      (response) => response,
      async (error) => {
        if (error.response?.status === 403 && 
            error.response?.data?.code === 'CSRF_TOKEN_INVALID') {
          console.log('CSRF token geçersiz, yenileniyor...');
          this.token = null;
          await this.getToken();
          
          // Orijinal isteği yeni token ile tekrar gönder
          error.config.headers['X-CSRF-Token'] = this.token;
          return axiosInstance.request(error.config);
        }
        return Promise.reject(error);
      }
    );
  }
}

// Global instance
const csrfManager = new CSRFManager();

// Kullanım örnekleri
async function examples() {
  // 1. Basit GET isteği
  try {
    const response = await csrfManager.secureFetch('/users');
    const data = await response.json();
    console.log('Kullanıcılar:', data);
  } catch (error) {
    console.error('GET hatası:', error);
  }

  // 2. POST isteği
  try {
    const response = await csrfManager.secureFetch('/news', {
      method: 'POST',
      body: JSON.stringify({
        title: 'Yeni Haber',
        content: 'Haber içeriği...',
        category: 'duyuru'
      })
    });
    const data = await response.json();
    console.log('Haber oluşturuldu:', data);
  } catch (error) {
    console.error('POST hatası:', error);
  }

  // 3. Form submit
  const form = document.getElementById('myForm');
  if (form) {
    await csrfManager.addTokenToForm(form);
    // Form artık CSRF token ile submit edilebilir
  }

  // 4. FormData ile dosya yükleme
  try {
    await csrfManager.ensureToken();
    
    const formData = new FormData();
    formData.append('_csrf', csrfManager.token);
    formData.append('title', 'Galeri Başlığı');
    formData.append('image', fileInput.files[0]);
    
    const response = await fetch('/api/gallery', {
      method: 'POST',
      body: formData,
      credentials: 'include'
    });
    
    const data = await response.json();
    console.log('Galeri oluşturuldu:', data);
  } catch (error) {
    console.error('Dosya yükleme hatası:', error);
  }
}

// DOM yüklendiğinde token'ı al
document.addEventListener('DOMContentLoaded', async () => {
  try {
    await csrfManager.getToken();
    console.log('CSRF token hazır');
  } catch (error) {
    console.error('CSRF token alma hatası:', error);
  }
});

// Export et
if (typeof module !== 'undefined' && module.exports) {
  module.exports = CSRFManager;
} else {
  window.CSRFManager = CSRFManager;
  window.csrfManager = csrfManager;
} 