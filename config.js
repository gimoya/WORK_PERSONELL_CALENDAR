// Configuration for Personnel Planning Calendar
const CONFIG = {
  // Calendar ID of the shared dummy calendar
  // Get this from Google Calendar settings > Integrate calendar > Calendar ID
  calendarId: 'c_8a82d2d6d54ec545f6019870cde156c3b4f0b338d760091f88c329358e0de867@group.calendar.google.com',
  
  // List of people (5-10 persons)
  people: [
    'Cody',
    'Kay',
    'Rene',
    'Gary',
    'Dimitri',
    'Alec',
    'Allen',
    'Paul S',
    'Paul V',
    'Viktor'
    // Add more people as needed
  ],
  
  // List of projects with colors
  projects: [
    { name: 'Rossau II', color: '#4285f4' },
    { name: 'Klaus Äule', color: '#ea4335' },
    { name: 'Alberschwende', color: '#fbbc04' },
    { name: '...', color: '#34a853' }
    // Add more projects as needed
  ],
  
  // OAuth 2.0 Client ID from Google Cloud Console
  // Get this from: APIs & Services > Credentials > OAuth 2.0 Client IDs
  oauthClientId: '581029517390-ofv5l3p97p5ikikp59d99o10065gc7eb.apps.googleusercontent.com'
};

