  const urlInput = document.getElementById('urlInput');  const fetchBtn = document.getElementById('fetchBtn');
  const downloadBtn = document.getElementById('downloadBtn');
  const infoBox = document.getElementById('infoBox');
  const controls = document.getElementById('controls');
  const logEl = document.getElementById('log');
  const progressBar = document.getElementById('progressBar');
  const progressText = document.getElementById('progressText');
  const progressWrap = document.getElementById('progressWrap');

  const audioSel = document.getElementById('audioSel');
  const videoSel = document.getElementById('videoSel');
  const typeSel = document.getElementById('typeSel');

  let current = null;

  function log(msg, type = '') {
    logEl.textContent += msg + '\n';
    logEl.className = 'log ' + type;
    logEl.scrollTop = logEl.scrollHeight;
  }
  function setProgress(p) {
    progressBar.style.width = p + '%';
    progressText.textContent = p + '%';
  }

  function normalizeUrl(u) {
    u = u.trim();
    if (!u) return null;
    let m = u.match(/youtu\.be\/([\w-]+)/);
    if (m) return 'https://www.youtube.com/watch?v=' + m[1];
    if (/youtube\.com\/watch\?v=/.test(u)) return u;
    if (/youtube\.com\/shorts\/([\w-]+)/.test(u)) {
      return u.replace(/shorts\//, 'watch?v=');
    }
    return null;
  }

  // ---- YouTube səhifəsindən ytInitialPlayerResponse tap ----
  function parseYouTubePage(html) {
    const m = html.match(/ytInitialPlayerResponse\s*=\s*(\{[\s\S]*?\})\s*;\s*</);
    if (!m) return null;
    try { return JSON.parse(m[1]); } catch(e) { return null; }
  }

  // ---- Məlumatları çoxlu fallback ilə al ----
  async function fetchMetadata(videoUrl) {
    const errors = [];

    // 1) ytdl.aca.im
    try {
      const res = await fetch('https://ytdl.aca.im/api/v1/search?q=' + encodeURIComponent(videoUrl) +
  '&format=json');
      if (res.ok) {
        const data = await res.json();
        if (data && data.videoDetails) return { source: 'ytdl.aca.im', data };
      }
      errors.push('ytdl.aca.im: HTTP ' + res.status);
    } catch(e) { errors.push('ytdl.aca.im: ' + e.message); }

    // 2) allorigins CORS proxy + YouTube səhifəsi
    try {
      const proxy = 'https://api.allorigins.win/raw?url=' + encodeURIComponent(videoUrl);
      const res = await fetch(proxy);
      if (res.ok) {
        const html = await res.text();
        const pr = parseYouTubePage(html);
        if (pr) {
          const vd = pr.videoDetails;
          const formats = (pr.streamingData && pr.streamingData.formats) || [];
          const adaptive = (pr.streamingData && pr.streamingData.adaptiveFormats) || [];
          const allFormats = formats.concat(adaptive);
          const data = {
            videoDetails: { title: vd.title, thumbnail: vd.thumbnail?.thumbnails?.[0]?.url || '', lengthSeconds:
  vd.lengthSeconds },
            formats: allFormats.map(f => ({
              itag: f.itag, url: f.url,
              hasVideo: !!f.hasVideo, hasAudio: !!f.hasAudio,
              qualityLabel: f.qualityLabel, mimeType: f.mimeType, fps: f.fps,
              contentLength: f.contentLength
            }))
          };
          if (data.formats.length) return { source: 'allorigins', data };
        }
      }
      errors.push('allorigins: parse failed');
    } catch(e) { errors.push('allorigins: ' + e.message); }

    // 3) corsproxy.io
    try {
      const proxy = 'https://corsproxy.io/?url=' + encodeURIComponent(videoUrl);
      const res = await fetch(proxy);
      if (res.ok) {
        const html = await res.text();
        const pr = parseYouTubePage(html);
        if (pr) {
          const vd = pr.videoDetails;
          const allFormats = ((pr.streamingData && pr.streamingData.formats) || []).concat((pr.streamingData &&
  pr.streamingData.adaptiveFormats) || []);
          const data = {
            videoDetails: { title: vd.title, thumbnail: vd.thumbnail?.thumbnails?.[0]?.url || '', lengthSeconds:
  vd.lengthSeconds },
            formats: allFormats.map(f => ({ itag: f.itag, url: f.url, hasVideo: !!f.hasVideo, hasAudio: !!f.hasAudio,  qualityLabel: f.qualityLabel, mimeType: f.mimeType, fps: f.fps, contentLength: f.contentLength }))
          };
          if (data.formats.length) return { source: 'corsproxy', data };
        }
      }
      errors.push('corsproxy: parse failed');
    } catch(e) { errors.push('corsproxy: ' + e.message); }

    // 4) codetabs
    try {
      const proxy = 'https://api.codetabs.com/v1/proxy?quest=' + encodeURIComponent(videoUrl);
      const res = await fetch(proxy);
      if (res.ok) {
        const html = await res.text();
        const pr = parseYouTubePage(html);
        if (pr) {
          const vd = pr.videoDetails;
          const allFormats = ((pr.streamingData && pr.streamingData.formats) || []).concat((pr.streamingData &&
  pr.streamingData.adaptiveFormats) || []);
          const data = {
            videoDetails: { title: vd.title, thumbnail: vd.thumbnail?.thumbnails?.[0]?.url || '', lengthSeconds:
  vd.lengthSeconds },
            formats: allFormats.map(f => ({ itag: f.itag, url: f.url, hasVideo: !!f.hasVideo, hasAudio: !!f.hasAudio,  qualityLabel: f.qualityLabel, mimeType: f.mimeType, fps: f.fps, contentLength: f.contentLength }))
          };
          if (data.formats.length) return { source: 'codetabs', data };
        }
      }
      errors.push('codetabs: parse failed');
    } catch(e) { errors.push('codetabs: ' + e.message); }

    throw new Error('Bütün API-lər mismatch: ' + errors.join(' | '));
  }

  // ---- Məlumatları al ----
  fetchBtn.addEventListener('click', async () => {
    const norm = normalizeUrl(urlInput.value);
    if (!norm) { log('Xəta: Düzgün YouTube linki daxil et.', 'error'); return; }

    fetchBtn.disabled = true;
    log('Məlumat alınıyor: ' + norm);
    setProgress(0);

    try {
      const { source, data } = await fetchMetadata(norm);

      const title = data.videoDetails.title || 'video';
      const thumb = data.videoDetails.thumbnail || '';
      const duration = parseInt(data.videoDetails.lengthSeconds || 0, 10);

      const formats = data.formats || [];
      const audio = formats
        .filter(f => f.hasAudio && !f.hasVideo)
        .map(f => ({ itag: f.itag, name: f.qualityLabel || f.mimeType || ('itag '+f.itag), url: f.url, size:
  f.contentLength ? Math.round(f.contentLength/1048576)+' MB' : '' }))
        .sort((a,b) => (b.itag||0) - (a.itag||0));
      const video = formats
        .filter(f => f.hasVideo)
        .map(f => ({ itag: f.itag, name: f.qualityLabel || f.fps+'fps', url: f.url, size: f.contentLength ?
  Math.round(f.contentLength/1048576)+' MB' : '', hasAudio: f.hasAudio }))
        .sort((a,b) => (parseInt((b.name||'0'))||0) - (parseInt((a.name||'0'))||0));

      if (!audio.length && !video.length) throw new Error('Format tapılmadı');

      current = { title, thumb, duration, audio, video };

      document.getElementById('thumb').src = thumb;
      document.getElementById('infoTitle').textContent = title;
      document.getElementById('infoMeta').textContent = duration + ' saniyə · ' + (video.length + audio.length) + '
  format · mənbə: ' + source;
      infoBox.classList.remove('hidden');

      audioSel.innerHTML = audio.map((f,i) => `<option value="${i}">${f.name}${f.size?' ·
  '+f.size:''}</option>`).join('') || '<option value="-1">yox</option>';
      videoSel.innerHTML = video.map((f,i) => `<option value="${i}">${f.name}${f.size?' · '+f.size:''}${f.hasAudio?'
  (ses var)':''}</option>`).join('') || '<option value="-1">yox</option>';

      controls.classList.remove('hidden');
      log('Məlumat alındı: ' + title + ' [' + source + ']', 'ok');
    } catch (e) {
      log('Xəta: ' + e.message, 'error');
    } finally {
      fetchBtn.disabled = false;
      setProgress(0);
    }
  });

  // ---- Brauzerdən endirmə ----
  async function downloadUrl(url, filename) {
    return new Promise((resolve, reject) => {
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      resolve();
    });
  }

  async function fetchBlobDownload(url, filename) {
    const res = await fetch(url, { mode: 'cors' });
    if (!res.ok) throw new Error('Endirmə HTTP ' + res.status);
    const blob = await res.blob();
    const blobUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = blobUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(blobUrl), 4000);
  }

  // ---- Yüklə ----
  downloadBtn.addEventListener('click', async () => {
    if (!current) return;
    const type = typeSel.value;
    const ai = parseInt(audioSel.value, 10);
    const vi = parseInt(videoSel.value, 10);

    downloadBtn.disabled = true;
    progressWrap.classList.remove('hidden');
    setProgress(5);

    const safeName = current.title.replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '_').slice(0, 60);

    try {
      if (type === 'audio') {
        const f = current.audio[ai];
        if (!f) throw new Error('Audio format seçilməyib');
        log('Audio endirilir: ' + f.name);
        await fetchBlobDownload(f.url, safeName + '.m4a');
        saveHistory('Audio', current.title, f.url);
        log('Tamam: ' + safeName + '.m4a', 'ok');
      } else if (type === 'video') {
        const f = current.video[vi];
        if (!f) throw new Error('Video format seçilməyib');
        const ext = (f.url||'').includes('.webm') ? 'webm' : 'mp4';
        log('Video endirilir: ' + f.name + (f.hasAudio ? '' : ' (ses yoxdur)'));
        await fetchBlobDownload(f.url, safeName + '.' + ext);
        saveHistory('Video' + (f.hasAudio ? '' : '(sesiz)'), current.title, f.url);
        log('Tamam: ' + safeName + '.' + ext, 'ok');
      } else {
        const a = current.audio[ai];
        const v = current.video[vi];
        if (!a || !v) throw new Error('Format seçilməyib');
        log('Audio endirilir...');
        await fetchBlobDownload(a.url, safeName + '_audio.m4a');
        log('Video endirilir...');
        await fetchBlobDownload(v.url, safeName + '_video.mp4');
        saveHistory('Audio+Video', current.title, a.url + ' | ' + v.url);
        log('Tamam: 2 fayl endirildi', 'ok');
      }
      setProgress(100);
    } catch (e) {
      log('Yükləmə xətası: ' + e.message + ' — direct link ilə cəhd edilir…', 'error');
      try {
        if (type === 'audio') await downloadUrl(current.audio[parseInt(audioSel.value,10)].url, safeName + '.m4a');
        else if (type === 'video') await downloadUrl(current.video[parseInt(videoSel.value,10)].url, safeName +
  '.mp4');
        else {
          await downloadUrl(current.audio[parseInt(audioSel.value,10)].url, safeName + '_audio.m4a');
          await downloadUrl(current.video[parseInt(videoSel.value,10)].url, safeName + '_video.mp4');
        }
        log('Fallback endirməsi işlədi', 'ok');
      } catch (e2) { log('Endirmə tamamilə mismatch: ' + e2.message, 'error'); }
    } finally {
      downloadBtn.disabled = false;
      progressWrap.classList.add('hidden');
    }
  });

  // ---- Tarix (LocalStorage) ----
  const HISTORY_KEY = 'freepy_history_v1';
  function saveHistory(type, title, url) {
    try {
      const list = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]');
      list.unshift({ type, title, url, time: new Date().toLocaleString('az-AZ') });
      localStorage.setItem(HISTORY_KEY, JSON.stringify(list.slice(0, 50)));
      renderHistory();
    } catch(e) {}
  }
  function renderHistory() {
    const ul = document.getElementById('historyList');
    let list = [];
    try { list = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]'); } catch(e) {}
    ul.innerHTML = list.map(h => `
      <li>
        <span class="tag">${h.type}</span>
        <span>${escapeHtml(h.title)}</span>
        <span class="time">${h.time}</span>
        <a href="${escapeAttr(h.url)}" target="_blank" rel="noopener">link</a>
      </li>`).join('');
  }
  function escapeHtml(s){ return String(s).replace(/[&<>"']/g, c =>
  ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
  function escapeAttr(s){ return escapeHtml(s); }
  renderHistory();