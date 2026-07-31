const brevo = require('@getbrevo/brevo');

const apiKey = process.env.BREVO_API_KEY;

let apiInstance = null;
if (apiKey) {
  apiInstance = new brevo.TransactionalEmailsApi();
  apiInstance.setApiKey(brevo.TransactionalEmailsApiApiKeys.apiKey, apiKey);
}

async function enviarEmail({ to, toName, subject, html }) {
  if (!apiInstance) {
    console.log('--- [email simulado: BREVO_API_KEY nao configurada] ---');
    console.log('Para:', to, toName ? `(${toName})` : '');
    console.log('Assunto:', subject);
    console.log(html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim());
    console.log('--------------------------------------------------------');
    return { simulado: true };
  }

  const email = new brevo.SendSmtpEmail();
  email.subject = subject;
  email.htmlContent = html;
  email.sender = {
    name: process.env.MAIL_FROM_NAME || 'DOMINIUM',
    email: process.env.MAIL_FROM_ADDRESS,
  };
  email.to = [{ email: to, name: toName || to }];
  if (process.env.MAIL_REPLY_TO) {
    email.replyTo = { email: process.env.MAIL_REPLY_TO };
  }

  return apiInstance.sendTransacEmail(email);
}

function layout(titulo, corpoHtml) {
  return `
  <div style="background:#0E1A2B;padding:32px 0;font-family:Georgia,serif;">
    <div style="max-width:480px;margin:0 auto;background:#16283F;border:1px solid rgba(201,162,75,0.35);border-radius:12px;padding:32px;color:#F7F5F0;">
      <h1 style="color:#C9A24B;font-size:22px;letter-spacing:2px;margin:0 0 24px;">DOMINIUM</h1>
      <h2 style="color:#F7F5F0;font-size:18px;margin:0 0 16px;">${titulo}</h2>
      <div style="font-size:14px;line-height:1.6;color:#E7E3DA;">${corpoHtml}</div>
      <p style="margin-top:32px;font-size:12px;color:#8496AC;">Controle • Planeje • Conquiste</p>
    </div>
  </div>`;
}

async function sendConfirmacaoCadastro({ to, nome, token }) {
  const link = `${process.env.FRONTEND_URL}/confirmar-email?token=${token}`;
  const html = layout(
    'Confirme seu cadastro',
    `<p>Ola, ${nome}.</p>
     <p>Falta pouco para comecar a usar o DOMINIUM. Confirme seu email clicando no link abaixo:</p>
     <p><a href="${link}" style="color:#C9A24B;">Confirmar meu email</a></p>
     <p>Se voce nao criou esta conta, ignore esta mensagem.</p>`
  );
  return enviarEmail({ to, toName: nome, subject: 'Confirme seu cadastro no DOMINIUM', html });
}

async function sendPasswordReset({ to, nome, token }) {
  const link = `${process.env.FRONTEND_URL}/redefinir-senha?token=${token}`;
  const html = layout(
    'Redefinicao de senha',
    `<p>Ola, ${nome}.</p>
     <p>Recebemos um pedido para redefinir sua senha. O link abaixo expira em 1 hora:</p>
     <p><a href="${link}" style="color:#C9A24B;">Redefinir minha senha</a></p>
     <p>Se voce nao solicitou isso, ignore esta mensagem, sua senha continua a mesma.</p>`
  );
  return enviarEmail({ to, toName: nome, subject: 'Redefinicao de senha - DOMINIUM', html });
}

module.exports = { enviarEmail, sendConfirmacaoCadastro, sendPasswordReset };
