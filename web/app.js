// Version du front : à modifier lors d'une nouvelle release.
const FRONT_VERSION = '1.0.0';

const list = document.getElementById('tasks');
const errorBox = document.getElementById('error');

// URL relatives : l'Ingress envoie /api vers le service api.
async function api(path, options = {}) {
  const res = await fetch('/api' + path, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!res.ok) throw new Error(`${options.method || 'GET'} /api${path} → ${res.status}`);
  return res.status === 204 ? null : res.json();
}

function showError(err) {
  errorBox.textContent = err ? err.message : '';
}

async function loadTasks() {
  try {
    const tasks = await api('/tasks');
    list.innerHTML = '';
    for (const t of tasks) {
      const li = document.createElement('li');
      li.className = t.done ? 'done' : '';

      const box = document.createElement('input');
      box.type = 'checkbox';
      box.checked = t.done;
      box.onchange = () => api(`/tasks/${t.id}`, { method: 'PATCH', body: JSON.stringify({ done: box.checked }) })
        .then(loadTasks).catch(showError);

      const label = document.createElement('span');
      label.textContent = t.title;

      const del = document.createElement('button');
      del.textContent = 'Supprimer';
      del.onclick = () => api(`/tasks/${t.id}`, { method: 'DELETE' }).then(loadTasks).catch(showError);

      li.append(box, label, del);
      list.append(li);
    }
    showError(null);
  } catch (err) {
    showError(err);
  }
}

document.getElementById('add-form').onsubmit = async (e) => {
  e.preventDefault();
  const input = document.getElementById('title');
  try {
    await api('/tasks', { method: 'POST', body: JSON.stringify({ title: input.value }) });
    input.value = '';
    loadTasks();
  } catch (err) {
    showError(err);
  }
};

document.getElementById('front-version').textContent = FRONT_VERSION;
api('/version')
  .then((v) => { document.getElementById('api-version').textContent = v.version; })
  .catch(() => { document.getElementById('api-version').textContent = 'injoignable'; });

loadTasks();
