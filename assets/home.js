const filters = document.querySelectorAll('[data-filter]');
const games = document.querySelectorAll('[data-category]');
filters.forEach(button => button.addEventListener('click', () => {
  filters.forEach(filter => {
    const active = filter === button;
    filter.classList.toggle('active', active);
    filter.setAttribute('aria-pressed', String(active));
  });
  games.forEach(game => { game.hidden = button.dataset.filter !== 'all' && game.dataset.category !== button.dataset.filter; });
}));
