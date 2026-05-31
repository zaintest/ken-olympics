/* ============================================================
   In-browser Firebase Realtime Database mock for hermetic E2E.

   Playwright serves THIS file in place of the gstatic compat SDK
   (both firebase-app-compat.js and firebase-database-compat.js map
   here via route interception), so no network is touched and the
   real production database is never read or written.

   It implements just the slice the app uses:
     firebase.initializeApp(), firebase.database()
     ref(path) → .child(), .set(), .update(), .once('value'), .on('value')
     snapshot.val()

   The whole DB lives in localStorage and writes propagate across pages
   of the same browser context via a BroadcastChannel — so an editor
   page's .update() fires a viewer page's .on('value') listener, exactly
   like real live sync.

   Test controls (window.__fbmock):
     setOnline(false|true)  — simulate dropping/restoring the connection.
                              While offline: once('value') rejects and writes
                              are buffered; restoring online flushes them.
     isOnline(), reset(), dump()
   Start a page offline by setting window.__FBMOCK_START_OFFLINE = true
   in an init script before navigation.
   ============================================================ */
(function () {
  if (window.firebase && window.firebase.__mock) return; // both script tags map here — init once

  var DB_KEY = '__fbmock_db__';
  var chan = ('BroadcastChannel' in window) ? new BroadcastChannel('fbmock') : null;
  var listeners = [];                       // { path, cb }
  var online = !window.__FBMOCK_START_OFFLINE;
  var buffer = [];                          // writes made while offline: { path, value, merge }

  function loadDB() { try { return JSON.parse(localStorage.getItem(DB_KEY) || '{}'); } catch (e) { return {}; } }
  function saveDB(db) { try { localStorage.setItem(DB_KEY, JSON.stringify(db)); } catch (e) {} }
  function clone(v) { return v == null ? null : JSON.parse(JSON.stringify(v)); }

  function getAt(db, path) {
    if (!path) return db;
    var parts = path.split('/'), cur = db;
    for (var i = 0; i < parts.length; i++) { if (cur == null) return null; cur = cur[parts[i]]; }
    return cur == null ? null : cur;
  }
  function setAt(db, path, value, merge) {
    var parts = path.split('/'), cur = db;
    for (var i = 0; i < parts.length - 1; i++) {
      if (typeof cur[parts[i]] !== 'object' || cur[parts[i]] == null) cur[parts[i]] = {};
      cur = cur[parts[i]];
    }
    var last = parts[parts.length - 1];
    if (merge && typeof cur[last] === 'object' && cur[last] != null && value && typeof value === 'object') {
      for (var k in value) cur[last][k] = value[k];
    } else {
      cur[last] = value;
    }
  }

  function snapshot(val) {
    return { val: function () { return clone(val); }, exists: function () { return val != null; } };
  }
  function fireLocal() {
    var db = loadDB();
    listeners.slice().forEach(function (l) { try { l.cb(snapshot(getAt(db, l.path))); } catch (e) {} });
  }
  function broadcast() { if (chan) chan.postMessage({ t: 1 }); }
  if (chan) chan.onmessage = function () { fireLocal(); };
  else window.addEventListener('storage', function (e) { if (e.key === DB_KEY) fireLocal(); });

  function commit(path, value, merge) {
    if (!online) { buffer.push({ path: path, value: clone(value), merge: merge }); return; }
    var db = loadDB(); setAt(db, path, value, merge); saveDB(db);
    fireLocal(); broadcast();
  }
  function flush() {
    if (!buffer.length) return;
    var db = loadDB();
    buffer.forEach(function (w) { setAt(db, w.path, w.value, w.merge); });
    buffer = []; saveDB(db); fireLocal(); broadcast();
  }

  // NB: use queueMicrotask (not setTimeout) so these resolve even when a test has
  // installed Playwright's fake clock (which pauses real timers).
  function soon(fn) { (typeof queueMicrotask === 'function' ? queueMicrotask : function (f) { Promise.resolve().then(f); })(fn); }

  function Ref(path) { this.path = path || ''; }
  Ref.prototype.child = function (sub) { return new Ref(this.path ? this.path + '/' + sub : sub); };
  Ref.prototype.set = function (value) {
    var p = this.path, v = clone(value);
    return new Promise(function (res, rej) { soon(function () {
      if (!online) return rej(new Error('offline')); commit(p, v, false); res();
    }); });
  };
  Ref.prototype.update = function (value) {
    var p = this.path, v = clone(value);
    return new Promise(function (res) { soon(function () { commit(p, v, true); res(); }); });
  };
  Ref.prototype.once = function () {
    var p = this.path;
    return new Promise(function (res, rej) { soon(function () {
      if (!online) return rej(new Error('offline')); res(snapshot(getAt(loadDB(), p)));
    }); });
  };
  Ref.prototype.on = function (event, cb) {
    var l = { path: this.path, cb: cb }; listeners.push(l);
    var db = loadDB();
    soon(function () { try { cb(snapshot(getAt(db, l.path))); } catch (e) {} });
    return cb;
  };
  Ref.prototype.off = function () { /* app never calls this */ };

  var db = { ref: function (path) { return new Ref(path || ''); } };
  window.firebase = { __mock: true, initializeApp: function () { return {}; }, database: function () { return db; } };
  window.__fbmock = {
    setOnline: function (v) { var was = online; online = !!v; if (online && !was) flush(); },
    isOnline: function () { return online; },
    reset: function () { buffer = []; try { localStorage.removeItem(DB_KEY); } catch (e) {} fireLocal(); broadcast(); },
    dump: function () { return loadDB(); }
  };
})();
