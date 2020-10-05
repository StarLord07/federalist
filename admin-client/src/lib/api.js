/* eslint-disable no-console */
/* global API_URL */
import { notification } from '../stores';
import { logout as authLogout } from './auth';

const apiUrl = API_URL;

const defaultOptions = {
  credentials: 'include',
  headers: {
    'Content-Type': 'application/json',
  },
  mode: 'cors',
};

// eslint-disable-next-line no-underscore-dangle
function _setSearchString(query = {}) {
  const search = new URLSearchParams();

  // eslint-disable-next-line array-callback-return
  Object.keys(query).map((key) => {
    search.set(key, query[key]);
  });
  return search.toString();
}

// eslint-disable-next-line no-underscore-dangle
async function _fetch(path, opts = {}) {
  return fetch(`${apiUrl}/admin${path}`, { ...defaultOptions, ...opts })
    .then((r) => {
      if (r.ok) return r.json();
      if (r.status === 401) {
        authLogout();
        return null;
      }
      throw r;
    })
    .catch((e) => {
      notification.setError(`API request failed: ${e.message}`);
      console.error(e);
      throw e;
    });
}

function destroy(path) {
  return _fetch(path, { method: 'DELETE' });
}

function get(path, query) {
  let qs = '';
  if (query) {
    const searchString = _setSearchString(query);
    qs = searchString !== '' ? `?${searchString}` : '';
  }
  return _fetch(path + qs);
}

function post(path, body) {
  return _fetch(path, { method: 'POST', body: JSON.stringify(body) });
}

function put(path, body) {
  return _fetch(path, { method: 'PUT', body: JSON.stringify(body) });
}

async function destroySite(id) {
  return destroy(`/sites/${id}`).catch(() => null);
}

async function fetchMe() {
  return get('/me');
}

async function fetchBuilds(query = {}) {
  return get('/builds', query).catch(() => []);
}

async function fetchSite(id) {
  return get(`/sites/${id}`).catch(() => null);
}

async function fetchSites(query = {}) {
  return get('/sites', query).catch(() => []);
}

async function updateSite(id, params) {
  return put(`/sites/${id}`, params).catch(() => null);
}

async function logout() {
  return get('/logout').catch(() => null);
}

async function createDomain(siteId, { domain, branch, serviceName }) {
  return post('/domains', {
    site: siteId, domain, branch, serviceName,
  });
}

async function destroyDomain(domainId) {
  return destroy(`/domains/${domainId}`);
}

export {
  createDomain,
  destroyDomain,
  destroySite,
  fetchMe,
  fetchBuilds,
  fetchSite,
  fetchSites,
  logout,
  updateSite,
};
