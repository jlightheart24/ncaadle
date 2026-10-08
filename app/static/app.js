const guessForm = document.getElementById('guess-form');
const guessInput = document.getElementById('guess');
const historyBox = document.getElementById('history');
const suggestions = document.getElementById('suggestions');
const breakdownToggle = document.getElementById('breakdown-toggle');
const breakdownModal = document.getElementById('breakdown-modal');
const breakdownClose = document.getElementById('breakdown-close');
const guessCount = document.getElementById('guess-count');
const boardEmpty = document.getElementById('board-empty');
const winBanner = document.getElementById('win-banner');

let teamsCache = [];
let attempts = 0;
let activeSuggestion = -1;

const titleCase = (value = '') =>
  value
    .toString()
    .split(' ')
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');

// ---- Help modal ----

const openBreakdown = () => {
  breakdownModal.hidden = false;
  breakdownModal.setAttribute('aria-hidden', 'false');
  document.body.classList.add('modal-open');
  breakdownClose.focus();
};

const closeBreakdown = () => {
  breakdownModal.hidden = true;
  breakdownModal.setAttribute('aria-hidden', 'true');
  document.body.classList.remove('modal-open');
  breakdownToggle.focus();
};

breakdownToggle.addEventListener('click', openBreakdown);
breakdownClose.addEventListener('click', closeBreakdown);
breakdownModal.addEventListener('click', (event) => {
  if (event.target.matches('[data-modal-close]')) closeBreakdown();
});
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && !breakdownModal.hidden) closeBreakdown();
});

// ---- Board ----

const stateClass = (match, near) => (match ? 'tile--match' : near ? 'tile--near' : 'tile--miss');

const formatCount = (guessCount, comparison) => {
  if (guessCount === null || guessCount === undefined) return { value: '?', arrow: '' };
  if (comparison === 'equal') return { value: `${guessCount}`, arrow: '' };
  return { value: `${guessCount}`, arrow: comparison === 'more' ? '↑' : '↓' };
};

const makeTile = (state, label, index) => {
  const tile = document.createElement('div');
  tile.className = `tile ${state}`;
  tile.style.setProperty('--i', index);
  tile.setAttribute('aria-label', label);
  return tile;
};

const textTile = (state, label, value, index) => {
  const tile = makeTile(state, `${label}: ${value}`, index);
  const span = document.createElement('span');
  span.className = 'tile__text';
  span.textContent = value;
  tile.appendChild(span);
  return tile;
};

const colorTile = (state, label, name, hex, index) => {
  const tile = textTile(state, label, name, index);
  if (hex) {
    const dot = document.createElement('i');
    dot.className = 'tile__swatch';
    dot.style.background = hex;
    tile.prepend(dot);
  }
  return tile;
};

const countTile = (state, label, { value, arrow }, index) => {
  const tile = makeTile(state, `${label}: ${value}${arrow ? `, answer is ${arrow === '↑' ? 'higher' : 'lower'}` : ''}`, index);
  tile.classList.add('tile--count');
  const num = document.createElement('span');
  num.className = 'tile__num';
  num.textContent = value;
  tile.appendChild(num);
  if (arrow) {
    const arr = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    arr.setAttribute('class', `tile__arrow${arrow === '↓' ? ' tile__arrow--down' : ''}`);
    arr.setAttribute('viewBox', '0 0 24 24');
    arr.setAttribute('aria-hidden', 'true');
    arr.innerHTML = '<path d="M12 20V5M5 11.5L12 4.5l7 7" />';
    tile.appendChild(arr);
  }
  return tile;
};

const schoolTile = (state, name, logoUrl) => {
  const tile = makeTile(state, `School: ${name}`, 0);
  tile.classList.add('tile--school');
  if (logoUrl) {
    const img = document.createElement('img');
    img.className = 'tile__logo';
    img.src = logoUrl;
    img.alt = '';
    tile.appendChild(img);
  }
  const span = document.createElement('span');
  span.className = 'tile__text';
  span.textContent = name;
  tile.appendChild(span);
  return tile;
};

const nearChampionships = (data) =>
  typeof data.championships === 'number' &&
  typeof data.guessedChampionships === 'number' &&
  Math.abs(data.championships - data.guessedChampionships) === 1;

const appendHistory = (data) => {
  const row = document.createElement('div');
  row.className = 'board__row';

  const school = data.guessedSchool || 'Unknown';
  row.append(
    schoolTile(data.result === 'correct' ? 'tile--match' : 'tile--miss', school, data.guessedLogo),
    textTile(
      stateClass(data.mascotMatch, data.mascotNear),
      'Mascot',
      titleCase(data.guessedMascot || 'Unknown'),
      1
    ),
    textTile(stateClass(data.conferenceMatch, false), 'Conference', data.guessedConference || 'Unknown', 2),
    colorTile(
      stateClass(data.colorMatch, data.colorCrossMatch),
      'Color',
      titleCase(data.guessedColorName || data.guessedColor || 'Unknown'),
      data.guessedColor,
      3
    ),
    colorTile(
      stateClass(data.alternateColorMatch, data.alternateColorCrossMatch),
      'Alternate color',
      titleCase(data.guessedAlternateColorName || data.guessedAlternateColor || 'Unknown'),
      data.guessedAlternateColor,
      4
    ),
    countTile(
      stateClass(data.conferenceChampionshipsMatch, data.conferenceChampionshipsNear),
      'Conference titles',
      formatCount(data.guessedConferenceChampionships, data.conferenceChampionshipsComparison),
      5
    ),
    countTile(
      stateClass(data.championshipsMatch, nearChampionships(data)),
      'National titles',
      formatCount(data.guessedChampionships, data.championshipsComparison),
      6
    ),
    countTile(
      stateClass(data.heismansMatch, data.heismansNear),
      'Heismans',
      formatCount(data.guessedHeismans, data.heismansComparison),
      7
    )
  );

  historyBox.prepend(row);
  boardEmpty.hidden = true;
  guessCount.textContent = attempts;
};

const showWin = (team) => {
  winBanner.textContent = `${team} it is. Solved in ${attempts} ${attempts === 1 ? 'guess' : 'guesses'}.`;
  winBanner.hidden = false;
};

// ---- Autocomplete ----

const loadTeams = async () => {
  try {
    const res = await fetch('/teams');
    teamsCache = await res.json();
  } catch (e) {
    // ignore autocomplete errors silently
  }
};
loadTeams();

const hideSuggestions = () => {
  suggestions.classList.remove('is-open');
  activeSuggestion = -1;
};

const highlightSuggestion = (index) => {
  const items = suggestions.querySelectorAll('.suggestions__item');
  items.forEach((item, i) => item.classList.toggle('is-active', i === index));
  activeSuggestion = index;
};

const renderSuggestions = (value) => {
  suggestions.innerHTML = '';
  if (!value) return hideSuggestions();
  const lower = value.toLowerCase();
  const matches = teamsCache.filter((team) => team.toLowerCase().includes(lower)).slice(0, 5);
  if (!matches.length) return hideSuggestions();
  matches.forEach((team) => {
    const item = document.createElement('div');
    item.className = 'suggestions__item';
    item.setAttribute('role', 'option');
    item.textContent = team;
    item.addEventListener('mousedown', (e) => {
      e.preventDefault();
      guessInput.value = team;
      hideSuggestions();
      guessInput.focus();
    });
    suggestions.appendChild(item);
  });
  activeSuggestion = -1;
  suggestions.classList.add('is-open');
};

guessInput.addEventListener('input', (e) => renderSuggestions(e.target.value.trim()));
guessInput.addEventListener('blur', () => setTimeout(hideSuggestions, 120));
guessInput.addEventListener('keydown', (e) => {
  const items = suggestions.querySelectorAll('.suggestions__item');
  if (!suggestions.classList.contains('is-open') || !items.length) return;
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault();
    const step = e.key === 'ArrowDown' ? 1 : -1;
    highlightSuggestion((activeSuggestion + step + items.length) % items.length);
  } else if (e.key === 'Enter' && activeSuggestion >= 0) {
    e.preventDefault();
    guessInput.value = items[activeSuggestion].textContent;
    hideSuggestions();
  } else if (e.key === 'Escape') {
    hideSuggestions();
  }
});

// ---- Guessing ----

const shakeInput = () => {
  guessForm.classList.remove('is-shaking');
  void guessForm.offsetWidth;
  guessForm.classList.add('is-shaking');
};

const handleGuess = async () => {
  const guess = guessInput.value.trim();
  if (!guess) return;
  hideSuggestions();

  const res = await fetch('/guess', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ guess }),
  });
  const data = await res.json();

  if (data.result === 'invalid') {
    shakeInput();
    guessInput.value = '';
    guessInput.focus();
    return;
  }

  attempts += 1;
  appendHistory(data);
  if (data.result === 'correct') showWin(data.target || data.guessedSchool);

  guessInput.value = '';
  guessInput.focus();
};

guessForm.addEventListener('submit', (e) => {
  e.preventDefault();
  handleGuess();
});

const resetButton = document.getElementById('reset');
if (resetButton) {
  resetButton.onclick = async () => {
    await fetch('/reset', { method: 'POST' });
    attempts = 0;
    historyBox.innerHTML = '';
    guessCount.textContent = '0';
    boardEmpty.hidden = false;
    winBanner.hidden = true;
    guessInput.value = '';
    guessInput.focus();
  };
}
