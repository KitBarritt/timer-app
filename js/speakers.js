const presets = {
  'One Minute': [60, 60, 60, 90],
  'Table Topics': [60, 90, 120, 150],
  'Evaluations': [120, 150, 180, 210],
  'Icebreaker': [240, 300, 360, 390],
  'Speech': [300, 360, 420, 450],
  '10 Minutes': [480, 540, 600, 630],
  '15 Minutes': [720, 840, 900, 930],
  '20 Minutes': [900, 1080, 1200, 1230]
};

function toMMSS(sec) {
  if (isNaN(sec)) return '';
  const m = Math.floor(sec / 60).toString().padStart(2, '0');
  const s = (sec % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

function toSeconds(str) {
  const [m, s] = str.split(':').map(Number);
  return (isNaN(m) || isNaN(s)) ? null : m * 60 + s;
}

const tableBody = document.getElementById("table-body");
const speakerData = JSON.parse(localStorage.getItem("speakerData") || "[]");

speakerData.forEach(s => {
  const tr = document.createElement("tr");
  tr.innerHTML = `
    <td><input name="name" value="${s.name}" /></td>
    <td>
      <select class="preset-select">
        <option value="">-- Select --</option>
        ${Object.keys(presets).map(p => `<option ${JSON.stringify(s.preset) === JSON.stringify(presets[p]) ? 'selected' : ''}>${p}</option>`).join('')}
      </select>
    </td>
    ${[0, 1, 2, 3].map(i => `<td><input class="time-mmss" value="${toMMSS(s.preset?.[i])}" /></td>`).join('')}
    <td>${toMMSS(s.actual)}</td>
  `;
  tableBody.appendChild(tr);
});

for (let i = 0; i < 10; i++) {
  const tr = document.createElement("tr");
  tr.innerHTML = `
    <td><input name="name" /></td>
    <td>
      <select class="preset-select">
        <option value="">-- Select --</option>
        ${Object.keys(presets).map(p => `<option>${p}</option>`).join('')}
      </select>
    </td>
    ${[0, 1, 2, 3].map(() => `<td><input class="time-mmss" /></td>`).join('')}
    <td></td>
  `;
  tableBody.appendChild(tr);
}

document.querySelectorAll('.preset-select').forEach(select => {
  select.addEventListener('change', () => {
    const values = presets[select.value] || ["", "", "", ""];
    const row = select.closest('tr');
    const inputs = row.querySelectorAll('.time-mmss');
    values.forEach((val, i) => {
      const m = String(Math.floor(val / 60)).padStart(2, '0');
      const s = String(val % 60).padStart(2, '0');
      inputs[i].value = `${m}:${s}`;
    });
  });
});

document.getElementById("speaker-form").addEventListener("submit", e => {
  e.preventDefault();

  const rows = document.querySelectorAll("#table-body tr");
  const updated = [];

  rows.forEach(row => {
    const name = row.querySelector("input[name='name']").value.trim();
    const inputs = row.querySelectorAll(".time-mmss");
    const preset = Array.from(inputs).map(input => toSeconds(input.value));
    if (name && preset.every(t => t !== null)) {
      const existing = speakerData.find(s => s.name === name);
      updated.push({ name, preset, actual: existing?.actual || null });
    }
  });

  localStorage.setItem("speakerData", JSON.stringify(updated));
  window.location.href = "timer.html";
});
