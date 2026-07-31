require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const multer = require('multer');
const { put, del } = require('@vercel/blob');
const db = require('./db');
const { sendReservationConfirmation } = require('./mailer');

const app = express();
const PORT = process.env.PORT || 3000;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'change-me';
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

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// --- Diagnostic temporaire (à retirer une fois le déploiement validé) ---
app.get('/api/debug-env', (req, res) => {
  const describe = (v) => (v ? `présent (${v.length} car.)` : 'absent');
  res.json({
    KV_REST_API_URL: describe(process.env.KV_REST_API_URL),
    KV_REST_API_TOKEN: describe(process.env.KV_REST_API_TOKEN),
    kv_KV_REST_API_URL: describe(process.env.kv_KV_REST_API_URL),
    kv_KV_REST_API_TOKEN: describe(process.env.kv_KV_REST_API_TOKEN),
    UPSTASH_REDIS_REST_URL: describe(process.env.UPSTASH_REDIS_REST_URL),
    UPSTASH_REDIS_REST_TOKEN: describe(process.env.UPSTASH_REDIS_REST_TOKEN),
    BLOB_READ_WRITE_TOKEN: describe(process.env.BLOB_READ_WRITE_TOKEN),
    VERCEL_ENV: process.env.VERCEL_ENV || 'absent',
    matchingKeys: Object.keys(process.env).filter(k => /kv|redis|blob|upstash|storage/i.test(k)),
    totalEnvVarCount: Object.keys(process.env).length
  });
});

app.get('/api/debug-blob', async (req, res) => {
  const start = Date.now();
  try {
    const blob = await put(`debug/test-${Date.now()}.txt`, 'hello world', {
      access: 'public',
      contentType: 'text/plain'
    });
    res.json({ ok: true, ms: Date.now() - start, url: blob.url });
  } catch (err) {
    res.status(500).json({ ok: false, ms: Date.now() - start, error: err.message });
  }
});

let dbReady = null;
app.use((req, res, next) => {
  if (!dbReady) dbReady = db.init();
  dbReady.then(() => next()).catch(next);
});

function requireAdmin(req, res, next) {
  if (req.header('x-admin-password') !== ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'Non autorisé' });
  }
  next();
}

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
