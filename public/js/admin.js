const loginBox = document.getElementById('login-box');
const adminPanel = document.getElementById('admin-panel');
const loginBtn = document.getElementById('login-btn');
const passwordInput = document.getElementById('admin-password');
const loginFeedback = document.getElementById('login-feedback');
const tbody = document.querySelector('#reservations-table tbody');

function getPassword() {
  return sessionStorage.getItem('adminPassword');
}

function statusOptions(current) {
  const statuses = ['en attente', 'confirmée', 'annulée'];
  return statuses.map(s => `<option value="${s}" ${s === current ? 'selected' : ''}>${s}</option>`).join('');
}

async function loadReservations() {
  const password = getPassword();
  const res = await fetch('/api/reservations', {
    headers: { 'x-admin-password': password }
  });

  if (res.status === 401) {
    sessionStorage.removeItem('adminPassword');
    showLogin('Mot de passe incorrect.');
    return;
  }

  const reservations = await res.json();

  tbody.innerHTML = reservations.map(r => `
    <tr data-id="${r.id}">
      <td>${r.date}</td>
      <td>${r.time}</td>
      <td>${r.name}</td>
      <td>${r.email}<br>${r.phone}</td>
      <td>${r.guests}</td>
      <td>${r.message || '-'}</td>
      <td>
        <select class="status-select">${statusOptions(r.status)}</select>
      </td>
      <td>
        <button class="btn-small btn-delete">Supprimer</button>
      </td>
    </tr>
  `).join('') || '<tr><td colspan="8">Aucune réservation pour le moment.</td></tr>';
}

tbody.addEventListener('change', async (e) => {
  if (!e.target.classList.contains('status-select')) return;
  const row = e.target.closest('tr');
  const id = row.dataset.id;
  await fetch(`/api/reservations/${id}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      'x-admin-password': getPassword()
    },
    body: JSON.stringify({ status: e.target.value })
  });
});

tbody.addEventListener('click', async (e) => {
  if (!e.target.classList.contains('btn-delete')) return;
  const row = e.target.closest('tr');
  const id = row.dataset.id;
  if (!confirm('Supprimer cette réservation ?')) return;

  await fetch(`/api/reservations/${id}`, {
    method: 'DELETE',
    headers: { 'x-admin-password': getPassword() }
  });
  loadReservations();
});

// --- Onglets ---
const tabButtons = document.querySelectorAll('.tab-btn');
const tabPanels = {
  reservations: document.getElementById('tab-reservations'),
  carte: document.getElementById('tab-carte'),
  menu: document.getElementById('tab-menu'),
  security: document.getElementById('tab-security')
};

tabButtons.forEach(btn => {
  btn.addEventListener('click', () => {
    tabButtons.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    Object.entries(tabPanels).forEach(([key, panel]) => {
      panel.classList.toggle('hidden', key !== btn.dataset.tab);
    });

    if (btn.dataset.tab === 'carte') loadCartePreview();
    if (btn.dataset.tab === 'menu') loadMenuList();
  });
});

// --- Carte du moment (Nourriture + Boissons) ---
function setupCarteForm({ type, settingKey, formId, feedbackId, previewId, fileId }) {
  const form = document.getElementById(formId);
  const feedback = document.getElementById(feedbackId);
  const preview = document.getElementById(previewId);

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fileInput = document.getElementById(fileId);
    if (!fileInput.files[0]) return;

    const formData = new FormData();
    formData.append('type', type);
    formData.append('carte', fileInput.files[0]);

    feedback.className = 'form-feedback';
    feedback.textContent = 'Envoi en cours...';

    try {
      const res = await fetch('/api/admin/carte', {
        method: 'POST',
        headers: { 'x-admin-password': getPassword() },
        body: formData
      });
      const result = await res.json();

      if (!res.ok) throw new Error(result.error || 'Erreur lors de l\'envoi.');

      feedback.textContent = 'Carte mise à jour avec succès !';
      feedback.classList.add('success');
      form.reset();
      preview.src = `${result[settingKey]}?t=${Date.now()}`;
      preview.classList.remove('hidden');
    } catch (err) {
      feedback.textContent = err.message;
      feedback.classList.add('error');
    }
  });

  return { preview };
}

const carteNourriturePreview = setupCarteForm({
  type: 'nourriture',
  settingKey: 'carteNourriture',
  formId: 'carte-nourriture-form',
  feedbackId: 'carte-nourriture-feedback',
  previewId: 'admin-carte-nourriture-preview',
  fileId: 'carte-nourriture-file'
}).preview;

const carteBoissonPreview = setupCarteForm({
  type: 'boisson',
  settingKey: 'carteBoisson',
  formId: 'carte-boisson-form',
  feedbackId: 'carte-boisson-feedback',
  previewId: 'admin-carte-boisson-preview',
  fileId: 'carte-boisson-file'
}).preview;

async function loadCartePreview() {
  const res = await fetch('/api/settings');
  const settings = await res.json();

  if (settings.carteNourriture) {
    carteNourriturePreview.src = `${settings.carteNourriture}?t=${Date.now()}`;
  }

  if (settings.carteBoisson) {
    carteBoissonPreview.src = `${settings.carteBoisson}?t=${Date.now()}`;
    carteBoissonPreview.classList.remove('hidden');
  } else {
    carteBoissonPreview.classList.add('hidden');
  }

  fillChefSuggestion(settings.chefSuggestion);
  fillBarSuggestion(settings.barSuggestion);
}

// --- Suggestions (chef / bar) ---
function setupSuggestionForm({ prefix, endpoint, confirmLabel }) {
  const form = document.getElementById(`${prefix}-suggestion-form`);
  const feedback = document.getElementById(`${prefix}-suggestion-feedback`);
  const nameInput = document.getElementById(`${prefix}-suggestion-name`);
  const descriptionInput = document.getElementById(`${prefix}-suggestion-description`);
  const priceInput = document.getElementById(`${prefix}-suggestion-price`);
  const photoInput = document.getElementById(`${prefix}-suggestion-photo`);
  const preview = document.getElementById(`${prefix}-suggestion-preview`);
  const photoPreview = document.getElementById(`${prefix}-suggestion-photo-preview`);
  const removeBtn = document.getElementById(`${prefix}-suggestion-remove-btn`);

  function fill(suggestion) {
    if (suggestion) {
      nameInput.value = suggestion.name;
      descriptionInput.value = suggestion.description || '';
      priceInput.value = suggestion.price;
      removeBtn.classList.remove('hidden');
      if (suggestion.photo) {
        photoPreview.src = `${suggestion.photo}?t=${Date.now()}`;
        preview.classList.remove('hidden');
      } else {
        preview.classList.add('hidden');
      }
    } else {
      form.reset();
      removeBtn.classList.add('hidden');
      preview.classList.add('hidden');
    }
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const formData = new FormData();
    formData.append('name', nameInput.value.trim());
    formData.append('description', descriptionInput.value.trim());
    formData.append('price', priceInput.value);
    if (photoInput.files[0]) {
      formData.append('photo', photoInput.files[0]);
    }

    feedback.className = 'form-feedback';
    feedback.textContent = 'Enregistrement...';

    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'x-admin-password': getPassword() },
        body: formData
      });
      const result = await res.json();

      if (!res.ok) throw new Error(result.error || 'Erreur lors de l\'enregistrement.');

      feedback.textContent = 'Suggestion enregistrée avec succès !';
      feedback.classList.add('success');
      photoInput.value = '';
      fill(result);
    } catch (err) {
      feedback.textContent = err.message;
      feedback.classList.add('error');
    }
  });

  removeBtn.addEventListener('click', async () => {
    if (!confirm(`Retirer ${confirmLabel} ?`)) return;
    await fetch(endpoint, {
      method: 'DELETE',
      headers: { 'x-admin-password': getPassword() }
    });
    fill(null);
    feedback.textContent = '';
  });

  return fill;
}

const fillChefSuggestion = setupSuggestionForm({
  prefix: 'chef',
  endpoint: '/api/admin/chef-suggestion',
  confirmLabel: 'la suggestion du chef'
});

const fillBarSuggestion = setupSuggestionForm({
  prefix: 'bar',
  endpoint: '/api/admin/bar-suggestion',
  confirmLabel: 'la suggestion du bar'
});

// --- Menu détaillé ---
const menuList = document.getElementById('menu-list');
const menuForm = document.getElementById('menu-form');
const menuFeedback = document.getElementById('menu-feedback');
const menuFormTitle = document.getElementById('menu-form-title');
const menuSubmitBtn = document.getElementById('menu-submit-btn');
const menuCancelBtn = document.getElementById('menu-cancel-btn');
const menuItemIdInput = document.getElementById('menu-item-id');
const menuCategoryInput = document.getElementById('menu-category');
const menuNameInput = document.getElementById('menu-name');
const menuDescriptionInput = document.getElementById('menu-description');
const menuPriceInput = document.getElementById('menu-price');
const menuPhotoInput = document.getElementById('menu-photo');
const menuTypeInput = document.getElementById('menu-type');
const menuFilterButtons = document.querySelectorAll('.menu-filter-btn');
let currentMenuFilter = 'nourriture';

async function loadMenuList() {
  const res = await fetch('/api/menu');
  const items = await res.json();
  const filtered = items.filter(item => (item.type || 'nourriture') === currentMenuFilter);

  menuList.innerHTML = filtered.map(item => `
    <div class="admin-menu-item" data-id="${item.id}">
      <div class="admin-menu-item-body">
        <span class="admin-menu-item-category">${item.category}</span>
        <h4>${item.name}</h4>
        <p>${item.description || ''}</p>
        ${item.photo ? `<img src="${item.photo}" alt="${item.name}" class="admin-menu-item-photo">` : ''}
        <span class="admin-menu-item-price">${item.price.toFixed(2)} €</span>
      </div>
      <div class="admin-menu-item-actions">
        <button class="btn-small btn-edit">Modifier</button>
        ${item.photo ? '<button class="btn-small btn-remove-photo">Retirer la photo</button>' : ''}
        <button class="btn-small btn-delete">Supprimer</button>
      </div>
    </div>
  `).join('') || '<p>Aucun plat dans cette carte pour le moment.</p>';
}

menuFilterButtons.forEach(btn => {
  btn.addEventListener('click', () => {
    menuFilterButtons.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    currentMenuFilter = btn.dataset.filter;
    resetMenuForm();
    loadMenuList();
  });
});

function resetMenuForm() {
  menuForm.reset();
  menuItemIdInput.value = '';
  menuTypeInput.value = currentMenuFilter;
  menuFormTitle.textContent = 'Ajouter un plat';
  menuSubmitBtn.textContent = 'Ajouter au menu';
  menuCancelBtn.classList.add('hidden');
}

menuCancelBtn.addEventListener('click', resetMenuForm);

menuList.addEventListener('click', async (e) => {
  const row = e.target.closest('.admin-menu-item');
  if (!row) return;
  const id = row.dataset.id;

  if (e.target.classList.contains('btn-delete')) {
    if (!confirm('Supprimer ce plat ?')) return;
    await fetch(`/api/menu/${id}`, {
      method: 'DELETE',
      headers: { 'x-admin-password': getPassword() }
    });
    loadMenuList();
  }

  if (e.target.classList.contains('btn-remove-photo')) {
    if (!confirm('Retirer la photo de ce plat ?')) return;
    await fetch(`/api/menu/${id}/photo`, {
      method: 'DELETE',
      headers: { 'x-admin-password': getPassword() }
    });
    loadMenuList();
  }

  if (e.target.classList.contains('btn-edit')) {
    const res = await fetch('/api/menu');
    const items = await res.json();
    const item = items.find(i => String(i.id) === id);
    if (!item) return;

    menuItemIdInput.value = item.id;
    menuTypeInput.value = item.type || 'nourriture';
    menuCategoryInput.value = item.category;
    menuNameInput.value = item.name;
    menuDescriptionInput.value = item.description || '';
    menuPriceInput.value = item.price;
    menuFormTitle.textContent = 'Modifier le plat';
    menuSubmitBtn.textContent = 'Enregistrer les modifications';
    menuCancelBtn.classList.remove('hidden');
    menuForm.scrollIntoView({ behavior: 'smooth' });
  }
});

menuForm.addEventListener('submit', async (e) => {
  e.preventDefault();

  const formData = new FormData();
  formData.append('type', menuTypeInput.value);
  formData.append('category', menuCategoryInput.value.trim());
  formData.append('name', menuNameInput.value.trim());
  formData.append('description', menuDescriptionInput.value.trim());
  formData.append('price', menuPriceInput.value);
  if (menuPhotoInput.files[0]) {
    formData.append('photo', menuPhotoInput.files[0]);
  }

  const id = menuItemIdInput.value;
  const url = id ? `/api/menu/${id}` : '/api/menu';
  const method = id ? 'PUT' : 'POST';

  menuFeedback.className = 'form-feedback';
  menuFeedback.textContent = 'Enregistrement...';

  try {
    const res = await fetch(url, {
      method,
      headers: { 'x-admin-password': getPassword() },
      body: formData
    });
    const result = await res.json();

    if (!res.ok) throw new Error(result.error || 'Erreur lors de l\'enregistrement.');

    menuFeedback.textContent = 'Plat enregistré avec succès !';
    menuFeedback.classList.add('success');
    resetMenuForm();
    loadMenuList();
  } catch (err) {
    menuFeedback.textContent = err.message;
    menuFeedback.classList.add('error');
  }
});

function showLogin(message) {
  loginBox.classList.remove('hidden');
  adminPanel.classList.add('hidden');
  loginFeedback.textContent = message || '';
}

function showPanel() {
  loginBox.classList.add('hidden');
  adminPanel.classList.remove('hidden');
  loadReservations();
}

loginBtn.addEventListener('click', () => {
  const password = passwordInput.value;
  if (!password) return;
  sessionStorage.setItem('adminPassword', password);
  showPanel();
});

passwordInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') loginBtn.click();
});

if (getPassword()) {
  showPanel();
} else {
  showLogin();
}

// --- Afficher/masquer les mots de passe ---
document.querySelectorAll('.password-toggle').forEach(btn => {
  const input = document.getElementById(btn.dataset.target);
  const eyeIcon = btn.querySelector('.icon-eye');
  const eyeOffIcon = btn.querySelector('.icon-eye-off');

  btn.addEventListener('click', () => {
    const isHidden = input.type === 'password';
    input.type = isHidden ? 'text' : 'password';
    eyeIcon.classList.toggle('hidden', isHidden);
    eyeOffIcon.classList.toggle('hidden', !isHidden);
    btn.setAttribute('aria-label', isHidden ? 'Masquer le mot de passe' : 'Afficher le mot de passe');
  });
});

// --- Mot de passe oublié ---
const loginForm = document.getElementById('login-form');
const forgotPasswordForm = document.getElementById('forgot-password-form');
const forgotPasswordLink = document.getElementById('forgot-password-link');
const backToLoginLink = document.getElementById('back-to-login-link');
const forgotStepRequest = document.getElementById('forgot-step-request');
const forgotStepReset = document.getElementById('forgot-step-reset');
const sendResetCodeBtn = document.getElementById('send-reset-code-btn');
const resetPasswordBtn = document.getElementById('reset-password-btn');
const resetCodeInput = document.getElementById('reset-code');
const resetNewPasswordInput = document.getElementById('reset-new-password');
const forgotPasswordFeedback = document.getElementById('forgot-password-feedback');

function resetForgotPasswordForm() {
  forgotStepRequest.classList.remove('hidden');
  forgotStepReset.classList.add('hidden');
  resetCodeInput.value = '';
  resetNewPasswordInput.value = '';
  forgotPasswordFeedback.textContent = '';
  forgotPasswordFeedback.className = 'form-feedback';
}

forgotPasswordLink.addEventListener('click', (e) => {
  e.preventDefault();
  resetForgotPasswordForm();
  loginForm.classList.add('hidden');
  forgotPasswordForm.classList.remove('hidden');
});

backToLoginLink.addEventListener('click', (e) => {
  e.preventDefault();
  forgotPasswordForm.classList.add('hidden');
  loginForm.classList.remove('hidden');
});

sendResetCodeBtn.addEventListener('click', async () => {
  forgotPasswordFeedback.className = 'form-feedback';
  forgotPasswordFeedback.textContent = 'Envoi en cours...';

  try {
    const res = await fetch('/api/admin/forgot-password', { method: 'POST' });
    const result = await res.json();

    if (!res.ok) throw new Error(result.error || 'Erreur lors de l\'envoi du code.');

    forgotPasswordFeedback.textContent = 'Code envoyé ! Vérifie ta boîte mail.';
    forgotPasswordFeedback.classList.add('success');
    forgotStepRequest.classList.add('hidden');
    forgotStepReset.classList.remove('hidden');
  } catch (err) {
    forgotPasswordFeedback.textContent = err.message;
    forgotPasswordFeedback.classList.add('error');
  }
});

resetPasswordBtn.addEventListener('click', async () => {
  const code = resetCodeInput.value.trim();
  const newPassword = resetNewPasswordInput.value;

  if (!code || !newPassword) {
    forgotPasswordFeedback.className = 'form-feedback error';
    forgotPasswordFeedback.textContent = 'Merci de remplir tous les champs.';
    return;
  }

  forgotPasswordFeedback.className = 'form-feedback';
  forgotPasswordFeedback.textContent = 'Réinitialisation en cours...';

  try {
    const res = await fetch('/api/admin/reset-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code, newPassword })
    });
    const result = await res.json();

    if (!res.ok) throw new Error(result.error || 'Erreur lors de la réinitialisation.');

    sessionStorage.setItem('adminPassword', newPassword);
    forgotPasswordForm.classList.add('hidden');
    loginForm.classList.remove('hidden');
    showPanel();
  } catch (err) {
    forgotPasswordFeedback.textContent = err.message;
    forgotPasswordFeedback.classList.add('error');
  }
});

// --- Changer le mot de passe (espace sécurité) ---
const changePasswordForm = document.getElementById('change-password-form');
const currentPasswordInput = document.getElementById('current-password');
const newPasswordInput = document.getElementById('new-password');
const confirmNewPasswordInput = document.getElementById('confirm-new-password');
const changePasswordFeedback = document.getElementById('change-password-feedback');

changePasswordForm.addEventListener('submit', async (e) => {
  e.preventDefault();

  const currentPassword = currentPasswordInput.value;
  const newPassword = newPasswordInput.value;
  const confirmNewPassword = confirmNewPasswordInput.value;

  changePasswordFeedback.className = 'form-feedback';

  if (newPassword !== confirmNewPassword) {
    changePasswordFeedback.textContent = 'Les nouveaux mots de passe ne correspondent pas.';
    changePasswordFeedback.classList.add('error');
    return;
  }

  changePasswordFeedback.textContent = 'Enregistrement...';

  try {
    const res = await fetch('/api/admin/change-password', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-admin-password': getPassword()
      },
      body: JSON.stringify({ currentPassword, newPassword })
    });
    const result = await res.json();

    if (!res.ok) throw new Error(result.error || 'Erreur lors du changement de mot de passe.');

    sessionStorage.setItem('adminPassword', newPassword);
    changePasswordFeedback.textContent = 'Mot de passe modifié avec succès !';
    changePasswordFeedback.classList.add('success');
    changePasswordForm.reset();
  } catch (err) {
    changePasswordFeedback.textContent = err.message;
    changePasswordFeedback.classList.add('error');
  }
});
