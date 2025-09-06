// User Dashboard JavaScript
let currentUser = null;

// Initialize dashboard
document.addEventListener('DOMContentLoaded', function() {
    // Check authentication
    if (!Utils.requireAuth()) return;
    
    // Check user role
    const userInfo = Utils.getUserInfo();
    if (!userInfo || userInfo.role !== 'user') {
        Utils.logout();
        return;
    }
    
    // Load user data (refresh from backend to ensure accuracy)
    refreshUserFromServer();
    updateDateTime();
    setInterval(updateDateTime, 60000); // Update every minute
});

// Load user data
function loadUserData() {
    const userInfo = JSON.parse(localStorage.getItem('userInfo') || '{}');
    currentUser = userInfo;
    
    if (userInfo) {
        // Update user name in sidebar
        document.getElementById('userName').textContent = 
            `${userInfo.firstName} ${userInfo.lastName}`;
        
        // Update welcome message
        document.getElementById('welcomeName').textContent = userInfo.firstName;
        
        // Update profile form
        document.getElementById('profileFirstName').value = userInfo.firstName || '';
        document.getElementById('profileLastName').value = userInfo.lastName || '';
        document.getElementById('profileId').value = userInfo.id || '';
        document.getElementById('profileCreated').value = 
            userInfo.createdAt ? Utils.formatDate(userInfo.createdAt) : '';
        
        // Update last login
        document.getElementById('lastLogin').textContent = 'Just now';
    }
}

// Refresh current user from backend /users/me
async function refreshUserFromServer() {
    try {
        const response = await api.getCurrentUser();
        if (response && response.data) {
            localStorage.setItem('userInfo', JSON.stringify(response.data));
            loadUserData();
        }
    } catch (err) {
        console.error('Failed to refresh user profile', err);
        // Fallback to existing local storage
        loadUserData();
    }
}

// Show/Hide sections
function showSection(sectionName) {
    // Hide all sections
    document.querySelectorAll('.content-section').forEach(section => {
        section.style.display = 'none';
    });
    
    // Remove active class from nav links
    document.querySelectorAll('.nav-link').forEach(link => {
        link.classList.remove('active');
    });
    
    // Show selected section
    const section = document.getElementById(sectionName + 'Section');
    if (section) {
        section.style.display = 'block';
    }
    
    // Add active class to clicked nav link
    if (event && event.target) {
        event.target.classList.add('active');
    }
}

// Update date and time
function updateDateTime() {
    const now = new Date();
    const options = {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    };
    
    document.getElementById('currentDate').textContent = 
        now.toLocaleDateString('en-US', options);
}

// Profile form submission
document.getElementById('profileForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const firstName = document.getElementById('profileFirstName').value;
    const lastName = document.getElementById('profileLastName').value;
    
    if (!currentUser || !currentUser.id) {
        Utils.showAlert('User information not found', 'danger');
        return;
    }
    
    Utils.showLoading('Updating profile...');
    
    try {
        await api.updateUser(currentUser.id, { firstName, lastName });
        
        // Update local user info
        const updatedUser = { ...currentUser, firstName, lastName };
        localStorage.setItem('userInfo', JSON.stringify(updatedUser));
        
        // Reload user data
        loadUserData();
        
        Utils.hideLoading();
        Utils.showAlert('Profile updated successfully!', 'success');
        
    } catch (error) {
        Utils.hideLoading();
        Utils.showAlert('Error updating profile: ' + error.message, 'danger');
    }
});

// Load activity history (simulated)
function loadActivityHistory() {
    const activities = [
        {
            date: new Date(),
            status: 'success',
            method: 'Face ID',
            ip: '192.168.1.100'
        },
        {
            date: new Date(Date.now() - 86400000), // Yesterday
            status: 'success',
            method: 'Face ID',
            ip: '192.168.1.100'
        },
        {
            date: new Date(Date.now() - 172800000), // 2 days ago
            status: 'success',
            method: 'Face ID',
            ip: '192.168.1.105'
        }
    ];
    
    const tbody = document.getElementById('activityTableBody');
    tbody.innerHTML = activities.map(activity => `
        <tr>
            <td>${Utils.formatDate(activity.date)}</td>
            <td>
                <span class="badge bg-${activity.status === 'success' ? 'success' : 'danger'}">
                    ${activity.status === 'success' ? 'Success' : 'Failed'}
                </span>
            </td>
            <td>
                <i class="fas fa-camera me-2"></i>
                ${activity.method}
            </td>
            <td>${activity.ip}</td>
        </tr>
    `).join('');
}

// Initialize activity history when activity section is shown
document.addEventListener('click', function(e) {
    if (e.target.getAttribute('onclick') === "showSection('activity')") {
        setTimeout(loadActivityHistory, 100);
    }
});

// Settings form handlers
document.getElementById('enableNotifications')?.addEventListener('change', function() {
    const enabled = this.checked;
    localStorage.setItem('notificationsEnabled', enabled);
    Utils.showAlert(`Notifications ${enabled ? 'enabled' : 'disabled'}`, 'info');
});

document.getElementById('enableFaceId')?.addEventListener('change', function() {
    if (!this.checked) {
        if (!confirm('Disabling Face ID will require you to use alternative authentication. Are you sure?')) {
            this.checked = true;
            return;
        }
    }
    
    const enabled = this.checked;
    localStorage.setItem('faceIdEnabled', enabled);
    Utils.showAlert(`Face ID ${enabled ? 'enabled' : 'disabled'}`, enabled ? 'success' : 'warning');
});

document.getElementById('shareAnalytics')?.addEventListener('change', function() {
    const enabled = this.checked;
    localStorage.setItem('analyticsEnabled', enabled);
    Utils.showAlert(`Analytics sharing ${enabled ? 'enabled' : 'disabled'}`, 'info');
});

// Load saved settings
function loadSettings() {
    const notifications = localStorage.getItem('notificationsEnabled');
    const faceId = localStorage.getItem('faceIdEnabled');
    const analytics = localStorage.getItem('analyticsEnabled');
    
    if (notifications !== null) {
        document.getElementById('enableNotifications').checked = notifications === 'true';
    }
    
    if (faceId !== null) {
        document.getElementById('enableFaceId').checked = faceId === 'true';
    }
    
    if (analytics !== null) {
        document.getElementById('shareAnalytics').checked = analytics === 'true';
    }
}

// Load settings when page loads
setTimeout(loadSettings, 100);
