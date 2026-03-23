const STORAGE_KEY = 'fotomapa_entries_v2';
let map;
let markersLayer;
let currentPosition = null;
let currentImageDataUrl = '';
let deferredPrompt = null;
let cameraStream = null;

const els = {
  entryForm: document.getElementById('entryForm'),
  titleInput: document.getElementById('titleInput'),
  descInput: document.getElementById('descInput'),
  photoInput: document.getElementById('photoInput'),
  photoPreview: document.getElementById('photoPreview'),
  previewWrap: document.getElementById('previewWrap'),
  locateBtn: document.getElementById('locateBtn'),
  centerBtn: document.getElementById('centerBtn'),
  clearBtn: document.getElementById('clearBtn'),
  statusBox: document.getElementById('statusBox'),
  entriesList: document.getElementById('entriesList'),
  entryTemplate: document.getElementById('entryTemplate'),
  installBtn: document.getElementById('installBtn'),
  startCameraBtn: document.getElementById('startCameraBtn'),
  capturePhotoBtn: document.getElementById('capturePhotoBtn'),
  stopCameraBtn: document.getElementById('stopCameraBtn'),
  cameraWrap: document.getElementById('cameraWrap'),
  cameraVideo: document.getElementById('cameraVideo'),
  cameraCanvas: document.getElementById('cameraCanvas'),
  cameraBadge: document.getElementById('cameraBadge'),
};

document.addEventListener('DOMContentLoaded', async () => {
  initMap();
  bindEvents();
  await renderEntries();
  registerServiceWorker();
});

function bindEvents() {
  els.photoInput.addEventListener('change', handlePhotoChange);
  els.locateBtn.addEventListener('click', getLocation);
  els.entryForm.addEventListener('submit', saveEntry);
  els.clearBtn.addEventListener('click', clearEntries);
  els.centerBtn.addEventListener('click', centerOnLast);
  els.installBtn.addEventListener('click', installApp);
  els.startCameraBtn.addEventListener('click', startCamera);
  els.capturePhotoBtn.addEventListener('click', capturePhoto);
  els.stopCameraBtn.addEventListener('click', stopCamera);

  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    deferredPrompt = event;
    els.installBtn.classList.remove('d-none');
  });

  window.addEventListener('appinstalled', () => {
    updateStatus('Aplikacja została zainstalowana.', 'success');
    els.installBtn.classList.add('d-none');
  });

  window.addEventListener('beforeunload', stopCameraSilently);
}

function initMap() {
  map = L.map('map').setView([52.2297, 21.0122], 6);
  markersLayer = L.layerGroup().addTo(map);

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap',
    maxZoom: 19,
  }).addTo(map);
}

function updateStatus(message, type = 'secondary') {
  els.statusBox.className = `alert alert-${type} mb-0 small status-box`;
  els.statusBox.textContent = message;
}

function setPreview(dataUrl, sourceLabel = 'Zdjęcie gotowe.') {
  currentImageDataUrl = dataUrl;
  els.photoPreview.src = currentImageDataUrl;
  els.previewWrap.classList.remove('d-none');
  updateStatus(`${sourceLabel} Teraz pobierz GPS lub zapisz wpis.`, 'info');
}

function handlePhotoChange(event) {
  const file = event.target.files?.[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = () => setPreview(reader.result, 'Zdjęcie wybrane z pliku.');
  reader.readAsDataURL(file);
}

async function startCamera() {
  if (!navigator.mediaDevices?.getUserMedia) {
    updateStatus('Ta przeglądarka nie obsługuje dostępu do kamery.', 'danger');
    return;
  }

  try {
    stopCameraSilently();

    cameraStream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: { ideal: 'environment' },
        width: { ideal: 1280 },
        height: { ideal: 720 },
      },
      audio: false,
    });

    els.cameraVideo.srcObject = cameraStream;
    els.cameraWrap.classList.remove('d-none');
    els.capturePhotoBtn.disabled = false;
    els.stopCameraBtn.disabled = false;
    els.cameraBadge.textContent = 'Kamera aktywna';
    els.cameraBadge.className = 'badge text-bg-success';
    updateStatus('Kamera została uruchomiona. Możesz zrobić zdjęcie.', 'success');
  } catch (error) {
    updateStatus(`Nie udało się uruchomić kamery: ${error.message}`, 'danger');
  }
}

function capturePhoto() {
  if (!cameraStream) {
    updateStatus('Najpierw włącz kamerę.', 'warning');
    return;
  }

  const video = els.cameraVideo;
  const canvas = els.cameraCanvas;
  const width = video.videoWidth || 1280;
  const height = video.videoHeight || 720;

  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext('2d');
  context.drawImage(video, 0, 0, width, height);
  const dataUrl = canvas.toDataURL('image/jpeg', 0.92);
  setPreview(dataUrl, 'Zdjęcie zrobione kamerą.');
}

function stopCamera() {
  stopCameraSilently();
  updateStatus('Kamera została wyłączona.', 'secondary');
}

function stopCameraSilently() {
  if (cameraStream) {
    cameraStream.getTracks().forEach((track) => track.stop());
    cameraStream = null;
  }

  els.cameraVideo.srcObject = null;
  els.cameraWrap.classList.add('d-none');
  els.capturePhotoBtn.disabled = true;
  els.stopCameraBtn.disabled = true;
  els.cameraBadge.textContent = 'Kamera wyłączona';
  els.cameraBadge.className = 'badge text-bg-secondary';
}

function getLocation() {
  if (!('geolocation' in navigator)) {
    updateStatus('Ta przeglądarka nie obsługuje geolokalizacji.', 'danger');
    return;
  }

  updateStatus('Pobieram lokalizację GPS...', 'warning');

  navigator.geolocation.getCurrentPosition(
    ({ coords }) => {
      currentPosition = {
        lat: coords.latitude,
        lng: coords.longitude,
        accuracy: coords.accuracy,
      };
      updateStatus(`Lokalizacja pobrana: ${coords.latitude.toFixed(5)}, ${coords.longitude.toFixed(5)}`, 'success');
      map.setView([coords.latitude, coords.longitude], 16);
    },
    (error) => {
      updateStatus(`Nie udało się pobrać GPS: ${error.message}`, 'danger');
    },
    {
      enableHighAccuracy: true,
      timeout: 10000,
      maximumAge: 0,
    }
  );
}

async function saveEntry(event) {
  event.preventDefault();

  if (!currentImageDataUrl) {
    updateStatus('Najpierw dodaj zdjęcie z pliku albo zrób je kamerą.', 'danger');
    return;
  }

  if (!currentPosition) {
    updateStatus('Najpierw pobierz lokalizację GPS.', 'danger');
    return;
  }

  const title = els.titleInput.value.trim();
  const description = els.descInput.value.trim();
  if (!title) {
    updateStatus('Podaj tytuł wpisu.', 'danger');
    return;
  }

  const entry = {
    id: crypto.randomUUID(),
    title,
    description,
    imageDataUrl: currentImageDataUrl,
    lat: currentPosition.lat,
    lng: currentPosition.lng,
    accuracy: currentPosition.accuracy,
    createdAt: new Date().toISOString(),
  };

  const entries = getEntries();
  entries.unshift(entry);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));

  resetForm();
  await renderEntries();
  focusEntry(entry.id);
  updateStatus('Wpis zapisany lokalnie i dodany na mapę.', 'success');
}

function getEntries() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
  } catch {
    return [];
  }
}

async function renderEntries() {
  const entries = getEntries();
  els.entriesList.innerHTML = '';
  markersLayer.clearLayers();

  if (!entries.length) {
    els.entriesList.innerHTML = '<div class="text-muted rounded-4 p-4 bg-body-tertiary">Brak wpisów. Dodaj pierwszy punkt.</div>';
    return;
  }

  for (const entry of entries) {
    addMarker(entry);
    els.entriesList.appendChild(createEntryCard(entry));
  }
}

function addMarker(entry) {
  const popupHtml = `
    <div>
      <img src="${entry.imageDataUrl}" alt="Zdjęcie">
      <strong>${escapeHtml(entry.title)}</strong><br>
      <span>${entry.lat.toFixed(5)}, ${entry.lng.toFixed(5)}</span>
    </div>
  `;
  const marker = L.marker([entry.lat, entry.lng]).addTo(markersLayer);
  marker.bindPopup(popupHtml);
  marker.entryId = entry.id;
}

function createEntryCard(entry) {
  const fragment = els.entryTemplate.content.cloneNode(true);
  const card = fragment.querySelector('.entry-card');
  const img = fragment.querySelector('.entry-image');
  const title = fragment.querySelector('.entry-title');
  const date = fragment.querySelector('.entry-date');
  const desc = fragment.querySelector('.entry-desc');
  const coords = fragment.querySelector('.entry-coords');
  const shareBtn = fragment.querySelector('.share-btn');
  const focusBtn = fragment.querySelector('.focus-btn');
  const deleteBtn = fragment.querySelector('.delete-btn');

  card.dataset.id = entry.id;
  img.src = entry.imageDataUrl;
  title.textContent = entry.title;
  date.textContent = new Date(entry.createdAt).toLocaleString('pl-PL');
  desc.textContent = entry.description || 'Brak opisu';
  coords.textContent = `${entry.lat.toFixed(5)}, ${entry.lng.toFixed(5)} (±${Math.round(entry.accuracy)} m)`;

  shareBtn.addEventListener('click', () => shareEntry(entry));
  focusBtn.addEventListener('click', () => focusEntry(entry.id));
  deleteBtn.addEventListener('click', () => deleteEntry(entry.id));

  return fragment;
}

async function shareEntry(entry) {
  const shareText = `${entry.title}\n${entry.description || ''}\nGPS: ${entry.lat.toFixed(5)}, ${entry.lng.toFixed(5)}\nhttps://www.openstreetmap.org/?mlat=${entry.lat}&mlon=${entry.lng}#map=18/${entry.lat}/${entry.lng}`;

  try {
    if (navigator.share) {
      const files = [];
      const file = dataUrlToFile(entry.imageDataUrl, `fotomapa-${entry.id}.jpg`);
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        files.push(file);
      }

      await navigator.share({
        title: entry.title,
        text: shareText,
        files,
      });
      updateStatus('Wpis został udostępniony.', 'success');
    } else {
      await navigator.clipboard.writeText(shareText);
      updateStatus('Web Share API niedostępne. Skopiowano tekst do schowka.', 'warning');
    }
  } catch (error) {
    if (error?.name !== 'AbortError') {
      updateStatus(`Udostępnianie nie powiodło się: ${error.message}`, 'danger');
    }
  }
}

function focusEntry(entryId) {
  const entry = getEntries().find((item) => item.id === entryId);
  if (!entry) return;

  map.setView([entry.lat, entry.lng], 17);

  markersLayer.eachLayer((layer) => {
    if (layer.entryId === entryId) {
      layer.openPopup();
    }
  });
}

function centerOnLast() {
  const entries = getEntries();
  if (entries.length) {
    focusEntry(entries[0].id);
  } else if (currentPosition) {
    map.setView([currentPosition.lat, currentPosition.lng], 16);
  }
}

function deleteEntry(entryId) {
  const filtered = getEntries().filter((entry) => entry.id !== entryId);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered));
  renderEntries();
  updateStatus('Wpis został usunięty.', 'info');
}

function clearEntries() {
  if (!confirm('Usunąć wszystkie zapisane wpisy?')) return;
  localStorage.removeItem(STORAGE_KEY);
  renderEntries();
  updateStatus('Wyczyszczono wszystkie wpisy.', 'info');
}

function resetForm() {
  els.entryForm.reset();
  els.previewWrap.classList.add('d-none');
  els.photoPreview.removeAttribute('src');
  currentImageDataUrl = '';
  currentPosition = null;
  stopCameraSilently();
}

async function installApp() {
  if (!deferredPrompt) return;
  deferredPrompt.prompt();
  await deferredPrompt.userChoice;
  deferredPrompt = null;
  els.installBtn.classList.add('d-none');
}

function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch((error) => {
      console.error('SW registration failed', error);
    });
  }
}

function escapeHtml(value) {
  const div = document.createElement('div');
  div.textContent = value;
  return div.innerHTML;
}

function dataUrlToFile(dataUrl, filename) {
  const [meta, content] = dataUrl.split(',');
  const mime = meta.match(/data:(.*?);base64/)[1];
  const binary = atob(content);
  const bytes = new Uint8Array(binary.length);

  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }

  return new File([bytes], filename, { type: mime });
}