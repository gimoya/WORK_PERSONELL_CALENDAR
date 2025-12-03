// Personnel Planning Calendar Application

let calendar = null;
let gapiClient = null;
let isSignedIn = false;
let allEvents = [];

// Initialize the application
async function init() {
  showStatus('Loading Google API...', 'loading');
  
  try {
    // Load Google API client library
    await loadGAPI();
    
    // Initialize Google API client
    await gapi.client.init({
      apiKey: '', // Not needed for OAuth
      clientId: CONFIG.oauthClientId,
      discoveryDocs: ['https://www.googleapis.com/discovery/v1/apis/calendar/v3/rest'],
      scope: 'https://www.googleapis.com/auth/calendar'
    });
    
    gapiClient = gapi.client;
    
    // Check if user is already signed in
    const authInstance = gapi.auth2.getAuthInstance();
    isSignedIn = authInstance.isSignedIn.get();
    
    if (isSignedIn) {
      // User already signed in, proceed with app initialization
      await onSignInSuccess();
    } else {
      // Show sign-in button
      showSignInButton();
      showStatus('Please sign in to continue', 'info');
    }
    
  } catch (error) {
    console.error('Initialization error:', error);
    showStatus('Error: ' + error.message, 'error');
  }
}

// Load Google API client library
function loadGAPI() {
  return new Promise((resolve, reject) => {
    gapi.load('client:auth2', {
      callback: resolve,
      onerror: reject
    });
  });
}

// Handle successful sign-in
async function onSignInSuccess() {
  isSignedIn = true;
  hideSignInButton();
  showStatus('Signed in successfully', 'success');
  
  // Initialize UI
  initializeUI();
  
  // Load calendar events
  await loadEvents();
  
  showStatus('Calendar loaded successfully', 'success');
  setTimeout(() => hideStatus(), 3000);
}

// Sign in handler
async function handleSignIn() {
  try {
    showStatus('Signing in...', 'loading');
    const authInstance = gapi.auth2.getAuthInstance();
    await authInstance.signIn();
    await onSignInSuccess();
  } catch (error) {
    console.error('Sign-in error:', error);
    showStatus('Sign-in failed: ' + error.message, 'error');
  }
}

// Sign out handler
function handleSignOut() {
  const authInstance = gapi.auth2.getAuthInstance();
  authInstance.signOut().then(() => {
    isSignedIn = false;
    showSignInButton();
    const signOutBtn = document.getElementById('signOutBtn');
    if (signOutBtn) {
      signOutBtn.style.display = 'none';
    }
    if (calendar) {
      calendar.destroy();
      calendar = null;
    }
    allEvents = [];
    showStatus('Signed out', 'info');
  });
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
    const timeMin = new Date(new Date().getFullYear(), 0, 1).toISOString();
    const timeMax = new Date(new Date().getFullYear() + 1, 11, 31).toISOString();
    
    // Use gapi.client directly for better error handling
    const response = await gapiClient.calendar.events.list({
      calendarId: CONFIG.calendarId,
      timeMin: timeMin,
      timeMax: timeMax,
      singleEvents: true,
      orderBy: 'startTime'
    });
    
    allEvents = response.result.items || [];
    
    // Update calendar display
    updateCalendar();
    
    console.log(`Loaded ${allEvents.length} events`);
  } catch (error) {
    console.error('Error loading events:', error);
    showStatus('Error loading events: ' + error.message, 'error');
  }
}

// Parse event to extract person and project
function parseEvent(event) {
  const summary = event.summary || '';
  const match = summary.match(/^(.+?)\s*-\s*(.+)$/);
  
  if (match) {
    return {
      person: match[1].trim(),
      project: match[2].trim()
    };
  }
  
  return { person: '', project: summary };
}

// Convert Google Calendar event to FullCalendar event
function toFullCalendarEvent(gcalEvent) {
  const { person, project } = parseEvent(gcalEvent);
  const projectConfig = CONFIG.projects.find(p => p.name === project);
  const color = projectConfig ? projectConfig.color : '#9aa0a6';
  
  const start = gcalEvent.start.dateTime || gcalEvent.start.date;
  const end = gcalEvent.end.dateTime || gcalEvent.end.date;
  
  return {
    id: gcalEvent.id,
    title: `${person} - ${project}`,
    start: start,
    end: end,
    backgroundColor: color,
    borderColor: color,
    extendedProps: {
      person: person,
      project: project,
      gcalEvent: gcalEvent
    }
  };
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
  
  // Populate person filter
  const personFilter = document.getElementById('personFilter');
  CONFIG.people.forEach(person => {
    const option = document.createElement('option');
    option.value = person;
    option.textContent = person;
    personFilter.appendChild(option);
  });
  
  // Populate project filter
  const projectFilter = document.getElementById('projectFilter');
  CONFIG.projects.forEach(project => {
    const option = document.createElement('option');
    option.value = project.name;
    option.textContent = project.name;
    projectFilter.appendChild(option);
  });
  
  // Initialize FullCalendar
  const calendarEl = document.getElementById('calendar');
  calendar = new FullCalendar.Calendar(calendarEl, {
    initialView: 'dayGridMonth',
    editable: true,
    droppable: false,
    selectable: true,
    selectMirror: true,
    dayMaxEvents: true,
    headerToolbar: {
      left: 'prev,next today',
      center: 'title',
      right: 'dayGridMonth,timeGridWeek,listYear'
    },
    events: [],
    select: handleDateSelect,
    eventDrop: handleEventDrop,
    eventResize: handleEventResize,
    eventClick: handleEventClick
  });
  
  calendar.render();
  
  // Event listeners
  document.getElementById('personFilter').addEventListener('change', updateCalendar);
  document.getElementById('projectFilter').addEventListener('change', updateCalendar);
  document.getElementById('viewType').addEventListener('change', (e) => {
    calendar.changeView(e.target.value);
  });
  document.getElementById('refreshBtn').addEventListener('click', loadEvents);
}

// Update calendar display with filtered events
function updateCalendar() {
  const personFilter = document.getElementById('personFilter').value;
  const projectFilter = document.getElementById('projectFilter').value;
  
  let filteredEvents = allEvents.map(toFullCalendarEvent);
  
  if (personFilter) {
    filteredEvents = filteredEvents.filter(e => e.extendedProps.person === personFilter);
  }
  
  if (projectFilter) {
    filteredEvents = filteredEvents.filter(e => e.extendedProps.project === projectFilter);
  }
  
  calendar.removeAllEvents();
  calendar.addEventSource(filteredEvents);
}

// Handle date selection (create new event)
async function handleDateSelect(selectInfo) {
  // Show prompt for person and project
  const person = prompt('Enter person name:', CONFIG.people[0]);
  if (!person) {
    calendar.unselect();
    return;
  }
  
  const project = prompt('Enter project name:', CONFIG.projects[0].name);
  if (!project) {
    calendar.unselect();
    return;
  }
  
  try {
    await createEvent(person, project, selectInfo.start, selectInfo.end);
    calendar.unselect();
  } catch (error) {
    console.error('Error creating event:', error);
    showStatus('Error creating event: ' + error.message, 'error');
    calendar.unselect();
  }
}

// Create new event
async function createEvent(person, project, start, end) {
  showStatus('Creating event...', 'loading');
  
  const event = {
    summary: `${person} - ${project}`,
    start: {
      date: start.toISOString().split('T')[0]
    },
    end: {
      date: end.toISOString().split('T')[0]
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
    
    showStatus('Event created successfully', 'success');
    setTimeout(() => hideStatus(), 2000);
  } catch (error) {
    console.error('Error creating event:', error);
    throw error;
  }
}

// Handle event drop (move event)
async function handleEventDrop(dropInfo) {
  const event = dropInfo.event;
  const gcalEvent = event.extendedProps.gcalEvent;
  
  try {
    await updateEvent(gcalEvent.id, dropInfo.event.start, dropInfo.event.end);
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
  
  try {
    await updateEvent(gcalEvent.id, resizeInfo.event.start, resizeInfo.event.end);
  } catch (error) {
    console.error('Error updating event:', error);
    showStatus('Error updating event: ' + error.message, 'error');
    resizeInfo.revert();
  }
}

// Update event
async function updateEvent(eventId, start, end) {
  showStatus('Updating event...', 'loading');
  
  // Find the original event
  const gcalEvent = allEvents.find(e => e.id === eventId);
  if (!gcalEvent) {
    throw new Error('Event not found');
  }
  
  const update = {
    ...gcalEvent,
    start: {
      date: start.toISOString().split('T')[0]
    },
    end: {
      date: end.toISOString().split('T')[0]
    }
  };
  
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
    
    showStatus('Event updated successfully', 'success');
    setTimeout(() => hideStatus(), 2000);
  } catch (error) {
    console.error('Error updating event:', error);
    throw error;
  }
}

// Handle event click (delete)
async function handleEventClick(clickInfo) {
  if (confirm('Delete this event?')) {
    const eventId = clickInfo.event.extendedProps.gcalEvent.id;
    
    try {
      await deleteEvent(eventId);
    } catch (error) {
      console.error('Error deleting event:', error);
      showStatus('Error deleting event: ' + error.message, 'error');
    }
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

// Initialize when page loads
document.addEventListener('DOMContentLoaded', init);

