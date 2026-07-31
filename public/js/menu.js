async function loadCarteImage() {
  try {
    const res = await fetch('/api/settings');
    const settings = await res.json();

    if (settings.carteNourriture) {
      document.getElementById('carte-image').src = settings.carteNourriture;
    }

    const boissonSection = document.getElementById('carte-boisson-section');
    if (settings.carteBoisson) {
      document.getElementById('carte-image-boisson').src = settings.carteBoisson;
      boissonSection.classList.remove('hidden');
    } else {
      boissonSection.classList.add('hidden');
    }
  } catch (err) {
    // garde l'image par défaut si la requête échoue
  }
}

function renderItems(container, items) {
  if (!items.length) {
    container.innerHTML = '<p>La carte sera bientôt disponible.</p>';
    return;
  }

  const categories = [...new Set(items.map(item => item.category))];

  container.innerHTML = categories.map(category => {
    const categoryItems = items.filter(item => item.category === category);
    return `
      <div class="menu-category">
        <h3>${category}</h3>
        <div class="menu-items">
          ${categoryItems.map(item => `
            <div class="menu-item">
              <div class="menu-item-body">
                <div class="menu-item-header">
                  <h4>${item.name}</h4>
                  <span class="menu-item-price">${item.price.toFixed(2)} €</span>
                </div>
                <p>${item.description}</p>
                ${item.photo ? `<img src="${item.photo}" alt="${item.name}" class="menu-item-photo">` : ''}
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  }).join('');
}

async function loadMenu() {
  const foodContainer = document.getElementById('menu-content');
  const drinksContainer = document.getElementById('drinks-content');

  try {
    const res = await fetch('/api/menu');
    const items = await res.json();

    const foodItems = items.filter(item => (item.type || 'nourriture') === 'nourriture');
    const drinkItems = items.filter(item => item.type === 'boisson');

    renderItems(foodContainer, foodItems);
    renderItems(drinksContainer, drinkItems);
  } catch (err) {
    foodContainer.innerHTML = '<p>Impossible de charger la carte pour le moment.</p>';
    drinksContainer.innerHTML = '<p>Impossible de charger la carte pour le moment.</p>';
  }
}

function setupLightbox() {
  const lightbox = document.getElementById('photo-lightbox');
  const lightboxImage = document.getElementById('lightbox-image');
  const closeBtn = lightbox.querySelector('.lightbox-close');

  function openLightbox(src, alt) {
    lightboxImage.src = src;
    lightboxImage.alt = alt;
    lightbox.classList.remove('hidden');
  }

  function closeLightbox() {
    lightbox.classList.add('hidden');
    lightboxImage.src = '';
  }

  document.body.addEventListener('click', (e) => {
    if (e.target.classList.contains('menu-item-photo')) {
      openLightbox(e.target.src, e.target.alt);
    }
  });

  closeBtn.addEventListener('click', closeLightbox);
  lightbox.addEventListener('click', (e) => {
    if (e.target === lightbox) closeLightbox();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeLightbox();
  });
}

function setupMenuTypeTabs() {
  const buttons = document.querySelectorAll('.menu-type-btn');
  const views = {
    nourriture: document.getElementById('view-nourriture'),
    boisson: document.getElementById('view-boisson')
  };

  buttons.forEach(btn => {
    btn.addEventListener('click', () => {
      buttons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      Object.entries(views).forEach(([key, view]) => {
        view.classList.toggle('hidden', key !== btn.dataset.view);
      });
    });
  });
}

loadCarteImage();
loadMenu();
setupLightbox();
setupMenuTypeTabs();
