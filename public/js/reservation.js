const form = document.getElementById('reservation-form');
const feedback = document.getElementById('form-feedback');
const dateInput = document.getElementById('date');
const dateFeedback = document.getElementById('date-feedback');
const timeSelect = document.getElementById('time');

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

function toMinutes(hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

function toHHMM(minutes) {
  const h = String(Math.floor(minutes / 60)).padStart(2, '0');
  const m = String(minutes % 60).padStart(2, '0');
  return `${h}:${m}`;
}

function buildSlots(windows) {
  const slots = [];
  windows.forEach(([start, end]) => {
    for (let t = toMinutes(start); t < toMinutes(end); t += 30) {
      slots.push(toHHMM(t));
    }
  });
  return slots;
}

function updateTimeOptions() {
  const value = dateInput.value;
  timeSelect.innerHTML = '';
  dateFeedback.textContent = '';

  if (!value) {
    timeSelect.disabled = true;
    timeSelect.innerHTML = '<option value="">Choisissez d\'abord une date</option>';
    return;
  }

  const day = new Date(`${value}T00:00:00`).getDay();
  const windows = SERVICE_HOURS[day];

  if (!windows) {
    timeSelect.disabled = true;
    timeSelect.innerHTML = '<option value="">Fermé ce jour-là</option>';
    dateFeedback.textContent = 'Nous sommes fermés ce jour-là. Merci de choisir un autre jour (mer.–sam.).';
    return;
  }

  const slots = buildSlots(windows);
  timeSelect.disabled = false;
  timeSelect.innerHTML = '<option value="">Choisissez un horaire</option>' +
    slots.map(s => `<option value="${s}">${s}</option>`).join('');
}

dateInput.addEventListener('change', updateTimeOptions);
updateTimeOptions();

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  feedback.textContent = '';
  feedback.className = 'form-feedback';

  const data = {
    name: form.name.value.trim(),
    email: form.email.value.trim(),
    phone: form.phone.value.trim(),
    date: form.date.value,
    time: form.time.value,
    guests: form.guests.value,
    message: form.message.value.trim()
  };

  try {
    const res = await fetch('/api/reservations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });

    const result = await res.json();

    if (!res.ok) {
      throw new Error(result.error || 'Une erreur est survenue.');
    }

    feedback.textContent = 'Votre demande de réservation a bien été envoyée ! Nous vous confirmerons par email.';
    feedback.classList.add('success');
    form.reset();
    updateTimeOptions();
  } catch (err) {
    feedback.textContent = err.message;
    feedback.classList.add('error');
  }
});
