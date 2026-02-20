const { all, get } = require('../config/db');

function listSports() {
  return all('SELECT id, slug, name FROM sports ORDER BY name ASC');
}

function getSportById(id) {
  return get('SELECT id, slug, name FROM sports WHERE id = ?', [id]);
}

module.exports = {
  listSports,
  getSportById
};
