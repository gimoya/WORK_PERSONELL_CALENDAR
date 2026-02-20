// Personnel Planning Calendar Application

let calendar = null;
let gapiClient = null;
let tokenClient = null;
let accessToken = null;
let isSignedIn = false;
let allEvents = [];
let currentSelectInfo = null; // Store selected date range for event creation
let currentEditingEventId = null; // Track which event is being edited

// Get default config data (used when creating new config event or when not signed in)
function getDefaultConfigData() {
  return {
    personnel: [],
    projects: [], // Projects will be objects with { name, color }
    roles: [
      'Project-Manager',
      'Foreman',
      'Shaper',
      'Operator-Shaper'
    ]
  };
}

// Initialize config arrays (data will be loaded from calendar)
function loadConfig() {
  // Initialize empty arrays - data comes from calendar event
  CONFIG.personnel = [];
  CONFIG.projects = [];
  CONFIG.roles = [];
}

// Find or create config event in calendar
async function findOrCreateConfigEvent() {
  const CONFIG_EVENT_DATE = '2000-01-01';
  const CONFIG_EVENT_TITLE = '__PERSONNEL_CONFIG__';
  
  try {
    // Search for existing config event
    const response = await gapiClient.calendar.events.list({
      calendarId: CONFIG.calendarId,
      timeMin: CONFIG_EVENT_DATE + 'T00:00:00Z',
      timeMax: CONFIG_EVENT_DATE + 'T23:59:59Z',
      singleEvents: true,
      q: CONFIG_EVENT_TITLE
    });
    
    const events = response.result.items || [];
    const configEvent = events.find(e => e.summary === CONFIG_EVENT_TITLE);
    
    if (configEvent) {
      return configEvent;
    }
    
    // Create new config event with defaults
    const defaultData = getDefaultConfigData();
    const newEvent = {
      summary: CONFIG_EVENT_TITLE,
      start: { date: CONFIG_EVENT_DATE },
      end: { date: '2000-01-02' },
      extendedProperties: {
        shared: {
          personnelConfig: JSON.stringify(defaultData)
        }
      }
    };
    
    const createResponse = await gapiClient.calendar.events.insert({
      calendarId: CONFIG.calendarId,
      resource: newEvent
    });
    
    return createResponse.result;
  } catch (error) {
    console.error('Error finding/creating config event:', error);
    throw error;
  }
}

// Load config from calendar
async function loadConfigFromCalendar() {
  if (!isSignedIn || !gapiClient) {
    // If not signed in, use defaults
    const defaultData = getDefaultConfigData();
    CONFIG.personnel = defaultData.personnel;
    CONFIG.projects = defaultData.projects;
    CONFIG.roles = defaultData.roles;
    return;
  }
  
  try {
    const configEvent = await findOrCreateConfigEvent();
    
    if (configEvent?.extendedProperties?.shared?.personnelConfig) {
      const configData = JSON.parse(configEvent.extendedProperties.shared.personnelConfig);
      
      if (configData.roles && Array.isArray(configData.roles)) {
        CONFIG.roles = configData.roles;
      } else {
        const defaultData = getDefaultConfigData();
        CONFIG.roles = defaultData.roles;
      }
      
      if (configData.personnel && Array.isArray(configData.personnel)) {
        CONFIG.personnel = configData.personnel;
      } else {
        CONFIG.personnel = [];
      }
      
      if (configData.projects && Array.isArray(configData.projects)) {
        CONFIG.projects = configData.projects;
      } else {
        CONFIG.projects = [];
      }
  } else {
      // No config data, use defaults
      const defaultData = getDefaultConfigData();
      CONFIG.personnel = defaultData.personnel;
      CONFIG.projects = defaultData.projects;
      CONFIG.roles = defaultData.roles;
    }
  } catch (error) {
    console.error('Error loading config from calendar:', error);
    // Fall back to defaults
    const defaultData = getDefaultConfigData();
    CONFIG.personnel = defaultData.personnel;
    CONFIG.projects = defaultData.projects;
    CONFIG.roles = defaultData.roles;
    }
  }
  
// Save config to calendar
async function saveConfigToCalendar() {
  if (!isSignedIn || !gapiClient) {
    return; // Can't save to calendar if not signed in
  }
  
  try {
    const configEvent = await findOrCreateConfigEvent();
    
    const configData = {
      personnel: CONFIG.personnel,
      projects: CONFIG.projects,
      roles: CONFIG.roles
    };
    
    await gapiClient.calendar.events.update({
      calendarId: CONFIG.calendarId,
      eventId: configEvent.id,
      resource: {
        ...configEvent,
        extendedProperties: {
          shared: {
            personnelConfig: JSON.stringify(configData)
          }
        }
      }
    });
  } catch (error) {
    console.error('Error saving config to calendar:', error);
    if (error.status === 403) {
      showStatus('Cannot save: You do not have write access to this calendar. Please ask the calendar owner to grant you "Make changes to events" permission.', 'error');
      throw new Error('Write access denied');
    } else if (error.status === 404) {
      showStatus('Cannot save: Calendar not found or not shared with your account.', 'error');
      throw new Error('Calendar not accessible');
    }
    throw error;
  }
}

// Persist config (writes to calendar when signed in)
async function saveConfig() {
  if (isSignedIn && gapiClient) {
    try {
      await saveConfigToCalendar();
    } catch (error) {
      console.error('Failed to save config to calendar:', error);
      throw error;
    }
  } else {
    console.warn('Cannot save config: not signed in');
  }
}

// Initialize config on load
loadConfig();

// Load defaults if not signed in (will be overridden when signed in)
if (!isSignedIn) {
  const defaultData = getDefaultConfigData();
  CONFIG.personnel = defaultData.personnel;
  CONFIG.projects = defaultData.projects;
  CONFIG.roles = defaultData.roles;
}

// Initialize the application
async function init() {
  showStatus('Loading Google API...', 'loading');
  
  try {
    // Wait for Google Identity Services to load
    await waitForGoogleIdentityServices();
    
    // Initialize Google API client (without auth2)
    await loadGAPI();
    
    // Initialize Google API client with discovery docs
    await gapi.client.init({
      discoveryDocs: ['https://www.googleapis.com/discovery/v1/apis/calendar/v3/rest']
    });
    
    gapiClient = gapi.client;
    
    // Initialize OAuth 2.0 token client with new Google Identity Services
    tokenClient = google.accounts.oauth2.initTokenClient({
      client_id: CONFIG.oauthClientId,
      scope: 'https://www.googleapis.com/auth/calendar',
      callback: (tokenResponse) => {
        if (tokenResponse.error) {
          console.error('Token error:', tokenResponse);
          showStatus('Authentication failed: ' + tokenResponse.error, 'error');
          return;
        }
        accessToken = tokenResponse.access_token;
        // Set token on gapi client
        gapi.client.setToken({ access_token: accessToken });
        onSignInSuccess();
      },
      error_callback: (error) => {
        console.error('OAuth error:', error);
        showStatus('Authentication error: ' + (error.message || 'Unknown error'), 'error');
      }
    });
    
    // Check if we have a stored token
    const storedToken = localStorage.getItem('google_access_token');
    if (storedToken) {
      try {
        // Set token and verify it's still valid
        gapi.client.setToken({ access_token: storedToken });
        accessToken = storedToken;
        // Make a test request to verify token
        await gapi.client.calendar.calendarList.list({ maxResults: 1 });
        isSignedIn = true;
        await onSignInSuccess();
        return;
      } catch (error) {
        // Token invalid or expired, clear it
        // Token invalid or expired, clear it
        localStorage.removeItem('google_access_token');
        gapi.client.setToken(null);
      }
    }
    
    // Show sign-in button
    showSignInButton();
    showStatus('Please sign in to continue', 'info');
    
  } catch (error) {
    console.error('Initialization error:', error);
    showStatus('Error: ' + error.message, 'error');
  }
}

// Wait for Google Identity Services to load
function waitForGoogleIdentityServices() {
  return new Promise((resolve) => {
    if (window.google && window.google.accounts) {
      resolve();
      return;
    }
    
    const checkInterval = setInterval(() => {
      if (window.google && window.google.accounts) {
        clearInterval(checkInterval);
        resolve();
      }
    }, 100);
    
    // Timeout after 10 seconds
    setTimeout(() => {
      clearInterval(checkInterval);
      if (!window.google || !window.google.accounts) {
        throw new Error('Google Identity Services failed to load');
      }
      resolve();
    }, 10000);
  });
}

// Load Google API client library (without auth2)
function loadGAPI() {
  return new Promise((resolve, reject) => {
    gapi.load('client', {
      callback: resolve,
      onerror: reject
    });
  });
}

// Validate calendar access and write permissions
async function validateCalendarAccess() {
  try {
    // First, check if we can access the calendar at all
    const calendarResponse = await gapiClient.calendar.calendars.get({
      calendarId: CONFIG.calendarId
    });
    
    const calendar = calendarResponse.result;
    
    // Check if user has write access by attempting to list events
    // If they can't even read, they definitely can't write
    await gapiClient.calendar.events.list({
      calendarId: CONFIG.calendarId,
      maxResults: 1
    });
    
    // Try to create a test event to verify write access
    // We'll delete it immediately if successful
    const testEvent = {
      summary: '__WRITE_ACCESS_TEST__',
      start: { date: '2000-01-01' },
      end: { date: '2000-01-02' }
    };
    
    try {
      const createResponse = await gapiClient.calendar.events.insert({
        calendarId: CONFIG.calendarId,
        resource: testEvent
      });
      
      // Delete the test event immediately
      await gapiClient.calendar.events.delete({
        calendarId: CONFIG.calendarId,
        eventId: createResponse.result.id
      });
      
      return { hasAccess: true, hasWriteAccess: true };
    } catch (writeError) {
      if (writeError.status === 403) {
        return { 
          hasAccess: true, 
          hasWriteAccess: false,
          error: 'You have read access but not write access. Please ask the calendar owner to grant you "Make changes to events" permission.'
        };
      }
      throw writeError;
    }
  } catch (error) {
    if (error.status === 404) {
      return {
        hasAccess: false,
        hasWriteAccess: false,
        error: 'Calendar not found or not shared with your account. Please ask the calendar owner to share the calendar with your email address.'
      };
    } else if (error.status === 403) {
      return {
        hasAccess: false,
        hasWriteAccess: false,
        error: 'You do not have access to this calendar. Please ask the calendar owner to share it with your email address and grant "Make changes to events" permission.'
      };
    }
    throw error;
  }
}

// Handle successful sign-in
async function onSignInSuccess() {
  isSignedIn = true;
  hideSignInButton();
  
  // Store token for future use
  if (accessToken) {
    localStorage.setItem('google_access_token', accessToken);
  }
  
  showStatus('Signed in successfully. Validating calendar access...', 'loading');
  
  // Validate calendar access and write permissions
  try {
    const accessCheck = await validateCalendarAccess();
    
    if (!accessCheck.hasAccess) {
      showStatus(accessCheck.error, 'error');
      // Still allow UI to initialize but disable write operations
      initializeUI();
      return;
    }
    
    if (!accessCheck.hasWriteAccess) {
      showStatus(accessCheck.error, 'error');
      // Still allow UI to initialize but disable write operations
      initializeUI();
      return;
    }
    
    showStatus('Calendar access validated', 'success');
  } catch (error) {
    console.error('Error validating calendar access:', error);
    showStatus('Error validating calendar access: ' + error.message, 'error');
    initializeUI();
    return;
  }
  
  // Load config from calendar (will override localStorage)
  try {
    await loadConfigFromCalendar();
  } catch (error) {
    console.error('Error loading config from calendar:', error);
    if (error.status === 403 || error.status === 404) {
      showStatus('Cannot load configuration: ' + (error.message || 'Access denied'), 'error');
    }
  }
  
  // Initialize UI
  initializeUI();
  
  // Update personnel legend
  updatePersonnelLegend();
  
  // Load calendar events
  await loadEvents();
  
  showStatus('Calendar loaded successfully', 'success');
  setTimeout(() => hideStatus(), 3000);
}

// Sign in handler
function handleSignIn() {
  try {
    showStatus('Signing in...', 'loading');
    // Clear any stale tokens first
    localStorage.removeItem('google_access_token');
    gapi.client.setToken(null);
    accessToken = null;
    
    // Request access token using the new Google Identity Services
    // This will open the modern OAuth consent screen
    if (tokenClient) {
      // Use prompt: 'select_account' to force fresh login and avoid legacy flow
      tokenClient.requestAccessToken({ prompt: 'select_account' });
    } else {
      showStatus('Authentication not initialized. Please refresh the page.', 'error');
    }
  } catch (error) {
    console.error('Sign-in error:', error);
    showStatus('Sign-in failed: ' + error.message, 'error');
  }
}

// Sign out handler
function handleSignOut() {
  if (accessToken) {
    // Revoke the token
    google.accounts.oauth2.revoke(accessToken, () => {
      // Token revoked
    });
  }
  
  // Clear stored token
  localStorage.removeItem('google_access_token');
  accessToken = null;
  gapi.client.setToken(null);
  
  isSignedIn = false;
  showSignInButton();
  const signOutBtn = document.getElementById('signOutBtn');
  if (signOutBtn) {
    signOutBtn.style.display = 'none';
  }
  if (calendar) {
    calendar.destroy(); // FullCalendar API
    calendar = null;
  }
  allEvents = [];
  showStatus('Signed out', 'info');
}

// Show sign-in button
function showSignInButton() {
  const signInBtn = document.getElementById('signInBtn');
  if (signInBtn) {
    signInBtn.style.display = 'block';
    signInBtn.onclick = handleSignIn;
  }
}

// Hide sign-in button
function hideSignInButton() {
  const signInBtn = document.getElementById('signInBtn');
  if (signInBtn) {
    signInBtn.style.display = 'none';
  }
}

// Load events from calendar
async function loadEvents() {
  showStatus('Loading events...', 'loading');
  
  try {
    const year = CONFIG.year;
    const timeMin = new Date(year, 0, 1).toISOString();
    const timeMax = new Date(year, 11, 31, 23, 59, 59).toISOString();
    
    // Use gapi.client directly for better error handling
    const response = await gapiClient.calendar.events.list({
      calendarId: CONFIG.calendarId,
      timeMin: timeMin,
      timeMax: timeMax,
      singleEvents: true,
      orderBy: 'startTime'
    });
    
    // Filter out config event
    allEvents = (response.result.items || []).filter(e => 
      !e.summary || e.summary !== '__PERSONNEL_CONFIG__'
    );
    
    // Update calendar display
    updateCalendar();
    
    // Show success and auto-hide
    showStatus('Events loaded successfully', 'success');
    setTimeout(() => hideStatus(), 2000);
    
  } catch (error) {
    console.error('Error loading events:', error);
    // Check if token expired
    if (error.status === 401) {
      // Token expired, request new one
      showStatus('Session expired. Please sign in again.', 'error');
      handleSignOut();
      showSignInButton();
    } else if (error.status === 403) {
      showStatus('Cannot load events: You do not have access to this calendar. Please ask the calendar owner to share it with your email address.', 'error');
    } else if (error.status === 404) {
      showStatus('Cannot load events: Calendar not found or not shared with your account.', 'error');
    } else {
      showStatus('Error loading events: ' + error.message, 'error');
    }
  }
}

// Parse event to extract person, project, and role
function parseEvent(event) {
  const summary = event.summary || '';
  // Try to match "Person - Project - Role" format
  const matchWithRole = summary.match(/^(.+?)\s*-\s*(.+?)\s*-\s*(.+)$/);
  
  if (matchWithRole) {
    return {
      person: matchWithRole[1].trim(),
      project: matchWithRole[2].trim(),
      role: matchWithRole[3].trim()
    };
  }
  
  // Fallback to "Person - Project" format (role optional)
  const match = summary.match(/^(.+?)\s*-\s*(.+)$/);
  if (match) {
    return {
      person: match[1].trim(),
      project: match[2].trim(),
      role: ''
    };
  }
  
  return { person: '', project: summary, role: '' };
}

// Get project color
function getProjectColor(projectName) {
  const projectConfig = CONFIG.projects.find(p => p.name === projectName);
  return projectConfig ? (projectConfig.color || '#4285f4') : '#4285f4';
}

// Convert hex color to rgba
function hexToRgba(hex, alpha) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

// Check if person, project, or role exists in CONFIG
function isValidEvent(person, project, role) {
  const personExists = !person || person.trim() === '' || CONFIG.personnel.includes(person);
  const projectExists = !project || project.trim() === '' || CONFIG.projects.some(p => p.name === project);
  const roleExists = !role || role.trim() === '' || CONFIG.roles.includes(role);
  
  return personExists && projectExists && roleExists;
}

// Convert Google Calendar event to FullCalendar event shape (FullCalendar API)
function toFullCalendarEvent(gcalEvent) {
  const { person, project, role } = parseEvent(gcalEvent);
  
  // Use project color for calendar events
  const isValid = isValidEvent(person, project, role);
  const color = isValid ? getProjectColor(project) : '#9aa0a6';
  
  const start = gcalEvent.start.dateTime || gcalEvent.start.date;
  const end = gcalEvent.end.dateTime || gcalEvent.end.date;
  
  const title = role ? `${person} - ${project} - ${role}` : `${person} - ${project}`;
  
  return {
    id: gcalEvent.id,
    title: title,
    start: start,
    end: end,
    backgroundColor: color,
    borderColor: color,
    extendedProps: {
      person: person,
      project: project,
      role: role,
      gcalEvent: gcalEvent
    }
  };
}

// Multi-select filter helpers (checkboxes)
function getSelectedFilters(containerId) {
  const el = document.getElementById(containerId);
  if (!el) return [];
  return Array.from(el.querySelectorAll('input[type="checkbox"]:checked'))
    .filter(cb => !cb.classList.contains('filter-all-none'))
    .map(cb => cb.value);
}
function getSelectedPersonFilters() {
  return getSelectedFilters('personFilterCheckboxes');
}
function getSelectedProjectFilters() {
  return getSelectedFilters('projectFilterCheckboxes');
}

function syncAllNoneCheckbox(containerId) {
  const container = document.getElementById(containerId);
  if (!container) return;
  const allCb = container.querySelector('input.filter-all-none');
  const itemCbs = container.querySelectorAll('input[type="checkbox"]:not(.filter-all-none)');
  if (!allCb || itemCbs.length === 0) return;
  const n = itemCbs.length;
  const checked = Array.from(itemCbs).filter(cb => cb.checked).length;
  allCb.checked = checked === n;
  allCb.indeterminate = checked > 0 && checked < n;
}

function populateFilterCheckboxes() {
  const personContainer = document.getElementById('personFilterCheckboxes');
  const projectContainer = document.getElementById('projectFilterCheckboxes');
  if (!personContainer || !projectContainer) return;
  const selectedPersons = getSelectedPersonFilters();
  const selectedProjects = getSelectedProjectFilters();

  personContainer.innerHTML = '';
  addAllNoneRow(personContainer, 'person', CONFIG.personnel.length, selectedPersons.length, function (checked) {
    personContainer.querySelectorAll('input[type="checkbox"]:not(.filter-all-none)').forEach(cb => { cb.checked = checked; });
    updateFilterButtonLabels();
    updateCalendar();
  });
  [...CONFIG.personnel].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' })).forEach(person => {
    const label = document.createElement('label');
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.value = person;
    if (selectedPersons.length === 0 || selectedPersons.includes(person)) cb.checked = true;
    label.appendChild(cb);
    label.appendChild(document.createTextNode(person));
    personContainer.appendChild(label);
  });
  syncAllNoneCheckbox('personFilterCheckboxes');

  projectContainer.innerHTML = '';
  addAllNoneRow(projectContainer, 'project', CONFIG.projects.length, selectedProjects.length, function (checked) {
    projectContainer.querySelectorAll('input[type="checkbox"]:not(.filter-all-none)').forEach(cb => { cb.checked = checked; });
    updateFilterButtonLabels();
    updateCalendar();
  });
  [...CONFIG.projects].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })).forEach(project => {
    const label = document.createElement('label');
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.value = project.name;
    if (selectedProjects.length === 0 || selectedProjects.includes(project.name)) cb.checked = true;
    label.appendChild(cb);
    label.appendChild(document.createTextNode(project.name));
    projectContainer.appendChild(label);
  });
  syncAllNoneCheckbox('projectFilterCheckboxes');
  updateFilterButtonLabels();
}

function addAllNoneRow(container, kind, total, selectedCount, onToggle) {
  const label = document.createElement('label');
  label.className = 'filter-all-none-row';
  const cb = document.createElement('input');
  cb.type = 'checkbox';
  cb.className = 'filter-all-none';
  cb.checked = total > 0 && (selectedCount === 0 || selectedCount === total);
  cb.indeterminate = selectedCount > 0 && selectedCount < total;
  cb.title = 'Select all / none';
  label.appendChild(cb);
  label.appendChild(document.createTextNode('All / None'));
  cb.addEventListener('change', () => {
    onToggle(cb.checked);
    syncAllNoneCheckbox(container.id);
  });
  container.appendChild(label);
}

function updateFilterButtonLabels(overrideSelectedPersons, overrideSelectedProjects) {
  const personBtn = document.getElementById('personFilterBtn');
  const projectBtn = document.getElementById('projectFilterBtn');
  const persons = overrideSelectedPersons ?? getSelectedPersonFilters();
  const projects = overrideSelectedProjects ?? getSelectedProjectFilters();
  const personContainer = document.getElementById('personFilterCheckboxes');
  const projectContainer = document.getElementById('projectFilterCheckboxes');
  const totalPersonnel = personContainer ? personContainer.querySelectorAll('input[type="checkbox"]:not(.filter-all-none)').length : 0;
  const totalProjects = projectContainer ? projectContainer.querySelectorAll('input[type="checkbox"]:not(.filter-all-none)').length : 0;
  const personCount = totalPersonnel === 0 ? 0 : (persons.length > 0 ? persons.length : totalPersonnel);
  const projectCount = totalProjects === 0 ? 0 : (projects.length > 0 ? projects.length : totalProjects);
  if (personBtn) {
    personBtn.textContent = totalPersonnel === 0 ? 'Personnel' : `Personnel (${personCount})`;
  }
  if (projectBtn) {
    projectBtn.textContent = totalProjects === 0 ? 'Projects' : `Projects (${projectCount})`;
  }
}

// Initialize UI components
function initializeUI() {
  // Show sign-out button and hide sign-in button
  const signOutBtn = document.getElementById('signOutBtn');
  if (signOutBtn) {
    signOutBtn.style.display = 'block';
    signOutBtn.onclick = handleSignOut;
  }
  hideSignInButton();
  
  // Populate person and project filter checkboxes
  populateFilterCheckboxes();
  
  // Initialize FullCalendar (FullCalendar API: https://fullcalendar.io/)
  const calendarEl = document.getElementById('calendar');
  calendar = new FullCalendar.Calendar(calendarEl, {
    // FullCalendar API options:
    initialView: 'dayGridMonth',
    initialDate: `${CONFIG.year}-01-01`,
    firstDay: 1, // Start week on Monday
    weekNumbers: true,
    weekNumberCalculation: 'ISO',
    editable: true,
    eventStartEditable: true,
    eventDurationEditable: true,
    droppable: false,
    selectable: true,
    selectMirror: true,
    dayMaxEvents: false, // Show all events expanded (no "+more" popover)
    validRange: {
      start: `${CONFIG.year}-01-01`,
      end: `${CONFIG.year}-12-31`
    },
    headerToolbar: {
      left: 'prev,next today',
      center: 'title',
      right: ''
    },
    events: [],
    // FullCalendar API callbacks:
    select: handleDateSelect,
    eventDrop: handleEventDrop,
    eventResize: handleEventResize,
    eventClick: handleEventClick
  });
  
  calendar.render(); // FullCalendar API

  // Initialize year selector
  const yearSelect = document.getElementById('yearSelect');
  if (yearSelect) {
    // Populate available years from calendarIds
    yearSelect.innerHTML = '';
    Object.keys(CONFIG.calendarIds)
      .sort((a, b) => parseInt(a) - parseInt(b))
      .forEach(year => {
        const option = document.createElement('option');
        option.value = year;
        option.textContent = year;
        if (parseInt(year) === CONFIG.year) {
          option.selected = true;
        }
        yearSelect.appendChild(option);
      });
    
    yearSelect.addEventListener('change', handleYearChange);
  }
  
  // Event listeners: filter dropdowns (portal to body so they appear above calendar)
  const personFilterBtn = document.getElementById('personFilterBtn');
  const projectFilterBtn = document.getElementById('projectFilterBtn');
  const personFilterPanel = document.getElementById('personFilterPanel');
  const projectFilterPanel = document.getElementById('projectFilterPanel');

  function openFilterPanel(panel, button) {
    if (!panel || !button) return;
    const parent = button.closest('.filter-dropdown');
    if (panel.parentNode === document.body) return;
    const rect = button.getBoundingClientRect();
    document.body.appendChild(panel);
    panel.classList.add('filter-dropdown-panel-portal');
    panel.style.display = 'block';
    panel.style.top = (rect.bottom + 4) + 'px';
    panel.style.left = rect.left + 'px';
    parent?.classList.add('open');
    button.setAttribute('aria-expanded', 'true');
  }
  function closeFilterPanel(panel, button) {
    if (!panel || !button) return;
    const parent = button.closest('.filter-dropdown');
    if (panel.parentNode !== document.body) return;
    parent?.appendChild(panel);
    panel.classList.remove('filter-dropdown-panel-portal');
    panel.style.display = '';
    panel.style.top = '';
    panel.style.left = '';
    parent?.classList.remove('open');
    button.setAttribute('aria-expanded', 'false');
  }
  function closeAllFilterPanels() {
    [personFilterPanel, projectFilterPanel].forEach((panel, i) => {
      const btn = i === 0 ? personFilterBtn : projectFilterBtn;
      if (panel?.parentNode === document.body) closeFilterPanel(panel, btn);
    });
  }

  if (personFilterBtn && personFilterPanel) {
    personFilterBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const parent = personFilterBtn.closest('.filter-dropdown');
      const isOpen = parent?.classList.contains('open');
      closeFilterPanel(projectFilterPanel, projectFilterBtn);
      if (isOpen) closeFilterPanel(personFilterPanel, personFilterBtn);
      else openFilterPanel(personFilterPanel, personFilterBtn);
    });
    personFilterPanel.addEventListener('click', (e) => e.stopPropagation());
  }
  if (projectFilterBtn && projectFilterPanel) {
    projectFilterBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const parent = projectFilterBtn.closest('.filter-dropdown');
      const isOpen = parent?.classList.contains('open');
      closeFilterPanel(personFilterPanel, personFilterBtn);
      if (isOpen) closeFilterPanel(projectFilterPanel, projectFilterBtn);
      else openFilterPanel(projectFilterPanel, projectFilterBtn);
    });
    projectFilterPanel.addEventListener('click', (e) => e.stopPropagation());
  }
  const personFilterEl = document.getElementById('personFilterCheckboxes');
  const projectFilterEl = document.getElementById('projectFilterCheckboxes');
  if (personFilterEl) personFilterEl.addEventListener('change', () => { syncAllNoneCheckbox('personFilterCheckboxes'); updateFilterButtonLabels(); updateCalendar(); });
  if (projectFilterEl) projectFilterEl.addEventListener('change', () => { syncAllNoneCheckbox('projectFilterCheckboxes'); updateFilterButtonLabels(); updateCalendar(); });
  document.addEventListener('click', closeAllFilterPanels);
  document.getElementById('refreshBtn').addEventListener('click', loadEvents);
  
  // Initialize header Today button (only visible in overview mode)
  const headerTodayBtn = document.getElementById('headerTodayBtn');
  if (headerTodayBtn) {
    headerTodayBtn.addEventListener('click', () => {
      const compactYearView = document.getElementById('compactYearView');
      if (compactYearView && compactYearView.classList.contains('visible')) {
        const todayCell = compactYearView.querySelector('.day-cell.today');
        if (todayCell) {
          todayCell.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
        }
      }
    });
  }
  
  // Overview toggle button
  let overviewActive = false;
  document.getElementById('overviewToggleBtn').addEventListener('click', () => {
    overviewActive = !overviewActive;
    const btn = document.getElementById('overviewToggleBtn');
    if (overviewActive) {
      showCompactYearView();
      btn.textContent = 'Scheduling';
      btn.classList.add('btn-primary');
      btn.classList.remove('btn-secondary');
      // Show Today button in header
      if (headerTodayBtn) {
        headerTodayBtn.style.display = 'inline-block';
      }
    } else {
      hideCompactYearView();
      btn.textContent = 'Overview';
      btn.classList.remove('btn-primary');
      btn.classList.add('btn-secondary');
      // Hide Today button in header
      if (headerTodayBtn) {
        headerTodayBtn.style.display = 'none';
      }
    }
  });
  
  // Modal event listeners
  document.getElementById('eventCreateBtn').addEventListener('click', handleEventCreate);
  document.getElementById('eventCancelBtn').addEventListener('click', closeEventModal);
  document.getElementById('eventDeleteBtn').addEventListener('click', async () => {
    if (currentEditingEventId && confirm('Delete this event?')) {
      try {
        await deleteEvent(currentEditingEventId);
        closeEventModal();
      } catch (error) {
        console.error('Error deleting event:', error);
        showStatus('Error deleting event: ' + error.message, 'error');
      }
    }
  });
  document.querySelector('#eventModal .modal-close').addEventListener('click', closeEventModal);
  
  // New Assignment button
  const newAssignmentBtn = document.getElementById('newAssignmentBtn');
  if (newAssignmentBtn) {
    newAssignmentBtn.addEventListener('click', openEventModal);
  }
  
  // Management buttons
  document.getElementById('managePeopleBtn').addEventListener('click', () => {
    showPeopleModal();
  });
  document.getElementById('manageProjectsBtn').addEventListener('click', () => {
    showProjectsModal();
  });
  const manageRolesBtn = document.getElementById('manageRolesBtn');
  if (manageRolesBtn) {
    manageRolesBtn.addEventListener('click', () => {
      showRolesModal();
    });
  }
  
  // Calendar access info modal
  const calendarAccessInfoLink = document.getElementById('calendarAccessInfoLink');
  const calendarAccessInfoModal = document.getElementById('calendarAccessInfoModal');
  const calendarAccessInfoCloseBtn = document.getElementById('calendarAccessInfoCloseBtn');
  const displayCalendarId = document.getElementById('displayCalendarId');
  const calendarShareLink = document.getElementById('calendarShareLink');
  
  if (calendarAccessInfoLink) {
    calendarAccessInfoLink.addEventListener('click', (e) => {
      e.preventDefault();
      
      // Display calendar ID
      if (displayCalendarId) {
        displayCalendarId.textContent = CONFIG.calendarId;
      }
      
      // Set calendar share link
      if (calendarShareLink && CONFIG.shareLink) {
        calendarShareLink.href = CONFIG.shareLink;
      }
      
      // Show modal
      if (calendarAccessInfoModal) {
        calendarAccessInfoModal.style.display = 'block';
      }
    });
  }
  
  if (calendarAccessInfoCloseBtn) {
    calendarAccessInfoCloseBtn.addEventListener('click', () => {
      if (calendarAccessInfoModal) {
        calendarAccessInfoModal.style.display = 'none';
      }
    });
  }
  
  if (calendarAccessInfoModal) {
    const closeBtn = calendarAccessInfoModal.querySelector('.modal-close');
    if (closeBtn) {
      closeBtn.addEventListener('click', () => {
        calendarAccessInfoModal.style.display = 'none';
      });
    }
    
    // Close modal when clicking outside
    window.addEventListener('click', (e) => {
      if (e.target === calendarAccessInfoModal) {
        calendarAccessInfoModal.style.display = 'none';
      }
    });
  }
  
  // People management
  document.getElementById('addPersonBtn').addEventListener('click', addPerson);
  document.getElementById('peopleCloseBtn').addEventListener('click', () => {
    document.getElementById('peopleModal').style.display = 'none';
  });
  document.querySelector('#peopleModal .modal-close').addEventListener('click', () => {
    document.getElementById('peopleModal').style.display = 'none';
  });
  
  // Projects management
  document.getElementById('addProjectBtn').addEventListener('click', addProject);
  document.getElementById('projectsCloseBtn').addEventListener('click', () => {
    document.getElementById('projectsModal').style.display = 'none';
  });
  document.querySelector('#projectsModal .modal-close').addEventListener('click', () => {
    document.getElementById('projectsModal').style.display = 'none';
  });
  
  // Roles management
  const addRoleBtn = document.getElementById('addRoleBtn');
  const rolesCloseBtn = document.getElementById('rolesCloseBtn');
  const rolesModalClose = document.querySelector('#rolesModal .modal-close');
  if (addRoleBtn) {
    addRoleBtn.addEventListener('click', addRole);
  }
  if (rolesCloseBtn) {
    rolesCloseBtn.addEventListener('click', () => {
      document.getElementById('rolesModal').style.display = 'none';
    });
  }
  if (rolesModalClose) {
    rolesModalClose.addEventListener('click', () => {
      document.getElementById('rolesModal').style.display = 'none';
    });
  }
  
  // Close modals when clicking outside
  window.addEventListener('click', (e) => {
    const eventModal = document.getElementById('eventModal');
    const peopleModal = document.getElementById('peopleModal');
    const projectsModal = document.getElementById('projectsModal');
    const rolesModal = document.getElementById('rolesModal');
    
    if (e.target === eventModal) {
      closeEventModal();
    }
    if (e.target === peopleModal) {
      peopleModal.style.display = 'none';
    }
    if (e.target === projectsModal) {
      projectsModal.style.display = 'none';
    }
    if (rolesModal && e.target === rolesModal) {
      rolesModal.style.display = 'none';
    }
  });
}

// Handle year change
async function handleYearChange(event) {
  const newYear = parseInt(event.target.value);
  if (newYear === CONFIG.year) return;
  
  // Check if calendar ID exists for this year
  if (!CONFIG.calendarIds[newYear]) {
    showStatus(`Calendar for year ${newYear} is not configured. Please add the calendar ID to config.js in the calendarIds object.`, 'error');
    // Reset dropdown to current year
    event.target.value = CONFIG.year;
    setTimeout(() => hideStatus(), 5000);
    return;
  }
  
  CONFIG.year = newYear;
  
  // Update calendar validRange and initial date (FullCalendar API)
  if (calendar) {
    calendar.setOption('validRange', {
      start: `${newYear}-01-01`,
      end: `${newYear}-12-31`
    });
    calendar.setOption('initialDate', `${newYear}-01-01`);
    calendar.gotoDate(`${newYear}-01-01`);
  }
  
  // Reload events for new year
  try {
    await loadEvents();
    updateCalendar();
    
    // Reload config from calendar (personnel, projects, roles)
    await loadConfigFromCalendar();
    updateFilters();
    updatePersonnelLegend();
    
    if (document.getElementById('overviewToggleBtn')?.textContent === 'Scheduling') {
      renderCompactYearView();
    }
    
    showStatus(`Switched to year ${newYear}`, 'success');
    setTimeout(() => hideStatus(), 2000);
  } catch (error) {
    console.error('Error switching year:', error);
    showStatus(`Error switching to year ${newYear}: ${error.message}`, 'error');
    // Reset dropdown to previous year
    event.target.value = CONFIG.year;
    setTimeout(() => hideStatus(), 5000);
  }
}

// Update calendar with filtered events
function updateCalendar(overrideSelectedPersons, overrideSelectedProjects) {
  const selectedPersons = overrideSelectedPersons ?? getSelectedPersonFilters();
  const selectedProjects = overrideSelectedProjects ?? getSelectedProjectFilters();

  let filteredEvents = allEvents.map(toFullCalendarEvent);

  if (selectedPersons.length > 0) {
    filteredEvents = filteredEvents.filter(e => selectedPersons.includes(e.extendedProps.person));
  }
  if (selectedProjects.length > 0) {
    filteredEvents = filteredEvents.filter(e => selectedProjects.includes(e.extendedProps.project));
  }

  calendar.removeAllEvents();
  calendar.addEventSource([...filteredEvents]);

  // Also update compact year view if it's active
  const overviewBtn = document.getElementById('overviewToggleBtn');
  if (overviewBtn && overviewBtn.textContent === 'Scheduling') {
    renderCompactYearView();
  }
}

// Handle date selection (create new event)
function handleDateSelect(selectInfo) {
  currentSelectInfo = selectInfo;
  currentEditingEventId = null; // Reset edit mode for new event
  
  // Populate date fields from selection
  const startDateInput = document.getElementById('eventStartDate');
  const endDateInput = document.getElementById('eventEndDate');
  
  if (startDateInput && endDateInput && selectInfo) {
    // Format dates as YYYY-MM-DD for date inputs
    startDateInput.value = formatLocalDate(selectInfo.start);
    // End date is exclusive in FullCalendar, so subtract 1 day for the input
    const endDate = new Date(selectInfo.end);
    endDate.setDate(endDate.getDate() - 1);
    endDateInput.value = formatLocalDate(endDate);
  }
  
  // Populate dropdowns
  const personSelect = document.getElementById('eventPerson');
  const projectSelect = document.getElementById('eventProject');
  const roleSelect = document.getElementById('eventRole');
  
  if (!personSelect || !projectSelect || !roleSelect) {
    console.error('Modal dropdown elements not found');
    return;
  }
  
  // Clear existing options (except first)
  personSelect.innerHTML = '<option value="">Select personnel...</option>';
  projectSelect.innerHTML = '<option value="">Select a project...</option>';
  roleSelect.innerHTML = '<option value="">Select a role...</option>';
  
  // Populate person dropdown (alpha)
  if (CONFIG.personnel && CONFIG.personnel.length > 0) {
    [...CONFIG.personnel].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' })).forEach(person => {
      const option = document.createElement('option');
      option.value = person;
      option.textContent = person;
      personSelect.appendChild(option);
    });
  }
  
  // Populate project dropdown (alpha)
  if (CONFIG.projects && CONFIG.projects.length > 0) {
    [...CONFIG.projects].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })).forEach(project => {
      const option = document.createElement('option');
      option.value = project.name;
      option.textContent = project.name;
      projectSelect.appendChild(option);
    });
  }
  
  // Populate role dropdown (alpha)
  if (CONFIG.roles && CONFIG.roles.length > 0) {
  if (roleSelect) {
    roleSelect.innerHTML = '<option value="">Select a role...</option>';
    
      [...CONFIG.roles].filter(r => r && r.trim()).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' })).forEach(role => {
          const option = document.createElement('option');
          option.value = role;
          option.textContent = role;
          roleSelect.appendChild(option);
      });
    }
  }
  
  // Reset modal title and button text for new event
  const modalTitle = document.querySelector('#eventModal h2');
  if (modalTitle) {
    modalTitle.textContent = 'Create New Assignment';
  }
  const createBtn = document.getElementById('eventCreateBtn');
  if (createBtn) {
    createBtn.textContent = 'Create';
  }
  const deleteBtn = document.getElementById('eventDeleteBtn');
  if (deleteBtn) {
    deleteBtn.style.display = 'none';
  }
  
  // Show modal
  const eventModal = document.getElementById('eventModal');
  if (eventModal) {
    eventModal.style.display = 'block';
    
    // Double-check role dropdown after modal is shown
    setTimeout(() => {
      const roleSelectCheck = document.getElementById('eventRole');
      if (roleSelectCheck && roleSelectCheck.options.length <= 1) {
        // Repopulate if still empty
        roleSelectCheck.innerHTML = '<option value="">Select a role...</option>';
        const rolesToAdd = (CONFIG.roles && CONFIG.roles.length > 0 ? CONFIG.roles : ['Project-Manager', 'Foreman', 'Shaper', 'Operator-Shaper'])
          .filter(r => r && r.trim())
          .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
        rolesToAdd.forEach(role => {
          const option = document.createElement('option');
          option.value = role;
          option.textContent = role;
          roleSelectCheck.appendChild(option);
        });
      }
    }, 100);
  }
}

// Open event modal without date selection
function openEventModal() {
  currentSelectInfo = null;
  currentEditingEventId = null; // Reset edit mode
  
  // Set default dates to today (single day event)
  const startDateInput = document.getElementById('eventStartDate');
  const endDateInput = document.getElementById('eventEndDate');
  const today = new Date();
  
  if (startDateInput && endDateInput) {
    startDateInput.value = formatLocalDate(today);
    endDateInput.value = formatLocalDate(today);
  }
  
  // Populate dropdowns
  const personSelect = document.getElementById('eventPerson');
  const projectSelect = document.getElementById('eventProject');
  const roleSelect = document.getElementById('eventRole');
  
  if (!personSelect || !projectSelect || !roleSelect) {
    console.error('Modal dropdown elements not found');
    return;
  }
  
  // Clear existing options (except first)
  personSelect.innerHTML = '<option value="">Select personnel...</option>';
  projectSelect.innerHTML = '<option value="">Select a project...</option>';
  roleSelect.innerHTML = '<option value="">Select a role...</option>';
  
  // Populate person dropdown (alpha)
  if (CONFIG.personnel && CONFIG.personnel.length > 0) {
    [...CONFIG.personnel].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' })).forEach(person => {
      const option = document.createElement('option');
      option.value = person;
      option.textContent = person;
      personSelect.appendChild(option);
    });
  }
  // Populate project dropdown (alpha)
  if (CONFIG.projects && CONFIG.projects.length > 0) {
    [...CONFIG.projects].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })).forEach(project => {
      const option = document.createElement('option');
      option.value = project.name;
      option.textContent = project.name;
      projectSelect.appendChild(option);
    });
  }
  // Populate role dropdown (alpha)
  if (CONFIG.roles && CONFIG.roles.length > 0 && roleSelect) {
    roleSelect.innerHTML = '<option value="">Select a role...</option>';
    [...CONFIG.roles].filter(r => r && r.trim()).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' })).forEach(role => {
      const option = document.createElement('option');
      option.value = role;
      option.textContent = role;
      roleSelect.appendChild(option);
    });
  }
  const eventModal = document.getElementById('eventModal');
  if (eventModal) {
    eventModal.style.display = 'block';
    setTimeout(() => {
      const roleSelectCheck = document.getElementById('eventRole');
      if (roleSelectCheck && roleSelectCheck.options.length <= 1) {
        roleSelectCheck.innerHTML = '<option value="">Select a role...</option>';
        const rolesToAdd = (CONFIG.roles && CONFIG.roles.length > 0 ? CONFIG.roles : ['Project-Manager', 'Foreman', 'Shaper', 'Operator-Shaper'])
          .filter(r => r && r.trim()).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
        rolesToAdd.forEach(role => {
          const option = document.createElement('option');
          option.value = role;
          option.textContent = role;
          roleSelectCheck.appendChild(option);
        });
      }
    }, 100);
  }
}

// Close event modal
function closeEventModal() {
  document.getElementById('eventModal').style.display = 'none';
  currentSelectInfo = null;
  currentEditingEventId = null;
  
  // Reset modal title
  const modalTitle = document.querySelector('#eventModal h2');
  if (modalTitle) {
    modalTitle.textContent = 'Create New Assignment';
  }
  
  // Reset button text
  const createBtn = document.getElementById('eventCreateBtn');
  if (createBtn) {
    createBtn.textContent = 'Create';
  }
  
  // Hide delete button
  const deleteBtn = document.getElementById('eventDeleteBtn');
  if (deleteBtn) {
    deleteBtn.style.display = 'none';
  }
  
  if (calendar) {
    calendar.unselect(); // FullCalendar API
  }
}

// Handle event creation/update from modal
async function handleEventCreate() {
  const person = document.getElementById('eventPerson').value;
  const project = document.getElementById('eventProject').value;
  const role = document.getElementById('eventRole').value;
  const startDateInput = document.getElementById('eventStartDate');
  const endDateInput = document.getElementById('eventEndDate');
  
  if (!person || !project || !role) {
    showStatus('Please select personnel, project, and role', 'error');
    return;
  }
  
  if (!startDateInput || !startDateInput.value) {
    showStatus('Please select a start date', 'error');
    return;
  }
  
  if (!endDateInput || !endDateInput.value) {
    showStatus('Please select an end date', 'error');
    return;
  }
  
  // Parse dates from inputs (use local timezone, not UTC)
  // Date input value is in YYYY-MM-DD format, parse it as local date
  const startDateParts = startDateInput.value.split('-');
  const endDateParts = endDateInput.value.split('-');
  const startDate = new Date(parseInt(startDateParts[0]), parseInt(startDateParts[1]) - 1, parseInt(startDateParts[2]));
  const endDate = new Date(parseInt(endDateParts[0]), parseInt(endDateParts[1]) - 1, parseInt(endDateParts[2]));
  
  // Validate dates are in configured year
  const year = CONFIG.year;
  if (startDate.getFullYear() !== year || endDate.getFullYear() !== year) {
    showStatus(`Dates must be in ${year}`, 'error');
    return;
  }
  
  // End date should be exclusive (day after last day) for Google Calendar
  const endDateExclusive = new Date(endDate);
  endDateExclusive.setDate(endDateExclusive.getDate() + 1);
  
  try {
    if (currentEditingEventId) {
      // Update existing event
      await updateEvent(currentEditingEventId, startDate, endDateExclusive, person, project, role);
    } else {
      // Create new event
      await createEvent(person, project, role, startDate, endDateExclusive);
    }
    closeEventModal();
  } catch (error) {
    console.error('Error saving event:', error);
    showStatus('Error saving event: ' + error.message, 'error');
  }
}

// Format date as YYYY-MM-DD in local timezone (not UTC)
function formatLocalDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// Create new event
async function createEvent(person, project, role, start, end) {
  showStatus('Creating event...', 'loading');
  
  // Use local date formatting to avoid timezone issues
  // For all-day events, Google Calendar expects dates in YYYY-MM-DD format
  // We need to use local date, not UTC, to prevent day shifts
  const startDate = formatLocalDate(start);
  // End date is already exclusive (day after last day) - no need to add another day
  const endDate = formatLocalDate(end);
  
  const event = {
    summary: `${person} - ${project} - ${role}`,
    start: {
      date: startDate
    },
    end: {
      date: endDate
    }
  };
  
  try {
    const response = await gapiClient.calendar.events.insert({
      calendarId: CONFIG.calendarId,
      resource: event
    });
    
    const createdEvent = response.result;
    allEvents.push(createdEvent);
    updateCalendar();
    refreshOverviewIfVisible();
    
    showStatus('Event created successfully', 'success');
    setTimeout(() => hideStatus(), 2000);
  } catch (error) {
    console.error('Error creating event:', error);
    if (error.status === 401) {
      handleSignOut();
      showSignInButton();
      throw new Error('Session expired. Please sign in again.');
    }
    throw error;
  }
}

// Handle event drop (move event)
async function handleEventDrop(dropInfo) {
  const event = dropInfo.event;
  const gcalEvent = event.extendedProps.gcalEvent;
  const newStart = event.start;
  const newEnd = event.end || event.start;
  
  // Validate year
  const year = CONFIG.year;
  if (newStart.getFullYear() !== year || newEnd.getFullYear() !== year) {
    showStatus(`Events must stay within ${year}`, 'error');
    updateCalendar(); // Refresh to revert the change
    return;
  }
  
  try {
    await updateEvent(gcalEvent.id, dropInfo.event.start, dropInfo.event.end);
    refreshOverviewIfVisible();
    requestAnimationFrame(() => {
      updateCalendar();
      refreshOverviewIfVisible();
    });
  } catch (error) {
    console.error('Error updating event:', error);
    showStatus('Error updating event: ' + error.message, 'error');
    // Revert the change
    dropInfo.revert();
  }
}

// Handle event resize
async function handleEventResize(resizeInfo) {
  const event = resizeInfo.event;
  const gcalEvent = event.extendedProps.gcalEvent;
  const newStart = event.start;
  const newEnd = event.end || event.start;
  
  // Validate year
  const year = CONFIG.year;
  if (newStart.getFullYear() !== year || newEnd.getFullYear() !== year) {
    showStatus(`Events must stay within ${year}`, 'error');
    updateCalendar(); // Refresh to revert the change
    return;
  }
  
  try {
    await updateEvent(gcalEvent.id, resizeInfo.event.start, resizeInfo.event.end);
    await loadEvents(); // Reload events to sync with Google Calendar
    refreshOverviewIfVisible();
  } catch (error) {
    console.error('Error updating event:', error);
    showStatus('Error updating event: ' + error.message, 'error');
    resizeInfo.revert();
  }
}

// Update event
async function updateEvent(eventId, start, end, person, project, role) {
  showStatus('Updating event...', 'loading');
  
  // Find the original event
  const gcalEvent = allEvents.find(e => e.id === eventId);
  if (!gcalEvent) {
    throw new Error('Event not found');
  }
  
  // Use local date formatting to avoid timezone issues
  const startDate = formatLocalDate(start);
  // End date from FullCalendar is already exclusive (day after last day), so don't add another day
  const endDate = formatLocalDate(end);
  
  const update = {
    ...gcalEvent,
    start: {
      date: startDate
    },
    end: {
      date: endDate
    }
  };
  
  // Only update summary if person, project, and role are provided (from modal edit)
  // Otherwise preserve original summary (from drag/resize)
  if (person && project && role) {
    update.summary = `${person} - ${project} - ${role}`;
  }
  
  try {
    const response = await gapiClient.calendar.events.update({
      calendarId: CONFIG.calendarId,
      eventId: eventId,
      resource: update
    });
    
    const updatedEvent = response.result;
    const index = allEvents.findIndex(e => e.id === eventId);
    if (index !== -1) {
      allEvents[index] = updatedEvent;
    }
    
    updateCalendar();
    refreshOverviewIfVisible();
    
    showStatus('Event updated successfully', 'success');
    setTimeout(() => hideStatus(), 2000);
  } catch (error) {
    console.error('Error updating event:', error);
    if (error.status === 401) {
      handleSignOut();
      showSignInButton();
      throw new Error('Session expired. Please sign in again.');
    }
    throw error;
  }
}

// Handle event click (edit)
async function handleEventClick(clickInfo) {
  const gcalEvent = clickInfo.event.extendedProps.gcalEvent;
  const { person, project, role } = parseEvent(gcalEvent);
  
  // Store the event ID for editing
  currentEditingEventId = gcalEvent.id;
  
  // Populate date fields
  const startDateInput = document.getElementById('eventStartDate');
  const endDateInput = document.getElementById('eventEndDate');
  
  if (startDateInput && endDateInput) {
    // Parse start date (all-day events use date, not dateTime)
    const startDate = gcalEvent.start.date || gcalEvent.start.dateTime;
    const endDate = gcalEvent.end.date || gcalEvent.end.dateTime;
    
    // Format dates for inputs
    const start = new Date(startDate);
    const end = new Date(endDate);
    
    startDateInput.value = formatLocalDate(start);
    // End date is exclusive, so subtract 1 day for the input
    const endDateForInput = new Date(end);
    endDateForInput.setDate(endDateForInput.getDate() - 1);
    endDateInput.value = formatLocalDate(endDateForInput);
  }
  
  // Populate dropdowns
  const personSelect = document.getElementById('eventPerson');
  const projectSelect = document.getElementById('eventProject');
  const roleSelect = document.getElementById('eventRole');
  
  if (!personSelect || !projectSelect || !roleSelect) {
    console.error('Modal dropdown elements not found');
    return;
  }
  
  // Clear and populate person dropdown (alpha)
  personSelect.innerHTML = '<option value="">Select personnel...</option>';
  if (CONFIG.personnel && CONFIG.personnel.length > 0) {
    [...CONFIG.personnel].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' })).forEach(p => {
      const option = document.createElement('option');
      option.value = p;
      option.textContent = p;
      if (p === person) option.selected = true;
      personSelect.appendChild(option);
    });
  }
  // Clear and populate project dropdown (alpha)
  projectSelect.innerHTML = '<option value="">Select a project...</option>';
  if (CONFIG.projects && CONFIG.projects.length > 0) {
    [...CONFIG.projects].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })).forEach(proj => {
      const option = document.createElement('option');
      option.value = proj.name;
      option.textContent = proj.name;
      if (proj.name === project) option.selected = true;
      projectSelect.appendChild(option);
    });
  }
  // Clear and populate role dropdown (alpha)
  roleSelect.innerHTML = '<option value="">Select a role...</option>';
  if (CONFIG.roles && CONFIG.roles.length > 0) {
    [...CONFIG.roles].filter(r => r && r.trim()).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' })).forEach(r => {
      const option = document.createElement('option');
      option.value = r;
      option.textContent = r;
      if (r === role) option.selected = true;
      roleSelect.appendChild(option);
    });
  }
  
  // Update modal title
  const modalTitle = document.querySelector('#eventModal h2');
  if (modalTitle) {
    modalTitle.textContent = 'Edit Assignment';
  }
  
  // Update button text
  const createBtn = document.getElementById('eventCreateBtn');
  if (createBtn) {
    createBtn.textContent = 'Update';
  }
  
  // Show delete button
  const deleteBtn = document.getElementById('eventDeleteBtn');
  if (deleteBtn) {
    deleteBtn.style.display = 'inline-block';
  }
  
  // Show modal
  const eventModal = document.getElementById('eventModal');
  if (eventModal) {
    eventModal.style.display = 'block';
  }
}

// Delete event
async function deleteEvent(eventId) {
  showStatus('Deleting event...', 'loading');
  
  try {
    await gapiClient.calendar.events.delete({
      calendarId: CONFIG.calendarId,
      eventId: eventId
    });
    
    allEvents = allEvents.filter(e => e.id !== eventId);
    updateCalendar();
    
    showStatus('Event deleted successfully', 'success');
    setTimeout(() => hideStatus(), 2000);
  } catch (error) {
    console.error('Error deleting event:', error);
    if (error.status === 401) {
      handleSignOut();
      showSignInButton();
      throw new Error('Session expired. Please sign in again.');
    }
    throw error;
  }
}

// Status message helpers
function showStatus(message, type = 'loading') {
  const statusEl = document.getElementById('status');
  statusEl.textContent = message;
  statusEl.className = `status ${type}`;
  statusEl.style.display = 'block';
}

function hideStatus() {
  document.getElementById('status').style.display = 'none';
}

// Show people management modal
function showPeopleModal() {
  updatePeopleList();
  document.getElementById('peopleModal').style.display = 'block';
}

// Update people list display
function updatePeopleList() {
  const peopleList = document.getElementById('peopleList');
  peopleList.innerHTML = '';
  
  if (CONFIG.personnel.length === 0) {
    peopleList.innerHTML = '<p style="color: #999; padding: 10px;">No personnel added yet.</p>';
    return;
  }
  
  [...CONFIG.personnel].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' })).forEach(person => {
    const index = CONFIG.personnel.indexOf(person);
    const item = document.createElement('div');
    item.className = 'item-list-item';
    item.innerHTML = `
      <span class="item-name">${person}</span>
      <div class="item-actions">
        <button class="btn btn-small btn-secondary" onclick="removePerson(${index})">Remove</button>
      </div>
    `;
    peopleList.appendChild(item);
  });
}

// Add person
function addPerson() {
  const nameInput = document.getElementById('newPersonName');
  const name = nameInput.value.trim();
  
  if (!name) {
    showStatus('Please enter a personnel name', 'error');
    return;
  }
  
  // Check if person already exists
  const exists = CONFIG.personnel.includes(name);
  if (exists) {
    showStatus('Personnel already exists', 'error');
    return;
  }
  
  CONFIG.personnel.push(name);
  saveConfig();
  updatePeopleList();
  updateFilters();
  // Ensure new person is included in the filter (checkbox checked); defer so DOM is updated
  requestAnimationFrame(() => {
    const personCheckboxes = document.querySelectorAll('#personFilterCheckboxes input[type="checkbox"]');
    personCheckboxes.forEach(cb => { if (cb.value === name) cb.checked = true; });
    updateFilterButtonLabels();
    updateCalendar();
    if (document.getElementById('compactYearView')?.classList.contains('visible')) {
      renderCompactYearView();
    }
  });
  nameInput.value = '';
  showStatus('Personnel added successfully', 'success');
  setTimeout(() => hideStatus(), 2000);
}

// Remove person (and all events assigned to this person)
async function removePerson(index) {
  const personName = CONFIG.personnel[index];
  if (!confirm(`Remove "${personName}"? All events assigned to this person will be deleted from the calendar.`)) return;
  const eventsToDelete = allEvents.filter(e => {
    const { person } = parseEvent(e);
    return person === personName;
  });
  if (eventsToDelete.length > 0) {
    showStatus(`Deleting ${eventsToDelete.length} event(s)...`, 'loading');
    try {
      for (const e of eventsToDelete) {
        await gapiClient.calendar.events.delete({
          calendarId: CONFIG.calendarId,
          eventId: e.id
        });
      }
      const ids = new Set(eventsToDelete.map(e => e.id));
      allEvents = allEvents.filter(e => !ids.has(e.id));
      updateCalendar();
      refreshOverviewIfVisible();
    } catch (err) {
      console.error('Error deleting events for person:', err);
      if (err.status === 401) {
        handleSignOut();
        showSignInButton();
      }
      showStatus('Failed to delete some events. Person not removed.', 'error');
      setTimeout(() => hideStatus(), 4000);
      return;
    }
  }
  CONFIG.personnel.splice(index, 1);
  saveConfig();
  updatePeopleList();
  updateFilters();
  const compactYearView = document.getElementById('compactYearView');
  if (compactYearView && compactYearView.classList.contains('visible')) {
    renderCompactYearView();
  }
  showStatus(eventsToDelete.length > 0 ? `Personnel and ${eventsToDelete.length} event(s) removed` : 'Personnel removed', 'success');
  setTimeout(() => hideStatus(), 2000);
}

// Show projects management modal
function showProjectsModal() {
  updateProjectsList();
  document.getElementById('projectsModal').style.display = 'block';
}

// Update projects list display
function updateProjectsList() {
  const projectsList = document.getElementById('projectsList');
  projectsList.innerHTML = '';
  
  if (CONFIG.projects.length === 0) {
    projectsList.innerHTML = '<p style="color: #999; padding: 10px;">No projects added yet.</p>';
    return;
  }
  
  [...CONFIG.projects].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })).forEach(project => {
    const index = CONFIG.projects.indexOf(project);
    const projectName = project.name;
    const projectColor = project.color || '#4285f4';
    const item = document.createElement('div');
    item.className = 'item-list-item';
    item.innerHTML = `
      <div class="role-color-container">
        <div class="role-color-preview" style="background-color: ${projectColor};" data-index="${index}"></div>
        <input type="color" class="role-color-picker" value="${projectColor}" data-index="${index}" title="Click to change color">
      </div>
      <span class="item-name">${projectName}</span>
      <div class="item-actions">
        <button class="btn btn-small btn-secondary" onclick="removeProject(${index})">Remove</button>
      </div>
    `;
    projectsList.appendChild(item);
    const colorPicker = item.querySelector('.role-color-picker');
    const colorPreview = item.querySelector('.role-color-preview');
    colorPicker.addEventListener('change', (e) => {
      const newColor = e.target.value;
      CONFIG.projects[index].color = newColor;
      // Update preview immediately
      colorPreview.style.backgroundColor = newColor;
      saveConfig();
      updateCalendar();
      updatePersonnelLegend();
      if (document.getElementById('overviewToggleBtn')?.textContent === 'Scheduling') {
        renderCompactYearView();
      }
    });
    
    // Click on preview to trigger color picker
    colorPreview.addEventListener('click', () => {
      colorPicker.click();
    });
  });
}

// Add project
function addProject() {
  const nameInput = document.getElementById('newProjectName');
  const colorInput = document.getElementById('newProjectColor');
  const name = nameInput.value.trim();
  const color = colorInput.value;
  
  if (!name) {
    showStatus('Please enter a project name', 'error');
    return;
  }
  
  // Check if project already exists
  const exists = CONFIG.projects.some(p => p.name === name);
  if (exists) {
    showStatus('Project already exists', 'error');
    return;
  }
  
  CONFIG.projects.push({ name: name, color: color });
  saveConfig();
  updateProjectsList();
  updateFilters();
  updatePersonnelLegend();
  // Ensure new project is included in the filter (checkbox checked); defer so DOM is updated
  requestAnimationFrame(() => {
    const projectCheckboxes = document.querySelectorAll('#projectFilterCheckboxes input[type="checkbox"]');
    projectCheckboxes.forEach(cb => { if (cb.value === name) cb.checked = true; });
    updateFilterButtonLabels();
    updateCalendar();
    if (document.getElementById('overviewToggleBtn')?.textContent === 'Scheduling') {
      renderCompactYearView();
    }
  });
  nameInput.value = '';
  colorInput.value = '#4285f4';
  showStatus('Project added successfully', 'success');
  setTimeout(() => hideStatus(), 2000);
}

// Remove project (and all events assigned to this project)
async function removeProject(index) {
  const project = CONFIG.projects[index];
  const projectName = project.name;
  if (!confirm(`Remove "${projectName}"? All events for this project will be deleted from the calendar.`)) return;
  const eventsToDelete = allEvents.filter(e => {
    const { project: evProject } = parseEvent(e);
    return evProject === projectName;
  });
  if (eventsToDelete.length > 0) {
    showStatus(`Deleting ${eventsToDelete.length} event(s)...`, 'loading');
    try {
      for (const e of eventsToDelete) {
        await gapiClient.calendar.events.delete({
          calendarId: CONFIG.calendarId,
          eventId: e.id
        });
      }
      const ids = new Set(eventsToDelete.map(e => e.id));
      allEvents = allEvents.filter(e => !ids.has(e.id));
      updateCalendar();
      refreshOverviewIfVisible();
    } catch (err) {
      console.error('Error deleting events for project:', err);
      if (err.status === 401) {
        handleSignOut();
        showSignInButton();
      }
      showStatus('Failed to delete some events. Project not removed.', 'error');
      setTimeout(() => hideStatus(), 4000);
      return;
    }
  }
  CONFIG.projects.splice(index, 1);
  saveConfig();
  updateProjectsList();
  updateFilters();
  updatePersonnelLegend();
  if (document.getElementById('overviewToggleBtn')?.textContent === 'Scheduling') {
    renderCompactYearView();
  }
  showStatus(eventsToDelete.length > 0 ? `Project and ${eventsToDelete.length} event(s) removed` : 'Project removed', 'success');
  setTimeout(() => hideStatus(), 2000);
}

// Update filter dropdowns
function updatePersonnelLegend() {
  const legendContainer = document.getElementById('personnelLegend');
  if (!legendContainer) return;
  
  const legendItems = CONFIG.projects.map(project => {
    const projectName = project.name;
    const projectColor = project.color || '#4285f4';
    return `<div class="personnel-legend-item">
      <div class="personnel-legend-color" style="background-color: ${projectColor};"></div>
      <span class="personnel-legend-name">${projectName}</span>
    </div>`;
  }).join('');
  
  legendContainer.innerHTML = legendItems;
}

function updateFilters() {
  populateFilterCheckboxes();
  updateCalendar();
}

// Show roles management modal
function showRolesModal() {
  updateRolesList();
  document.getElementById('rolesModal').style.display = 'block';
}

// Update roles list display
function updateRolesList() {
  const rolesList = document.getElementById('rolesList');
  rolesList.innerHTML = '';
  
  if (CONFIG.roles.length === 0) {
    rolesList.innerHTML = '<p style="color: #999; padding: 10px;">No roles added yet.</p>';
    return;
  }
  
  [...CONFIG.roles].filter(r => r && r.trim()).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' })).forEach(role => {
    const index = CONFIG.roles.indexOf(role);
    const item = document.createElement('div');
    item.className = 'item-list-item';
    item.innerHTML = `
      <span class="item-name">${role}</span>
      <div class="item-actions">
        <button class="btn btn-small btn-secondary" onclick="removeRole(${index})">Remove</button>
      </div>
    `;
    rolesList.appendChild(item);
  });
}

// Add role
function addRole() {
  const nameInput = document.getElementById('newRoleName');
  const name = nameInput.value.trim();
  
  if (!name) {
    showStatus('Please enter a role name', 'error');
    return;
  }
  
  // Check if role already exists
  const exists = CONFIG.roles.includes(name);
  if (exists) {
    showStatus('Role already exists', 'error');
    return;
  }
  
  // Roles are now just strings (no color)
  CONFIG.roles.push(name);
  saveConfig();
  updateRolesList();
  updatePersonnelLegend();
  
  // Re-render compact year view if it's currently visible
  const compactYearView = document.getElementById('compactYearView');
  if (compactYearView && compactYearView.classList.contains('visible')) {
    renderCompactYearView();
  }
  
  nameInput.value = '';
  showStatus('Role added successfully', 'success');
  setTimeout(() => hideStatus(), 2000);
}

// Remove role
function removeRole(index) {
  const role = CONFIG.roles[index];
  if (confirm(`Remove "${role}"?`)) {
    CONFIG.roles.splice(index, 1);
    saveConfig();
    updateRolesList();
    updatePersonnelLegend();
    
    // Re-render compact year view if it's currently visible
    const compactYearView = document.getElementById('compactYearView');
    if (compactYearView && compactYearView.classList.contains('visible')) {
      renderCompactYearView();
    }
    
    showStatus('Role removed', 'success');
    setTimeout(() => hideStatus(), 2000);
  }
}

// Make remove functions globally accessible
window.removePerson = removePerson;
window.removeProject = removeProject;
window.removeRole = removeRole;

// Refresh overview if it's currently visible
function refreshOverviewIfVisible() {
  const compactYearView = document.getElementById('compactYearView');
  const overviewBtn = document.getElementById('overviewToggleBtn');
  if (compactYearView && overviewBtn && overviewBtn.textContent === 'Scheduling') {
    renderCompactYearView();
  }
}

// Compact Year View - Months as columns, weeks as rows
function showCompactYearView() {
  const calendarEl = document.getElementById('calendar');
  const compactViewEl = document.getElementById('compactYearView');
  const headerTodayBtn = document.getElementById('headerTodayBtn');
  
  if (calendarEl) {
    calendarEl.classList.add('hidden');
  }
  if (compactViewEl) {
    compactViewEl.classList.add('visible');
    // Use requestAnimationFrame to ensure CSS has applied before rendering
    requestAnimationFrame(() => {
      renderCompactYearView();
    });
  }
  // Show Today button in header
  if (headerTodayBtn) {
    headerTodayBtn.style.display = 'inline-block';
  }
}

function hideCompactYearView() {
  const calendarEl = document.getElementById('calendar');
  const compactViewEl = document.getElementById('compactYearView');
  const headerTodayBtn = document.getElementById('headerTodayBtn');
  
  if (compactViewEl) {
    compactViewEl.classList.remove('visible');
    compactViewEl.innerHTML = ''; // Clear content to prevent any rendering issues
  }
  if (calendarEl) {
    calendarEl.classList.remove('hidden');
    // Force calendar to recalculate size after becoming visible (FullCalendar API)
    if (calendar) {
      requestAnimationFrame(() => {
        calendar.updateSize();
      });
    }
  }
  // Hide Today button in header
  if (headerTodayBtn) {
    headerTodayBtn.style.display = 'none';
  }
}

// Calculate ISO week number
function getISOWeekNumber(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
}

function renderCompactYearView() {
  const container = document.getElementById('compactYearView');
  const year = CONFIG.year;

  // Get filtered events (toFullCalendarEvent produces FullCalendar event shape; we reuse for overview)
  const selectedPersons = getSelectedPersonFilters();
  const selectedProjects = getSelectedProjectFilters();

  let filteredEvents = allEvents.map(toFullCalendarEvent);

  if (selectedPersons.length > 0) {
    filteredEvents = filteredEvents.filter(e => selectedPersons.includes(e.extendedProps.person));
  }
  if (selectedProjects.length > 0) {
    filteredEvents = filteredEvents.filter(e => selectedProjects.includes(e.extendedProps.project));
  }
  
  // Group events by project, then by person+role combination
  // Include ALL events - valid ones grouped normally, invalid ones in a special section
  const eventsByProjectPersonRole = {};
  const invalidEvents = []; // Track invalid events separately
  
  filteredEvents.forEach(event => {
    try {
      const project = event.extendedProps.project || '';
      const person = event.extendedProps.person || '';
      const role = event.extendedProps.role || '';
      
      // Check if event is valid (has person, project, role and they exist in CONFIG)
      const projectExists = CONFIG.projects.some(p => p.name === project);
      const personExists = CONFIG.personnel.includes(person);
      const roleExists = CONFIG.roles.includes(role);
      
      const isValid = project && person && role && 
                      project.trim() !== '' && person.trim() !== '' && role.trim() !== '' &&
                      projectExists && personExists && roleExists;
      
      if (!isValid) {
        // Store invalid events separately
        invalidEvents.push(event);
        return;
      }
      
      // Process valid events normally
      const personRoleKey = `${person}|||${role}`;
      
      if (!eventsByProjectPersonRole[project]) {
        eventsByProjectPersonRole[project] = {};
      }
      if (!eventsByProjectPersonRole[project][personRoleKey]) {
        eventsByProjectPersonRole[project][personRoleKey] = {
          person: person,
          role: role,
          events: []
        };
      }
      eventsByProjectPersonRole[project][personRoleKey].events.push(event);
    } catch (error) {
      console.error('Error processing event:', error, event);
      // Add to invalid events if processing fails
      invalidEvents.push(event);
    }
  });
  
  // Create a map of all dates for each person+role in each project
  const personRoleDatesByProject = {};
  // Build a map to detect conflicts: dateKey -> Map of personnel -> count
  const personnelCountByDate = {};
  
  Object.keys(eventsByProjectPersonRole).forEach(project => {
    personRoleDatesByProject[project] = {};
    Object.keys(eventsByProjectPersonRole[project]).forEach(personRoleKey => {
      const { person, role, events } = eventsByProjectPersonRole[project][personRoleKey];
      const dateSet = new Set();
      
      events.forEach(event => {
        try {
          const start = new Date(event.start);
          const end = new Date(event.end);
          
          // Validate dates
          if (isNaN(start.getTime()) || isNaN(end.getTime())) {
            console.warn('Skipping event with invalid dates:', event);
            return;
          }
          
          const current = new Date(start);
          
          // End date is exclusive in Google Calendar, so iterate while current < end (not <=)
          while (current < end) {
            // Use local date formatting to avoid timezone issues
            const dateKey = formatLocalDate(current);
            dateSet.add(dateKey);
            
            // Track personnel assignments per date for conflict detection
            if (!personnelCountByDate[dateKey]) {
              personnelCountByDate[dateKey] = {};
            }
            if (!personnelCountByDate[dateKey][person]) {
              personnelCountByDate[dateKey][person] = 0;
            }
            personnelCountByDate[dateKey][person]++;
            
            current.setDate(current.getDate() + 1);
          }
        } catch (error) {
          console.error('Error processing event dates:', error, event);
          // Continue with next event
        }
      });
      
      personRoleDatesByProject[project][personRoleKey] = {
        person,
        role,
        dates: Array.from(dateSet).sort()
      };
    });
  });
  
  // Find dates with conflicts (same personnel assigned more than once)
  const conflictedDates = new Set();
  Object.keys(personnelCountByDate).forEach(dateKey => {
    const personnelCounts = personnelCountByDate[dateKey];
    // Check if any personnel appears more than once on this date
    Object.keys(personnelCounts).forEach(person => {
      if (personnelCounts[person] > 1) {
        conflictedDates.add(dateKey);
      }
    });
  });
  
  // Get projects that have valid person+role assignments
  const projectsWithAssignments = new Set();
  Object.keys(personRoleDatesByProject).forEach(project => {
    const combos = personRoleDatesByProject[project] || {};
    const validKeys = Object.keys(combos).filter(key => {
      const combo = combos[key];
      return combo && combo.person && combo.role && combo.dates && combo.dates.length > 0;
    });
    if (validKeys.length > 0) {
      projectsWithAssignments.add(project);
    }
  });
  
  // Process invalid events and add them to personRoleDatesByProject
  if (invalidEvents.length > 0) {
    // Group invalid events by their original summary for display
    const invalidBySummary = {};
    invalidEvents.forEach(event => {
      const summary = event.extendedProps.gcalEvent?.summary || 'Untitled Event';
      if (!invalidBySummary[summary]) {
        invalidBySummary[summary] = [];
      }
      invalidBySummary[summary].push(event);
    });
    
    // Add each invalid event group as a row
    Object.keys(invalidBySummary).forEach(summary => {
      const events = invalidBySummary[summary];
      const specialProject = '⚠️ Unformatted Events';
      
      if (!personRoleDatesByProject[specialProject]) {
        personRoleDatesByProject[specialProject] = {};
      }
      
      events.forEach(event => {
        // Use summary as the person-role key
        const personRoleKey = `${summary}|||Unformatted`;
        if (!personRoleDatesByProject[specialProject][personRoleKey]) {
          personRoleDatesByProject[specialProject][personRoleKey] = {
            person: summary,
            role: 'Unformatted',
            dates: []
          };
        }
        
        // Process dates for invalid events
        try {
          const start = new Date(event.start);
          const end = new Date(event.end);
          if (!isNaN(start.getTime()) && !isNaN(end.getTime())) {
            const current = new Date(start);
            const dateSet = new Set();
            while (current < end) {
              const dateKey = formatLocalDate(current);
              dateSet.add(dateKey);
              current.setDate(current.getDate() + 1);
            }
            // Merge dates with existing ones
            const existingDates = personRoleDatesByProject[specialProject][personRoleKey].dates;
            const newDates = Array.from(dateSet);
            personRoleDatesByProject[specialProject][personRoleKey].dates = 
              [...new Set([...existingDates, ...newDates])].sort();
          }
        } catch (error) {
          console.error('Error processing dates for invalid event:', error);
        }
      });
    });
    
    // Add to projects with assignments
    if (Object.keys(personRoleDatesByProject['⚠️ Unformatted Events'] || {}).length > 0) {
      projectsWithAssignments.add('⚠️ Unformatted Events');
    }
  }
  
  // Get projects to show: ONLY show projects with valid assignments (no empty rows from CONFIG)
  // Order by earliest date that has at least one assignment (Unformatted Events last)
  const earliestDateByProject = {};
  projectsWithAssignments.forEach(project => {
    const combos = personRoleDatesByProject[project] || {};
    let earliest = null;
    Object.keys(combos).forEach(key => {
      const dates = combos[key]?.dates;
      if (dates && dates.length > 0) {
        const first = dates[0];
        if (earliest === null || first < earliest) earliest = first;
      }
    });
    // YYYY-MM-DD strings compare correctly; put Unformatted Events last
    earliestDateByProject[project] = project === '⚠️ Unformatted Events' ? '9999-12-31' : (earliest || '9999-12-31');
  });
  let projectsToShow = selectedProjects.length > 0
    ? selectedProjects.filter(p => projectsWithAssignments.has(p)).sort((a, b) => (earliestDateByProject[a] || '').localeCompare(earliestDateByProject[b] || ''))
    : Array.from(projectsWithAssignments).sort((a, b) => (earliestDateByProject[a] || '').localeCompare(earliestDateByProject[b] || ''));

  projectsToShow = [...new Set(projectsToShow)].filter(p => p && p.trim() !== '' && p !== '...');
  
  
  // Generate HTML
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const dayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  
  // Generate all days for configured year
  const allDays = [];
  const years = [year];
  years.forEach(yearNum => {
    for (let month = 0; month < 12; month++) {
      const lastDay = new Date(yearNum, month + 1, 0);
      const daysInMonth = lastDay.getDate();
      for (let day = 1; day <= daysInMonth; day++) {
        const date = new Date(yearNum, month, day);
        // Use local date formatting to avoid timezone issues
        const dateKey = formatLocalDate(date);
        const dayOfWeek = date.getDay();
        const dayName = dayNames[dayOfWeek === 0 ? 6 : dayOfWeek - 1];
        const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
        const weekNumber = getISOWeekNumber(date);
        
        allDays.push({
          date,
          dateKey,
          day,
          month,
          year: yearNum,
          dayName,
          isWeekend,
          weekNumber,
          monthName: monthNames[month]
        });
      }
    }
  });
  
  // Build proper table structure like CSV
  let html = `<div class="project-overview-container">
    <div class="overview-table-wrapper">
      <table class="overview-table">
      <thead>
        <!-- Row 1: Month headers -->
        <tr class="header-row-month">
          <th class="project-col-header" rowspan="3">Project</th>
          <th class="role-col-header" rowspan="3">Role</th>
          <th class="person-col-header" rowspan="3">Personnel</th>`;
  
  // Month header row - group days by month
  let currentMonth = null;
  let monthStartIndex = 0;
  allDays.forEach((dayInfo, index) => {
    const monthKey = `${dayInfo.year}-${dayInfo.month}`;
    if (currentMonth !== monthKey) {
      if (currentMonth !== null) {
        // Close previous month header
        const monthSpan = index - monthStartIndex;
        html += `<th class="month-header" colspan="${monthSpan}">${allDays[monthStartIndex].monthName} ${allDays[monthStartIndex].year}</th>`;
      }
      // Start new month header
      monthStartIndex = index;
      currentMonth = monthKey;
    }
  });
  // Close last month header
  if (currentMonth !== null) {
    const monthSpan = allDays.length - monthStartIndex;
    html += `<th class="month-header" colspan="${monthSpan}">${allDays[monthStartIndex].monthName} ${allDays[monthStartIndex].year}</th>`;
  }
  html += `</tr>`;
  
  // Row 2: Week number headers
  html += `<tr class="header-row-week">`;
  let currentWeek = null;
  let weekStartIndex = 0;
  allDays.forEach((dayInfo, index) => {
    const weekKey = `${dayInfo.year}-W${dayInfo.weekNumber}`;
    if (currentWeek !== weekKey) {
      if (currentWeek !== null) {
        // Close previous week header
        const weekSpan = index - weekStartIndex;
        html += `<th class="week-header" colspan="${weekSpan}">KW${allDays[weekStartIndex].weekNumber}</th>`;
      }
      weekStartIndex = index;
      currentWeek = weekKey;
    }
  });
  // Close last week header
  if (currentWeek !== null) {
    const weekSpan = allDays.length - weekStartIndex;
    html += `<th class="week-header" colspan="${weekSpan}">KW${allDays[weekStartIndex].weekNumber}</th>`;
  }
  html += `</tr>`;
  
  // Row 3: Day name headers (weekday only)
  html += `<tr class="header-row-day">`;
  allDays.forEach(dayInfo => {
    const hasConflict = conflictedDates.has(dayInfo.dateKey);
    const conflictClass = hasConflict ? 'conflict' : '';
    html += `<th class="day-header ${dayInfo.isWeekend ? 'weekend' : ''} ${conflictClass}" title="${dayInfo.dateKey}">
      ${dayInfo.dayName}
    </th>`;
  });
  html += `</tr>
      </thead>
      <tbody>`;
  
  // Group data rows by project (one card per project)
  projectsToShow.forEach(project => {
    const projectName = project; // projectsToShow contains project names as strings
    // For unformatted events, use gray color
    const projectColor = projectName === '⚠️ Unformatted Events' ? '#9aa0a6' : getProjectColor(projectName);
    
    // Skip if project name is invalid
    if (!projectName || projectName.trim() === '' || projectName === '...') {
      return;
    }
    
    // Get all person+role combinations for this project
    const personRoleCombos = personRoleDatesByProject[project] || {};
    const personRoleKeys = Object.keys(personRoleCombos).filter(key => {
      const combo = personRoleCombos[key];
      return combo && combo.person && combo.role && combo.dates && combo.dates.length > 0;
    });
    
    // Sort by CONFIG.roles order first, then by CONFIG.personnel order
    const rolesOrder = CONFIG.roles || ['Project-Manager', 'Foreman', 'Shaper', 'Operator-Shaper'];
    const peopleOrder = CONFIG.personnel;
    
    personRoleKeys.sort((a, b) => {
      const comboA = personRoleCombos[a];
      const comboB = personRoleCombos[b];
      
      // First sort by role order
      const roleIndexA = rolesOrder.indexOf(comboA.role);
      const roleIndexB = rolesOrder.indexOf(comboB.role);
      if (roleIndexA !== roleIndexB) {
        // If role not found in config, put it at the end
        if (roleIndexA === -1) return 1;
        if (roleIndexB === -1) return -1;
        return roleIndexA - roleIndexB;
      }
      
      // Then sort by person order
      const personIndexA = peopleOrder.indexOf(comboA.person);
      const personIndexB = peopleOrder.indexOf(comboB.person);
      if (personIndexA !== personIndexB) {
        // If person not found in config, put it at the end
        if (personIndexA === -1) return 1;
        if (personIndexB === -1) return -1;
        return personIndexA - personIndexB;
      }
      
      return 0;
    });
    
    // Skip projects with no valid assignments
    if (personRoleKeys.length === 0) {
      return;
    }
    
    // For each person+role combination, create a row
    personRoleKeys.forEach((personRoleKey, index) => {
      const { person, role, dates } = personRoleCombos[personRoleKey];
      
      if (!person || !role || !dates || dates.length === 0) {
        return;
      }
      
      const dateSet = new Set(dates);
      const isFirstRow = index === 0;
      const rowSpan = personRoleKeys.length;
      
      // Check if this person has conflicts on any of their assigned dates
      const hasPersonConflict = dates.some(dateKey => {
        return conflictedDates.has(dateKey) && 
               personnelCountByDate[dateKey] && 
               personnelCountByDate[dateKey][person] > 1;
      });
      const personColClass = hasPersonConflict ? 'person-col conflict' : 'person-col';
      
      // Apply semi-transparent project color to row
      const projectColorRgba = hexToRgba(projectColor, 0.15);
      html += `<tr class="data-row" style="background-color: ${projectColorRgba};">`;
      
      // Project column (only in first row, spans all rows for this project, rotated 90°)
      if (isFirstRow) {
        html += `<td class="project-col" rowspan="${rowSpan}" style="background-color: ${projectColor};" title="${projectName}">
          <div class="project-name-rotated">${projectName}</div>
        </td>`;
      }
      
      // Role column with project color
      html += `<td class="role-col" style="background-color: ${projectColor};" title="${role}">${role}</td>`;
      
      // Person column with project color (diagonal stripe pattern if this person has conflicts)
      html += `<td class="${personColClass}" style="background-color: ${projectColor};" title="${person}">${person}</td>`;
      
      // Day cells
      allDays.forEach((dayInfo, dayIndex) => {
        const hasPerson = dateSet.has(dayInfo.dateKey);
        // Use local date to avoid timezone issues
        const today = new Date();
        const todayKey = formatLocalDate(today);
        const isToday = dayInfo.dateKey === todayKey;
        
        // Check if this is start, middle, or end of a bar span
        const prevDay = dayIndex > 0 ? allDays[dayIndex - 1] : null;
        const nextDay = dayIndex < allDays.length - 1 ? allDays[dayIndex + 1] : null;
        const hasPrev = prevDay && dateSet.has(prevDay.dateKey);
        const hasNext = nextDay && dateSet.has(nextDay.dateKey);
        
        let barClass = '';
        if (hasPerson) {
          if (hasPrev && hasNext) {
            barClass = 'bar-middle';
          } else if (hasPrev) {
            barClass = 'bar-end';
          } else if (hasNext) {
            barClass = 'bar-start';
          } else {
            barClass = 'bar-single';
          }
        }
        
        // For weekend cells, add semi-transparent project color overlay
        const weekendOverlay = dayInfo.isWeekend ? `background-color: ${hexToRgba(projectColor, 0.3)};` : '';
        html += `<td class="day-cell ${isToday ? 'today' : ''} ${hasPerson ? 'has-personnel' : ''} ${dayInfo.isWeekend ? 'weekend' : ''} ${barClass}" 
          data-date="${dayInfo.dateKey}"
          data-person="${person}"
          style="${weekendOverlay}"
          title="${dayInfo.date.toLocaleDateString()} - ${projectName} - ${person} (${role})">`;
        
        html += `<div class="day-number-in-cell">${dayInfo.day}</div>`;
        
        if (hasPerson) {
          html += `<div class="person-role-bar" style="background-color: ${projectColor};"></div>`;
        }
        
        html += `</td>`;
      });
      
      html += `</tr>`;
    });
    
    // End project card group - add separator row
    html += `<tr class="project-group-end">
      <td class="project-separator-left" colspan="3"></td>`;
    
    allDays.forEach(() => {
      html += `<td class="project-separator-cell"></td>`;
    });
    
    html += `</tr>`;
  });
  
  html += `</tbody>
      </table>
    </div>
  </div>`;
  
  container.innerHTML = html;

  // Auto-scroll to today on initial load
  setTimeout(() => {
    const todayCell = container.querySelector('.day-cell.today');
    if (todayCell) {
      todayCell.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
    }
  }, 100);
  
  // No click handlers - this is a read-only presentation view
}

// Initialize when page loads
document.addEventListener('DOMContentLoaded', init);

