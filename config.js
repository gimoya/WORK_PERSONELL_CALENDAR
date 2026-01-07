// Configuration for Personnel Planning Calendar
// Only IDs are stored here - all data (personnel, projects, roles) comes from calendar event
const CONFIG = {
  // Calendar ID of the shared dummy calendar
  // Get this from Google Calendar settings > Integrate calendar > Calendar ID
  calendarId: 'c_8a82d2d6d54ec545f6019870cde156c3b4f0b338d760091f88c329358e0de867@group.calendar.google.com',
  
  // OAuth 2.0 Client ID from Google Cloud Console
  // Get this from: APIs & Services > Credentials > OAuth 2.0 Client IDs
  oauthClientId: '581029517390-ofv5l3p97p5ikikp59d99o10065gc7eb.apps.googleusercontent.com',

  // Share link for the calendar
  shareLink: 'https://calendar.google.com/calendar/u/1?cid=Y184YTgyZDJkNmQ1NGVjNTQ1ZjYwMTk4NzBjZGUxNTZjM2I0ZjBiMzM4ZDc2MDA5MWY4OGMzMjkzNThlMGRlODY3QGdyb3VwLmNhbGVuZGFyLmdvb2dsZS5jb20',
  
  // Placeholder arrays - DO NOT add data here!
  // These are overwritten when you sign in. All personnel, projects, and roles
  // are stored in the calendar event (__PERSONNEL_CONFIG__) for sharing across users.
  // Use the "Manage Personnel", "Manage Projects", and "Manage Roles" buttons in the UI.
  personnel: [],
  projects: [],
  roles: []
};

