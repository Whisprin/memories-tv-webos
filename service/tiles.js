'use strict';
/* eslint-disable no-var -- plain ES5 so it runs on any webOS Node version */
/* global __dirname */

// Map tiles for the app's Map tab, served by the media proxy at /<token>/tile/<provider>/<z>/<x>/<y>.png.
//
// OpenStreetMap's tile policy (https://operations.osmfoundation.org/policies/tiles/) asks apps to
// name themselves in the User-Agent, which an <img> in the web app can't set, and to cache tiles
// for at least 7 days. So tiles are fetched here and kept in a disk cache (LRU, size-capped),
// which also survives app restarts; the browser's own cache on the TV is small. Stale tiles are
// revalidated with conditional requests, and served as they are when the server can't be reached.

var fs = require('fs');
var path = require('path');
var os = require('os');
var https = require('https');
var url = require('url');
var Buffer = require('buffer').Buffer;

var PROVIDERS = {
  osm: { url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png', maxZoom: 19 },
  topo: { url: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', subdomains: ['a', 'b', 'c'], maxZoom: 17 }
};

var DAY_MS = 24 * 60 * 60 * 1000;
var MIN_FRESH_MS = 7 * DAY_MS;
var MAX_FRESH_MS = 30 * DAY_MS;
var UPSTREAM_TIMEOUT_MS = 15000;
var BROWSER_MAX_AGE_S = 24 * 60 * 60;
// Disk cache: in the service's own folder if it is writable, else in a temp folder (RAM on the
// TV, so smaller), else in memory.
var DISK_CAP_BYTES = 200 * 1024 * 1024;
var TMP_CAP_BYTES = 50 * 1024 * 1024;
var MEMORY_CAP_BYTES = 20 * 1024 * 1024;
var TRIM_TO = 0.8;

var agent = new https.Agent({ keepAlive: true, maxSockets: 4 });
var store = null;
var inFlight = {};

function mkdirp(dir) {
  if (fs.existsSync(dir)) return;
  mkdirp(path.dirname(dir));
  fs.mkdirSync(dir);
}

function writable(dir) {
  try {
    mkdirp(dir);
    var probe = path.join(dir, '.probe');
    fs.writeFileSync(probe, 'ok');
    fs.unlinkSync(probe);
    return true;
  } catch (e) {
    return false;
  }
}

// ---------- stores: get(key) → {data, meta} | null, put(key, data, meta), setMeta(key, meta) ----------

function memoryStore(cap) {
  var entries = {};
  var order = [];
  var total = 0;
  function touch(key) {
    var i = order.indexOf(key);
    if (i >= 0) order.splice(i, 1);
    order.push(key);
  }
  return {
    location: 'memory',
    get: function (key) {
      var e = entries[key];
      if (!e) return null;
      touch(key);
      return e;
    },
    put: function (key, data, meta) {
      if (entries[key]) total -= entries[key].data.length;
      entries[key] = { data: data, meta: meta };
      total += data.length;
      touch(key);
      while (total > cap && order.length > 1) {
        var old = order.shift();
        total -= entries[old].data.length;
        delete entries[old];
      }
    },
    setMeta: function (key, meta) {
      if (entries[key]) entries[key].meta = meta;
    }
  };
}

function diskStore(root, cap) {
  // key → {size, used}; rebuilt from the folder on start
  var index = {};
  var total = 0;

  function walk(dir, rel) {
    var names;
    try { names = fs.readdirSync(dir); } catch (e) { return; }
    names.forEach(function (name) {
      var full = path.join(dir, name);
      var st;
      try { st = fs.statSync(full); } catch (e) { return; }
      if (st.isDirectory()) { walk(full, rel ? rel + '/' + name : name); return; }
      if (!/\.png$/.test(name)) return;
      var key = (rel ? rel + '/' : '') + name.replace(/\.png$/, '');
      index[key] = { size: st.size, used: st.mtime.getTime() };
      total += st.size;
    });
  }

  function files(key) {
    var base = path.join(root, key);
    return { data: base + '.png', meta: base + '.json' };
  }

  function remove(key) {
    var f = files(key);
    try { fs.unlinkSync(f.data); } catch (e) { /* gone */ }
    try { fs.unlinkSync(f.meta); } catch (e) { /* gone */ }
    if (index[key]) { total -= index[key].size; delete index[key]; }
  }

  function trim() {
    if (total <= cap) return;
    var keys = Object.keys(index).sort(function (a, b) { return index[a].used - index[b].used; });
    for (var i = 0; i < keys.length && total > cap * TRIM_TO; i++) remove(keys[i]);
  }

  walk(root, '');
  trim();

  return {
    location: root,
    get: function (key) {
      if (!index[key]) return null;
      var f = files(key);
      try {
        var data = fs.readFileSync(f.data);
        var meta = {};
        try { meta = JSON.parse(fs.readFileSync(f.meta, 'utf8')); } catch (e) { /* no metadata: treat as stale */ }
        var now = new Date();
        index[key].used = now.getTime();
        try { fs.utimesSync(f.data, now, now); } catch (e) { /* only for LRU order after a restart */ }
        return { data: data, meta: meta };
      } catch (e) {
        remove(key);
        return null;
      }
    },
    put: function (key, data, meta) {
      var f = files(key);
      try {
        mkdirp(path.dirname(f.data));
        fs.writeFileSync(f.data, data);
        fs.writeFileSync(f.meta, JSON.stringify(meta));
        if (index[key]) total -= index[key].size;
        index[key] = { size: data.length, used: Date.now() };
        total += data.length;
        trim();
      } catch (e) {
        remove(key);
      }
    },
    setMeta: function (key, meta) {
      try { fs.writeFileSync(files(key).meta, JSON.stringify(meta)); } catch (e) { /* stays stale */ }
    }
  };
}

function getStore() {
  if (store) return store;
  var candidates = [
    { dir: path.join(__dirname, 'tile-cache'), cap: DISK_CAP_BYTES },
    { dir: path.join(os.tmpdir(), 'memoriestv-tile-cache'), cap: TMP_CAP_BYTES }
  ];
  for (var i = 0; i < candidates.length; i++) {
    if (writable(candidates[i].dir)) {
      store = diskStore(candidates[i].dir, candidates[i].cap);
      break;
    }
  }
  if (!store) store = memoryStore(MEMORY_CAP_BYTES);
  console.log('[tiles] cache: ' + store.location);
  return store;
}

// ---------- requests ----------

function parse(rest) {
  var m = /^([a-z]+)\/(\d{1,2})\/(\d{1,7})\/(\d{1,7})\.png(\?.*)?$/.exec(rest);
  if (!m || !Object.prototype.hasOwnProperty.call(PROVIDERS, m[1])) return null;
  var provider = PROVIDERS[m[1]];
  var z = +m[2];
  var x = +m[3];
  var y = +m[4];
  var n = Math.pow(2, z);
  if (z > provider.maxZoom || x >= n || y >= n) return null;
  var sub = provider.subdomains ? provider.subdomains[(x + y) % provider.subdomains.length] : '';
  return {
    key: m[1] + '/' + z + '/' + x + '/' + y,
    url: provider.url.replace('{s}', sub).replace('{z}', z).replace('{x}', x).replace('{y}', y)
  };
}

function freshFor(cacheControl) {
  var m = /max-age=(\d+)/.exec(cacheControl || '');
  var ms = m ? +m[1] * 1000 : 0;
  return Math.min(MAX_FRESH_MS, Math.max(MIN_FRESH_MS, ms));
}

function send(res, status, data, type) {
  if (res.finished) return;
  if (!data) { res.writeHead(status); res.end(); return; }
  res.writeHead(status, {
    'Content-Type': type || 'image/png',
    'Content-Length': data.length,
    'Cache-Control': 'max-age=' + BROWSER_MAX_AGE_S
  });
  res.end(data);
}

function answerAll(key, status, data, type) {
  var waiting = inFlight[key] || [];
  delete inFlight[key];
  waiting.forEach(function (res) { send(res, status, data, type); });
}

function fetchUpstream(tile, cached, userAgent) {
  var target = url.parse(tile.url);
  var headers = { 'User-Agent': userAgent, 'Accept': 'image/png,image/*' };
  if (cached && cached.meta.etag) headers['If-None-Match'] = cached.meta.etag;
  if (cached && cached.meta.lastModified) headers['If-Modified-Since'] = cached.meta.lastModified;
  var fallback = function (status) {
    if (cached) answerAll(tile.key, 200, cached.data, cached.meta.type);
    else answerAll(tile.key, status);
  };
  var req = https.request({
    hostname: target.hostname, port: target.port || 443, path: target.path, method: 'GET', headers: headers, agent: agent
  }, function (up) {
    if (up.statusCode === 304 && cached) {
      up.resume();
      var revalidated = cached.meta;
      revalidated.fetched = Date.now();
      revalidated.fresh = freshFor(up.headers['cache-control']);
      getStore().setMeta(tile.key, revalidated);
      answerAll(tile.key, 200, cached.data, revalidated.type);
      return;
    }
    if (up.statusCode !== 200) {
      up.resume();
      fallback(up.statusCode === 404 ? 404 : 502);
      return;
    }
    var chunks = [];
    up.on('data', function (c) { chunks.push(c); });
    up.on('end', function () {
      var data = Buffer.concat(chunks);
      var meta = {
        type: up.headers['content-type'] || 'image/png',
        etag: up.headers.etag || null,
        lastModified: up.headers['last-modified'] || null,
        fetched: Date.now(),
        fresh: freshFor(up.headers['cache-control'])
      };
      getStore().put(tile.key, data, meta);
      answerAll(tile.key, 200, data, meta.type);
    });
    up.on('error', function () { fallback(502); });
  });
  req.on('error', function () { fallback(502); });
  req.setTimeout(UPSTREAM_TIMEOUT_MS, function () { req.abort(); });
  req.end();
}

// rest: '<provider>/<z>/<x>/<y>.png'
function handleTile(req, res, rest, userAgent) {
  var tile = parse(rest);
  if (!tile) { send(res, 404); return; }
  var cached = getStore().get(tile.key);
  if (cached && cached.meta.fetched && Date.now() - cached.meta.fetched < (cached.meta.fresh || MIN_FRESH_MS)) {
    send(res, 200, cached.data, cached.meta.type);
    return;
  }
  if (inFlight[tile.key]) { inFlight[tile.key].push(res); return; }
  inFlight[tile.key] = [res];
  fetchUpstream(tile, cached, userAgent);
}

// Tests use their own store instead of a cache folder next to the service.
function useStore(s) {
  store = s;
  inFlight = {};
}

module.exports = { handleTile: handleTile, parse: parse, freshFor: freshFor, memoryStore: memoryStore, diskStore: diskStore, useStore: useStore };
