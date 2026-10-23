require('dotenv').config();

function generarToken() {
  return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
}

function generarCodigo6() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

function formatearEmail(destino, asunto, html, texto) {
  return {
    to: destino,
    subject: asunto,
    html,
    text: texto,
  };
}

const plantillas = {
  verificacion: (codigo, username) => ({
    asunto: 'Verifica tu cuenta - My Money',
    html: `
      <div style="font-family:Inter,Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px;background:#0f1419;color:#e2e8f0;border-radius:12px;border:1px solid #1e293b">
        <div style="text-align:center;margin-bottom:24px">
          <div style="display:inline-block;width:48px;height:48px;background:#10b981;color:#0f1419;border-radius:12px;line-height:48px;font-size:24px">💰</div>
          <h1 style="margin:16px 0 8px;color:#f8fafc">My Money</h1>
        </div>
        <p style="color:#94a3b8;margin-bottom:16px">Hola <strong>${username}</strong>,</p>
        <p style="color:#94a3b8;margin-bottom:24px">Gracias por registrarte. Usa este código para verificar tu email:</p>
        <div style="text-align:center;margin:24px 0">
          <span style="display:inline-block;background:#1e293b;color:#10b981;font-size:32px;font-weight:700;letter-spacing:8px;padding:16px 32px;border-radius:8px;font-family:monospace">${codigo}</span>
        </div>
        <p style="color:#64748b;font-size:14px;margin-top:24px">Este código expira en 15 minutos. Si no solicitaste esto, ignora este email.</p>
      </div>
    `,
    texto: `My Money - Verifica tu cuenta\n\nHola ${username},\n\nTu código de verificación: ${codigo}\n\nExpira en 15 minutos.`,
  }),

  resetPassword: (codigo, username) => ({
    asunto: 'Restablece tu contraseña - My Money',
    html: `
      <div style="font-family:Inter,Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px;background:#0f1419;color:#e2e8f0;border-radius:12px;border:1px solid #1e293b">
        <div style="text-align:center;margin-bottom:24px">
          <div style="display:inline-block;width:48px;height:48px;background:#f59e0b;color:#0f1419;border-radius:12px;line-height:48px;font-size:24px">🔐</div>
          <h1 style="margin:16px 0 8px;color:#f8fafc">My Money</h1>
        </div>
        <p style="color:#94a3b8;margin-bottom:16px">Hola <strong>${username}</strong>,</p>
        <p style="color:#94a3b8;margin-bottom:24px">Recibimos una solicitud para restablecer tu contraseña. Usa este código:</p>
        <div style="text-align:center;margin:24px 0">
          <span style="display:inline-block;background:#1e293b;color:#f59e0b;font-size:32px;font-weight:700;letter-spacing:8px;padding:16px 32px;border-radius:8px;font-family:monospace">${codigo}</span>
        </div>
        <p style="color:#64748b;font-size:14px;margin-top:24px">Este código expira en 15 minutos. Si no solicitaste esto, ignora este email.</p>
      </div>
    `,
    texto: `My Money - Restablecer contraseña\n\nHola ${username},\n\nTu código de restablecimiento: ${codigo}\n\nExpira en 15 minutos.`,
  }),

  notificacionSuscripcion: (servicio, costo, fecha, username) => ({
    asunto: `Recordatorio: Cobro de ${servicio} hoy`,
    html: `
      <div style="font-family:Inter,Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px;background:#0f1419;color:#e2e8f0;border-radius:12px;border:1px solid #1e293b">
        <div style="text-align:center;margin-bottom:24px">
          <div style="display:inline-block;width:48px;height:48px;background:#3b82f6;color:#fff;border-radius:12px;line-height:48px;font-size:24px">📅</div>
          <h1 style="margin:16px 0 8px;color:#f8fafc">My Money</h1>
        </div>
        <p style="color:#94a3b8;margin-bottom:16px">Hola <strong>${username}</strong>,</p>
        <p style="color:#94a3b8;margin-bottom:24px">Hoy cobran tu suscripción:</p>
        <div style="background:#1e293b;padding:16px;border-radius:8px;margin:16px 0">
          <p style="margin:0;color:#e2e8f0"><strong>${servicio}</strong></p>
          <p style="margin:8px 0 0;color:#10b981;font-size:18px;font-weight:600">$${costo.toFixed(2)}</p>
          <p style="margin:8px 0 0;color:#94a3b8;font-size:14px">${fecha}</p>
        </div>
      </div>
    `,
    texto: `My Money - Recordatorio\n\nHola ${username},\n\nHoy cobran: ${servicio} - $${costo.toFixed(2)} (${fecha})`,
  }),
};

async function enviarEmail(destino, plantilla, datos) {
  const { asunto, html, texto } = plantillas[plantilla](...Object.values(datos));
  const email = formatearEmail(destino, asunto, html, texto);
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;

  if (!apiKey) throw new Error('Falta configurar RESEND_API_KEY en .env');
  if (!from) throw new Error('Falta configurar EMAIL_FROM en .env');

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from,
      to: [email.to],
      subject: email.subject,
      html: email.html,
      text: email.text,
    }),
  });

  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = result.message || result.name || `HTTP ${response.status}`;
    throw new Error(`Resend no pudo enviar el correo: ${detail}`);
  }

  return { success: true, messageId: result.id };
}

async function enviarVerificacion(email, username, codigo) {
  return enviarEmail(email, 'verificacion', [codigo, username]);
}

async function enviarResetPassword(email, username, codigo) {
  return enviarEmail(email, 'resetPassword', [codigo, username]);
}

async function enviarNotificacionSuscripcion(email, username, servicio, costo, fecha) {
  return enviarEmail(email, 'notificacionSuscripcion', [servicio, costo, fecha, username]);
}

module.exports = {
  enviarEmail,
  enviarVerificacion,
  enviarResetPassword,
  enviarNotificacionSuscripcion,
  generarToken,
  generarCodigo6,
  plantillas,
};
