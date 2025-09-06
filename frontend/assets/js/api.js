// API Configuration
const API_BASE_URL = 'http://localhost:5000/api';

// API Helper Functions
class ApiService {
    constructor() {
        this.baseURL = API_BASE_URL;
    }

    // Get auth token from localStorage
    getAuthToken() {
        return localStorage.getItem('authToken');
    }

    // Set auth token to localStorage
    setAuthToken(token) {
        localStorage.setItem('authToken', token);
    }

    // Remove auth token
    removeAuthToken() {
        localStorage.removeItem('authToken');
    }

    // Get auth headers
    getAuthHeaders() {
        const token = this.getAuthToken();
        return {
            'Content-Type': 'application/json',
            ...(token && { 'Authorization': `Bearer ${token}` })
        };
    }

    // Generic API call method
    async apiCall(endpoint, options = {}) {
        const url = `${this.baseURL}${endpoint}`;
        const config = {
            headers: this.getAuthHeaders(),
            ...options
        };

        try {
            const response = await fetch(url, config);
            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.message || data.error || 'API request failed');
            }

            return data;
        } catch (error) {
            console.error('API Error:', error);
            throw error;
        }
    }

    // Admin Authentication
    async adminLogin(username, password) {
        return await this.apiCall('/admins/login', {
            method: 'POST',
            body: JSON.stringify({ username, password })
        });
    }

    async adminRegister(username, password, role = 'admin') {
        return await this.apiCall('/admins/register', {
            method: 'POST',
            body: JSON.stringify({ username, password, role })
        });
    }

    // User Authentication
    async userLogin(faceEmbedding) {
        return await this.apiCall('/users/login', {
            method: 'POST',
            body: JSON.stringify({ faceEmbedding })
        });
    }

    async userRegister(firstName, lastName, faceEmbedding) {
        return await this.apiCall('/users/register', {
            method: 'POST',
            body: JSON.stringify({ firstName, lastName, faceEmbedding })
        });
    }

    // Users CRUD
    async getUsers() {
        return await this.apiCall('/users');
    }

    async getUserById(id) {
        return await this.apiCall(`/users/${id}`);
    }

    async updateUser(id, userData) {
        return await this.apiCall(`/users/${id}`, {
            method: 'PUT',
            body: JSON.stringify(userData)
        });
    }

    async deleteUser(id) {
        return await this.apiCall(`/users/${id}`, {
            method: 'DELETE'
        });
    }

    // Admins CRUD
    async getAdmins() {
        return await this.apiCall('/admins');
    }

    async getAdminById(id) {
        return await this.apiCall(`/admins/${id}`);
    }

    async updateAdmin(id, adminData) {
        return await this.apiCall(`/admins/${id}`, {
            method: 'PUT',
            body: JSON.stringify(adminData)
        });
    }

    async deleteAdmin(id) {
        return await this.apiCall(`/admins/${id}`, {
            method: 'DELETE'
        });
    }
}

// Utility Functions
const Utils = {
    // Show loading spinner
    showLoading(message = 'Processing...') {
        const overlay = document.createElement('div');
        overlay.className = 'spinner-overlay';
        overlay.id = 'loadingOverlay';
        overlay.innerHTML = `
            <div class="text-center">
                <div class="spinner-border text-light" role="status">
                    <span class="visually-hidden">Loading...</span>
                </div>
                <div class="loading-text">${message}</div>
            </div>
        `;
        document.body.appendChild(overlay);
    },

    // Hide loading spinner
    hideLoading() {
        const overlay = document.getElementById('loadingOverlay');
        if (overlay) {
            overlay.remove();
        }
    },

    // Show alert message
    showAlert(message, type = 'info', containerId = 'alertContainer') {
        const alertContainer = document.getElementById(containerId);
        if (!alertContainer) return;

        const alert = document.createElement('div');
        alert.className = `alert alert-${type} alert-dismissible fade show`;
        alert.innerHTML = `
            ${message}
            <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
        `;
        
        alertContainer.innerHTML = '';
        alertContainer.appendChild(alert);

        // Auto hide after 5 seconds
        setTimeout(() => {
            if (alert.parentNode) {
                alert.remove();
            }
        }, 5000);
    },

    // Format date
    formatDate(dateString) {
        return new Date(dateString).toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    },

    // Check if user is authenticated
    isAuthenticated() {
        return localStorage.getItem('authToken') !== null;
    },

    // Get user info from token (basic decode)
    getUserInfo() {
        const token = localStorage.getItem('authToken');
        if (!token) return null;

        try {
            const payload = JSON.parse(atob(token.split('.')[1]));
            return payload;
        } catch (error) {
            console.error('Error decoding token:', error);
            return null;
        }
    },

    // Logout user
    logout() {
        localStorage.removeItem('authToken');
        localStorage.removeItem('userInfo');
        window.location.href = '../index.html';
    },

    // Redirect if not authenticated
    requireAuth() {
        if (!this.isAuthenticated()) {
            window.location.href = '../index.html';
            return false;
        }
        return true;
    }
};

// Initialize API service
const api = new ApiService();
