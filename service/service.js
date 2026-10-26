'use strict';
/* eslint-disable no-var -- plain ES5 so it runs on any webOS Node version */

// Memories TV helper service.
//
// loginFlowInit: Nextcloud names an app password after the User-Agent of the request
// that starts Login Flow v2 (POST /login/v2), and Chromium ignores a User-Agent set
// from fetch(). So this one request is made here in Node, where the header can be set.
//
// mediaProxy: <img>/<video> can't send an Authorization
// header, and with go-vod transcoding off the original file is the only video source.
// This method starts HTTP servers on 127.0.0.1 that add the auth header:
//   /<token>/memories/<path>       forwarded to /index.php/apps/memories/<path>, Range passed
//                                  through (video seeking)
//   /<token>/batch/preview/<id>?x=&y=&a=
//                                  previews; requests arriving within BATCH_WINDOW_MS are
//                                  fetched upstream as one multipreview, then answered one by one
// It listens on several ports because the browser opens at most 6 connections per host:port;
// spreading <img> requests over the ports lets more of them reach the proxy at once.

var Service = require('webos-service');
var http = require('http');
var https = require('https');
var url = require('url');
var crypto = require('crypto');

var SERVICE_ID = 'com.wisp.memoriestv.service';
var CLIENT_NAME = 'Memories TV'; // shown in Nextcloud → Settings → Security
var TIMEOUT_MS = 15000;

var service = new Service(SERVICE_ID);

// payload: {server: "https://cloud.example.com"}  (normalized base URL, no trailing slash)
// response: {returnValue: true, status: <HTTP status>, body: <parsed JSON or null>}
//           {returnValue: true, status: 0, error: "<message>"}        server unreachable
//           {returnValue: false, errorCode: "invalid_url", errorText}  bad input
service.register('loginFlowInit', function (message) {
  var server = String((message.payload && message.payload.server) || '').replace(/\/+$/, '');
  var u = url.parse(server + '/index.php/login/v2');
  if (u.protocol !== 'https:' && u.protocol !== 'http:') {
    message.respond({ returnValue: false, errorCode: 'invalid_url', errorText: 'Invalid server URL' });
    return;
  }

  var done = false;
  function reply(obj) {
    if (done) return;
    done = true;
    obj.returnValue = obj.returnValue !== false;
    message.respond(obj);
  }

  var req = (u.protocol === 'https:' ? https : http).request({
    hostname: u.hostname,
    port: u.port || (u.protocol === 'https:' ? 443 : 80),
    path: u.path,
    method: 'POST',
    headers: { 'User-Agent': CLIENT_NAME, 'Accept': 'application/json', 'Content-Length': 0 }
  }, function (res) {
    var data = '';
    res.setEncoding('utf8');
    res.on('data', function (chunk) { data += chunk; });
    res.on('end', function () {
      var body = null;
      try { body = data ? JSON.parse(data) : null; } catch (e) { /* non-JSON error page */ }
      reply({ status: res.statusCode, body: body });
    });
  });
  req.on('error', function (err) { reply({ status: 0, error: (err && err.message) || 'request failed' }); });
  req.setTimeout(TIMEOUT_MS, function () {
    reply({ status: 0, error: 'The server took too long to answer.' });
    req.abort();
  });
  req.end();
});

// ---------- mediaProxy ----------

// Only headers the media element needs are passed back.
var PASS_HEADERS = ['content-type', 'content-length', 'content-range', 'accept-ranges', 'etag', 'last-modified', 'cache-control'];

var PROXY_PORTS = 10;
var BATCH_WINDOW_MS = 10;
var BATCH_MAX = 100;

var proxy = { servers: [], ports: [], token: null, auth: null, subs: 0, activity: null };

// Reused upstream connections: without keep-alive every image would need a new TLS handshake.
var agents = {
  'http:': new http.Agent({ keepAlive: true, maxSockets: 16 }),
  'https:': new https.Agent({ keepAlive: true, maxSockets: 16 })
};

function upstreamRequest(target, method, headers, onResponse) {
  var isHttps = target.protocol === 'https:';
  return (isHttps ? https : http).request({
    hostname: target.hostname,
    port: target.port || (isHttps ? 443 : 80),
    path: target.path,
    method: method,
    headers: headers,
    agent: agents[target.protocol]
  }, onResponse);
}

function authHeaders(extra) {
  var h = { 'Authorization': proxy.auth.header, 'OCS-APIRequest': 'true', 'User-Agent': CLIENT_NAME };
  if (extra) Object.keys(extra).forEach(function (k) { h[k] = extra[k]; });
  return h;
}

function b64(s) {
  return (Buffer.from ? Buffer.from(s, 'utf8') : new Buffer(s, 'utf8')).toString('base64');
}

function handleProxy(req, res) {
  var batchPrefix = '/' + proxy.token + '/batch/preview/';
  if (req.method === 'GET' && proxy.auth && req.url.indexOf(batchPrefix) === 0) {
    enqueuePreview(req, res, req.url.slice(batchPrefix.length));
    return;
  }
  // URL shape: /<token>/memories/<path under /index.php/apps/memories/>
  var prefix = '/' + proxy.token + '/memories/';
  if ((req.method !== 'GET' && req.method !== 'HEAD') || !proxy.auth || req.url.indexOf(prefix) !== 0) {
    res.writeHead(404);
    res.end();
    return;
  }
  var target = url.parse(proxy.auth.server + '/index.php/apps/memories/' + req.url.slice(prefix.length));
  var headers = authHeaders(req.headers.range ? { Range: req.headers.range } : null);

  var up = upstreamRequest(target, req.method, headers, function (upRes) {
    var out = {};
    PASS_HEADERS.forEach(function (h) { if (upRes.headers[h]) out[h] = upRes.headers[h]; });
    res.writeHead(upRes.statusCode, out);
    upRes.pipe(res);
  });
  up.on('error', function (err) {
    console.log('mediaProxy upstream error: ' + (err && err.message));
    if (!res.headersSent) res.writeHead(502);
    res.end();
  });
  // The player closes connections when it seeks; stop the upstream download too.
  res.on('close', function () { if (!res.finished) up.abort(); });
  up.end();
}

// ---------- Batched previews ----------

var batchQueue = [];
var batchTimer = null;
var batchSeq = 0;

// rest: "<fileid>?x=256&y=256&a=0[&anything]"
function enqueuePreview(req, res, rest) {
  var u = url.parse(rest, true);
  var fileid = parseInt(u.pathname, 10);
  if (!(fileid > 0)) { res.writeHead(400); res.end(); return; }
  var entry = {
    reqid: ++batchSeq,
    fileid: fileid,
    x: parseInt(u.query.x, 10) || 256,
    y: parseInt(u.query.y, 10) || 256,
    a: u.query.a === '1' ? 1 : 0,
    res: res,
    closed: false
  };
  res.on('close', function () { entry.closed = true; });
  batchQueue.push(entry);
  if (batchQueue.length >= BATCH_MAX) flushBatch();
  else if (!batchTimer) batchTimer = setTimeout(flushBatch, BATCH_WINDOW_MS);
}

function answer(entry, status, body, type) {
  if (entry.closed || entry.res.headersSent) return;
  if (status !== 200) { entry.res.writeHead(status); entry.res.end(); return; }
  entry.res.writeHead(200, { 'Content-Type': type, 'Content-Length': body.length, 'Cache-Control': 'private, max-age=604800' });
  entry.res.end(body);
}

function flushBatch() {
  if (batchTimer) { clearTimeout(batchTimer); batchTimer = null; }
  var batch = batchQueue.filter(function (e) { return !e.closed; });
  batchQueue = [];
  if (!batch.length || !proxy.auth) return;

  var pending = {};
  batch.forEach(function (e) { pending[e.reqid] = e; });
  var body = JSON.stringify({ files: batch.map(function (e) {
    return { reqid: e.reqid, fileid: e.fileid, x: e.x, y: e.y, a: e.a };
  }) });
  var target = url.parse(proxy.auth.server + '/index.php/apps/memories/api/image/multipreview');
  var failAll = function (status) {
    Object.keys(pending).forEach(function (k) { answer(pending[k], status); });
    pending = {};
  };

  var up = upstreamRequest(target, 'POST', authHeaders({
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(body, 'utf8')
  }), function (upRes) {
    if (upRes.statusCode !== 200) { upRes.resume(); failAll(502); return; }
    // Frames: [1 byte n][n bytes JSON {reqid, len, type}][len bytes image]
    var buf = Buffer.alloc(0);
    upRes.on('data', function (chunk) {
      buf = Buffer.concat([buf, chunk]);
      for (;;) {
        if (buf.length < 1) break;
        var jsonLen = buf[0];
        if (buf.length < 1 + jsonLen) break;
        var hdr = JSON.parse(buf.slice(1, 1 + jsonLen).toString('utf8'));
        var end = 1 + jsonLen + hdr.len;
        if (buf.length < end) break;
        var img = buf.slice(1 + jsonLen, end);
        buf = buf.slice(end);
        var e = pending[hdr.reqid];
        if (e) { delete pending[hdr.reqid]; answer(e, 200, img, hdr.type); }
      }
    });
    upRes.on('end', function () { failAll(404); }); // files the server skipped
    upRes.on('error', function () { failAll(502); });
  });
  up.on('error', function (err) {
    console.log('mediaProxy batch error: ' + (err && err.message));
    failAll(502);
  });
  up.end(body);
}

function holdActivity() {
  if (proxy.activity !== null) return;
  try {
    service.activityManager.create('mediaProxy', function (a) { proxy.activity = a; });
  } catch (e) { /* the open subscription alone keeps the service alive */ }
}

function releaseActivity() {
  if (proxy.activity === null) return;
  try { service.activityManager.complete(proxy.activity); } catch (e) { /* ignore */ }
  proxy.activity = null;
}

function startProxy(cb) {
  if (proxy.servers.length) { cb(null); return; }
  var started = [];
  var failed = false;
  function listenOne() {
    var srv = http.createServer(handleProxy);
    srv.on('error', function (err) {
      if (failed) return;
      failed = true;
      started.forEach(function (x) { try { x.close(); } catch (e) { /* ignore */ } });
      cb(err);
    });
    srv.listen(0, '127.0.0.1', function () {
      started.push(srv);
      if (started.length < PROXY_PORTS) { listenOne(); return; }
      proxy.servers = started;
      proxy.ports = started.map(function (x) { return x.address().port; });
      cb(null);
    });
  }
  listenOne();
}

function stopProxy() {
  releaseActivity();
  proxy.servers.forEach(function (srv) {
    try { srv.close(); } catch (e) { /* already closed */ }
  });
  proxy.servers = [];
  proxy.ports = [];
  proxy.auth = null;
}

// payload: {server, loginName, appPassword, subscribe: true}
// response: {returnValue: true, port, ports, token}. The proxy runs while a subscription is open.
service.register('mediaProxy', function (message) {
  var p = message.payload || {};
  if (!p.server || !p.loginName || !p.appPassword) {
    message.respond({ returnValue: false, errorCode: 'bad_params', errorText: 'server, loginName and appPassword are required' });
    return;
  }
  proxy.auth = { server: String(p.server).replace(/\/+$/, ''), header: 'Basic ' + b64(p.loginName + ':' + p.appPassword) };
  if (!proxy.token) proxy.token = crypto.randomBytes(16).toString('hex');
  startProxy(function (err) {
    if (err) {
      message.respond({ returnValue: false, errorCode: 'listen_failed', errorText: 'Could not listen on 127.0.0.1: ' + err.message });
      return;
    }
    if (message.isSubscription) {
      proxy.subs++;
      holdActivity();
    }
    message.respond({
      returnValue: true, port: proxy.ports[0], ports: proxy.ports, token: proxy.token, subscribed: !!message.isSubscription
    });
  });
}, function () {
  proxy.subs = Math.max(0, proxy.subs - 1);
  if (proxy.subs === 0) stopProxy();
});
