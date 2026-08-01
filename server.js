require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const multer = require('multer');
const { put, del } = require('@vercel/blob');
const db = require('./db');
const { sendReservationConfirmation, sendAdminPasswordReset } = require('./mailer');

const app = express();
const PORT = process.env.PORT || 3000;
const ADMIN_EMAIL = process.env.ADMIN_EMAIL;
const MENU_TYPES = ['nourriture', 'boisson'];

function imageFileFilter(req, file, cb) {
  if (!file.mimetype.startsWith('image/')) {
    return cb(new Error('Le fichier doit être une image.'));
  }
  cb(null, true);
}

function makeUploader(maxSizeMb) {
  return multer({
    storage: multer.memoryStorage(),
    fileFilter: imageFileFilter,
    limits: { fileSize: maxSizeMb * 1024 * 1024 }
  });
}

const uploadMenuPhoto = makeUploader(5);
const uploadCarte = makeUploader(8);

async function uploadToBlob(file, folder) {
  const safeName = file.originalname.replace(/[^a-zA-Z0-9.\-]/g, '-');
  const pathname = `${folder}/${Date.now()}-${safeName}`;
  const blob = await put(pathname, file.buffer, {
    access: 'public',
    contentType: file.mimetype
  });
  return blob.url;
}

async function deleteFromBlob(url) {
  if (!url || !url.includes('blob.vercel-storage.com')) return;
  try {
    await del(url);
  } catch (err) {
    // le fichier a peut-être déjà été supprimé, on ignore
  }
}

const MAINTENANCE_MODE = process.env.MAINTENANCE_MODE !== 'false';
const MAINTENANCE_BYPASS_KEY = process.env.MAINTENANCE_BYPASS_KEY || '';

const MAINTENANCE_PAGE = `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Le P'tit Bistro Réunionnais | Bientôt en ligne</title>
<style>
  body { margin: 0; min-height: 100vh; display: flex; align-items: center; justify-content: center; background: #faf8f5; color: #111111; font-family: 'Poppins', Arial, sans-serif; text-align: center; padding: 2rem; box-sizing: border-box; }
  .box { max-width: 480px; }
  h1 { font-family: 'Playfair Display', serif; font-size: 2rem; margin: 0 0 1rem; }
  p { color: #6f6f6f; line-height: 1.6; }
</style>
</head>
<body>
  <div class="box">
    <h1>Le P'tit Bistro Réunionnais</h1>
    <p>Notre site est actuellement en préparation.<br>Merci de votre patience, nous serons bientôt en ligne.</p>
  </div>
</body>
</html>`;

function hasMaintenanceBypass(req) {
  if (!MAINTENANCE_BYPASS_KEY) return false;
  if (req.query.key === MAINTENANCE_BYPASS_KEY) return true;
  const cookie = req.headers.cookie || '';
  return cookie.split(';').some(c => c.trim() === `bypass=${MAINTENANCE_BYPASS_KEY}`);
}

app.use((req, res, next) => {
  if (!MAINTENANCE_MODE) return next();
  if (hasMaintenanceBypass(req)) {
    if (req.query.key === MAINTENANCE_BYPASS_KEY) {
      res.cookie('bypass', MAINTENANCE_BYPASS_KEY, { maxAge: 30 * 24 * 60 * 60 * 1000, httpOnly: true, sameSite: 'lax' });
    }
    return next();
  }
  if (req.path.startsWith('/api/')) {
    return res.status(503).json({ error: 'Site en maintenance.' });
  }
  res.status(503).type('html').send(MAINTENANCE_PAGE);
});

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

let dbReady = null;
app.use((req, res, next) => {
  if (!dbReady) dbReady = db.init();
  dbReady.then(() => next()).catch(next);
});

async function requireAdmin(req, res, next) {
  const password = req.header('x-admin-password') || '';
  const valid = await db.verifyAdminPassword(password);
  if (!valid) {
    return res.status(401).json({ error: 'Non autorisé' });
  }
  next();
}

// --- Mot de passe admin ---
app.post('/api/admin/change-password', requireAdmin, async (req, res) => {
  const { currentPassword, newPassword } = req.body;

  if (!currentPassword || !newPassword) {
    return res.status(400).json({ error: 'Merci de remplir tous les champs.' });
  }
  if (newPassword.length < 6) {
    return res.status(400).json({ error: 'Le nouveau mot de passe doit contenir au moins 6 caractères.' });
  }

  const valid = await db.verifyAdminPassword(currentPassword);
  if (!valid) {
    return res.status(401).json({ error: 'Mot de passe actuel incorrect.' });
  }

  await db.setAdminPassword(newPassword);
  res.json({ success: true });
});

app.post('/api/admin/forgot-password', async (req, res) => {
  if (!ADMIN_EMAIL) {
    return res.status(400).json({ error: 'Aucune adresse email de récupération n\'est configurée (ADMIN_EMAIL).' });
  }

  const code = String(Math.floor(100000 + Math.random() * 900000));
  await db.setResetToken({ code, expiresAt: Date.now() + 15 * 60 * 1000 });

  const result = await sendAdminPasswordReset(ADMIN_EMAIL, code);
  if (!result.sent) {
    return res.status(500).json({ error: 'Impossible d\'envoyer l\'email pour le moment. Vérifie la configuration SMTP.' });
  }

  res.json({ success: true });
});

app.post('/api/admin/reset-password', async (req, res) => {
  const { code, newPassword } = req.body;

  if (!code || !newPassword) {
    return res.status(400).json({ error: 'Merci de remplir tous les champs.' });
  }
  if (newPassword.length < 6) {
    return res.status(400).json({ error: 'Le nouveau mot de passe doit contenir au moins 6 caractères.' });
  }

  const token = await db.getResetToken();
  if (!token || token.code !== code || Date.now() > token.expiresAt) {
    return res.status(401).json({ error: 'Code invalide ou expiré.' });
  }

  await db.setAdminPassword(newPassword);
  await db.setResetToken(null);
  res.json({ success: true });
});

// --- Réglages (carte du moment) ---
app.get('/api/settings', async (req, res) => {
  res.json(await db.getSettings());
});

app.post('/api/admin/carte', requireAdmin, uploadCarte.single('carte'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'Aucune image reçue.' });
  }

  const type = MENU_TYPES.includes(req.body.type) ? req.body.type : 'nourriture';
  const settingKey = type === 'boisson' ? 'carteBoisson' : 'carteNourriture';

  const settings = await db.getSettings();
  const previous = settings[settingKey];
  const carteImage = await uploadToBlob(req.file, 'carte');

  settings[settingKey] = carteImage;
  await db.setSettings(settings);
  await deleteFromBlob(previous);

  res.json({ [settingKey]: carteImage, type });
});

app.post('/api/admin/chef-suggestion', requireAdmin, uploadMenuPhoto.single('photo'), async (req, res) => {
  const { name, description, price } = req.body;

  if (!name || !price) {
    return res.status(400).json({ error: 'Le nom et le prix du plat sont obligatoires.' });
  }

  const settings = await db.getSettings();
  const previousPhoto = settings.chefSuggestion ? settings.chefSuggestion.photo : '';

  const chefSuggestion = {
    name,
    description: description || '',
    price: Number(price),
    photo: req.file ? await uploadToBlob(req.file, 'chef') : previousPhoto || ''
  };

  settings.chefSuggestion = chefSuggestion;
  await db.setSettings(settings);

  if (req.file) {
    await deleteFromBlob(previousPhoto);
  }

  res.json(chefSuggestion);
});

app.delete('/api/admin/chef-suggestion', requireAdmin, async (req, res) => {
  const settings = await db.getSettings();

  if (settings.chefSuggestion) {
    await deleteFromBlob(settings.chefSuggestion.photo);
  }

  settings.chefSuggestion = null;
  await db.setSettings(settings);

  res.status(204).end();
});

app.post('/api/admin/bar-suggestion', requireAdmin, uploadMenuPhoto.single('photo'), async (req, res) => {
  const { name, description, price } = req.body;

  if (!name || !price) {
    return res.status(400).json({ error: 'Le nom et le prix sont obligatoires.' });
  }

  const settings = await db.getSettings();
  const previousPhoto = settings.barSuggestion ? settings.barSuggestion.photo : '';

  const barSuggestion = {
    name,
    description: description || '',
    price: Number(price),
    photo: req.file ? await uploadToBlob(req.file, 'bar') : previousPhoto || ''
  };

  settings.barSuggestion = barSuggestion;
  await db.setSettings(settings);

  if (req.file) {
    await deleteFromBlob(previousPhoto);
  }

  res.json(barSuggestion);
});

app.delete('/api/admin/bar-suggestion', requireAdmin, async (req, res) => {
  const settings = await db.getSettings();

  if (settings.barSuggestion) {
    await deleteFromBlob(settings.barSuggestion.photo);
  }

  settings.barSuggestion = null;
  await db.setSettings(settings);

  res.status(204).end();
});

// --- Menu ---
app.get('/api/menu', async (req, res) => {
  res.json(await db.getMenu());
});

app.post('/api/menu', requireAdmin, uploadMenuPhoto.single('photo'), async (req, res) => {
  const { category, name, description, price, type } = req.body;

  if (!category || !name || !price) {
    return res.status(400).json({ error: 'Catégorie, nom et prix sont obligatoires.' });
  }

  const menu = await db.getMenu();
  const id = await db.getNextMenuId();

  const item = {
    id,
    category,
    name,
    description: description || '',
    price: Number(price),
    photo: req.file ? await uploadToBlob(req.file, 'menu') : '',
    type: MENU_TYPES.includes(type) ? type : 'nourriture'
  };

  menu.push(item);
  await db.setMenu(menu);
  await db.setNextMenuId(id + 1);

  res.status(201).json(item);
});

app.put('/api/menu/:id', requireAdmin, uploadMenuPhoto.single('photo'), async (req, res) => {
  const id = Number(req.params.id);
  const menu = await db.getMenu();
  const item = menu.find(i => i.id === id);

  if (!item) {
    return res.status(404).json({ error: 'Plat introuvable.' });
  }

  const { category, name, description, price, type } = req.body;
  if (category) item.category = category;
  if (name) item.name = name;
  if (description !== undefined) item.description = description;
  if (price) item.price = Number(price);
  if (MENU_TYPES.includes(type)) item.type = type;

  if (req.file) {
    const previousPhoto = item.photo;
    item.photo = await uploadToBlob(req.file, 'menu');
    await deleteFromBlob(previousPhoto);
  }

  await db.setMenu(menu);
  res.json(item);
});

app.delete('/api/menu/:id/photo', requireAdmin, async (req, res) => {
  const id = Number(req.params.id);
  const menu = await db.getMenu();
  const item = menu.find(i => i.id === id);

  if (!item) {
    return res.status(404).json({ error: 'Plat introuvable.' });
  }

  await deleteFromBlob(item.photo);
  item.photo = '';
  await db.setMenu(menu);
  res.json(item);
});

app.delete('/api/menu/:id', requireAdmin, async (req, res) => {
  const id = Number(req.params.id);
  const menu = await db.getMenu();
  const item = menu.find(i => i.id === id);

  if (item) {
    await deleteFromBlob(item.photo);
  }

  await db.setMenu(menu.filter(i => i.id !== id));
  res.status(204).end();
});

// --- Réservations ---
// 0 = Dimanche ... 6 = Samedi. null = fermé ce jour-là.
const SERVICE_HOURS = {
  0: null,
  1: null,
  2: null,
  3: [['11:30', '14:00']],
  4: [['11:30', '14:00'], ['19:00', '22:00']],
  5: [['11:30', '14:00'], ['19:00', '22:00']],
  6: [['11:30', '14:00'], ['19:00', '22:00']]
};

function isWithinServiceHours(dateStr, timeStr) {
  const day = new Date(`${dateStr}T00:00:00`).getDay();
  const windows = SERVICE_HOURS[day];
  if (!windows) return false;
  return windows.some(([start, end]) => timeStr >= start && timeStr < end);
}

app.post('/api/reservations', async (req, res) => {
  const { name, email, phone, date, time, guests, message } = req.body;

  if (!name || !email || !phone || !date || !time || !guests) {
    return res.status(400).json({ error: 'Merci de remplir tous les champs obligatoires.' });
  }

  if (!isWithinServiceHours(date, time)) {
    return res.status(400).json({ error: 'Ce créneau n\'est pas disponible. Merci de choisir un jour et un horaire d\'ouverture (mer.–sam.).' });
  }

  const reservations = await db.getReservations();
  const id = await db.getNextReservationId();

  const reservation = {
    id,
    name,
    email,
    phone,
    date,
    time,
    guests: Number(guests),
    message: message || '',
    status: 'en attente',
    createdAt: new Date().toISOString()
  };

  reservations.push(reservation);
  await db.setReservations(reservations);
  await db.setNextReservationId(id + 1);

  res.status(201).json(reservation);
});

app.get('/api/reservations', requireAdmin, async (req, res) => {
  const reservations = await db.getReservations();
  reservations.sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
  res.json(reservations);
});

app.patch('/api/reservations/:id', requireAdmin, async (req, res) => {
  const id = Number(req.params.id);
  const { status } = req.body;
  const allowed = ['en attente', 'confirmée', 'annulée'];

  if (!allowed.includes(status)) {
    return res.status(400).json({ error: 'Statut invalide.' });
  }

  const reservations = await db.getReservations();
  const reservation = reservations.find(r => r.id === id);

  if (!reservation) {
    return res.status(404).json({ error: 'Réservation introuvable.' });
  }

  const wasAlreadyConfirmed = reservation.status === 'confirmée';
  reservation.status = status;
  await db.setReservations(reservations);

  if (status === 'confirmée' && !wasAlreadyConfirmed) {
    await sendReservationConfirmation(reservation);
  }

  res.json(reservation);
});

app.delete('/api/reservations/:id', requireAdmin, async (req, res) => {
  const id = Number(req.params.id);
  const reservations = await db.getReservations();
  await db.setReservations(reservations.filter(r => r.id !== id));
  res.status(204).end();
});

app.use((err, req, res, next) => {
  if (err) {
    return res.status(400).json({ error: err.message || 'Erreur lors du téléchargement du fichier.' });
  }
  next();
});

if (!process.env.VERCEL) {
  app.listen(PORT, () => {
    console.log(`Site du restaurant disponible sur http://localhost:${PORT}`);
  });
}

module.exports = app;
