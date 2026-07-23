/*
  LifeDrop backend — plain Node.js (no external packages required)
  Run with: node server.js
  Serves the frontend from /public and a JSON REST API under /api/*
  Data is stored server-side in data/db.json (a real persistent file, not browser storage)
*/
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const url = require('url');
async function sendMatchEmail(to, request) {
  if (!process.env.RESEND_API_KEY) {
    console.log('RESEND_API_KEY not set — skipping email.');
    return;
  }
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + process.env.RESEND_API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'LifeDrop <onboarding@resend.dev>',
        to: [to],
        subject: 'Blood needed: ' + request.bloodType + ' in ' + request.city,
        html: '<p>A ' + request.urgency + ' blood request matches your type.</p>' +
              '<p><b>Patient:</b> ' + request.patientName + '<br>' +
              '<b>Blood type:</b> ' + request.bloodType + '<br>' +
              '<b>Hospital:</b> ' + request.hospital + ', ' + request.city + '<br>' +
              '<b>Contact:</b> ' + request.contactPhone + '</p>',
      }),
    });
    const data = await res.json();
    if (!res.ok) console.error('Resend error:', data);
    else console.log('Email sent to', to);
  } catch (err) {
    console.error('Email send failed:', err.message);
  }
}
const PORT = process.env.PORT || 3000;
const DB_PATH = path.join(__dirname, 'data', 'db.json');
const PUBLIC_DIR = path.join(__dirname, 'public');

/* ---------------- Database (JSON file) ---------------- */

function seedDB() {
  const now = Date.now();
  const mkUser = (name, email, bloodType, city, phone, i) => {
    const { hash, salt } = hashPassword('demo1234');
    return {
      id: 'u_' + crypto.randomBytes(6).toString('hex'),
      name, email, passwordHash: hash, passwordSalt: salt,
      role: 'donor', bloodType, city, phone,
      availableGeneral: i % 5 !== 0,
      availableEmergency: i % 3 === 0,
      donations: i % 3 === 0 ? [{ id: 'd_' + i, date: '2026-05-12', location: 'Dhaka Medical College Hospital' }] : [],
      createdAt: now - i * 86400000,
    };
  };

  const donorSeed = [
    ['Rahim Uddin', 'rahim.uddin@example.com', 'O+', 'Dhaka', '01700000001'],
    ['Fatima Akter', 'fatima.akter@example.com', 'A-', 'Dhaka', '01700000002'],
    ['Karim Hossain', 'karim.hossain@example.com', 'B+', 'Chattogram', '01700000003'],
    ['Nasrin Sultana', 'nasrin.sultana@example.com', 'AB+', 'Sylhet', '01700000004'],
    ['Jahangir Alam', 'jahangir.alam@example.com', 'O-', 'Khulna', '01700000005'],
    ['Sadia Islam', 'sadia.islam@example.com', 'A+', 'Dhaka', '01700000006'],
    ['Tanvir Ahmed', 'tanvir.ahmed@example.com', 'B-', 'Rajshahi', '01700000007'],
    ['Mim Chowdhury', 'mim.chowdhury@example.com', 'O+', 'Dhaka', '01700000008'],
  ];
  const donors = donorSeed.map((d, i) => mkUser(d[0], d[1], d[2], d[3], d[4], i));

  const adminPw = hashPassword('admin123');
  const admin = {
    id: 'u_admin', name: 'Admin', email: 'admin@lifedrop.org',
    passwordHash: adminPw.hash, passwordSalt: adminPw.salt,
    role: 'admin', createdAt: now,
  };

  const requests = [
    {
      id: 'r_' + crypto.randomBytes(5).toString('hex'), patientName: 'Abdul Karim', bloodType: 'O-', city: 'Dhaka',
      hospital: 'Dhaka Medical College Hospital', unitsNeeded: 2, urgency: 'emergency',
      contactPhone: '01711000111', notes: 'Emergency surgery — needed within hours.',
      postedBy: donors[1].id, status: 'open', createdAt: now - 3600000 * 2,
      offers: [],
    },
    {
      id: 'r_' + crypto.randomBytes(5).toString('hex'), patientName: 'Ruma Begum', bloodType: 'B+', city: 'Chattogram',
      hospital: 'Chattogram General Hospital', unitsNeeded: 1, urgency: 'soon',
      contactPhone: '01822000222', notes: 'Scheduled procedure in 3 days.',
      postedBy: donors[2].id, status: 'open', createdAt: now - 3600000 * 30,
      offers: [],
    },
  ];

  return { users: [...donors, admin], requests, sessions: {} };
}

function hashPassword(password, existingSalt) {
  const salt = existingSalt || crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return { hash, salt };
}

function verifyPassword(password, salt, hash) {
  const check = crypto.scryptSync(password, salt, 64).toString('hex');
  return crypto.timingSafeEqual(Buffer.from(check), Buffer.from(hash));
}

function loadDB() {
  if (!fs.existsSync(DB_PATH)) {
    const fresh = seedDB();
    fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
    fs.writeFileSync(DB_PATH, JSON.stringify(fresh, null, 2));
    return fresh;
  }
  return JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
}

function saveDB(db) {
  fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2));
}

let db = loadDB();


/* ---------------- Helpers ---------------- */

function publicUser(u) {
  if (!u) return null;
  const { passwordHash, passwordSalt, ...rest } = u;
  return rest;
}

function send(res, status, data) {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(body),
    'Access-Control-Allow-Origin': '*',
  });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let chunks = '';
    req.on('data', c => { chunks += c; if (chunks.length > 1e6) req.destroy(); });
    req.on('end', () => {
      if (!chunks) return resolve({});
      try { resolve(JSON.parse(chunks)); } catch (e) { resolve({}); }
    });
    req.on('error', reject);
  });
}

function getToken(req) {
  const auth = req.headers['authorization'] || '';
  const match = auth.match(/^Bearer (.+)$/);
  return match ? match[1] : null;
}

function getCurrentUser(req) {
  const token = getToken(req);
  if (!token) return null;
  const userId = db.sessions[token];
  if (!userId) return null;
  return db.users.find(u => u.id === userId) || null;
}

function requireAuth(req, res) {
  const user = getCurrentUser(req);
  if (!user) { send(res, 401, { error: 'Not logged in.' }); return null; }
  return user;
}

const MIME = {
  '.html': 'text/html', '.css': 'text/css', '.js': 'application/javascript',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png',
};

function serveStatic(req, res, pathname) {
  let filePath = pathname === '/' ? '/index.html' : pathname;
  const fullPath = path.join(PUBLIC_DIR, filePath);
  if (!fullPath.startsWith(PUBLIC_DIR)) { res.writeHead(403); return res.end('Forbidden'); }
  fs.readFile(fullPath, (err, data) => {
    if (err) { res.writeHead(404); return res.end('Not found'); }
    const ext = path.extname(fullPath);
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    res.end(data);
  });
}

/* ---------------- API routes ---------------- */

async function handleApi(req, res, pathname, query) {
  const method = req.method;
  // POST /api/register
  if (pathname === '/api/register' && method === 'POST') {
    const body = await readBody(req);
    const { name, email, password, phone, bloodType, city } = body;
    if (!name || !email || !password || !phone || !bloodType || !city) {
      return send(res, 400, { error: 'All fields are required.' });
    }
    if (db.users.some(u => u.email.toLowerCase() === email.toLowerCase())) {
      return send(res, 409, { error: 'An account with this email already exists.' });
    }
    const { hash, salt } = hashPassword(password);
    const user = {
      id: 'u_' + crypto.randomBytes(6).toString('hex'), name, email, phone, bloodType, city,
      passwordHash: hash, passwordSalt: salt, role: 'donor',
      availableGeneral: true, availableEmergency: false, donations: [], createdAt: Date.now(),
    };
    db.users.push(user);
    const token = crypto.randomBytes(24).toString('hex');
    db.sessions[token] = user.id;
    saveDB(db);
    return send(res, 201, { token, user: publicUser(user) });
  }

 // POST /api/login
  if (pathname === '/api/login' && method === 'POST') {
    const body = await readBody(req);
    const user = db.users.find(u => u.email.toLowerCase() === (body.email || '').toLowerCase());
    if (!user || !verifyPassword(body.password || '', user.passwordSalt, user.passwordHash)) {
      return send(res, 401, { error: 'Incorrect email or password.' });
    }
    user.lastLogin = Date.now();
    const token = crypto.randomBytes(24).toString('hex');
    db.sessions[token] = user.id;
    saveDB(db);
    return send(res, 200, { token, user: publicUser(user) });
  }

  // POST /api/logout
  if (pathname === '/api/logout' && method === 'POST') {
    const token = getToken(req);
    if (token) { delete db.sessions[token]; saveDB(db); }
    return send(res, 200, { ok: true });
  }

  // GET /api/me
  if (pathname === '/api/me' && method === 'GET') {
    const user = getCurrentUser(req);
    return send(res, 200, { user: publicUser(user) });
  }

  // GET /api/donors?bloodType=&city=&available=&emergency=
  if (pathname === '/api/donors' && method === 'GET') {
    let donors = db.users.filter(u => u.role === 'donor');
    if (query.bloodType && query.bloodType !== 'any') donors = donors.filter(d => d.bloodType === query.bloodType);
    if (query.city && query.city !== 'any') donors = donors.filter(d => d.city === query.city);
    if (query.available === 'true') donors = donors.filter(d => d.availableGeneral);
    if (query.emergency === 'true') donors = donors.filter(d => d.availableEmergency);
    return send(res, 200, { donors: donors.map(publicUser) });
  }

  // PATCH /api/donors/:id/availability  { availableGeneral, availableEmergency }
  let m = pathname.match(/^\/api\/donors\/([^/]+)\/availability$/);
  if (m && method === 'PATCH') {
    const user = requireAuth(req, res); if (!user) return;
    if (user.id !== m[1] && user.role !== 'admin') return send(res, 403, { error: 'Not allowed.' });
    const body = await readBody(req);
    const target = db.users.find(u => u.id === m[1]);
    if (!target) return send(res, 404, { error: 'Donor not found.' });
    if (typeof body.availableGeneral === 'boolean') target.availableGeneral = body.availableGeneral;
    if (typeof body.availableEmergency === 'boolean') target.availableEmergency = body.availableEmergency;
    saveDB(db);
    return send(res, 200, { user: publicUser(target) });
  }

  // POST /api/donors/:id/donations  { date, location }  — logs when & where a donor donated
  m = pathname.match(/^\/api\/donors\/([^/]+)\/donations$/);
  if (m && method === 'POST') {
    const user = requireAuth(req, res); if (!user) return;
    if (user.id !== m[1] && user.role !== 'admin') return send(res, 403, { error: 'Not allowed.' });
    const body = await readBody(req);
    if (!body.date || !body.location) return send(res, 400, { error: 'Date and location are required.' });
    const target = db.users.find(u => u.id === m[1]);
    if (!target) return send(res, 404, { error: 'Donor not found.' });
    const record = { id: 'd_' + crypto.randomBytes(5).toString('hex'), date: body.date, location: body.location };
    target.donations = target.donations || [];
    target.donations.push(record);
    saveDB(db);
    return send(res, 201, { donations: target.donations });
  }

  // GET /api/donors/:id/donations — donation history (when & where)
  m = pathname.match(/^\/api\/donors\/([^/]+)\/donations$/);
  if (m && method === 'GET') {
    const target = db.users.find(u => u.id === m[1]);
    if (!target) return send(res, 404, { error: 'Donor not found.' });
    return send(res, 200, { donations: target.donations || [] });
  }

  // GET /api/requests?bloodType=&city=&status=&urgency=
  if (pathname === '/api/requests' && method === 'GET') {
    let reqs = db.requests.slice();
    if (query.bloodType && query.bloodType !== 'any') reqs = reqs.filter(r => r.bloodType === query.bloodType);
    if (query.city && query.city !== 'any') reqs = reqs.filter(r => r.city === query.city);
    if (query.status && query.status !== 'any') reqs = reqs.filter(r => r.status === query.status);
    if (query.urgency && query.urgency !== 'any') reqs = reqs.filter(r => r.urgency === query.urgency);
    reqs.sort((a, b) => {
      const rank = { emergency: 0, urgent: 0, soon: 1, open: 2 };
      if (a.status !== b.status) return a.status === 'open' ? -1 : 1;
      return (rank[a.urgency] - rank[b.urgency]) || (b.createdAt - a.createdAt);
    });
    return send(res, 200, { requests: reqs });
  }

  // POST /api/requests — post a new (optionally emergency) blood request
  if (pathname === '/api/requests' && method === 'POST') {
    const user = getCurrentUser(req);
    const body = await readBody(req);
    const required = ['patientName', 'bloodType', 'city', 'hospital', 'contactPhone'];
    if (required.some(k => !body[k])) return send(res, 400, { error: 'Missing required fields.' });
    const request = {
      id: 'r_' + crypto.randomBytes(5).toString('hex'),
      patientName: body.patientName, bloodType: body.bloodType, city: body.city,
      hospital: body.hospital, unitsNeeded: Number(body.unitsNeeded) || 1,
      urgency: body.urgency || 'soon', contactPhone: body.contactPhone, notes: body.notes || '',
      postedBy: user ? user.id : null, status: 'open', createdAt: Date.now(), offers: [],
    };
    db.requests.unshift(request);
    saveDB(db);
    const matchingDonors = db.users.filter(u =>
      u.role === 'donor' && u.bloodType === request.bloodType &&
      u.city === request.city && u.availableGeneral
    );
    matchingDonors.forEach(d => sendMatchEmail(d.email, request));
    return send(res, 201, { request });
  }

  // POST /api/requests/:id/respond — a donor offers to help (used for emergency response too)
  m = pathname.match(/^\/api\/requests\/([^/]+)\/respond$/);
  if (m && method === 'POST') {
    const user = requireAuth(req, res); if (!user) return;
    const request = db.requests.find(r => r.id === m[1]);
    if (!request) return send(res, 404, { error: 'Request not found.' });
    if (request.status !== 'open') return send(res, 400, { error: 'This request is no longer open.' });
    if (!request.offers.some(o => o.donorId === user.id)) {
      request.offers.push({ donorId: user.id, donorName: user.name, donorPhone: user.phone, at: Date.now() });
    }
    saveDB(db);
    return send(res, 200, { request });
  }

  // POST /api/requests/:id/fulfill — mark a request as fulfilled
  m = pathname.match(/^\/api\/requests\/([^/]+)\/fulfill$/);
  if (m && method === 'POST') {
    const user = requireAuth(req, res); if (!user) return;
    const request = db.requests.find(r => r.id === m[1]);
    if (!request) return send(res, 404, { error: 'Request not found.' });
    if (request.postedBy !== user.id && user.role !== 'admin') return send(res, 403, { error: 'Not allowed.' });
    request.status = 'fulfilled';
    saveDB(db);
    return send(res, 200, { request });
  }

  // DELETE /api/requests/:id — admin only
  m = pathname.match(/^\/api\/requests\/([^/]+)$/);
  if (m && method === 'DELETE') {
    const user = requireAuth(req, res); if (!user) return;
    if (user.role !== 'admin') return send(res, 403, { error: 'Admin only.' });
    db.requests = db.requests.filter(r => r.id !== m[1]);
    saveDB(db);
    return send(res, 200, { ok: true });
  }

  // DELETE /api/donors/:id — admin only
  m = pathname.match(/^\/api\/donors\/([^/]+)$/);
  if (m && method === 'DELETE') {
    const user = requireAuth(req, res); if (!user) return;
    if (user.role !== 'admin') return send(res, 403, { error: 'Admin only.' });
    db.users = db.users.filter(u => u.id !== m[1]);
    saveDB(db);
    return send(res, 200, { ok: true });
  }

  // GET /api/stats — admin overview numbers
  if (pathname === '/api/stats' && method === 'GET') {
    const donors = db.users.filter(u => u.role === 'donor');
    const byType = {};
    donors.forEach(d => { byType[d.bloodType] = (byType[d.bloodType] || 0) + 1; });
    return send(res, 200, {
      totalDonors: donors.length,
      availableNow: donors.filter(d => d.availableGeneral).length,
      availableEmergency: donors.filter(d => d.availableEmergency).length,
      openRequests: db.requests.filter(r => r.status === 'open').length,
      fulfilledRequests: db.requests.filter(r => r.status === 'fulfilled').length,
      totalDonationsLogged: donors.reduce((s, d) => s + (d.donations || []).length, 0),
      byType,
    });
  }

  return send(res, 404, { error: 'Not found.' });
}

/* ---------------- Server ---------------- */

const server = http.createServer(async (req, res) => {
  const parsed = url.parse(req.url, true);
  const pathname = parsed.pathname;

  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET,POST,PATCH,DELETE,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    });
    return res.end();
  }

  if (pathname.startsWith('/api/')) {
    try {
      await handleApi(req, res, pathname, parsed.query);
    } catch (err) {
      console.error(err);
      send(res, 500, { error: 'Server error.' });
    }
    return;
  }

  serveStatic(req, res, pathname);
});

server.listen(PORT, () => {
  console.log('LifeDrop server running at http://localhost:' + PORT);
  console.log('Demo donor login: rahim.uddin@example.com / demo1234');
  console.log('Demo admin login:  admin@lifedrop.org / admin123');
});