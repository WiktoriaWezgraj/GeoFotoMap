const STORAGE_KEY = 'fotomapa_entries_v1';
let map;
let markersLayer;
let currentPosition = null;
let deferredPrompt = null;

const form = document.getElementById('entryForm');
const titleInput = document.getElementById('titleInput');
const descInput = document.getElementById('descInput');
const entriesList = document.getElementById('entriesList');
const locateBtn = document.getElementById('locateBtn');
const statusBox = document.getElementById('statusBox');
const centerBtn = document.getElementById('centerBtn');
const clearBtn = document.getElementById('clearBtn');
const installBtn = document.getElementById('installBtn');
const photoInput = document.getElementById('photoInput');
const photoPreview = document.getElementById('photoPreview');
let currentImageDataUrl = '';

document.addEventListener('DOMContentLoaded', () => {
  initMap();
  renderEntries();
});

locateBtn.addEventListener('click', getLocation);
centerBtn.addEventListener('click', centerOnLast);
clearBtn.addEventListener('click', clearEntries);
installBtn.addEventListener('click', installApp);
window.addEventListener('beforeinstallprompt', (event) => { event.preventDefault(); deferredPrompt = event; installBtn.hidden = false; });
window.addEventListener('appinstalled', () => { updateStatus('Aplikacja została zainstalowana.'); installBtn.hidden = true; });

photoInput.addEventListener('change', (event) => {
  const file = event.target.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    currentImageDataUrl = reader.result;
    photoPreview.src = currentImageDataUrl;
    photoPreview.hidden = false;
  };
  reader.readAsDataURL(file);
});

form.addEventListener('submit', (event) => {
  event.preventDefault();
  const entries = getEntries();
  entries.unshift({
    id: crypto.randomUUID(),
    title: titleInput.value.trim(),
    description: descInput.value.trim(),
    imageDataUrl: currentImageDataUrl,
    lat: currentPosition?.lat ?? 52.2297,
    lng: currentPosition?.lng ?? 21.0122,
    createdAt: new Date().toISOString(),
  });
  localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  renderEntries();
  form.reset();
});

function initMap() {
  map = L.map('map').setView([52.2297, 21.0122], 6);
  markersLayer = L.layerGroup().addTo(map);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap',
    maxZoom: 19,
  }).addTo(map);
}

function getEntries() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || []; } catch { return []; }
}

function renderEntries() {
  const entries = getEntries();
  entriesList.innerHTML = '';
  markersLayer.clearLayers();

  entries.forEach((entry) => {
    const item = document.createElement('article');
    item.className = 'entry';
    item.innerHTML = `${entry.imageDataUrl ? `<img src="${entry.imageDataUrl}" alt="Zdjęcie">` : ''}<h3>${entry.title}</h3><p>${entry.description || 'Brak opisu'}</p><p>GPS: ${entry.lat.toFixed(5)}, ${entry.lng.toFixed(5)}</p><button data-action="share">Udostępnij</button> <button data-action="focus">Pokaż na mapie</button> <button data-action="delete">Usuń</button>`;
    item.querySelector('[data-action="share"]').addEventListener('click', () => shareEntry(entry));
    item.querySelector('[data-action="focus"]').addEventListener('click', () => focusEntry(entry.id));
    item.querySelector('[data-action="delete"]').addEventListener('click', () => deleteEntry(entry.id));
    entriesList.appendChild(item);
    const marker = L.marker([entry.lat, entry.lng]).addTo(markersLayer).bindPopup(entry.title);
    marker.entryId = entry.id;
  });
}

function updateStatus(message) {
  statusBox.textContent = message;
}

function getLocation() {
  if (!('geolocation' in navigator)) {
    updateStatus('Ta przeglądarka nie obsługuje geolokalizacji.');
    return;
  }

  updateStatus('Pobieram lokalizację GPS...');
  navigator.geolocation.getCurrentPosition((pos) => {
    currentPosition = { lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy };
    updateStatus('Lokalizacja: ${currentPosition.lat.toFixed(5)}, ${currentPosition.lng.toFixed(5)}');
    map.setView([currentPosition.lat, currentPosition.lng], 16);
  }, (error) => {
    updateStatus('Nie udało się pobrać GPS: ${error.message}');
  }, { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 });
}

function focusEntry(entryId) {
  const entry = getEntries().find((item) => item.id === entryId);
  if (!entry) return;
  map.setView([entry.lat, entry.lng], 17);
  markersLayer.eachLayer((layer) => { if (layer.entryId === entryId) layer.openPopup(); });
}

function centerOnLast() {
  const entries = getEntries();
  if (entries.length) focusEntry(entries[0].id);
}

function deleteEntry(entryId) {
  const filtered = getEntries().filter((entry) => entry.id !== entryId);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered));
  renderEntries();
  updateStatus('Wpis został usunięty.');
}

function clearEntries() {
  if (!confirm('Usunąć wszystkie wpisy?')) return;
  localStorage.removeItem(STORAGE_KEY);
  renderEntries();
  updateStatus('Wyczyszczono wszystkie wpisy.');
}

async function shareEntry(entry) {
  const shareText = `${entry.title}
${entry.description || ''}
GPS: ${entry.lat.toFixed(5)}, ${entry.lng.toFixed(5)}`;
  try {
    if (navigator.share) {
      await navigator.share({ title: entry.title, text: shareText });
      updateStatus('Wpis został udostępniony.');
    } else {
      await navigator.clipboard.writeText(shareText);
      updateStatus('Web Share API niedostępne. Skopiowano tekst do schowka.');
    }
  } catch (error) {
    if (error?.name !== 'AbortError') updateStatus('Udostępnianie nie powiodło się: ${error.message}');
  }
}

async function installApp() {
  if (!deferredPrompt) return;
  deferredPrompt.prompt();
  await deferredPrompt.userChoice;
  deferredPrompt = null;
  installBtn.hidden = true;
}

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js').catch((error) => console.error('SW registration failed', error));
}