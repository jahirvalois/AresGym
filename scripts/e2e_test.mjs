import fetch from 'node-fetch';

const BASE = process.env.BASE_URL || 'http://localhost:8080';
const headers = { 'Content-Type': 'application/json', 'x-user-id': 'test-user-123', 'x-user-role': 'INDEPENDENT' };

function log(...args) { console.log(new Date().toISOString(), ...args); }

async function run() {
  try {
    const id = 'e2e-node-1';
    const routine = {
      id,
      name: 'E2E Node Routine',
      userId: 'test-user-123',
      exercises: [{ exerciseId: 'ex1', name: 'Push', sets: 1, reps: 10 }],
      status: 'ACTIVE'
    };

    log('POST /api/routines -> create (wrapped payload with coachId)');
    // server expects body shape: { coachId, routine }
    const payload = { coachId: 'coach-1', routine };
    let res = await fetch(`${BASE}/api/routines`, { method: 'POST', headers, body: JSON.stringify(payload) });
    let body = await res.text();
    log('CREATE status', res.status);
    console.log(body);

    log('GET /api/routines?userId=test-user-123 -> list');
    res = await fetch(`${BASE}/api/routines?userId=test-user-123`, { headers });
    body = await res.text();
    log('LIST status', res.status);
    console.log(body);

    log('PATCH /api/routines/' + id + ' -> update');
    res = await fetch(`${BASE}/api/routines/${id}`, { method: 'PATCH', headers, body: JSON.stringify({ name: 'E2E Node Routine Updated' }) });
    body = await res.text();
    log('PATCH status', res.status);
    console.log(body);

    log('DELETE /api/routines/' + id + ' -> delete');
    res = await fetch(`${BASE}/api/routines/${id}`, { method: 'DELETE', headers });
    log('DELETE status', res.status);

    log('GET /api/routines?userId=test-user-123 -> final list');
    res = await fetch(`${BASE}/api/routines?userId=test-user-123`, { headers });
    body = await res.text();
    log('FINAL LIST status', res.status);
    console.log(body);

    log('GET /api/audit -> searching for routine id');
    res = await fetch(`${BASE}/api/audit`, { headers });
    body = await res.text();
    log('AUDIT status', res.status);
    // print a small excerpt
    if (body && body.length > 2000) {
      console.log(body.slice(0, 2000));
      console.log('... (truncated, total length:', body.length, ')');
    } else {
      console.log(body);
    }

    log('E2E script completed');
    process.exit(0);
  } catch (err) {
    console.error('E2E error', err);
    process.exit(2);
  }
}

run();
