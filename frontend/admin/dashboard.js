// Admin Dashboard JavaScript
let currentUsers = [];
let faceCapture = null;
let capturedFaceEmbeddings = null; // array of embeddings (multi-frame)

// Initialize dashboard
document.addEventListener('DOMContentLoaded', function() {
    // Check authentication
    if (!Utils.requireAuth()) return;
    
    // Load user info
    const userInfo = Utils.getUserInfo();
    if (userInfo && userInfo.username) {
        document.getElementById('adminName').textContent = userInfo.username;
    }
    
    // Load initial data
    loadUsers();
    updateStats();
});

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
    event.target.classList.add('active');
}

// Load users from API
async function loadUsers() {
    try {
        Utils.showLoading('Loading users...');
        const response = await api.getUsers();
        currentUsers = response.data || [];
        
        displayUsers();
        updateStats();
        Utils.hideLoading();
    } catch (error) {
        Utils.hideLoading();
        Utils.showAlert('Error loading users: ' + error.message, 'danger');
        console.error('Error loading users:', error);
    }
}

// Display users in table
function displayUsers() {
    const tbody = document.getElementById('usersTableBody');
    
    if (currentUsers.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="5" class="text-center text-muted">
                    <i class="fas fa-users fa-2x mb-2"></i>
                    <div>No users found</div>
                </td>
            </tr>
        `;
        return;
    }
    
    tbody.innerHTML = currentUsers.map(user => `
        <tr>
            <td><small class="text-muted">${user.id.substring(0, 8)}...</small></td>
            <td>
                <strong>${user.firstName} ${user.lastName}</strong>
                <br>
                <small class="text-muted">${user.role || 'user'}</small>
            </td>
            <td>
                <span class="badge bg-primary">${user.role || 'user'}</span>
            </td>
            <td>
                <small>${Utils.formatDate(user.createdAt)}</small>
            </td>
            <td>
                <button class="btn btn-sm btn-outline-primary me-1" onclick="editUser('${user.id}')">
                    <i class="fas fa-edit"></i>
                </button>
                <button class="btn btn-sm btn-outline-danger" onclick="deleteUser('${user.id}')">
                    <i class="fas fa-trash"></i>
                </button>
            </td>
        </tr>
    `).join('');
}

// Update dashboard stats
function updateStats() {
    const totalUsers = currentUsers.length;
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const weekAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
    
    // Count new users this week
    const newThisWeek = currentUsers.filter(user => 
        new Date(user.createdAt) >= weekAgo
    ).length;
    
    document.getElementById('totalUsers').textContent = totalUsers;
    document.getElementById('activeToday').textContent = Math.floor(totalUsers * 0.1); // Simulated
    document.getElementById('newThisWeek').textContent = newThisWeek;
}

// Face capture functions
async function startFaceCapture() {
    try {
        FaceUtils.showCameraPreview('cameraPreview');
        faceCapture = await FaceUtils.initFaceCapture();
        
        document.getElementById('captureBtn').disabled = false;
        Utils.showAlert('Camera started! Position your face in the camera and click capture.', 'info');
    } catch (error) {
        Utils.showAlert('Camera error: ' + error.message, 'danger');
    }
}

async function captureFace() {
    if (!faceCapture) {
        Utils.showAlert('Please start the camera first', 'warning');
        return;
    }
    
    try {
        Utils.showLoading('Processing face capture...');
    const result = await FaceUtils.captureFace(faceCapture, 5, 120, { debug: false });
    capturedFaceEmbeddings = result.embeddings; // store entire set
        
        // Show preview
        const preview = document.getElementById('capturePreview');
        preview.innerHTML = `
            <img src="${result.imageData}" class="img-fluid rounded" style="max-height: 200px;">
            <div class="text-success mt-2">
                <i class="fas fa-check-circle me-2"></i>
                Face captured successfully!
            </div>
        `;
        
        document.getElementById('submitBtn').disabled = false;
        Utils.hideLoading();
        Utils.showAlert('Face captured successfully!', 'success');
        
    } catch (error) {
        Utils.hideLoading();
        Utils.showAlert('Capture failed: ' + error.message, 'danger');
    }
}

function stopFaceCapture() {
    if (faceCapture) {
        faceCapture.stopCamera();
        faceCapture = null;
    }
    
    document.getElementById('cameraPreview').innerHTML = `
        <div class="text-center p-4 border rounded">
            <i class="fas fa-camera fa-3x text-muted mb-3"></i>
            <div>Click "Start Camera" to begin face capture</div>
        </div>
    `;
    
    document.getElementById('captureBtn').disabled = true;
}

// Add user form submission
document.getElementById('addUserForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const firstName = document.getElementById('firstName').value;
    const lastName = document.getElementById('lastName').value;
    
    if (!capturedFaceEmbeddings || !capturedFaceEmbeddings.length) {
        Utils.showAlert('Please capture a face first', 'warning');
        return;
    }
    
    Utils.showLoading('Adding user...');
    
    try {
    await api.userRegister(firstName, lastName, capturedFaceEmbeddings);
        
        Utils.hideLoading();
        Utils.showAlert('User added successfully!', 'success');
        
        // Reset form
        document.getElementById('addUserForm').reset();
    capturedFaceEmbeddings = null;
        document.getElementById('submitBtn').disabled = true;
        document.getElementById('capturePreview').innerHTML = `
            <i class="fas fa-image fa-3x text-muted mb-3"></i>
            <div class="text-muted">Captured face will appear here</div>
        `;
        
        stopFaceCapture();
        loadUsers();
        
    } catch (error) {
        Utils.hideLoading();
        Utils.showAlert('Error adding user: ' + error.message, 'danger');
    }
});

// Edit user
function editUser(userId) {
    const user = currentUsers.find(u => u.id === userId);
    if (!user) return;
    
    document.getElementById('editUserId').value = user.id;
    document.getElementById('editFirstName').value = user.firstName;
    document.getElementById('editLastName').value = user.lastName;
    
    const modal = new bootstrap.Modal(document.getElementById('editUserModal'));
    modal.show();
}

// Edit user form submission
document.getElementById('editUserForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const userId = document.getElementById('editUserId').value;
    const firstName = document.getElementById('editFirstName').value;
    const lastName = document.getElementById('editLastName').value;
    
    Utils.showLoading('Updating user...');
    
    try {
        await api.updateUser(userId, { firstName, lastName });
        
        Utils.hideLoading();
        Utils.showAlert('User updated successfully!', 'success');
        
        bootstrap.Modal.getInstance(document.getElementById('editUserModal')).hide();
        loadUsers();
        
    } catch (error) {
        Utils.hideLoading();
        Utils.showAlert('Error updating user: ' + error.message, 'danger');
    }
});

// Delete user
async function deleteUser(userId) {
    if (!confirm('Are you sure you want to delete this user? This action cannot be undone.')) {
        return;
    }
    
    Utils.showLoading('Deleting user...');
    
    try {
        await api.deleteUser(userId);
        
        Utils.hideLoading();
        Utils.showAlert('User deleted successfully!', 'success');
        loadUsers();
        
    } catch (error) {
        Utils.hideLoading();
        Utils.showAlert('Error deleting user: ' + error.message, 'danger');
    }
}
