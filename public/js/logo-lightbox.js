(function () {
  const logoIcon = document.getElementById('logo-icon');
  if (!logoIcon) return;

  let lightbox = document.getElementById('photo-lightbox');
  if (!lightbox) {
    lightbox = document.createElement('div');
    lightbox.id = 'photo-lightbox';
    lightbox.className = 'lightbox hidden';
    lightbox.innerHTML = '<button class="lightbox-close" aria-label="Fermer">&times;</button><img id="lightbox-image" src="" alt="">';
    document.body.appendChild(lightbox);
  }

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

  logoIcon.addEventListener('click', () => openLightbox(logoIcon.src, logoIcon.alt));
  closeBtn.addEventListener('click', closeLightbox);
  lightbox.addEventListener('click', (e) => {
    if (e.target === lightbox) closeLightbox();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeLightbox();
  });
})();
