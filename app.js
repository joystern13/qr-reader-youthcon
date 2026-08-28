// Register Service Worker
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(err => console.error('SW reg error:', err));
}

let activeWorkshopUuid = "";
let html5QrcodeScanner = null;
let isProcessing = false;

// Convert slot + title into a deterministic UUID v4 identifier
async function computeWorkshopUuid(slot, title) {
  const input = `${slot.toLowerCase()}-${title.trim().toLowerCase()}`;
  const encoder = new TextEncoder();
  const data = encoder.encode(input);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

  // Format hash into UUID structure
  return `${hex.substr(0,8)}-${hex.substr(8,4)}-4${hex.substr(13,3)}-a${hex.substr(17,3)}-${hex.substr(20,12)}`;
}

// UI Elements
const configScreen = document.getElementById('config-screen');
const scannerScreen = document.getElementById('scanner-screen');
const slotSelect = document.getElementById('slot');
const titleInput = document.getElementById('workshop-title');
const startBtn = document.getElementById('start-btn');
const resetBtn = document.getElementById('reset-btn');
const activeIdDisplay = document.getElementById('active-id-display');
const resultBadge = document.getElementById('result-badge');

startBtn.addEventListener('click', async () => {
  const slot = slotSelect.value;
  const rawTitle = titleInput.value.trim();

  if (!rawTitle) {
    alert('Please enter a workshop title or ID.');
    return;
  }

  // Check if user input is already a valid UUID format; if so, use directly, otherwise compute one
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(rawTitle);
  activeWorkshopUuid = isUuid ? rawTitle.toLowerCase() : await computeWorkshopUuid(slot, rawTitle);

  activeIdDisplay.innerText = activeWorkshopUuid;
  configScreen.classList.add('hidden');
  scannerScreen.classList.remove('hidden');

  initScanner();
});

resetBtn.addEventListener('click', () => {
  if (html5QrcodeScanner) {
    html5QrcodeScanner.clear();
  }
  scannerScreen.classList.add('hidden');
  configScreen.classList.remove('hidden');
  resultBadge.style.display = 'none';
});

function initScanner() {
  html5QrcodeScanner = new Html5QrcodeScanner("reader", { 
    fps: 10, 
    qrbox: { width: 250, height: 250 } 
  });
  
  html5QrcodeScanner.render(onScanSuccess, onScanFailure);
}

async function onScanSuccess(decodedText) {
  if (isProcessing) return;
  isProcessing = true;

  showStatus('Extracting participant ID and URL...', 'loading');

  try {
    const rawText = decodedText.trim();

    // 1. Parse the scanned string as a URL to dynamically get origin and path
    const parsedUrl = new URL(rawText);
    const baseUrl = parsedUrl.origin;

    // 2. Extract Participant ID from path (matches e.g. /r/1126-8832-6919-9765)
    const idMatch = parsedUrl.hash.match(/\/r\/([a-zA-Z0-9-]+)/) || parsedUrl.pathname.match(/\/r\/([a-zA-Z0-9-]+)/);
    if (!idMatch) {
      throw new Error("Invalid QR code format: Could not extract participant ID.");
    }
    const participantId = idMatch[1];

    // 3. Step 1: Fetch Authentication Token directly from target server
    showStatus('Fetching access token...', 'loading');
    const tokenEndpoint = `${baseUrl}/LundK.Online/api/Token/${participantId}?app=false`;

    const tokenResponse = await fetch(tokenEndpoint, {
      method: 'GET',
      mode: 'cors',
      headers: { 
        'Accept': 'application/json' 
      }
    });

    if (!tokenResponse.ok) {
      throw new Error(`Token fetch failed with status ${tokenResponse.status}`);
    }

    let tokenData = await tokenResponse.text();
    // Clean up quotes if returned as a JSON string
    const token = tokenData.replace(/^"|"$/g, '').trim();

    // 4. Step 2: Fetch Attendee Data directly from target server
    showStatus('Verifying registration...', 'loading');
    const dataEndpoint = `${baseUrl}/LundK.Online/api/Data/attendee/${participantId}`;

    const dataResponse = await fetch(dataEndpoint, {
      method: 'GET',
      mode: 'cors',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/json'
      }
    });

    if (!dataResponse.ok) {
      throw new Error(`Attendee data request failed with status ${dataResponse.status}`);
    }

    const data = await dataResponse.json();

    // 5. Extract EventPropertyId list from AttendeeProperty
    const attendeeProperties = Array.isArray(data.AttendeeProperty) 
      ? data.AttendeeProperty 
      : (data.AttendeeProperty ? [data.AttendeeProperty] : []);

    const registeredIds = attendeeProperties.map(p => (p.EventPropertyId || "").toLowerCase());

    // 6. Verify configured workshop match
    const isRegistered = registeredIds.includes(activeWorkshopUuid.toLowerCase());

    if (isRegistered) {
      showStatus('ENTRY ALLOWED ✓', 'allowed');
    } else {
      showStatus('ENTRY DENIED ✗ (Not Registered)', 'denied');
    }

  } catch (err) {
    showStatus(`Error: ${err.message}`, 'denied');
  }

  // Cool-down period before reading next code
  setTimeout(() => {
    isProcessing = false;
  }, 3000);
}

function onScanFailure(error) {
  // Silent fail on frame-by-frame non-matches
}

function showStatus(msg, type) {
  resultBadge.innerText = msg;
  resultBadge.className = `status-badge ${type}`;
  resultBadge.style.display = 'block';
}
