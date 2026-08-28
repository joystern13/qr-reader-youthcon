// Register Service Worker
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(err => console.error('SW reg error:', err));
}

// Defined Workshop Data Catalog
const WORKSHOPS = [
  { id: "74d3df9e-edc6-4a2e-8889-a1efeac84c67", slot: "morning", name: "Main Character Energy (Anna Hartinger)" },
  { id: "109f7f59-5e40-4ddd-a3a0-e472fc95be21", slot: "afternoon", name: "Main Character Energy (Anna Hartinger)" },
  { id: "196df6bc-919c-4116-9f0c-755f801f7a4d", slot: "morning", name: "Anchored in the Storm (Fr. Stephan Kappler)" },
  { id: "c016b86d-8ab4-4814-b239-29b82343bb3b", slot: "afternoon", name: "Anchored in the Storm (Fr. Stephan Kappler)" },
  { id: "28614b39-73ef-406b-9091-01a45bc9a582", slot: "morning", name: "Bible Art-Journaling (Sr. Josefa Maria Grießhaber & Annika Woitich)" },
  { id: "63dbcc73-0b0e-4e29-aeb1-0588738037f9", slot: "afternoon", name: "Bible Art-Journaling (Sr. Josefa Maria Grießhaber & Annika Woitich)" },
  { id: "d2f03073-b101-4830-a496-eae7d4e93107", slot: "morning", name: "The Power of Forgiveness (Rev. Emmanuel Opara)" },
  { id: "55e8aa49-420a-4f71-85f4-e1971673a106", slot: "afternoon", name: "The Power of Forgiveness (Rev. Emmanuel Opara)" },
  { id: "bfc84544-af4e-4dbe-8d95-a3f0428c6d95", slot: "morning", name: "Vocational Coaching (Rev. Klaus Hofstetter & Sr. Maria Wolfsberger)" },
  { id: "bfa23f94-d964-48e6-a195-90a028bddb3e", slot: "afternoon", name: "Vocational Coaching (Rev. Klaus Hofstetter & Sr. Maria Wolfsberger)" },
  { id: "d9f93582-6528-4b05-a995-91443067c851", slot: "morning", name: "The Loneliness Epidemic (Rev. Jonas Piodo & J.R. Notarte)" },
  { id: "12c056ed-6326-4f39-827d-765b6622a3ed", slot: "afternoon", name: "The Loneliness Epidemic (Rev. Jonas Piodo & J.R. Notarte)" },
  { id: "0b92cdaf-cdfe-4d5e-baf7-1e1752e66833", slot: "morning", name: "Finding Your One True Love (Nestle Jeturian)" },
  { id: "8cc438fe-fb9b-4998-9758-eb5430a18b85", slot: "morning", name: "You(th) can compose (Herbert Ntambi)" }
];

let activeWorkshopUuid = "";
let html5QrcodeScanner = null;

// UI Elements
const configScreen = document.getElementById('config-screen');
const scannerScreen = document.getElementById('scanner-screen');
const slotSelect = document.getElementById('slot');
const workshopSelect = document.getElementById('workshop-select');
const startBtn = document.getElementById('start-btn');
const resetBtn = document.getElementById('reset-btn');
const scanNextBtn = document.getElementById('scan-next-btn');
const activeWorkshopName = document.getElementById('active-workshop-name');
const resultBadge = document.getElementById('result-badge');
const readerContainer = document.getElementById('reader-container');

// Populate workshop options based on selected slot
function updateWorkshopDropdown() {
  const selectedSlot = slotSelect.value;
  const filteredWorkshops = WORKSHOPS.filter(w => w.slot === selectedSlot);
  
  workshopSelect.innerHTML = '';
  filteredWorkshops.forEach(w => {
    const opt = document.createElement('option');
    opt.value = w.id;
    opt.textContent = w.name;
    workshopSelect.appendChild(opt);
  });
}

slotSelect.addEventListener('change', updateWorkshopDropdown);
updateWorkshopDropdown();

startBtn.addEventListener('click', () => {
  activeWorkshopUuid = workshopSelect.value;
  const selectedObj = WORKSHOPS.find(w => w.id === activeWorkshopUuid);

  activeWorkshopName.innerText = `[${selectedObj.slot.toUpperCase()}] ${selectedObj.name}`;
  configScreen.classList.add('hidden');
  scannerScreen.classList.remove('hidden');

  startCamera();
});

scanNextBtn.addEventListener('click', () => {
  resultBadge.style.display = 'none';
  scanNextBtn.classList.add('hidden');
  readerContainer.classList.remove('hidden');
  startCamera();
});

resetBtn.addEventListener('click', async () => {
  await stopCamera();
  scannerScreen.classList.add('hidden');
  configScreen.classList.remove('hidden');
  resultBadge.style.display = 'none';
  scanNextBtn.classList.add('hidden');
});

function startCamera() {
  readerContainer.classList.remove('hidden');
  if (!html5QrcodeScanner) {
    html5QrcodeScanner = new Html5QrcodeScanner("reader", { 
      fps: 10, 
      qrbox: { width: 250, height: 250 } 
    });
  }
  html5QrcodeScanner.render(onScanSuccess, () => {});
}

async function stopCamera() {
  if (html5QrcodeScanner) {
    try {
      await html5QrcodeScanner.clear();
    } catch (e) {
      console.warn("Scanner clear issue:", e);
    }
  }
  readerContainer.classList.add('hidden');
}

async function onScanSuccess(decodedText) {
  await stopCamera();
  showStatus('Verifying registration...', 'loading');

  try {
    const rawText = decodedText.trim();

    // 1. Extract dynamic Base URL and Participant ID directly from scanned QR string
    const parsedUrl = new URL(rawText);
    const baseUrl = parsedUrl.origin;
    
    const idMatch = parsedUrl.hash.match(/\/r\/([a-zA-Z0-9-]+)/) || parsedUrl.pathname.match(/\/r\/([a-zA-Z0-9-]+)/);
    if (!idMatch) {
      throw new Error("Invalid QR code: Could not extract participant ID.");
    }
    const participantId = idMatch[1];

    // 2. Fetch Authorization Token
    const tokenEndpoint = `${baseUrl}/LundK.Online/api/Token/${participantId}?app=false`;
    const tokenResponse = await fetch(tokenEndpoint, {
      method: 'GET',
      mode: 'cors',
      headers: { 'Accept': 'application/json' }
    });

    if (!tokenResponse.ok) {
      throw new Error(`Token request failed (Status ${tokenResponse.status})`);
    }

    let tokenData = await tokenResponse.text();
    const token = tokenData.replace(/^"|"$/g, '').trim();

    // 3. Fetch Participant Data
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
      throw new Error(`Attendee request failed (Status ${dataResponse.status})`);
    }

    const data = await dataResponse.json();

    // 4. Extract AttendeeProperty via the 'Zam' object
    let attendeeProperties = [];
    
    if (data.Zam) {
      const zamObj = data.Zam;
      if (Array.isArray(zamObj)) {
        // If Zam is an array, collect all AttendeeProperty items across entries
        zamObj.forEach(z => {
          if (Array.isArray(z.AttendeeProperty)) {
            attendeeProperties.push(...z.AttendeeProperty);
          } else if (z.AttendeeProperty) {
            attendeeProperties.push(z.AttendeeProperty);
          }
        });
      } else if (Array.isArray(zamObj.AttendeeProperty)) {
        attendeeProperties = zamObj.AttendeeProperty;
      } else if (zamObj.AttendeeProperty) {
        attendeeProperties = [zamObj.AttendeeProperty];
      }
    }

    // 5. Validate registration against active workshop UUID
    const registeredIds = attendeeProperties.map(p => (p.EventPropertyId || "").toLowerCase());
    const isRegistered = registeredIds.includes(activeWorkshopUuid.toLowerCase());

    if (isRegistered) {
      showStatus('ENTRY ALLOWED ✓', 'allowed');
    } else {
      showStatus('ENTRY DENIED ✗\n(Not Registered for this Workshop)', 'denied');
    }

  } catch (err) {
    showStatus(`Error: ${err.message}`, 'denied');
  }

  scanNextBtn.classList.remove('hidden');
}

function showStatus(msg, type) {
  resultBadge.innerText = msg;
  resultBadge.className = `status-badge ${type}`;
  resultBadge.style.display = 'block';
}