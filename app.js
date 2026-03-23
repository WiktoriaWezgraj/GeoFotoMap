const form = document.getElementById('entryForm');
const titleInput = document.getElementById('titleInput');
const descInput = document.getElementById('descInput');
const entriesList = document.getElementById('entriesList');

form.addEventListener('submit', (event) => {
  event.preventDefault();

  const article = document.createElement('article');
  article.innerHTML = `<h3>${titleInput.value}</h3><p>${descInput.value || 'Brak opisu'}</p>`;
  entriesList.prepend(article);
  form.reset();
});
