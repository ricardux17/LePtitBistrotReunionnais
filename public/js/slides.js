(function () {
  const wrapper = document.querySelector('.slides-wrapper');
  if (!wrapper) return;

  const track = document.getElementById('slides-track');
  const slides = Array.from(track.children);
  const dotsContainer = document.getElementById('slide-dots');

  let current = 0;
  let isAnimating = false;

  function setWrapperHeight() {
    const header = document.querySelector('.site-header');
    const headerHeight = header ? header.offsetHeight : 0;
    wrapper.style.height = `${window.innerHeight - headerHeight}px`;
  }

  function updateDots() {
    Array.from(dotsContainer.children).forEach((dot, i) => {
      dot.classList.toggle('active', i === current);
    });
  }

  function goToSlide(index) {
    if (index < 0 || index >= slides.length || index === current) return;
    current = index;
    track.style.transform = `translateY(-${current * 100}%)`;
    updateDots();
    isAnimating = true;
    setTimeout(() => { isAnimating = false; }, 600);
  }

  slides.forEach((_, i) => {
    const dot = document.createElement('button');
    dot.className = 'slide-dot';
    dot.setAttribute('aria-label', `Aller à la section ${i + 1}`);
    dot.addEventListener('click', () => goToSlide(i));
    dotsContainer.appendChild(dot);
  });

  let wheelAccum = 0;
  let wheelResetTimer = null;
  const WHEEL_THRESHOLD = 40;

  wrapper.addEventListener('wheel', (e) => {
    const activeSlide = slides[current];
    const canScrollDown = activeSlide.scrollTop + activeSlide.clientHeight < activeSlide.scrollHeight - 1;
    const canScrollUp = activeSlide.scrollTop > 0;

    if (e.deltaY > 0 && canScrollDown) return;
    if (e.deltaY < 0 && canScrollUp) return;

    e.preventDefault();

    if (isAnimating) return;

    wheelAccum += e.deltaY;
    clearTimeout(wheelResetTimer);
    wheelResetTimer = setTimeout(() => { wheelAccum = 0; }, 150);

    if (Math.abs(wheelAccum) > WHEEL_THRESHOLD) {
      goToSlide(wheelAccum > 0 ? current + 1 : current - 1);
      wheelAccum = 0;
    }
  }, { passive: false });

  let touchStartY = 0;
  wrapper.addEventListener('touchstart', (e) => {
    touchStartY = e.touches[0].clientY;
  }, { passive: true });

  wrapper.addEventListener('touchend', (e) => {
    const deltaY = touchStartY - e.changedTouches[0].clientY;
    if (Math.abs(deltaY) > 50) {
      goToSlide(deltaY > 0 ? current + 1 : current - 1);
    }
  }, { passive: true });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') goToSlide(current + 1);
    if (e.key === 'ArrowUp') goToSlide(current - 1);
  });

  document.querySelectorAll('a[href^="#"]').forEach(link => {
    link.addEventListener('click', (e) => {
      const targetId = link.getAttribute('href').slice(1);
      const targetIndex = slides.findIndex(s => s.id === targetId);
      if (targetIndex !== -1) {
        e.preventDefault();
        goToSlide(targetIndex);
      }
    });
  });

  window.addEventListener('resize', setWrapperHeight);
  setWrapperHeight();
  updateDots();
})();
