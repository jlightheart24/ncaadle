const guessInput = document.getElementById('guess');
const historyBox = document.getElementById('history');
const suggestions = document.getElementById('suggestions');
const breakdownToggle = document.getElementById('breakdown-toggle');
const breakdownModal = document.getElementById('breakdown-modal');
const breakdownClose = document.getElementById('breakdown-close');
const historyScroll = document.querySelector('.history-scroll');
const historyList = document.querySelector('.history-list');
const historyLeft = document.getElementById('history-left');
const historyRight = document.getElementById('history-right');

let teamsCache = [];
let attempts = 0;

const titleCase = (value = '') =>
  value
    .toString()
    .split(' ')
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');

const openBreakdown = () => {
  if (!breakdownModal) return;
  breakdownModal.hidden = false;
  breakdownModal.setAttribute('aria-hidden', 'false');
  document.body.classList.add('modal-open');
};

const closeBreakdown = () => {
  if (!breakdownModal) return;
  breakdownModal.hidden = true;
  breakdownModal.setAttribute('aria-hidden', 'true');
  document.body.classList.remove('modal-open');
};

if (breakdownToggle) {
  breakdownToggle.addEventListener('click', openBreakdown);
}
if (breakdownClose) {
  breakdownClose.addEventListener('click', closeBreakdown);
}
if (breakdownModal) {
  breakdownModal.addEventListener('click', (event) => {
    if (event.target && event.target.matches('[data-modal-close]')) {
      closeBreakdown();
    }
  });
}
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && breakdownModal && !breakdownModal.hidden) {
    closeBreakdown();
  }
});

const panState = {
  offset: 0,
  max: 0,
  dragging: false,
  startX: 0,
  startY: 0,
  startOffset: 0,
  startScrollTop: 0,
};

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

const updateHistoryButtons = () => {
  if (historyLeft) {
    historyLeft.disabled = panState.offset >= 0 || panState.max === 0;
  }
  if (historyRight) {
    historyRight.disabled = panState.offset <= -panState.max || panState.max === 0;
  }
};

const applyPan = () => {
  if (!historyList) return;
  historyList.style.transform = `translateX(${panState.offset}px)`;
  updateHistoryButtons();
};

const syncPanBounds = () => {
  if (!historyScroll || !historyList) return;
  const parentWidth = historyScroll.parentElement
    ? historyScroll.parentElement.clientWidth
    : historyScroll.clientWidth;
  if (parentWidth > 0) {
    historyScroll.style.width = `${parentWidth}px`;
  }
  panState.max = Math.max(0, historyList.scrollWidth - historyScroll.clientWidth);
  panState.offset = clamp(panState.offset, -panState.max, 0);
  applyPan();
};

const panBy = (delta) => {
  panState.offset = clamp(panState.offset + delta, -panState.max, 0);
  applyPan();
};

const setupHistoryPan = () => {
  if (!historyScroll || !historyList) return;

  if (historyLeft) {
    historyLeft.addEventListener('click', () => panBy(220));
  }
  if (historyRight) {
    historyRight.addEventListener('click', () => panBy(-220));
  }

  historyScroll.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) return;
    event.preventDefault();
    panState.dragging = true;
    panState.startX = event.clientX;
    panState.startY = event.clientY;
    panState.startOffset = panState.offset;
    panState.startScrollTop = historyScroll.scrollTop;
    historyScroll.classList.add('is-dragging');
    if (historyScroll.setPointerCapture) {
      historyScroll.setPointerCapture(event.pointerId);
    }
  });

  historyScroll.addEventListener('pointermove', (event) => {
    if (!panState.dragging) return;
    event.preventDefault();
    const deltaX = event.clientX - panState.startX;
    const deltaY = event.clientY - panState.startY;
    panState.offset = clamp(panState.startOffset + deltaX, -panState.max, 0);
    historyScroll.scrollTop = panState.startScrollTop - deltaY;
    applyPan();
  });

  const stopDrag = () => {
    panState.dragging = false;
    historyScroll.classList.remove('is-dragging');
  };

  historyScroll.addEventListener('pointerup', stopDrag);
  historyScroll.addEventListener('pointercancel', stopDrag);
  historyScroll.addEventListener('pointerleave', stopDrag);

  // Mouse/touch fallback for environments where pointer events are flaky.
  historyScroll.addEventListener('mousedown', (event) => {
    if (event.button !== 0) return;
    event.preventDefault();
    panState.dragging = true;
    panState.startX = event.clientX;
    panState.startY = event.clientY;
    panState.startOffset = panState.offset;
    panState.startScrollTop = historyScroll.scrollTop;
    historyScroll.classList.add('is-dragging');
  });
  window.addEventListener('mousemove', (event) => {
    if (!panState.dragging) return;
    event.preventDefault();
    const deltaX = event.clientX - panState.startX;
    const deltaY = event.clientY - panState.startY;
    panState.offset = clamp(panState.startOffset + deltaX, -panState.max, 0);
    historyScroll.scrollTop = panState.startScrollTop - deltaY;
    applyPan();
  });
  window.addEventListener('mouseup', stopDrag);

  historyScroll.addEventListener(
    'wheel',
    (event) => {
      // Keep native vertical wheel scrolling; only map horizontal wheel to pan.
      if (Math.abs(event.deltaX) <= Math.abs(event.deltaY)) return;
      event.preventDefault();
      panBy(-event.deltaX);
    },
    { passive: false }
  );

  // Recompute bounds whenever entries change.
  const observer = new MutationObserver(() => syncPanBounds());
  observer.observe(historyList, { childList: true, subtree: true });

  window.addEventListener('resize', syncPanBounds);
  requestAnimationFrame(syncPanBounds);
};

const appendHistory = (data) => {
  const wrapper = document.createElement('div');
  wrapper.className = 'history-item';

  const grid = document.createElement('div');
  grid.className = 'history-grid';

  const addSchoolBox = (label, value, logoUrl, state) => {
    const box = document.createElement('div');
    box.className = `result-box result-box--wide ${state}`;
    const eyebrow = document.createElement('p');
    eyebrow.className = 'eyebrow';
    eyebrow.textContent = label;
    const row = document.createElement('div');
    row.className = 'school-row';
    const img = document.createElement('img');
    img.className = 'result-logo';
    if (logoUrl) {
      img.src = logoUrl;
      img.alt = value || 'Team logo';
      img.style.display = 'inline-block';
    } else {
      img.alt = '';
      img.style.display = 'none';
    }
    const val = document.createElement('p');
    val.className = 'result-box__value result-box__value--school';
    val.textContent = value || '—';
    row.appendChild(img);
    row.appendChild(val);
    box.appendChild(eyebrow);
    box.appendChild(row);
    grid.appendChild(box);
  };

  const addBox = (label, value, state, extraClass = '') => {
    const box = document.createElement('div');
    box.className = `result-box ${state} ${extraClass}`.trim();
    const eyebrow = document.createElement('p');
    eyebrow.className = 'eyebrow';
    eyebrow.textContent = label;
    const val = document.createElement('p');
    val.className = 'result-box__value';
    val.textContent = value || '—';
    box.appendChild(eyebrow);
    box.appendChild(val);
    grid.appendChild(box);
  };

  const championshipText = formatChampionships(
    data.guessedChampionships,
    data.championshipsComparison
  );
  const nearChampionships =
    typeof data.championships === 'number' &&
    typeof data.guessedChampionships === 'number' &&
    Math.abs(data.championships - data.guessedChampionships) === 1;
  const championshipsClass = data.championshipsMatch
    ? 'result-box--match'
    : nearChampionships
      ? 'result-box--near'
      : 'result-box--miss';
  const heismansText = formatHeismans(data.guessedHeismans, data.heismansComparison);
  const heismansClass = data.heismansMatch
    ? 'result-box--match'
    : data.heismansNear
      ? 'result-box--near'
      : 'result-box--miss';
  const conferenceChampionshipsText = formatChampionships(
    data.guessedConferenceChampionships,
    data.conferenceChampionshipsComparison
  );
  const conferenceChampionshipsClass = data.conferenceChampionshipsMatch
    ? 'result-box--match'
    : data.conferenceChampionshipsNear
      ? 'result-box--near'
      : 'result-box--miss';

  addSchoolBox(
    'School',
    data.guessedSchool || 'Unknown',
    data.guessedLogo,
    data.result === 'correct' ? 'result-box--match' : 'result-box--miss'
  );
  const mascotClass = data.mascotMatch
    ? 'result-box--match'
    : data.mascotNear
      ? 'result-box--near'
      : 'result-box--miss';
  addBox('Mascot', titleCase(data.guessedMascot || 'Unknown'), mascotClass);
  addBox(
    'Conference',
    data.guessedConference || 'Unknown',
    data.conferenceMatch ? 'result-box--match' : 'result-box--miss'
  );
  const colorClass = data.colorMatch
    ? 'result-box--match'
    : data.colorCrossMatch
      ? 'result-box--color-match'
      : 'result-box--miss';
  addBox('Color', titleCase(data.guessedColorName || data.guessedColor || 'Unknown'), colorClass);
  const altColorClass = data.alternateColorMatch
    ? 'result-box--match'
    : data.alternateColorCrossMatch
      ? 'result-box--color-match'
      : 'result-box--miss';
  addBox(
    'Alternate',
    titleCase(data.guessedAlternateColorName || data.guessedAlternateColor || 'Unknown'),
    altColorClass
  );
  addBox('Conf. Champ', conferenceChampionshipsText, conferenceChampionshipsClass);
  addBox('Champs', championshipText, championshipsClass);
  addBox('Heismans', heismansText, heismansClass, 'result-box--narrow');

  wrapper.appendChild(grid);
  historyBox.prepend(wrapper);
  syncPanBounds();
};

const loadTeams = async () => {
  try {
    const res = await fetch('/teams');
    teamsCache = await res.json();
  } catch (e) {
    // ignore autocomplete errors silently
  }
};
loadTeams();

const renderSuggestions = (value) => {
  suggestions.innerHTML = '';
  if (!value) {
    suggestions.style.display = 'none';
    return;
  }
  const lower = value.toLowerCase();
  const matches = teamsCache.filter((team) => team.toLowerCase().includes(lower)).slice(0, 5);
  if (!matches.length) {
    suggestions.style.display = 'none';
    return;
  }
  matches.forEach((team) => {
    const item = document.createElement('div');
    item.className = 'suggestions__item';
    item.textContent = team;
    item.onclick = () => {
      guessInput.value = team;
      suggestions.style.display = 'none';
      guessInput.focus();
    };
    suggestions.appendChild(item);
  });
  suggestions.style.display = 'block';
};

guessInput.addEventListener('input', (e) => {
  renderSuggestions(e.target.value.trim());
});
guessInput.addEventListener('blur', () => {
  setTimeout(() => (suggestions.style.display = 'none'), 120);
});

const formatChampionships = (guessCount, comparison) => {
  if (guessCount === null || guessCount === undefined) {
    return 'Unknown';
  }
  if (comparison === 'equal') {
    return `${guessCount}`;
  }
  if (comparison === 'more') {
    return `${guessCount} ↑`;
  }
  return `${guessCount} ↓`;
};

const formatHeismans = (guessCount, comparison) => {
  if (guessCount === null || guessCount === undefined) {
    return 'Unknown';
  }
  if (comparison === 'equal') {
    return `${guessCount}`;
  }
  if (comparison === 'more') {
    return `${guessCount} ↑`;
  }
  return `${guessCount} ↓`;
};

const handleGuess = async () => {
  const guess = guessInput.value.trim();
  if (!guess) {
    return;
  }

  const res = await fetch('/guess', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ guess }),
  });
  const data = await res.json();

  if (data.result === 'invalid') {
    guessInput.value = '';
    guessInput.focus();
    return;
  }

  attempts += 1;
  appendHistory(data);

  guessInput.value = '';
  guessInput.focus();
};

document.getElementById('submit').onclick = handleGuess;
guessInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    handleGuess();
  }
});

const resetButton = document.getElementById('reset');
if (resetButton) {
  resetButton.onclick = async () => {
    await fetch('/reset', { method: 'POST' });
    attempts = 0;
    historyBox.innerHTML = '';
    syncPanBounds();
    guessInput.value = '';
    guessInput.focus();
  };
}

setupHistoryPan();
