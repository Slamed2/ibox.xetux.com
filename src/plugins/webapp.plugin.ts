import { FastifyPluginAsync } from 'fastify';
import { AxiosError } from 'axios';
import { InlineKeyboard } from 'grammy';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
import { chatwootService } from '../services/chatwoot.service.js';
import { withExecutionLog } from '../services/execution-log.service.js';
import { bot, enableUserCommands } from '../services/telegram.service.js';
import { TEAMS } from '../services/department-menu.js';
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
        .label-row { display: flex; align-items: center; gap: 6px; }
        .help-icon { display: inline-flex; align-items: center; justify-content: center; width: 20px; height: 20px; border-radius: 50%; background: #e1983d; color: #000; font-size: 12px; font-weight: 700; cursor: pointer; flex-shrink: 0; }
        .tooltip-overlay { display: none; position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.85); z-index: 100; padding: 20px; justify-content: center; align-items: center; flex-direction: column; }
        .tooltip-overlay.visible { display: flex; }
        .tooltip-overlay img { max-width: 100%; max-height: 60vh; border-radius: 10px; margin-bottom: 16px; }
        .tooltip-overlay p { color: #fff; font-size: 14px; text-align: center; max-width: 300px; line-height: 1.5; }
        .tooltip-overlay .close-btn { margin-top: 16px; padding: 8px 24px; background: #e1983d; color: #000; border: none; border-radius: 8px; font-size: 14px; font-weight: 600; cursor: pointer; }
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
                <div class="label-row">
                    <label for="xetux_id">Xetux ID *</label>
                    <span class="help-icon" id="xetux-help">?</span>
                </div>
                <input type="text" id="xetux_id" placeholder="Ej: VE00029 o MX00023" required autocapitalize="characters" maxlength="7">
                <div class="error-text" id="xetux_id-error">Formato: 2 letras (MX o VE) + 5 digitos. Ej: VE00029</div>
            </div>
        </form>
    </div>
    <div class="tooltip-overlay" id="xetux-tooltip">
        <img src="/webapp/xetux-id-help.png" alt="Donde encontrar tu Xetux ID">
        <p>Tu Xetux ID se encuentra en la pantalla principal de la app Xetux, en el campo marcado como "XETUX ID".</p>
        <button class="close-btn" id="close-tooltip">Entendido</button>
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
        var prefillXetuxId = params.get('xetux_id');

        // Pre-fill xetux_id from deep link if available
        if (prefillXetuxId) {
            document.getElementById('xetux_id').value = prefillXetuxId;
        }

        // Tooltip handlers
        document.getElementById('xetux-help').addEventListener('click', function() {
            document.getElementById('xetux-tooltip').classList.add('visible');
        });
        document.getElementById('close-tooltip').addEventListener('click', function() {
            document.getElementById('xetux-tooltip').classList.remove('visible');
        });
        document.getElementById('xetux-tooltip').addEventListener('click', function(e) {
            if (e.target === this) this.classList.remove('visible');
        });

        // Auto-format Xetux ID: uppercase, 2 letters (MX/VE) + 5 digits, no dash
        document.getElementById('xetux_id').addEventListener('input', function() {
            var val = this.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
            // Check prefix: must start with MX or VE
            if (val.length >= 2 && !(/^(MX|VE|M|V)/.test(val))) {
                tg.showAlert('El Xetux ID debe comenzar con MX o VE');
                this.value = '';
                return;
            }
            // Keep only 2 letters + up to 5 digits
            var letters = val.slice(0, 2).replace(/[^A-Z]/g, '');
            var digits = val.slice(2).replace(/[^0-9]/g, '').slice(0, 5);
            this.value = letters + digits;
        });

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
            var regex = /^(?:MX|VE)\\d{5}$/;
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
            var apiUrl = window.location.origin + '/api/webapp/register';
            fetch(apiUrl, {
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
                    res.json().then(function(j) {
                        tg.showAlert('Error: ' + (j.error || 'Error desconocido'));
                    }).catch(function() {
                        tg.showAlert('Error al procesar el registro');
                    });
                }
            })
            .catch(function(err) {
                tg.MainButton.hideProgress();
                tg.showAlert('Error de conexión: ' + err.message);
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

  // Serve help image for Xetux ID tooltip
  fastify.get('/webapp/xetux-id-help.png', async (_request, reply) => {
    const imgPath = path.resolve(process.cwd(), 'src/assets/xetux-id-help.png');
    if (fs.existsSync(imgPath)) {
      const img = fs.readFileSync(imgPath);
      reply.type('image/jpeg').send(img);
    } else {
      reply.code(404).send('Image not found');
    }
  });

  // Handle form submission — update Chatwoot contact
  fastify.post<{ Body: RegisterBody }>('/api/webapp/register', async (request, reply) => {
    const { nombre, telefono, email, xetux_id, contact_id, conversation_id, telegram_user } = request.body;

    if (!contact_id || !conversation_id) {
      reply.code(400);
      return { error: 'contact_id y conversation_id son obligatorios' };
    }

    try {
      return await withExecutionLog(
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
          const conversationIdNum = parseInt(conversation_id, 10);

          if (!contactIdNum || !conversationIdNum) {
            throw new Error('contact_id y conversation_id deben ser números válidos');
          }

          // Derive country from xetux_id prefix
          const isMX = xetux_id.toUpperCase().startsWith('MX');
          const country = isMX ? 'Mexico' : 'Venezuela';
          const countryCode = isMX ? 'MX' : 'VE';

          // Update Chatwoot contact — if email/phone conflict, still sync xetux_id + country
          try {
            await chatwootService.updateContact(contactIdNum, {
              name: nombre,
              email,
              phone_number: telefono,
              additional_attributes: { country, country_code: countryCode },
              custom_attributes: { xetux_id },
            });
          } catch (updateErr) {
            logger.warn({ err: updateErr, contactId: contact_id }, 'Full contact update failed, syncing xetux_id only');
            await chatwootService.updateContact(contactIdNum, {
              name: nombre,
              additional_attributes: { country, country_code: countryCode },
              custom_attributes: { xetux_id },
            });
          }

          // Add country label to conversation
          await chatwootService.addLabels(conversationIdNum, [isMX ? 'mexico' : 'venezuela']);

          // Send registration details as internal note in Chatwoot
          await chatwootService.sendMessage(conversationIdNum, {
            content: `✅ Registro completado:\n• Nombre: ${nombre}\n• Teléfono: ${telefono}\n• Email: ${email}\n• Xetux ID: ${xetux_id}`,
            private: true,
            message_type: 'outgoing',
          });

          // Enable department commands in hamburger menu for this user
          if (telegram_user?.id) {
            await enableUserCommands(telegram_user.id);
          }

          // Send department selection menu via Telegram
          if (telegram_user?.id) {
            const country = xetux_id.toUpperCase().startsWith('MX') ? 'mx' : 've';
            const keyboard = new InlineKeyboard()
              .text('💼 Consultoría', `team:${country === 'mx' ? TEAMS.CONSULTORIA_MX : TEAMS.CONSULTORIA_VE}:Consultoría`)
              .text('🛠 Soporte', `team:${country === 'mx' ? TEAMS.SOPORTE_MX : TEAMS.SOPORTE_VE}:Soporte`)
              .row()
              .text('🛒 Ventas', `team:${TEAMS.VENTAS}:Ventas`)
              .text('📋 Administración', `team:${TEAMS.ADMINISTRACION}:Administración`);

            const deptMsg = await bot.api.sendMessage(
              telegram_user.id,
              '¿Con qué departamento deseas comunicarte?',
              { reply_markup: keyboard },
            );

            await chatwootService.sendMessage(conversationIdNum, {
              content: '¿Con qué departamento deseas comunicarte?\n\n💼 Consultoría | 🛠 Soporte | 🛒 Ventas | 📋 Administración',
              message_type: 'outgoing',
              source_id: String(deptMsg.message_id),
            });
          }

          logger.info({ contactId: contact_id, conversationId: conversation_id, xetux_id }, 'WebApp registration completed');
          return { success: true };
        },
      );
    } catch (err) {
      const axiosErr = err instanceof AxiosError ? err : null;
      const chatwootMsg = axiosErr?.response?.data?.message || axiosErr?.response?.data?.error;
      const message = chatwootMsg || (err instanceof Error ? err.message : 'Error desconocido');
      logger.error({ err, contactId: contact_id, conversationId: conversation_id }, 'WebApp registration failed');
      reply.code(422);
      return { error: message };
    }
  });
};
