const STORAGE_KEY = 'fotomapa_entries_v1';
let map;
let markersLayer;

const form = document.getElementById('entryForm');
const titleInput = document.getElementById('titleInput');
const descInput = document.getElementById('descInput');
const entriesList = document.getElementById('entriesList');

document.addEventListener('DOMContentLoaded', () => {
  initMap();
  renderEntries();
});

form.addEventListener('submit', (event) => {
  event.preventDefault();
  const entries = getEntries();
  entries.unshift({
    id: crypto.randomUUID(),
    title: titleInput.value.trim(),
    description: descInput.value.trim(),
    lat: 52.2297,
    lng: 21.0122,
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
    item.innerHTML = `<h3>${entry.title}</h3><p>${entry.description || 'Brak opisu'}</p>`;
    entriesList.appendChild(item);
    L.marker([entry.lat, entry.lng]).addTo(markersLayer).bindPopup(entry.title);
  });
}
