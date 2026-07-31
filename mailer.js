const nodemailer = require('nodemailer');

const { SMTP_HOST, SMTP_PORT, SMTP_SECURE, SMTP_USER, SMTP_PASS, FROM_EMAIL, FROM_NAME } = process.env;

let transporter = null;

if (SMTP_HOST && SMTP_USER && SMTP_PASS) {
  transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: Number(SMTP_PORT) || 587,
    secure: SMTP_SECURE === 'true',
    auth: { user: SMTP_USER, pass: SMTP_PASS }
  });
}

function formatDate(dateStr) {
  const date = new Date(`${dateStr}T00:00:00`);
  return date.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}

function buildConfirmationEmail(reservation) {
  return `
    <div style="font-family: Arial, Helvetica, sans-serif; max-width: 480px; margin: 0 auto; color: #111111;">
      <h2 style="margin: 0 0 1.5rem; color: #111111;">Le P'tit Bistro Réunionnais</h2>
      <p>Bonjour ${reservation.name},</p>
      <p>Votre réservation est <strong>confirmée</strong> ! Voici le récapitulatif :</p>
      <table style="width: 100%; border-collapse: collapse; margin: 1.25rem 0;">
        <tr>
          <td style="padding: 6px 0; color: #6f6f6f;">Date</td>
          <td style="padding: 6px 0;"><strong>${formatDate(reservation.date)}</strong></td>
        </tr>
        <tr>
          <td style="padding: 6px 0; color: #6f6f6f;">Heure</td>
          <td style="padding: 6px 0;"><strong>${reservation.time}</strong></td>
        </tr>
        <tr>
          <td style="padding: 6px 0; color: #6f6f6f;">Nombre de convives</td>
          <td style="padding: 6px 0;"><strong>${reservation.guests}</strong></td>
        </tr>
      </table>
      <p>Nous avons hâte de vous accueillir. Si vous avez besoin de modifier ou d'annuler votre réservation, contactez-nous directement par téléphone.</p>
      <p style="margin-top: 2rem; font-size: 0.85rem; color: #888888;">
        129 Rue Marius et Ary Leblond, Saint-Paul 97460, La Réunion<br>
        +262 693 55 81 00
      </p>
    </div>
  `;
}

async function sendReservationConfirmation(reservation) {
  if (!transporter) {
    console.warn('[mailer] Email non envoyé : configuration SMTP manquante (voir .env).');
    return { sent: false, reason: 'smtp_not_configured' };
  }

  try {
    await transporter.sendMail({
      from: `"${FROM_NAME || "Le P'tit Bistro Réunionnais"}" <${FROM_EMAIL || SMTP_USER}>`,
      to: reservation.email,
      subject: "Votre réservation est confirmée — Le P'tit Bistro Réunionnais",
      html: buildConfirmationEmail(reservation)
    });
    return { sent: true };
  } catch (err) {
    console.error('[mailer] Erreur lors de l\'envoi de l\'email de confirmation :', err.message);
    return { sent: false, reason: err.message };
  }
}

module.exports = { sendReservationConfirmation };
