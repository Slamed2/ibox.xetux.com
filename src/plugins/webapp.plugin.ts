import { FastifyPluginAsync } from 'fastify';
import { chatwootService } from '../services/chatwoot.service.js';
import { withExecutionLog } from '../services/execution-log.service.js';
import { logger } from '../utils/logger.js';

interface RegisterBody {
  nombre: string;
  telefono: string;
  email: string;
  xetux_id: string;
  contact_id: string;
  conversation_id: string;
  telegram_user?: { id: number; first_name: string; last_name?: string; username?: string } | null;
}

const WEBAPP_HTML = `<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
    <title>Registro - Xetux</title>
    <script src="https://telegram.org/js/telegram-web-app.js"></script>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        html, body { width: 100%; height: 100%; overflow-x: hidden; }
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #000000; color: #ffffff; padding: 16px; padding-bottom: 100px; }
        .logo { text-align: center; margin-bottom: 16px; }
        .logo img { width: 160px; height: auto; }
        h1 { font-size: 20px; font-weight: 600; text-align: center; margin-bottom: 4px; color: #e1983d; }
        .subtitle { text-align: center; font-size: 14px; color: #aeb5bc; margin-bottom: 24px; }
        .form-group { margin-bottom: 16px; }
        label { display: block; font-size: 13px; font-weight: 500; margin-bottom: 6px; color: #e1983d; text-transform: uppercase; letter-spacing: 0.5px; }
        input { width: 100%; padding: 12px 14px; font-size: 16px; border: 1px solid #333333; border-radius: 10px; background-color: #111111; color: #ffffff; outline: none; transition: border-color 0.2s; -webkit-appearance: none; }
        input:focus { border-color: #e1983d; }
        input::placeholder { color: #555555; }
        .error { border-color: #e53935 !important; }
        .error-text { color: #e53935; font-size: 12px; margin-top: 4px; display: none; }
        .error-text.visible { display: block; }
    </style>
</head>
<body>
    <div id="form-container">
        <div class="logo">
            <img src="https://www.xetux.com/wp-content/uploads/2023/08/logo_xetux.svg" alt="Xetux">
        </div>
        <h1>Datos de Contacto</h1>
        <p class="subtitle">Completa tus datos para continuar</p>
        <form id="contact-form">
            <div class="form-group">
                <label for="nombre">Nombre completo *</label>
                <input type="text" id="nombre" placeholder="Ej: Juan Perez" required>
                <div class="error-text" id="nombre-error">Este campo es obligatorio</div>
            </div>
            <div class="form-group">
                <label for="telefono">Teléfono *</label>
                <input type="tel" id="telefono" placeholder="Ej: +58 412 1234567" required>
                <div class="error-text" id="telefono-error">Ingresa un número de teléfono válido</div>
            </div>
            <div class="form-group">
                <label for="email">Email *</label>
                <input type="email" id="email" placeholder="Ej: juan@email.com" required>
                <div class="error-text" id="email-error">Ingresa un email válido</div>
            </div>
            <div class="form-group">
                <label for="xetux_id">Xetux ID *</label>
                <input type="text" id="xetux_id" placeholder="Ej: VE1234 o MX123" required>
                <div class="error-text" id="xetux_id-error">Debe ser MX/VE + números (sin espacios)</div>
            </div>
        </form>
    </div>
    <script>
        var tg = window.Telegram.WebApp;
        tg.ready();
        setTimeout(function() { tg.expand(); }, 100);
        tg.MainButton.setText('Enviar datos');
        tg.MainButton.color = '#e1983d';
        tg.MainButton.textColor = '#000000';
        tg.MainButton.show();

        var params = new URLSearchParams(window.location.search);
        var contactId = params.get('contact_id');
        var conversationId = params.get('conversation_id');

        function validate() {
            var valid = true;
            var errors = document.querySelectorAll('.error');
            for (var i = 0; i < errors.length; i++) errors[i].classList.remove('error');
            var errTexts = document.querySelectorAll('.error-text');
            for (var i = 0; i < errTexts.length; i++) errTexts[i].classList.remove('visible');
            var nombre = document.getElementById('nombre');
            if (!nombre.value.trim()) {
                nombre.classList.add('error');
                document.getElementById('nombre-error').classList.add('visible');
                valid = false;
            }
            var telefono = document.getElementById('telefono');
            if (telefono.value.trim().length < 7) {
                telefono.classList.add('error');
                document.getElementById('telefono-error').classList.add('visible');
                valid = false;
            }
            var email = document.getElementById('email');
            if (!email.value.trim() || email.value.indexOf('@') === -1) {
                email.classList.add('error');
                document.getElementById('email-error').classList.add('visible');
                valid = false;
            }
            var xetux_id = document.getElementById('xetux_id');
            var regex = /^(?:MX|VE)\\d+$/;
            if (!regex.test(xetux_id.value.trim())) {
                xetux_id.classList.add('error');
                document.getElementById('xetux_id-error').classList.add('visible');
                valid = false;
            }
            return valid;
        }

        tg.MainButton.onClick(function() {
            if (!validate()) return;
            tg.MainButton.showProgress();
            var data = {
                nombre: document.getElementById('nombre').value.trim(),
                telefono: document.getElementById('telefono').value.trim(),
                email: document.getElementById('email').value.trim(),
                xetux_id: document.getElementById('xetux_id').value.trim(),
                contact_id: contactId,
                conversation_id: conversationId,
                telegram_user: tg.initDataUnsafe.user || null
            };
            fetch('/api/webapp/register', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            })
            .then(function(res) {
                tg.MainButton.hideProgress();
                if (res.ok) {
                    tg.showAlert('Sesión iniciada correctamente. ¡Bienvenido a Xetux!');
                    setTimeout(function() { tg.close(); }, 1500);
                } else {
                    tg.showAlert('Error al enviar. Intenta de nuevo.');
                }
            })
            .catch(function() {
                tg.MainButton.hideProgress();
                tg.showAlert('Error de conexión. Intenta de nuevo.');
            });
        });
    </script>
</body>
</html>`;

export const webappPlugin: FastifyPluginAsync = async (fastify) => {
  // Serve the mini app HTML
  fastify.get('/webapp', async (_request, reply) => {
    reply.type('text/html').send(WEBAPP_HTML);
  });

  // Handle form submission — update Chatwoot contact
  fastify.post<{ Body: RegisterBody }>('/api/webapp/register', async (request, reply) => {
    const { nombre, telefono, email, xetux_id, contact_id, conversation_id, telegram_user } = request.body;

    return withExecutionLog(
      {
        eventType: 'webapp:register',
        source: 'webapp',
        direction: 'inbound',
        inputData: request.body,
        conversationId: conversation_id,
        contactId: contact_id,
        metadata: { xetux_id, telegram_user_id: telegram_user?.id ?? null },
      },
      async () => {
        const contactIdNum = parseInt(contact_id, 10);

        if (!contactIdNum) {
          reply.code(400);
          return { error: 'Invalid contact_id' };
        }

        // Update Chatwoot contact with the form data
        await chatwootService.updateContact(contactIdNum, {
          name: nombre,
          email,
          phone_number: telefono,
          custom_attributes: { xetux_id },
        });

        // Send confirmation message in the conversation
        const conversationIdNum = parseInt(conversation_id, 10);
        if (conversationIdNum) {
          await chatwootService.sendMessage(conversationIdNum, {
            content: `✅ Registro completado:\n• Nombre: ${nombre}\n• Teléfono: ${telefono}\n• Email: ${email}\n• Xetux ID: ${xetux_id}`,
            message_type: 'outgoing',
          });
        }

        logger.info({ contactId: contact_id, xetux_id }, 'WebApp registration completed');
        return { success: true };
      },
    );
  });
};
