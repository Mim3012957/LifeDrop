/* LifeDrop frontend — vanilla JS, talks to the backend over fetch() */

const API = ''; // same origin
const BLOOD_TYPES = ['O-', 'O+', 'A-', 'A+', 'B-', 'B+', 'AB-', 'AB+'];
const CITIES = ['Dhaka', 'Chattogram', 'Khulna', 'Rajshahi', 'Sylhet', 'Barishal', 'Rangpur', 'Mymensingh'];

let state = {
  token: localStorage.getItem('lifedrop_token') || null,
  user: null,
  route: 'home',
};

/* ---------------- API helper ---------------- */
async function api(path, opts = {}) {
  const headers = Object.assign({ 'Content-Type': 'application/json' }, opts.headers || {});
  if (state.token) headers['Authorization'] = 'Bearer ' + state.token;
  const res = await fetch(API + path, Object.assign({}, opts, { headers }));
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

function toast(msg, kind) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.className = 'toast' + (kind === 'err' ? ' err' : '');
  el.style.display = 'flex';
  clearTimeout(toast._t);
  toast._t = setTimeout(() => { el.style.display = 'none'; }, 2600);
}

function timeAgo(ts) {
  const h = Math.floor((Date.now() - ts) / 3600000);
  if (h < 1) {
    const min = Math.floor((Date.now() - ts) / 60000);
    return min < 1 ? 'just now' : min + 'm ago';
  }
  if (h < 24) return h + 'h ago';
  return Math.floor(h / 24) + 'd ago';
}

function el(tag, attrs, children) {
  const node = document.createElement(tag);
  Object.entries(attrs || {}).forEach(([k, v]) => {
    if (k === 'class') node.className = v;
    else if (k === 'html') node.innerHTML = v;
    else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
    else node.setAttribute(k, v);
  });
  (children || []).forEach(c => node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c));
  return node;
}

/* ---------------- Auth bootstrap ---------------- */
async function refreshMe() {
  if (!state.token) { state.user = null; return; }
  try {
    const data = await api('/api/me');
    state.user = data.user;
    if (!state.user) { state.token = null; localStorage.removeItem('lifedrop_token'); }
  } catch (e) {
    state.token = null; state.user = null; localStorage.removeItem('lifedrop_token');
  }
}

function setRoute(route) {
  state.route = route;
  render();
}

function updateNav() {
  document.querySelectorAll('.nav-link[data-route]').forEach(b => b.classList.toggle('active', b.dataset.route === state.route));
  document.getElementById('navDashboard').style.display = state.user ? 'flex' : 'none';
  document.getElementById('navAdmin').style.display = state.user && state.user.role === 'admin' ? 'flex' : 'none';

  const authActions = document.getElementById('authActions');
  authActions.innerHTML = '';
  if (state.user) {
    const logoutBtn = el('button', { class: 'btn secondary sm', onclick: () => window.lifedropLogout() }, [icon('logout'), 'Log out']);
    authActions.appendChild(logoutBtn);
  } else {
    authActions.appendChild(el('button', { class: 'btn secondary sm', onclick: () => setRoute('login') }, ['Log in']));
    authActions.appendChild(el('button', { class: 'btn blood sm', onclick: () => setRoute('register') }, [icon('droplet-plus'), 'Become a donor']));
  }
}

/* ---------------- Views ---------------- */

async function viewHome(root) {
  const stats = await api('/api/stats').catch(() => ({}));
  root.appendChild(el('div', { class: 'hero' }, [
    el('div', {}, [
      el('div', { class: 'pill' }, [el('span', { class: 'pulse-dot' }), (stats.openRequests || 0) + ' open request' + (stats.openRequests === 1 ? '' : 's') + ' right now']),
      el('h1', {}, ['Every donor is someone\u2019s answer.']),
      el('p', {}, ['LifeDrop connects blood donors with patients who need them, by blood type, by city, in minutes. Register once, get matched whenever someone nearby needs your type \u2014 including emergencies.']),
      el('div', { class: 'row' }, [
        el('button', { class: 'btn blood', onclick: () => (state.user ? setRoute('dashboard') : setRoute('register')) }, [icon('droplet-plus'), 'Register as donor']),
        el('button', { class: 'btn secondary', onclick: () => setRoute('search') }, [icon('search'), 'Find a donor']),
        el('button', { class: 'btn secondary', onclick: () => setRoute('emergency') }, [icon('alert-triangle'), 'Emergency request']),
      ]),
    ]),
    el('div', { class: 'grid-4' }, [
      statCard('Registered donors', stats.totalDonors, 'users'),
      statCard('Available now', stats.availableNow, 'circle-check', 'ok'),
      statCard('Open requests', stats.openRequests, 'alert-triangle', 'blood'),
      statCard('Donations logged', stats.totalDonationsLogged, 'history'),
    ]),
  ]));

  const compat = {
    'O-': ['O-'], 'O+': ['O-', 'O+'], 'A-': ['O-', 'A-'], 'A+': ['O-', 'O+', 'A-', 'A+'],
    'B-': ['O-', 'B-'], 'B+': ['O-', 'O+', 'B-', 'B+'], 'AB-': ['O-', 'A-', 'B-', 'AB-'], 'AB+': BLOOD_TYPES.slice(),
  };
  const section = el('div', {}, [el('h2', { style: 'font-size:22px;margin-bottom:16px' }, ['Compatibility, at a glance'])]);
  const card = el('div', { class: 'card', style: 'overflow-x:auto' });
  const table = el('table', {}, [
    el('tr', {}, [el('th', {}, ['Patient type']), el('th', {}, ['Can receive from'])]),
  ]);
  BLOOD_TYPES.forEach(bt => {
    table.appendChild(el('tr', {}, [
      el('td', {}, [el('span', { class: 'badge blood' }, [bt])]),
      el('td', {}, compat[bt].map(d => el('span', { class: 'badge mute', style: 'margin-right:6px' }, [d]))),
    ]));
  });
  card.appendChild(table);
  section.appendChild(card);
  root.appendChild(section);
}

function statCard(label, value, iconName, accent) {
  return el('div', { class: 'card stat' }, [
    el('div', { class: 'stat-icon' + (accent ? ' ' + accent : '') }, [icon(iconName)]),
    el('div', { class: 'stat-value' }, [String(value == null ? 0 : value)]),
    el('div', { class: 'stat-label' }, [label]),
  ]);
}

function icon(name) { return el('i', { class: 'ti ti-' + name, style: 'font-size:16px' }); }

async function viewSearch(root) {
  let bloodType = 'any', city = 'any', onlyAvailable = true;

  const filterCard = el('div', { class: 'card row', style: 'margin-bottom:20px;align-items:flex-end' });
  const btSelect = selectField('Blood type', ['any', ...BLOOD_TYPES], v => { bloodType = v; load(); });
  const citySelect = selectField('City', ['any', ...CITIES], v => { city = v; load(); });
  const availLabel = el('label', { style: 'display:flex;align-items:center;gap:8px;font-size:14px;color:var(--ink-soft);padding-bottom:11px' });
  const availCheckbox = el('input', { type: 'checkbox', style: 'width:16px;height:16px' });
  availCheckbox.checked = true;
  availCheckbox.addEventListener('change', () => { onlyAvailable = availCheckbox.checked; load(); });
  availLabel.appendChild(availCheckbox);
  availLabel.appendChild(document.createTextNode('Available only'));
  filterCard.appendChild(btSelect);
  filterCard.appendChild(citySelect);
  filterCard.appendChild(availLabel);

  const countEl = el('p', { class: 'muted', style: 'font-size:13px;margin-bottom:12px' });
  const resultsEl = el('div', { class: 'grid-2' });

  root.appendChild(el('h1', {}, ['Find donors']));
  root.appendChild(el('p', { class: 'soft', style: 'margin-bottom:24px' }, ['Search the registry by blood type and city.']));
  root.appendChild(filterCard);
  root.appendChild(countEl);
  root.appendChild(resultsEl);

  async function load() {
    const params = new URLSearchParams({ bloodType, city, available: String(onlyAvailable) });
    const data = await api('/api/donors?' + params.toString());
    countEl.textContent = data.donors.length + ' donor' + (data.donors.length !== 1 ? 's' : '') + ' found';
    resultsEl.innerHTML = '';
    if (data.donors.length === 0) {
      resultsEl.appendChild(el('div', { class: 'card muted', style: 'text-align:center;grid-column:1/-1' }, ['No donors match these filters yet.']));
    }
    data.donors.forEach(u => resultsEl.appendChild(donorCard(u)));
  }
  load();
}

function selectField(label, options, onChange) {
  const wrap = el('div', { class: 'field', style: 'margin:0;min-width:160px' });
  wrap.appendChild(el('label', {}, [label]));
  const select = el('select', {});
  options.forEach(o => select.appendChild(el('option', { value: o }, [o === 'any' ? 'Any' : o])));
  select.addEventListener('change', () => onChange(select.value));
  wrap.appendChild(select);
  return wrap;
}

function donorCard(u) {
  const statusClass = u.availableGeneral ? 'ok' : 'mute';
  const statusLabel = u.availableGeneral ? 'Available' : 'Unavailable';
  const card = el('div', { class: 'card' }, [
    el('div', { class: 'row', style: 'justify-content:space-between;align-items:flex-start;margin-bottom:10px' }, [
      el('div', {}, [
        el('div', { style: 'font-weight:700;font-size:15px' }, [u.name]),
        el('div', { class: 'muted', style: 'font-size:13px;display:flex;align-items:center;gap:4px' }, [icon('map-pin'), u.city]),
      ]),
      el('span', { class: 'badge blood' }, [u.bloodType]),
    ]),
    el('div', { class: 'row', style: 'margin-bottom:12px' }, [
      el('span', { class: 'badge ' + statusClass }, [statusLabel]),
      u.availableEmergency ? el('span', { class: 'badge blood' }, ['Emergency ready']) : null,
      el('span', { class: 'badge mute' }, [(u.donations || []).length + ' donation' + ((u.donations || []).length !== 1 ? 's' : '')]),
    ].filter(Boolean)),
    el('button', { class: 'btn secondary sm block', onclick: () => toast('Contact: ' + u.phone + ' \u00b7 ' + u.email) }, [icon('phone'), 'Show contact']),
  ]);
  return card;
}

async function viewEmergency(root) {
  root.appendChild(el('div', { class: 'emergency-banner' }, [
    el('div', {}, [
      el('h2', {}, [icon('alert-triangle'), ' Need blood urgently?']),
      el('p', {}, ['Post an emergency request \u2014 it goes straight to the top of the board and to donors marked available for emergencies.']),
    ]),
    el('button', { class: 'btn secondary sm', style: 'background:#fff;color:var(--blood-deep);border-color:#fff', onclick: () => openPostForm('emergency') }, ['Post emergency request']),
  ]));

  root.appendChild(el('h2', { style: 'font-size:19px;margin-bottom:12px' }, ['Donors ready for emergencies']));
  const list = el('div', { class: 'grid-2' });
  root.appendChild(list);
  const data = await api('/api/donors?emergency=true');
  if (data.donors.length === 0) {
    list.appendChild(el('div', { class: 'card muted', style: 'text-align:center;grid-column:1/-1' }, ['No donors currently marked as emergency-ready.']));
  }
  data.donors.forEach(u => list.appendChild(donorCard(u)));

  function openPostForm(urgency) {
    // Set the prefill value BEFORE navigating: setRoute() triggers a synchronous
    // render() -> viewPostRequest() call that reads this value immediately.
    sessionStorage.setItem('lifedrop_prefill_urgency', urgency);
    setRoute('post-request');
  }
}

async function viewRequests(root) {
  let bloodType = 'any', city = 'any';

  root.appendChild(el('div', { class: 'row', style: 'justify-content:space-between;align-items:flex-end;margin-bottom:18px' }, [
    el('div', {}, [
      el('h1', { style: 'margin-bottom:6px' }, ['Blood requests']),
      el('p', { class: 'soft' }, ['Open requests from patients and families.']),
    ]),
    el('button', { class: 'btn blood', onclick: () => setRoute('post-request') }, [icon('plus'), 'Post a request']),
  ]));

  const filterCard = el('div', { class: 'card row', style: 'margin-bottom:20px' });
  filterCard.appendChild(selectField('Blood type', ['any', ...BLOOD_TYPES], v => { bloodType = v; load(); }));
  filterCard.appendChild(selectField('City', ['any', ...CITIES], v => { city = v; load(); }));
  root.appendChild(filterCard);

  const list = el('div', { class: 'stack' });
  root.appendChild(list);

  async function load() {
    const params = new URLSearchParams({ bloodType, city });
    const data = await api('/api/requests?' + params.toString());
    list.innerHTML = '';
    if (data.requests.length === 0) {
      list.appendChild(el('div', { class: 'card muted', style: 'text-align:center' }, ['No requests match these filters.']));
    }
    data.requests.forEach(r => list.appendChild(requestRow(r, load)));
  }
  load();
}

function requestRow(r, reload) {
  const tagClass = r.status === 'fulfilled' ? 'open' : (r.urgency === 'emergency' ? 'emergency' : r.urgency === 'soon' ? 'soon' : 'open');
  const tagLabel = r.status === 'fulfilled' ? 'Fulfilled' : r.urgency === 'emergency' ? 'Emergency' : r.urgency === 'soon' ? 'Needed soon' : 'Open';
  const isOwner = state.user && r.postedBy === state.user.id;

  const actions = el('div', { class: 'stack', style: 'min-width:150px;justify-content:center' });
  if (r.status === 'open' && !isOwner) {
    actions.appendChild(el('button', { class: 'btn blood sm', onclick: async () => {
      try { await api('/api/requests/' + r.id + '/respond', { method: 'POST' }); toast('You offered to donate. Thank you.'); reload(); }
      catch (e) { toast(e.message, 'err'); }
    } }, [icon('hand-heart'), 'I can donate']));
  }
  if (r.status === 'open' && isOwner) {
    actions.appendChild(el('button', { class: 'btn secondary sm', onclick: async () => {
      await api('/api/requests/' + r.id + '/fulfill', { method: 'POST' }); toast('Marked as fulfilled.'); reload();
    } }, [icon('check'), 'Mark fulfilled']));
  }
  actions.appendChild(el('a', { class: 'btn secondary sm', href: 'tel:' + r.contactPhone }, [icon('phone'), r.contactPhone]));

  const card = el('div', { class: 'card row', style: 'justify-content:space-between;opacity:' + (r.status === 'fulfilled' ? '.6' : '1') }, [
    el('div', { style: 'flex:1;min-width:220px' }, [
      el('div', { class: 'row', style: 'margin-bottom:6px' }, [
        el('span', { class: 'tag ' + tagClass }, [tagLabel]),
        el('span', { class: 'badge blood' }, [r.bloodType]),
        el('span', { class: 'muted', style: 'font-size:12.5px' }, [timeAgo(r.createdAt)]),
      ]),
      el('div', { style: 'font-weight:700;font-size:15.5px;margin-bottom:3px' }, [r.patientName]),
      el('div', { class: 'soft', style: 'font-size:13.5px;margin-bottom:6px' }, [icon('building-hospital'), ' ' + r.hospital + ' \u00b7 ' + r.city + ' \u00b7 ' + r.unitsNeeded + ' unit' + (r.unitsNeeded !== 1 ? 's' : '')]),
      r.notes ? el('div', { class: 'muted', style: 'font-size:13.5px' }, [r.notes]) : null,
      r.offers && r.offers.length > 0 ? el('div', { style: 'font-size:12.5px;color:var(--ok);margin-top:6px' }, [icon('heart-handshake'), ' ' + r.offers.length + ' donor' + (r.offers.length !== 1 ? 's' : '') + ' offered to help']) : null,
    ].filter(Boolean)),
    actions,
  ]);
  return card;
}

async function viewPostRequest(root) {
  const prefillUrgency = sessionStorage.getItem('lifedrop_prefill_urgency');
  sessionStorage.removeItem('lifedrop_prefill_urgency');

  root.appendChild(el('h1', {}, ['Post a blood request']));
  root.appendChild(el('p', { class: 'soft', style: 'margin-bottom:24px' }, ['Visible immediately to donors on the requests board.']));

  const form = el('form', { class: 'card' });
  const fields = {};

  function addField(label, node) {
    const wrap = el('div', { class: 'field' }, [el('label', {}, [label]), node]);
    form.appendChild(wrap);
  }

  fields.patientName = el('input', { placeholder: 'Full name' });
  addField('Patient name', fields.patientName);

  const row1 = el('div', { style: 'display:grid;grid-template-columns:1fr 1fr;gap:14px' });
  fields.bloodType = el('select', {});
  BLOOD_TYPES.forEach(bt => fields.bloodType.appendChild(el('option', { value: bt }, [bt])));
  fields.unitsNeeded = el('input', { type: 'number', min: '1', value: '1' });
  row1.appendChild(el('div', { class: 'field' }, [el('label', {}, ['Blood type needed']), fields.bloodType]));
  row1.appendChild(el('div', { class: 'field' }, [el('label', {}, ['Units needed']), fields.unitsNeeded]));
  form.appendChild(row1);

  const row2 = el('div', { style: 'display:grid;grid-template-columns:1fr 1fr;gap:14px' });
  fields.city = el('select', {});
  CITIES.forEach(c => fields.city.appendChild(el('option', { value: c }, [c])));
  fields.urgency = el('select', {});
  [['emergency', 'Emergency \u2014 within hours'], ['soon', 'Needed soon \u2014 few days'], ['open', 'Open timeline']].forEach(([v, label]) => fields.urgency.appendChild(el('option', { value: v }, [label])));
  if (prefillUrgency) fields.urgency.value = prefillUrgency;
  row2.appendChild(el('div', { class: 'field' }, [el('label', {}, ['City']), fields.city]));
  row2.appendChild(el('div', { class: 'field' }, [el('label', {}, ['Urgency']), fields.urgency]));
  form.appendChild(row2);

  fields.hospital = el('input', { placeholder: 'Hospital name' });
  addField('Hospital', fields.hospital);
  fields.contactPhone = el('input', { placeholder: '01XXXXXXXXX', value: state.user ? state.user.phone || '' : '' });
  addField('Contact phone', fields.contactPhone);
  fields.notes = el('textarea', { placeholder: 'Any additional context for donors' });
  addField('Notes (optional)', fields.notes);

  const submitBtn = el('button', { class: 'btn blood block', type: 'submit' }, [icon('send'), 'Post request']);
  form.appendChild(submitBtn);

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const body = {
      patientName: fields.patientName.value, bloodType: fields.bloodType.value, city: fields.city.value,
      urgency: fields.urgency.value, unitsNeeded: fields.unitsNeeded.value, hospital: fields.hospital.value,
      contactPhone: fields.contactPhone.value, notes: fields.notes.value,
    };
    if (!body.patientName || !body.hospital || !body.contactPhone) { toast('Please fill in patient name, hospital, and contact phone.', 'err'); return; }
    try {
      await api('/api/requests', { method: 'POST', body: JSON.stringify(body) });
      toast('Blood request posted.');
      setRoute('requests');
    } catch (err) { toast(err.message, 'err'); }
  });

  root.appendChild(el('div', { style: 'max-width:560px;margin:0 auto' }, [form]));
}

async function viewLogin(root) {
  root.appendChild(el('div', { style: 'max-width:400px;margin:20px auto' }, [
    el('h1', {}, ['Log in']),
    el('p', { class: 'soft', style: 'margin-bottom:20px' }, ['Demo donor: rahim.uddin@example.com / demo1234 \u00b7 Demo admin: admin@lifedrop.org / admin123']),
  ]));
  const form = el('form', { class: 'card', style: 'max-width:400px;margin:0 auto' });
  const emailInput = el('input', { type: 'email', placeholder: 'you@example.com' });
  const passInput = el('input', { type: 'password', placeholder: '\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022' });
  form.appendChild(el('div', { class: 'field' }, [el('label', {}, ['Email']), emailInput]));
  form.appendChild(el('div', { class: 'field' }, [el('label', {}, ['Password']), passInput]));
  form.appendChild(el('button', { class: 'btn blood block', type: 'submit' }, ['Log in']));
  const switchP = el('p', { class: 'muted', style: 'font-size:13.5px;margin-top:14px;text-align:center' }, [
    'No account? ', el('a', { style: 'color:var(--blood);font-weight:700', onclick: () => setRoute('register') }, ['Register as a donor']),
  ]);
  form.appendChild(switchP);

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      const data = await api('/api/login', { method: 'POST', body: JSON.stringify({ email: emailInput.value, password: passInput.value }) });
      state.token = data.token; state.user = data.user;
      localStorage.setItem('lifedrop_token', state.token);
      toast('Welcome back, ' + data.user.name.split(' ')[0] + '.');
      setRoute(data.user.role === 'admin' ? 'admin' : 'dashboard');
    } catch (err) { toast(err.message, 'err'); }
  });

  root.appendChild(form);
}

async function viewRegister(root) {
  root.appendChild(el('div', { style: 'max-width:460px;margin:20px auto' }, [
    el('h1', {}, ['Become a donor']),
    el('p', { class: 'soft', style: 'margin-bottom:20px' }, ['Takes under a minute. You can update availability anytime.']),
  ]));
  const form = el('form', { class: 'card', style: 'max-width:460px;margin:0 auto' });
  const nameInput = el('input', { placeholder: 'Your name' });
  const emailInput = el('input', { type: 'email', placeholder: 'you@example.com' });
  const passInput = el('input', { type: 'password', placeholder: 'Choose a password' });
  const btSelect = el('select', {});
  BLOOD_TYPES.forEach(bt => btSelect.appendChild(el('option', { value: bt }, [bt])));
  const citySelect = el('select', {});
  CITIES.forEach(c => citySelect.appendChild(el('option', { value: c }, [c])));
  const phoneInput = el('input', { placeholder: '01XXXXXXXXX' });

  form.appendChild(el('div', { class: 'field' }, [el('label', {}, ['Full name']), nameInput]));
  form.appendChild(el('div', { class: 'field' }, [el('label', {}, ['Email']), emailInput]));
  form.appendChild(el('div', { class: 'field' }, [el('label', {}, ['Password']), passInput]));
  const row = el('div', { style: 'display:grid;grid-template-columns:1fr 1fr;gap:14px' });
  row.appendChild(el('div', { class: 'field' }, [el('label', {}, ['Blood type']), btSelect]));
  row.appendChild(el('div', { class: 'field' }, [el('label', {}, ['City']), citySelect]));
  form.appendChild(row);
  form.appendChild(el('div', { class: 'field' }, [el('label', {}, ['Phone']), phoneInput]));
  form.appendChild(el('button', { class: 'btn blood block', type: 'submit' }, [icon('droplet-plus'), 'Create account']));
  form.appendChild(el('p', { class: 'muted', style: 'font-size:13.5px;margin-top:14px;text-align:center' }, [
    'Already registered? ', el('a', { style: 'color:var(--blood);font-weight:700', onclick: () => setRoute('login') }, ['Log in']),
  ]));

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const body = { name: nameInput.value, email: emailInput.value, password: passInput.value, bloodType: btSelect.value, city: citySelect.value, phone: phoneInput.value };
    if (!body.name || !body.email || !body.password || !body.phone) { toast('Please fill in all fields.', 'err'); return; }
    try {
      const data = await api('/api/register', { method: 'POST', body: JSON.stringify(body) });
      state.token = data.token; state.user = data.user;
      localStorage.setItem('lifedrop_token', state.token);
      toast('Account created. Thanks for registering as a donor.');
      setRoute('dashboard');
    } catch (err) { toast(err.message, 'err'); }
  });

  root.appendChild(form);
}

async function viewDashboard(root) {
  const u = state.user;
  const donations = u.donations || [];
  const lastDonation = donations.length ? donations[donations.length - 1] : null;
  const daysSince = lastDonation ? Math.floor((Date.now() - new Date(lastDonation.date).getTime()) / 86400000) : null;
  const eligible = daysSince === null || daysSince >= 90;

  root.appendChild(el('h1', {}, ['Welcome, ' + u.name.split(' ')[0]]));
  root.appendChild(el('p', { class: 'soft', style: 'margin-bottom:24px' }, ['Your donor profile, availability, and donation history.']));

  const top = el('div', { class: 'grid-2', style: 'margin-bottom:24px' });

  const profileCard = el('div', { class: 'card' }, [
    el('div', { class: 'row', style: 'justify-content:space-between;margin-bottom:14px' }, [
      el('span', { style: 'font-weight:700' }, ['Profile']),
      el('span', { class: 'badge blood' }, [u.bloodType]),
    ]),
    el('div', { class: 'soft', style: 'font-size:13.5px;line-height:2' }, [
      el('div', {}, [icon('map-pin'), ' ' + u.city]),
      el('div', {}, [icon('phone'), ' ' + u.phone]),
      el('div', {}, [icon('history'), ' ' + donations.length + ' lifetime donations']),
    ]),
  ]);

  const statusCard = el('div', { class: 'card' });
  statusCard.appendChild(el('div', { style: 'font-weight:700;margin-bottom:14px' }, ['Availability']));
  statusCard.appendChild(el('div', { class: 'soft', style: 'font-size:13.5px;margin-bottom:14px' }, [
    lastDonation
      ? 'Last donated ' + daysSince + ' day' + (daysSince !== 1 ? 's' : '') + ' ago at ' + lastDonation.location + '. ' + (eligible ? 'You are eligible to donate again.' : 'Eligible again in ' + (90 - daysSince) + ' days.')
      : 'No donation on record yet.'
  ]));

  const btnRow = el('div', { class: 'row' });
  const generalBtn = el('button', { class: 'btn secondary sm' }, [icon(u.availableGeneral ? 'toggle-right' : 'toggle-left'), u.availableGeneral ? 'Mark unavailable' : 'Mark available']);
  generalBtn.addEventListener('click', async () => {
    const updated = await api('/api/donors/' + u.id + '/availability', { method: 'PATCH', body: JSON.stringify({ availableGeneral: !u.availableGeneral }) });
    state.user = updated.user; render();
  });
  const emergencyBtn = el('button', { class: 'btn secondary sm' }, [icon('alert-triangle'), u.availableEmergency ? 'Remove emergency-ready' : 'Mark emergency-ready']);
  emergencyBtn.addEventListener('click', async () => {
    const updated = await api('/api/donors/' + u.id + '/availability', { method: 'PATCH', body: JSON.stringify({ availableEmergency: !u.availableEmergency }) });
    state.user = updated.user; render();
  });
  const donateBtn = el('button', { class: 'btn blood sm' }, [icon('droplet-check'), 'Record a donation']);
  donateBtn.disabled = !eligible;
  donateBtn.addEventListener('click', () => openDonationForm());
  btnRow.appendChild(generalBtn); btnRow.appendChild(emergencyBtn); btnRow.appendChild(donateBtn);
  statusCard.appendChild(btnRow);

  top.appendChild(profileCard); top.appendChild(statusCard);
  root.appendChild(top);

  const donationFormWrap = el('div', { id: 'donationFormWrap' });
  root.appendChild(donationFormWrap);

  function openDonationForm() {
    donationFormWrap.innerHTML = '';
    const form = el('form', { class: 'card', style: 'margin-bottom:24px' });
    const dateInput = el('input', { type: 'date', value: new Date().toISOString().slice(0, 10) });
    const locInput = el('input', { placeholder: 'Hospital or blood bank name' });
    form.appendChild(el('div', { class: 'field' }, [el('label', {}, ['Date of donation']), dateInput]));
    form.appendChild(el('div', { class: 'field' }, [el('label', {}, ['Location']), locInput]));
    form.appendChild(el('button', { class: 'btn blood block', type: 'submit' }, ['Save donation record']));
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!locInput.value) { toast('Please enter a location.', 'err'); return; }
      await api('/api/donors/' + u.id + '/donations', { method: 'POST', body: JSON.stringify({ date: dateInput.value, location: locInput.value }) });
      await refreshMe();
      toast('Donation recorded. Thank you for saving a life.');
      render();
    });
    donationFormWrap.appendChild(form);
  }

  root.appendChild(el('h2', { style: 'font-size:19px;margin-bottom:12px' }, ['Donation history']));
  if (donations.length === 0) {
    root.appendChild(el('p', { class: 'muted', style: 'font-size:14px;margin-bottom:24px' }, ['No donations recorded yet \u2014 when you donate, log the date and location here.']));
  } else {
    const histCard = el('div', { class: 'card', style: 'margin-bottom:24px;overflow:hidden;padding:0' });
    const table = el('table', {}, [el('tr', {}, [el('th', {}, ['Date']), el('th', {}, ['Location'])])]);
    donations.slice().reverse().forEach(d => table.appendChild(el('tr', {}, [el('td', {}, [d.date]), el('td', {}, [d.location])])));
    histCard.appendChild(table);
    root.appendChild(histCard);
  }

  root.appendChild(el('h2', { style: 'font-size:19px;margin-bottom:12px' }, ['Requests you offered to help with']));
  const reqData = await api('/api/requests');
  const myOffers = reqData.requests.filter(r => (r.offers || []).some(o => o.donorId === u.id));
  if (myOffers.length === 0) {
    root.appendChild(el('p', { class: 'muted', style: 'font-size:14px' }, ['You haven\u2019t responded to any requests yet.']));
  } else {
    const list = el('div', { class: 'stack' });
    myOffers.forEach(r => list.appendChild(el('div', { class: 'card row', style: 'justify-content:space-between' }, [
      el('div', {}, [el('div', { style: 'font-weight:700;font-size:14px' }, [r.patientName]), el('div', { class: 'muted', style: 'font-size:12.5px' }, [r.hospital + ' \u00b7 ' + r.city])]),
      el('span', { class: 'badge blood' }, [r.bloodType]),
    ])));
    root.appendChild(list);
  }
}

async function viewAdmin(root) {
  let tab = 'overview';
  const tabsEl = el('div', { class: 'tabs' });
  const bodyEl = el('div', {});
  root.appendChild(el('h1', {}, ['Admin dashboard']));
  root.appendChild(el('p', { class: 'soft', style: 'margin-bottom:20px' }, ['Manage donors and requests across the network.']));
  root.appendChild(tabsEl);
  root.appendChild(bodyEl);

  const TABS = [
    ['overview', 'Overview'],
    ['donors', 'Donors'],
    ['requests', 'Requests'],
    ['activities', 'Activities'],
    ['search', 'Search Analytics'],
    ['online', 'Online Users'],
  ];

  TABS.forEach(([id, label]) => {
    const b = el('button', { class: 'nav-link' + (tab === id ? ' active' : ''), onclick: () => { tab = id; renderTabs(); loadTab(); } }, [label]);
    b.dataset.tabid = id;
    tabsEl.appendChild(b);
  });

  function renderTabs() {
    Array.from(tabsEl.children).forEach(b => b.classList.toggle('active', b.dataset.tabid === tab));
  }

  async function loadTab() {
    bodyEl.innerHTML = '';

    if (tab === 'overview') {
      const stats = await api('/api/stats');
      const grid = el('div', { class: 'grid-4', style: 'margin-bottom:24px' }, [
        statCard('Total donors', stats.totalDonors, 'users'),
        statCard('Open requests', stats.openRequests, 'alert-triangle', 'blood'),
        statCard('Fulfilled', stats.fulfilledRequests, 'circle-check', 'ok'),
        statCard('Donations logged', stats.totalDonationsLogged, 'history'),
      ]);
      bodyEl.appendChild(grid);
      bodyEl.appendChild(el('h2', { style: 'font-size:18px;margin-bottom:12px' }, ['Donors by blood type']));
      const chartCard = el('div', { class: 'card' });
      const maxCount = Math.max(1, ...Object.values(stats.byType || {}));
      BLOOD_TYPES.forEach(bt => {
        const count = (stats.byType || {})[bt] || 0;
        chartCard.appendChild(el('div', { class: 'bar-row' }, [
          el('span', { class: 'badge blood', style: 'width:50px' }, [bt]),
          el('div', { class: 'bar-track' }, [el('div', { class: 'bar-fill', style: 'width:' + (count / maxCount * 100) + '%' })]),
          el('span', { style: 'font-size:13px;width:20px;text-align:right' }, [String(count)]),
        ]));
      });
      bodyEl.appendChild(chartCard);
    }

    if (tab === 'donors') {
      const data = await api('/api/donors');
      const card = el('div', { class: 'card', style: 'overflow:hidden;padding:0;overflow-x:auto' });
      const table = el('table', {}, [el('tr', {}, ['Name', 'Type', 'City', 'Available', 'Donations', 'Last Login', ''].map(h => el('th', {}, [h])))]);
      data.donors.forEach(u => {
        const delBtn = el('button', { class: 'btn secondary sm', onclick: async () => { await api('/api/donors/' + u.id, { method: 'DELETE' }); toast('User removed.'); loadTab(); } }, [icon('trash')]);
        table.appendChild(el('tr', {}, [
          el('td', {}, [u.name, el('div', { style: 'font-size:11.5px;color:var(--ink-mute)' }, [u.email])]),
          el('td', {}, [el('span', { class: 'badge blood' }, [u.bloodType])]),
          el('td', {}, [u.city]),
          el('td', {}, [el('span', { class: 'badge ' + (u.availableGeneral ? 'ok' : 'mute') }, [u.availableGeneral ? 'Yes' : 'No'])]),
          el('td', {}, [String((u.donations || []).length)]),
          el('td', {}, [u.lastLogin ? timeAgo(u.lastLogin) : 'Never']),
          el('td', {}, [delBtn]),
        ]));
      });
      card.appendChild(table);
      bodyEl.appendChild(card);
    }

    if (tab === 'requests') {
      const [data, donorData] = await Promise.all([api('/api/requests'), api('/api/donors')]);
      const donorById = {};
      donorData.donors.forEach(d => { donorById[d.id] = d; });
      const list = el('div', { class: 'stack' });
      data.requests.forEach(r => {
        const poster = r.postedBy ? donorById[r.postedBy] : null;
        const actions = el('div', { class: 'row' });
        if (r.status === 'open') actions.appendChild(el('button', { class: 'btn secondary sm', onclick: async () => { await api('/api/requests/' + r.id + '/fulfill', { method: 'POST' }); loadTab(); } }, ['Mark fulfilled']));
        actions.appendChild(el('button', { class: 'btn secondary sm', onclick: async () => { await api('/api/requests/' + r.id, { method: 'DELETE' }); loadTab(); } }, [icon('trash')]));
        list.appendChild(el('div', { class: 'card row', style: 'justify-content:space-between' }, [
          el('div', {}, [
            el('div', { style: 'font-weight:700;font-size:14px' }, [r.patientName + ' ', el('span', { class: 'badge blood' }, [r.bloodType])]),
            el('div', { class: 'muted', style: 'font-size:12.5px' }, [r.hospital + ' \u00b7 ' + r.city + ' \u00b7 ' + timeAgo(r.createdAt) + ' \u00b7 Posted by: ' + (poster ? poster.name + ' (' + poster.email + ')' : 'Anonymous/Guest')]),
          ]),
          actions,
        ]));
      });
      bodyEl.appendChild(list);
    }

    if (tab === 'activities') {
      const data = await api('/api/activities');
      const list = el('div', { class: 'stack' });
      if (data.activities.length === 0) {
        list.appendChild(el('div', { class: 'card muted', style: 'text-align:center' }, ['No activity yet.']));
      }
      data.activities.forEach(a => {
        list.appendChild(el('div', { class: 'card row', style: 'justify-content:space-between' }, [
          el('span', {}, [a.message]),
          el('span', { class: 'muted', style: 'font-size:12.5px' }, [timeAgo(a.at)]),
        ]));
      });
      bodyEl.appendChild(list);
    }

    if (tab === 'search') {
      const data = await api('/api/search-stats');
      bodyEl.appendChild(el('p', { class: 'muted', style: 'margin-bottom:16px' }, [data.total + ' total searches recorded']));

      bodyEl.appendChild(el('h2', { style: 'font-size:18px;margin-bottom:12px' }, ['Most searched blood types']));
      const btCard = el('div', { class: 'card', style: 'margin-bottom:24px' });
      const btEntries = Object.entries(data.byBloodType).sort((a, b) => b[1] - a[1]);
      const btMax = Math.max(1, ...btEntries.map(e => e[1]));
      if (btEntries.length === 0) btCard.appendChild(el('p', { class: 'muted' }, ['No searches yet.']));
      btEntries.forEach(([bt, count]) => {
        btCard.appendChild(el('div', { class: 'bar-row' }, [
          el('span', { class: 'badge blood', style: 'width:50px' }, [bt]),
          el('div', { class: 'bar-track' }, [el('div', { class: 'bar-fill', style: 'width:' + (count / btMax * 100) + '%' })]),
          el('span', { style: 'font-size:13px;width:20px;text-align:right' }, [String(count)]),
        ]));
      });
      bodyEl.appendChild(btCard);

      bodyEl.appendChild(el('h2', { style: 'font-size:18px;margin-bottom:12px' }, ['Most searched cities']));
      const cityCard = el('div', { class: 'card' });
      const cityEntries = Object.entries(data.byCity).sort((a, b) => b[1] - a[1]);
      const cityMax = Math.max(1, ...cityEntries.map(e => e[1]));
      if (cityEntries.length === 0) cityCard.appendChild(el('p', { class: 'muted' }, ['No searches yet.']));
      cityEntries.forEach(([city, count]) => {
        cityCard.appendChild(el('div', { class: 'bar-row' }, [
          el('span', { class: 'badge mute', style: 'width:80px' }, [city]),
          el('div', { class: 'bar-track' }, [el('div', { class: 'bar-fill', style: 'width:' + (count / cityMax * 100) + '%' })]),
          el('span', { style: 'font-size:13px;width:20px;text-align:right' }, [String(count)]),
        ]));
      });
      bodyEl.appendChild(cityCard);
    }

    if (tab === 'online') {
      const data = await api('/api/online-users');
      bodyEl.appendChild(el('p', { class: 'muted', style: 'margin-bottom:16px' }, [data.count + ' user' + (data.count !== 1 ? 's' : '') + ' active in the last 15 minutes']));
      const list = el('div', { class: 'stack' });
      if (data.users.length === 0) {
        list.appendChild(el('div', { class: 'card muted', style: 'text-align:center' }, ['No one active right now.']));
      }
      data.users.forEach(u => {
        list.appendChild(el('div', { class: 'card row', style: 'justify-content:space-between' }, [
          el('div', {}, [
            el('div', { style: 'font-weight:700;font-size:14px' }, [u.name]),
            el('div', { class: 'muted', style: 'font-size:12.5px' }, [u.email]),
          ]),
          el('span', { class: 'badge ok' }, ['Active ' + timeAgo(u.lastActive)]),
        ]));
      });
      bodyEl.appendChild(list);
    }
  }
  loadTab();
}

/* ---------------- Router ---------------- */
async function render() {
  updateNav();
  const root = document.getElementById('app');
  root.innerHTML = '';
  try {
    if (state.route === 'home') return viewHome(root);
    if (state.route === 'search') return viewSearch(root);
    if (state.route === 'emergency') return viewEmergency(root);
    if (state.route === 'requests') return viewRequests(root);
    if (state.route === 'post-request') return viewPostRequest(root);
    if (state.route === 'login') return viewLogin(root);
    if (state.route === 'register') return viewRegister(root);
    if (state.route === 'dashboard') {
      if (!state.user) { setRoute('login'); return; }
      return viewDashboard(root);
    }
    if (state.route === 'admin') {
      if (!state.user || state.user.role !== 'admin') { setRoute('home'); return; }
      return viewAdmin(root);
    }
  } catch (err) {
    root.appendChild(el('div', { class: 'card' }, ['Something went wrong: ' + err.message]));
  }
}

document.getElementById('brandLink').addEventListener('click', () => setRoute('home'));
document.querySelectorAll('.nav-link[data-route]').forEach(b => b.addEventListener('click', () => setRoute(b.dataset.route)));
document.getElementById('loginBtn').addEventListener('click', () => setRoute('login'));
document.getElementById('registerBtn').addEventListener('click', () => setRoute('register'));

async function init() {
  await refreshMe();
  render();
}
init();

/* logout is reachable via a small helper attached to window for future auth UI */
window.lifedropLogout = async function () {
  await api('/api/logout', { method: 'POST' }).catch(() => {});
  state.token = null; state.user = null;
  localStorage.removeItem('lifedrop_token');
  setRoute('home');
};