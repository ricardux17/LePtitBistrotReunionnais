const { Redis } = require('@upstash/redis');
const seedItems = require('./seed/menu.json');

const redis = new Redis({
  url: process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN
});

const DEFAULT_SETTINGS = { carteNourriture: 'images/carte.jpg', carteBoisson: '' };

async function init() {
  const [menu, reservations, nextMenuId, nextReservationId, settings] = await Promise.all([
    redis.get('menu'),
    redis.get('reservations'),
    redis.get('nextMenuId'),
    redis.get('nextReservationId'),
    redis.get('settings')
  ]);

  const ops = [];
  if (menu === null) {
    ops.push(redis.set('menu', seedItems));
    ops.push(redis.set('nextMenuId', seedItems.length + 1));
  }
  if (reservations === null) ops.push(redis.set('reservations', []));
  if (nextReservationId === null) ops.push(redis.set('nextReservationId', 1));
  if (settings === null) ops.push(redis.set('settings', DEFAULT_SETTINGS));

  if (ops.length) await Promise.all(ops);
}

async function getMenu() {
  return (await redis.get('menu')) || [];
}

async function setMenu(menu) {
  await redis.set('menu', menu);
}

async function getReservations() {
  return (await redis.get('reservations')) || [];
}

async function setReservations(reservations) {
  await redis.set('reservations', reservations);
}

async function getSettings() {
  return (await redis.get('settings')) || DEFAULT_SETTINGS;
}

async function setSettings(settings) {
  await redis.set('settings', settings);
}

async function getNextMenuId() {
  return (await redis.get('nextMenuId')) || 1;
}

async function setNextMenuId(id) {
  await redis.set('nextMenuId', id);
}

async function getNextReservationId() {
  return (await redis.get('nextReservationId')) || 1;
}

async function setNextReservationId(id) {
  await redis.set('nextReservationId', id);
}

module.exports = {
  init,
  getMenu,
  setMenu,
  getReservations,
  setReservations,
  getSettings,
  setSettings,
  getNextMenuId,
  setNextMenuId,
  getNextReservationId,
  setNextReservationId
};
