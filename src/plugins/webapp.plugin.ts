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
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/intl-tel-input/17.0.8/css/intlTelInput.min.css">
    <script src="https://cdnjs.cloudflare.com/ajax/libs/intl-tel-input/17.0.8/js/intlTelInput.min.js"></script>
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
        .help-icon { display: inline-flex; align-items: center; justify-content: center; width: 18px; height: 18px; border-radius: 50%; background: #e1983d; color: #000; font-size: 11px; font-weight: 700; cursor: pointer; flex-shrink: 0; margin-bottom: 6px; }
        .tooltip-overlay { display: none; position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.92); z-index: 100; justify-content: center; align-items: center; flex-direction: column; overflow: hidden; touch-action: none; }
        .tooltip-overlay.visible { display: flex; }
        .tooltip-img-container { width: 100%; flex: 1; display: flex; justify-content: center; align-items: center; overflow: hidden; touch-action: pinch-zoom; }
        .tooltip-img-container img { max-width: 90%; max-height: 65vh; border-radius: 10px; transform-origin: center center; transition: transform 0.1s ease; }
        .tooltip-bottom { padding: 16px 20px; text-align: center; flex-shrink: 0; }
        .tooltip-bottom p { color: #fff; font-size: 14px; max-width: 300px; line-height: 1.5; margin: 0 auto 12px; }
        .tooltip-bottom .close-btn { padding: 10px 32px; background: #e1983d; color: #000; border: none; border-radius: 8px; font-size: 14px; font-weight: 600; cursor: pointer; }
        .iti { width: 100%; }
        .iti__flag-container { border-radius: 10px 0 0 10px; }
        .iti__selected-flag { background: transparent !important; padding-left: 14px; }
        .iti__arrow { border-top-color: #aaa; }
        .iti__arrow--up { border-bottom-color: #aaa; }
        .iti__country-list { background-color: #1a1a1a; border: 1px solid #333; border-radius: 8px; color: #fff; max-height: 200px; }
        .iti__country.iti__highlight { background-color: #333; }
        .iti__country-name, .iti__dial-code { color: #fff; }
        .iti__divider { border-bottom-color: #333; }
        .iti input { padding-left: 52px !important; }
        .iti--separate-dial-code .iti__selected-flag { background: #1a1a1a !important; border-radius: 10px 0 0 10px; border-right: 1px solid #333; }
        .iti--separate-dial-code input { padding-left: 90px !important; }
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
                <input type="tel" id="telefono" placeholder="412 1234567" required>
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
        <div class="tooltip-img-container" id="img-container">
            <img src="/webapp/xetux-id-help.png" alt="Donde encontrar tu Xetux ID" id="tooltip-img">
        </div>
        <div class="tooltip-bottom">
            <p>Tu Xetux ID se encuentra en la pantalla principal de la app Xetux, en el campo marcado como "XETUX ID".</p>
            <button class="close-btn" id="close-tooltip">Entendido</button>
        </div>
    </div>
    <script>
        var tg = window.Telegram.WebApp;
        tg.ready();
        setTimeout(function() { tg.expand(); }, 100);
        tg.MainButton.setText('Enviar datos');
        tg.MainButton.color = '#e1983d';
        tg.MainButton.textColor = '#000000';
        tg.MainButton.show();

        // Initialize intl-tel-input on phone field
        var phoneInput = document.getElementById('telefono');
        var iti = window.intlTelInput(phoneInput, {
            preferredCountries: ['ve', 'mx'],
            initialCountry: 'auto',
            geoIpLookup: function(cb) {
                fetch('https://ipapi.co/json/')
                    .then(function(r) { return r.json(); })
                    .then(function(d) { cb(d && d.country ? d.country : 'VE'); })
                    .catch(function() { cb('VE'); });
            },
            nationalMode: true,
            formatOnDisplay: false,
            autoPlaceholder: 'aggressive',
            separateDialCode: true,
            utilsScript: 'https://cdnjs.cloudflare.com/ajax/libs/intl-tel-input/17.0.8/js/utils.js'
        });

        var params = new URLSearchParams(window.location.search);
        var contactId = params.get('contact_id');
        var conversationId = params.get('conversation_id');
        var prefillXetuxId = params.get('xetux_id');

        // Pre-fill xetux_id from deep link if available
        if (prefillXetuxId) {
            document.getElementById('xetux_id').value = prefillXetuxId;
        }

        // Tooltip handlers with pinch-to-zoom
        var tooltipImg = document.getElementById('tooltip-img');
        var currentScale = 1;
        var startDist = 0;

        function resetZoom() {
            currentScale = 1;
            tooltipImg.style.transform = 'scale(1)';
        }

        document.getElementById('xetux-help').addEventListener('click', function() {
            resetZoom();
            document.getElementById('xetux-tooltip').classList.add('visible');
        });
        document.getElementById('close-tooltip').addEventListener('click', function() {
            document.getElementById('xetux-tooltip').classList.remove('visible');
            resetZoom();
        });
        document.getElementById('xetux-tooltip').addEventListener('click', function(e) {
            if (e.target === this) {
                this.classList.remove('visible');
                resetZoom();
            }
        });

        // Pinch-to-zoom on the image
        var imgContainer = document.getElementById('img-container');
        imgContainer.addEventListener('touchstart', function(e) {
            if (e.touches.length === 2) {
                e.preventDefault();
                startDist = Math.hypot(
                    e.touches[0].clientX - e.touches[1].clientX,
                    e.touches[0].clientY - e.touches[1].clientY
                );
            }
        }, { passive: false });

        imgContainer.addEventListener('touchmove', function(e) {
            if (e.touches.length === 2) {
                e.preventDefault();
                var dist = Math.hypot(
                    e.touches[0].clientX - e.touches[1].clientX,
                    e.touches[0].clientY - e.touches[1].clientY
                );
                var scale = currentScale * (dist / startDist);
                scale = Math.min(Math.max(scale, 1), 4);
                tooltipImg.style.transform = 'scale(' + scale + ')';
            }
        }, { passive: false });

        imgContainer.addEventListener('touchend', function(e) {
            if (e.touches.length < 2) {
                var transform = tooltipImg.style.transform;
                var match = transform.match(/scale\\(([\\d.]+)\\)/);
                currentScale = match ? parseFloat(match[1]) : 1;
                if (currentScale < 1.1) resetZoom();
            }
        });

        // Double tap to zoom
        var lastTap = 0;
        imgContainer.addEventListener('touchend', function(e) {
            if (e.touches.length > 0) return;
            var now = Date.now();
            if (now - lastTap < 300) {
                if (currentScale > 1.1) {
                    resetZoom();
                } else {
                    currentScale = 2.5;
                    tooltipImg.style.transform = 'scale(2.5)';
                }
            }
            lastTap = now;
        });

        // Auto-format Xetux ID: uppercase, 2 letters (MX/VE) + 5 digits, no dash
        document.getElementById('xetux_id').addEventListener('input', function() {
            var val = this.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
            // First character must be a letter (M or V)
            if (val.length >= 1 && /^[0-9]/.test(val)) {
                tg.showAlert('El Xetux ID debe comenzar con MX o VE');
                this.value = '';
                return;
            }
            // Check prefix: must start with M/V then MX/VE
            if (val.length >= 2 && !(/^(MX|VE)/.test(val))) {
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
                telefono: iti.getNumber() || document.getElementById('telefono').value.trim(),
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

/**
 * Standalone login page for group chats (no Telegram WebApp SDK dependency).
 * Same form and styling but uses a regular HTML button instead of MainButton.
 */
const STANDALONE_LOGIN_HTML = `<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
    <title>Iniciar sesión - Xetux</title>
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/intl-tel-input/17.0.8/css/intlTelInput.min.css">
    <script src="https://cdnjs.cloudflare.com/ajax/libs/intl-tel-input/17.0.8/js/intlTelInput.min.js"></script>
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
        .help-icon { display: inline-flex; align-items: center; justify-content: center; width: 18px; height: 18px; border-radius: 50%; background: #e1983d; color: #000; font-size: 11px; font-weight: 700; cursor: pointer; flex-shrink: 0; margin-bottom: 6px; }
        .tooltip-overlay { display: none; position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.92); z-index: 100; justify-content: center; align-items: center; flex-direction: column; overflow: hidden; touch-action: none; }
        .tooltip-overlay.visible { display: flex; }
        .tooltip-img-container { width: 100%; flex: 1; display: flex; justify-content: center; align-items: center; overflow: hidden; touch-action: pinch-zoom; }
        .tooltip-img-container img { max-width: 90%; max-height: 65vh; border-radius: 10px; transform-origin: center center; transition: transform 0.1s ease; }
        .tooltip-bottom { padding: 16px 20px; text-align: center; flex-shrink: 0; }
        .tooltip-bottom p { color: #fff; font-size: 14px; max-width: 300px; line-height: 1.5; margin: 0 auto 12px; }
        .tooltip-bottom .close-btn { padding: 10px 32px; background: #e1983d; color: #000; border: none; border-radius: 8px; font-size: 14px; font-weight: 600; cursor: pointer; }
        .iti { width: 100%; }
        .iti__flag-container { border-radius: 10px 0 0 10px; }
        .iti__selected-flag { background: transparent !important; padding-left: 14px; }
        .iti__arrow { border-top-color: #aaa; }
        .iti__arrow--up { border-bottom-color: #aaa; }
        .iti__country-list { background-color: #1a1a1a; border: 1px solid #333; border-radius: 8px; color: #fff; max-height: 200px; }
        .iti__country.iti__highlight { background-color: #333; }
        .iti__country-name, .iti__dial-code { color: #fff; }
        .iti__divider { border-bottom-color: #333; }
        .iti input { padding-left: 52px !important; }
        .iti--separate-dial-code .iti__selected-flag { background: #1a1a1a !important; border-radius: 10px 0 0 10px; border-right: 1px solid #333; }
        .iti--separate-dial-code input { padding-left: 90px !important; }
        .submit-btn { width: 100%; padding: 14px; background: #e1983d; color: #000; border: none; border-radius: 10px; font-size: 16px; font-weight: 600; cursor: pointer; margin-top: 24px; transition: opacity 0.2s; }
        .submit-btn:disabled { opacity: 0.5; cursor: not-allowed; }
        .success-msg { text-align: center; padding: 40px 20px; }
        .success-msg h2 { color: #4caf50; margin-bottom: 12px; }
        .success-msg p { color: #aeb5bc; }
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
                <input type="tel" id="telefono" placeholder="412 1234567" required>
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
            <button type="button" class="submit-btn" id="submit-btn">Enviar datos</button>
        </form>
    </div>
    <div class="tooltip-overlay" id="xetux-tooltip">
        <div class="tooltip-img-container" id="img-container">
            <img src="/webapp/xetux-id-help.png" alt="Donde encontrar tu Xetux ID" id="tooltip-img">
        </div>
        <div class="tooltip-bottom">
            <p>Tu Xetux ID se encuentra en la pantalla principal de la app Xetux, en el campo marcado como "XETUX ID".</p>
            <button class="close-btn" id="close-tooltip">Entendido</button>
        </div>
    </div>
    <div class="success-msg" id="success-msg" style="display:none;">
        <h2>✅ ¡Registro exitoso!</h2>
        <p>Sesión iniciada correctamente. Ya puedes volver al grupo de Telegram.</p>
    </div>
    <script>
        var phoneInput = document.getElementById('telefono');
        var iti = window.intlTelInput(phoneInput, {
            preferredCountries: ['ve', 'mx'],
            initialCountry: 'auto',
            geoIpLookup: function(cb) {
                fetch('https://ipapi.co/json/')
                    .then(function(r) { return r.json(); })
                    .then(function(d) { cb(d && d.country ? d.country : 'VE'); })
                    .catch(function() { cb('VE'); });
            },
            nationalMode: true,
            formatOnDisplay: false,
            autoPlaceholder: 'aggressive',
            separateDialCode: true,
            utilsScript: 'https://cdnjs.cloudflare.com/ajax/libs/intl-tel-input/17.0.8/js/utils.js'
        });

        var params = new URLSearchParams(window.location.search);
        var contactId = params.get('contact_id');
        var conversationId = params.get('conversation_id');
        var prefillXetuxId = params.get('xetux_id');

        if (prefillXetuxId) {
            document.getElementById('xetux_id').value = prefillXetuxId;
        }

        // Tooltip
        document.getElementById('xetux-help').addEventListener('click', function() {
            document.getElementById('xetux-tooltip').classList.add('visible');
        });
        document.getElementById('close-tooltip').addEventListener('click', function() {
            document.getElementById('xetux-tooltip').classList.remove('visible');
        });
        document.getElementById('xetux-tooltip').addEventListener('click', function(e) {
            if (e.target === this) this.classList.remove('visible');
        });

        // Auto-format Xetux ID
        document.getElementById('xetux_id').addEventListener('input', function() {
            var val = this.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
            if (val.length >= 1 && /^[0-9]/.test(val)) {
                alert('El Xetux ID debe comenzar con MX o VE');
                this.value = '';
                return;
            }
            if (val.length >= 2 && !(/^(MX|VE)/.test(val))) {
                alert('El Xetux ID debe comenzar con MX o VE');
                this.value = '';
                return;
            }
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
            if (!nombre.value.trim()) { nombre.classList.add('error'); document.getElementById('nombre-error').classList.add('visible'); valid = false; }
            var telefono = document.getElementById('telefono');
            if (telefono.value.trim().length < 7) { telefono.classList.add('error'); document.getElementById('telefono-error').classList.add('visible'); valid = false; }
            var email = document.getElementById('email');
            if (!email.value.trim() || email.value.indexOf('@') === -1) { email.classList.add('error'); document.getElementById('email-error').classList.add('visible'); valid = false; }
            var xetux_id = document.getElementById('xetux_id');
            var regex = /^(?:MX|VE)\\d{5}$/;
            if (!regex.test(xetux_id.value.trim())) { xetux_id.classList.add('error'); document.getElementById('xetux_id-error').classList.add('visible'); valid = false; }
            return valid;
        }

        document.getElementById('submit-btn').addEventListener('click', function() {
            if (!validate()) return;
            var btn = this;
            btn.disabled = true;
            btn.textContent = 'Enviando...';
            var data = {
                nombre: document.getElementById('nombre').value.trim(),
                telefono: iti.getNumber() || document.getElementById('telefono').value.trim(),
                email: document.getElementById('email').value.trim(),
                xetux_id: document.getElementById('xetux_id').value.trim(),
                contact_id: contactId,
                conversation_id: conversationId,
                telegram_user: null
            };
            var apiUrl = window.location.origin + '/api/webapp/register';
            fetch(apiUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            })
            .then(function(res) {
                btn.disabled = false;
                btn.textContent = 'Enviar datos';
                if (res.ok) {
                    document.getElementById('form-container').style.display = 'none';
                    document.getElementById('success-msg').style.display = 'block';
                } else {
                    res.json().then(function(j) {
                        alert('Error: ' + (j.error || 'Error desconocido'));
                    }).catch(function() {
                        alert('Error al procesar el registro');
                    });
                }
            })
            .catch(function(err) {
                btn.disabled = false;
                btn.textContent = 'Enviar datos';
                alert('Error de conexión: ' + err.message);
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

  // Serve standalone login page (for group chats — no Telegram SDK)
  fastify.get('/webapp/login', async (_request, reply) => {
    reply.type('text/html').send(STANDALONE_LOGIN_HTML);
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

          // Update Chatwoot contact — try full update, fallback field by field on conflict
          try {
            await chatwootService.updateContact(contactIdNum, {
              name: nombre,
              email,
              phone_number: telefono,
              additional_attributes: { country, country_code: countryCode },
              custom_attributes: { xetux_id },
            });
          } catch (updateErr) {
            logger.warn({ err: updateErr, contactId: contact_id }, 'Full contact update failed, trying without phone');
            try {
              await chatwootService.updateContact(contactIdNum, {
                name: nombre,
                email,
                additional_attributes: { country, country_code: countryCode },
                custom_attributes: { xetux_id },
              });
            } catch (updateErr2) {
              logger.warn({ err: updateErr2, contactId: contact_id }, 'Update without phone failed, trying without email');
              await chatwootService.updateContact(contactIdNum, {
                name: nombre,
                additional_attributes: { country, country_code: countryCode },
                custom_attributes: { xetux_id },
              });
            }
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
              .text('🛒 Ventas', `team:${country === 'mx' ? TEAMS.VENTAS_MX : TEAMS.VENTAS_VE}:Ventas`)
              .text('📋 Administración', `team:${country === 'mx' ? TEAMS.ADMINISTRACION_MX : TEAMS.ADMINISTRACION_VE}:Administración`);

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
