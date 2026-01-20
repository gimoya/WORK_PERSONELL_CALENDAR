// Configuration for Personnel Planning Calendar
// Only IDs are stored here - all data (personnel, projects, roles) comes from calendar event
const CONFIG = {
  // Current year this calendar instance is configured for
  year: 2026,
  
  // Calendar ID mapping by year
  // Add new calendar IDs here when creating calendars for new years
  // Each year requires its own separate Google Calendar
  calendarIds: {
    2026: 'c_8a82d2d6d54ec545f6019870cde156c3b4f0b338d760091f88c329358e0de867@group.calendar.google.com',
    2027: 'c_03f7ef804966f4544096bbc0669adb9829d254458de3e95de00f6fcb0d12a2e8@group.calendar.google.com',
    // 2028: 'calendar_id_for_2028@group.calendar.google.com',
  },
  
  // OAuth 2.0 Client ID from Google Cloud Console
  // Get this from: APIs & Services > Credentials > OAuth 2.0 Client IDs
  oauthClientId: '581029517390-ofv5l3p97p5ikikp59d99o10065gc7eb.apps.googleusercontent.com',

  // Share link for the calendar (will be updated based on selected year)
  shareLink: 'https://calendar.google.com/calendar/u/1?cid=Y184YTgyZDJkNmQ1NGVjNTQ1ZjYwMTk4NzBjZGUxNTZjM2I0ZjBiMzM4ZDc2MDA5MWY4OGMzMjkzNThlMGRlODY3QGdyb3VwLmNhbGVuZGFyLmdvb2dsZS5jb20',
  
  // Placeholder arrays - DO NOT add data here!
  // These are overwritten when you sign in. All personnel, projects, and roles
  // are stored in the calendar event (__PERSONNEL_CONFIG__) for sharing across users.
  // Use the "Manage Personnel", "Manage Projects", and "Manage Roles" buttons in the UI.
  personnel: [],
  projects: [],
  roles: [],
  
  // Get current calendar ID based on configured year
  get calendarId() {
    return this.calendarIds[this.year] || this.calendarIds[2026];
  }
};

