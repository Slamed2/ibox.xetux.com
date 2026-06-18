import { FastifyPluginAsync } from 'fastify';
import multipart from '@fastify/multipart';
import { AxiosError } from 'axios';
import { InlineKeyboard } from 'grammy';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
import { chatwootService } from '../services/chatwoot.service.js';
import { withExecutionLog } from '../services/execution-log.service.js';
import { bot, enableUserCommands } from '../services/telegram.service.js';
import { TEAMS, buildDepartmentKeyboard, DEPARTMENT_MENU_CHATWOOT } from '../services/department-menu.js';
import { conversationNudgeState } from '../flows/routing.flow.js';
import { config } from '../config.js';
import { logger } from '../utils/logger.js';

interface RegisterBody {
  nombre: string;
  telefono: string;
  email: string;
  xetux_id: string;
  empresa?: string;
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
            <img src="${config.LOGO_URL}" alt="${config.COMPANY_NAME}">
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
                <label for="email">Email</label>
                <input type="email" id="email" placeholder="Ej: juan@email.com">
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
            if (email.value.trim() && email.value.indexOf('@') === -1) {
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
                    tg.showAlert('Sesión iniciada correctamente. ¡Bienvenido a ${config.COMPANY_NAME}!');
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
            <img src="${config.LOGO_URL}" alt="${config.COMPANY_NAME}">
        </div>
        <h1>Datos de Contacto</h1>
        <p class="subtitle">Completa tus datos para continuar</p>
        <form id="contact-form">
            <div class="form-group">
                <label for="empresa">Empresa *</label>
                <input type="text" id="empresa" placeholder="Ej: Mi Empresa C.A." required>
                <div class="error-text" id="empresa-error">Este campo es obligatorio</div>
            </div>
            <div class="form-group">
                <label for="telefono">Teléfono *</label>
                <input type="tel" id="telefono" placeholder="412 1234567" required>
                <div class="error-text" id="telefono-error">Ingresa un número de teléfono válido</div>
            </div>
            <div class="form-group">
                <label for="email">Email</label>
                <input type="email" id="email" placeholder="Ej: juan@email.com">
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
            var empresa = document.getElementById('empresa');
            if (!empresa.value.trim()) { empresa.classList.add('error'); document.getElementById('empresa-error').classList.add('visible'); valid = false; }
            var telefono = document.getElementById('telefono');
            if (telefono.value.trim().length < 7) { telefono.classList.add('error'); document.getElementById('telefono-error').classList.add('visible'); valid = false; }
            var email = document.getElementById('email');
            if (email.value.trim() && email.value.indexOf('@') === -1) { email.classList.add('error'); document.getElementById('email-error').classList.add('visible'); valid = false; }
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
            var empresaVal = document.getElementById('empresa').value.trim();
            var data = {
                nombre: 'Grupos - ' + empresaVal,
                telefono: iti.getNumber() || document.getElementById('telefono').value.trim(),
                email: document.getElementById('email').value.trim(),
                xetux_id: document.getElementById('xetux_id').value.trim(),
                empresa: document.getElementById('empresa').value.trim(),
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

// ─── Página de subida de archivos grandes (videos >20MB que Telegram no entrega) ──
const UPLOAD_HTML = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Subir archivo · Xetux</title>
  <script src="https://telegram.org/js/telegram-web-app.js"></script>
  <style>
    * { box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0f1115; color: #e7e9ee; margin: 0; min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 20px; }
    .card { background: #1a1d24; border: 1px solid #2a2e38; border-radius: 16px; padding: 28px; max-width: 420px; width: 100%; text-align: center; }
    h1 { font-size: 20px; margin: 0 0 6px; }
    p { color: #9aa0ad; font-size: 14px; margin: 0 0 20px; line-height: 1.5; }
    .drop { padding: 4px 0 2px; }
    .drop .q { margin-bottom: 12px; color: #9aa0ad; font-size: 14px; }
    .pickrow { display: flex; flex-direction: column; gap: 10px; }
    .pick { background: #20242c; color: #e7e9ee; border: 1px solid #3a3f4b; border-radius: 10px; padding: 15px; font-size: 15px; cursor: pointer; transition: .15s; }
    .pick:hover { border-color: #e1983d; }
    input[type=file] { display: none; }
    .file { margin-top: 14px; font-size: 13px; color: #cfd3dc; word-break: break-all; }
    button { margin-top: 18px; width: 100%; background: #e1983d; color: #1a1d24; border: 0; border-radius: 10px; padding: 13px; font-size: 15px; font-weight: 600; cursor: pointer; }
    button:disabled { opacity: .5; cursor: not-allowed; }
    .msg { margin-top: 16px; font-size: 14px; min-height: 20px; }
    .ok { color: #4ade80; }
    .err { color: #f87171; }
    .bar { height: 6px; background: #2a2e38; border-radius: 4px; overflow: hidden; margin-top: 16px; display: none; }
    .bar span { display: block; height: 100%; width: 0; background: #e1983d; transition: width .2s; }
  </style>
</head>
<body>
  <div class="card">
    <h1>📎 Subir tu archivo</h1>
    <p>Sube aquí tus archivos (videos, fotos o documentos) y los recibirá nuestro equipo en el chat.</p>
    <div class="drop">
      <div class="q">¿Qué quieres subir? Puedes combinar varios:</div>
      <div class="pickrow">
        <button type="button" class="pick" id="pickVideo">Cargar video</button>
        <button type="button" class="pick" id="pickPhoto">Cargar imagen</button>
        <button type="button" class="pick" id="pickFile">Cargar archivos</button>
      </div>
    </div>
    <input type="file" id="fVideo" accept="video/*" multiple />
    <input type="file" id="fPhoto" accept="image/*" multiple />
    <input type="file" id="fFile" multiple />
    <div class="file" id="fileName"></div>
    <div class="bar" id="bar"><span id="barFill"></span></div>
    <button id="send" disabled>Enviar</button>
    <div class="msg" id="msg"></div>
  </div>
  <script>
    var tg = window.Telegram && window.Telegram.WebApp;
    if (tg) { try { tg.ready(); tg.expand(); } catch (e) {} }
    var params = new URLSearchParams(location.search);
    var conversationId = params.get('conversation_id');
    var sendBtn = document.getElementById('send');
    var msg = document.getElementById('msg');
    var fileName = document.getElementById('fileName');
    var bar = document.getElementById('bar');
    var barFill = document.getElementById('barFill');
    var selected = [];
    function render() {
      if (!selected.length) { fileName.textContent = ''; sendBtn.disabled = true; return; }
      var total = 0; for (var i = 0; i < selected.length; i++) total += selected[i].size;
      fileName.textContent = selected.length + (selected.length === 1 ? ' archivo' : ' archivos') + ' (' + (total/1048576).toFixed(1) + ' MB)';
      sendBtn.disabled = false; msg.textContent = '';
    }
    function addFrom(input) {
      for (var i = 0; i < input.files.length; i++) selected.push(input.files[i]);
      input.value = '';
      render();
    }
    function bind(inputId, btnId) {
      var input = document.getElementById(inputId);
      input.addEventListener('change', function () { addFrom(input); });
      document.getElementById(btnId).addEventListener('click', function () { input.click(); });
    }
    bind('fVideo', 'pickVideo');
    bind('fPhoto', 'pickPhoto');
    bind('fFile', 'pickFile');
    sendBtn.addEventListener('click', function () {
      if (!selected.length || !conversationId) { msg.className='msg err'; msg.textContent='Falta el archivo o el enlace es inválido.'; return; }
      var fd = new FormData();
      for (var i = 0; i < selected.length; i++) fd.append('file', selected[i]);
      var xhr = new XMLHttpRequest();
      xhr.open('POST', '/api/webapp/upload?conversation_id=' + encodeURIComponent(conversationId));
      sendBtn.disabled = true; bar.style.display='block'; msg.className='msg'; msg.textContent='Subiendo...';
      xhr.upload.onprogress = function (e) { if (e.lengthComputable) barFill.style.width = Math.round(e.loaded/e.total*100)+'%'; };
      xhr.onload = function () {
        if (xhr.status >= 200 && xhr.status < 300) {
          msg.className='msg ok'; msg.textContent='✅ ¡Listo! Tu archivo fue enviado al chat.';
          bar.style.display='none';
          if (tg) setTimeout(function(){ try { tg.close(); } catch (e) {} }, 1800);
        } else {
          var t = 'No se pudo subir.'; try { t = JSON.parse(xhr.responseText).error || t; } catch (e) {}
          msg.className='msg err'; msg.textContent='❌ ' + t; sendBtn.disabled=false; bar.style.display='none';
        }
      };
      xhr.onerror = function () { msg.className='msg err'; msg.textContent='❌ Error de red.'; sendBtn.disabled=false; bar.style.display='none'; };
      xhr.send(fd);
    });
  </script>
</body>
</html>`;

export const webappPlugin: FastifyPluginAsync = async (fastify) => {
  // Soporte de subida de archivos (para /api/webapp/upload)
  await fastify.register(multipart, { limits: { fileSize: 100 * 1024 * 1024, files: 10 } });

  // Serve the mini app HTML
  fastify.get('/webapp', async (_request, reply) => {
    reply.type('text/html').send(WEBAPP_HTML);
  });

  // Página de subida de archivos grandes
  fastify.get('/webapp/upload', async (_request, reply) => {
    reply.type('text/html').send(UPLOAD_HTML);
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

  // Recibe los archivos subidos por el cliente y los postea a Chatwoot como nota interna (privada)
  fastify.post<{ Querystring: { conversation_id?: string } }>('/api/webapp/upload', async (request, reply) => {
    const conversationId = request.query.conversation_id;
    if (!conversationId || !/^\d+$/.test(conversationId)) {
      return reply.code(400).send({ error: 'conversation_id inválido' });
    }
    const convId = parseInt(conversationId, 10);

    const files: Array<{ buffer: Buffer; filename: string; mimeType: string }> = [];
    try {
      for await (const part of request.files()) {
        const buffer = await part.toBuffer();
        files.push({
          buffer,
          filename: part.filename || 'archivo',
          mimeType: part.mimetype || 'application/octet-stream',
        });
      }
    } catch (err: any) {
      logger.warn({ err: err?.message, conversationId }, 'Upload: archivo demasiado grande o inválido');
      return reply.code(413).send({ error: 'Algún archivo supera el tamaño permitido.' });
    }
    if (!files.length) return reply.code(400).send({ error: 'No se recibió ningún archivo.' });

    const totalBytes = files.reduce((n, f) => n + f.buffer.length, 0);
    try {
      await withExecutionLog(
        {
          eventType: 'webapp:upload',
          source: 'webapp',
          direction: 'inbound',
          inputData: { conversationId: convId, count: files.length, bytes: totalBytes, names: files.map(f => f.filename) },
          conversationId: String(convId),
        },
        async () => {
          // outgoing + private = nota interna (modo probado). El agente recibe los
          // archivos en el chat y NO se reenvían al cliente por Telegram.
          const caption = files.length === 1
            ? `📎 Archivo subido por el cliente: ${files[0].filename}`
            : `📎 ${files.length} archivos subidos por el cliente`;
          await chatwootService.uploadAttachments(convId, files, caption, true, 'outgoing');
          return { ok: true, count: files.length, bytes: totalBytes };
        },
      );
    } catch (err: any) {
      logger.error({ err: err?.message, conversationId: convId }, 'Upload to Chatwoot failed');
      return reply.code(502).send({ error: 'No se pudo enviar al chat. Puede superar el límite de Chatwoot.' });
    }

    // Confirmar al cliente por Telegram que recibimos su(s) archivo(s) (+ espejo en Chatwoot)
    try {
      const conv = await chatwootService.getConversation(convId);
      const tgId = conv?.meta?.sender?.additional_attributes?.social_telegram_user_id as number | undefined;
      if (tgId) {
        const n = files.length;
        const confirm = `✅ Recibimos ${n} ${n === 1 ? 'archivo' : 'archivos'}. ¡Gracias! 🙌`;
        const sent = await bot.api.sendMessage(tgId, confirm);
        await chatwootService.sendMessage(convId, {
          content: confirm,
          message_type: 'outgoing',
          source_id: String(sent.message_id),
        });
      }
    } catch (err: any) {
      logger.warn({ err: err?.message, conversationId: convId }, 'No se pudo enviar la confirmación al cliente');
    }

    logger.info({ conversationId: convId, count: files.length, bytes: totalBytes }, 'WebApp upload posted to Chatwoot');
    return reply.send({ ok: true });
  });

  // Handle form submission — update Chatwoot contact
  fastify.post<{ Body: RegisterBody }>('/api/webapp/register', async (request, reply) => {
    const { nombre, telefono, email, xetux_id, empresa, contact_id, conversation_id, telegram_user } = request.body;

    // Input validation
    const errors: string[] = [];
    if (!contact_id || !conversation_id) errors.push('contact_id y conversation_id son obligatorios');
    if (contact_id && !/^\d+$/.test(contact_id)) errors.push('contact_id debe ser numérico');
    if (conversation_id && !/^\d+$/.test(conversation_id)) errors.push('conversation_id debe ser numérico');
    if (!nombre || nombre.trim().length === 0) errors.push('nombre es obligatorio');
    if (nombre && nombre.length > 200) errors.push('nombre no puede exceder 200 caracteres');
    if (!xetux_id || !/^(VE|MX)\d{5}$/i.test(xetux_id)) errors.push('xetux_id debe tener formato VE##### o MX#####');
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.push('email tiene formato inválido');

    if (errors.length > 0) {
      reply.code(400);
      return { error: errors.join('; ') };
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

          // Build custom attributes — include empresa if provided (groups)
          const customAttrs: Record<string, string> = { xetux_id };
          if (empresa) customAttrs.empresa = empresa;

          // Update Chatwoot contact — try full update, fallback field by field on conflict
          try {
            await chatwootService.updateContact(contactIdNum, {
              name: nombre,
              email,
              phone_number: telefono,
              additional_attributes: { country, country_code: countryCode },
              custom_attributes: customAttrs,
            });
          } catch (updateErr) {
            logger.warn({ err: updateErr, contactId: contact_id }, 'Full contact update failed, trying without phone');
            try {
              await chatwootService.updateContact(contactIdNum, {
                name: nombre,
                email,
                additional_attributes: { country, country_code: countryCode },
                custom_attributes: customAttrs,
              });
            } catch (updateErr2) {
              logger.warn({ err: updateErr2, contactId: contact_id }, 'Update without phone failed, trying without email');
              await chatwootService.updateContact(contactIdNum, {
                name: nombre,
                additional_attributes: { country, country_code: countryCode },
                custom_attributes: customAttrs,
              });
            }
          }

          // Add country label to conversation
          await chatwootService.addLabels(conversationIdNum, [isMX ? 'mexico' : 'venezuela']);

          // Send registration details as internal note in Chatwoot
          const regDetails = [`✅ Registro completado:`, `• Nombre: ${nombre}`, `• Teléfono: ${telefono}`];
          if (email) regDetails.push(`• Email: ${email}`);
          regDetails.push(`• Xetux ID: ${xetux_id}`);
          if (empresa) regDetails.push(`• Empresa: ${empresa}`);
          await chatwootService.sendMessage(conversationIdNum, {
            content: regDetails.join('\n'),
            private: true,
            message_type: 'outgoing',
          });

          // Resolve Telegram chat ID: from WebApp SDK (private) or from Chatwoot contact (group)
          let telegramChatId: number | undefined = telegram_user?.id;
          if (!telegramChatId) {
            // Standalone login (groups): get chat ID from Chatwoot contact's social_telegram_user_id
            const conversation = await chatwootService.getConversation(conversationIdNum);
            telegramChatId = conversation?.meta?.sender?.additional_attributes?.social_telegram_user_id as number | undefined;
            logger.debug({ telegramChatId, conversationId: conversationIdNum }, 'Resolved telegramChatId from Chatwoot contact');
          }

          // Enable department commands in the hamburger menu
          // For groups (negative ID), set commands for the group chat
          if (telegramChatId) {
            await enableUserCommands(telegramChatId);
          }

          // Send department selection menu via Telegram
          if (telegramChatId) {
            const country = xetux_id.toUpperCase().startsWith('MX') ? 'mx' : 've';
            const keyboard = buildDepartmentKeyboard(country);

            const deptMsg = await bot.api.sendMessage(
              telegramChatId,
              '¿Con qué departamento deseas comunicarte?',
              { reply_markup: keyboard },
            );

            await chatwootService.sendMessage(conversationIdNum, {
              content: DEPARTMENT_MENU_CHATWOOT,
              message_type: 'outgoing',
              source_id: String(deptMsg.message_id),
            });

            conversationNudgeState.set(conversationIdNum, 'dept_pending');
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
