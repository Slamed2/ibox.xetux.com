import { FastifyPluginAsync } from 'fastify';
import multipart from '@fastify/multipart';
import { chatwootService } from '../services/chatwoot.service.js';
import { withExecutionLog } from '../services/execution-log.service.js';
import { bot } from '../services/telegram.service.js';
import { logger } from '../utils/logger.js';

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

  // Página de subida de archivos grandes
  fastify.get('/webapp/upload', async (_request, reply) => {
    reply.type('text/html').send(UPLOAD_HTML);
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
};
