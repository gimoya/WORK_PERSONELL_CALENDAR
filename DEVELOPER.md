# Developer Documentation

This document explains the data structure and maintenance workflow for the Personnel Planning Calendar application.

## Table of Contents

1. [Data Structure](#data-structure)
   - [Configuration Event](#configuration-event)
   - [Assignment Events](#assignment-events)
   - [Date Handling](#date-handling)
2. [Maintenance Workflow](#maintenance-workflow)
   - [Adding New Years](#adding-new-years)
   - [Managing Calendar IDs](#managing-calendar-ids)
   - [Configuration Management](#configuration-management)
   - [Troubleshooting](#troubleshooting)

---

## Data Structure

### Configuration Event

The application stores shared configuration (personnel, projects, roles, and project colors) in a special Google Calendar event. This allows all users with calendar access to share the same configuration.

**Event Details:**
- **Title**: `__PERSONNEL_CONFIG__`
- **Date**: `2000-01-01` (fixed date, used as a marker)
- **Storage Location**: `extendedProperties.shared.personnelConfig` (JSON string)

**Data Format:**
```json
{
  "personnel": ["John Doe", "Jane Smith", "Bob Johnson"],
  "projects": [
    { "name": "Project Alpha", "color": "#4285f4" },
    { "name": "Project Beta", "color": "#ea4335" }
  ],
  "roles": ["Project-Manager", "Foreman", "Shaper", "Operator-Shaper"]
}
```

**Key Points:**
- **Personnel**: Array of strings (person names)
- **Projects**: Array of objects with `name` (string) and `color` (hex string)
- **Roles**: Array of strings (role names)
- **Per-Year**: Each calendar year has its own configuration event
- **Automatic Creation**: The config event is created automatically on first access if it doesn't exist

**Storage Location in Code:**
- **Read**: `loadConfigFromCalendar()` in `app.js` (lines ~82-147)
- **Write**: `saveConfigToCalendar()` in `app.js` (lines ~149-187)
- **Find/Create**: `findOrCreateConfigEvent()` in `app.js` (lines ~34-79)

### Assignment Events

Assignment events represent personnel allocations to projects with specific roles for date ranges.

**Event Structure:**
```javascript
{
  summary: "Person Name - Project Name - Role Name",
  start: { date: "2026-01-15" },  // All-day event, YYYY-MM-DD format
  end: { date: "2026-01-20" }     // Exclusive end date (day after last day)
}
```

**Summary Format:**
- **Pattern**: `"Person - Project - Role"`
- **Example**: `"John Doe - Project Alpha - Project-Manager"`
- **Parsing**: Uses regex `/^(.+?)\s*-\s*(.+?)\s*-\s*(.+)$/` in `parseEvent()` function

**Date Format:**
- **Type**: All-day events (no time component)
- **Format**: `YYYY-MM-DD` (ISO date format)
- **Timezone**: Local timezone (not UTC) to prevent day shifts
- **End Date**: Exclusive (represents the day after the last day of the assignment)

**Storage:**
- Stored directly in Google Calendar
- No extended properties used (all data in summary and dates)
- Color is derived from project configuration, not stored in event

**Code References:**
- **Create**: `createEvent()` in `app.js` (lines ~1312-1354)
- **Update**: `updateEvent()` in `app.js` (lines ~1409-1470)
- **Parse**: `parseEvent()` in `app.js` (lines ~564-590)
- **Convert**: `toFullCalendarEvent()` in `app.js` (lines ~631-657)

### Date Handling

**Critical Concept: Exclusive End Dates**

The application uses **exclusive end dates** throughout:
- **FullCalendar**: End date is exclusive (represents the day after the last visible day)
- **Google Calendar API**: End date is exclusive (represents the day after the last day of the event)
- **User Input**: Inclusive (user selects "Jan 1 to Jan 5" meaning 5 days)

**Conversion Flow:**
1. **User Input** (inclusive): `start: 2026-01-01`, `end: 2026-01-05` (5 days)
2. **To Google Calendar** (exclusive): `start: 2026-01-01`, `end: 2026-01-06` (add 1 day)
3. **From Google Calendar** (exclusive): `start: 2026-01-01`, `end: 2026-01-06`
4. **To User Display** (inclusive): `start: 2026-01-01`, `end: 2026-01-05` (subtract 1 day)

**Implementation Details:**
- **Local Timezone**: All date parsing uses local timezone (`new Date(year, month, day)`) to prevent day shifts
- **Format Function**: `formatLocalDate()` converts Date objects to `YYYY-MM-DD` strings
- **Overview Rendering**: Uses `while (current < end)` (exclusive comparison) to iterate days

**Code References:**
- **Format**: `formatLocalDate()` in `app.js` (lines ~1303-1309)
- **Parse Input**: `handleEventCreate()` in `app.js` (lines ~1272-1275)
- **Overview Loop**: `renderCompactYearView()` in `app.js` (uses exclusive end date)

---

## Maintenance Workflow

### Adding New Years

Each year requires its own separate Google Calendar. Follow these steps:

**1. Create New Google Calendar**
- Go to Google Calendar
- Click "+" next to "Other calendars"
- Select "Create new calendar"
- Name it (e.g., "Personnel Planning 2027")
- Click "Create calendar"

**2. Get Calendar ID**
- Open calendar settings
- Go to "Integrate calendar" section
- Copy the "Calendar ID" (format: `c_...@group.calendar.google.com`)

**3. Update `config.js`**
```javascript
calendarIds: {
  2026: 'c_...@group.calendar.google.com',
  2027: 'c_NEW_CALENDAR_ID@group.calendar.google.com',  // Add here
}
```

**4. Share Calendar**
- Share with same users who have access to other years
- Grant "Make changes to events" permission
- Users can add via share link

**5. Initial Configuration**
- When someone first switches to the new year, the app will:
  - Automatically create `__PERSONNEL_CONFIG__` event
  - Initialize with default roles (Project-Manager, Foreman, Shaper, Operator-Shaper)
  - Empty personnel and projects arrays
- Customize via UI: "Manage Personnel", "Manage Projects", "Manage Roles"

**Important Notes:**
- Each year has its own calendar and its own configuration event
- Personnel, projects, and roles are **per-year** (can differ between years)
- Year selector dropdown automatically shows all years in `calendarIds`
- If a year is selected without a calendar ID, an error message is shown

**Code References:**
- **Year Change Handler**: `handleYearChange()` in `app.js`
- **Calendar ID Getter**: `CONFIG.calendarId` getter in `config.js` (lines ~32-34)
- **Year Validation**: `handleYearChange()` checks `CONFIG.calendarIds[newYear]`

### Managing Calendar IDs

**Location**: `config.js` → `calendarIds` object

**Structure:**
```javascript
calendarIds: {
  2026: 'c_8a82d2d6d54ec545f6019870cde156c3b4f0b338d760091f88c329358e0de867@group.calendar.google.com',
  2027: 'c_03f7ef804966f4544096bbc0669adb9829d254458de3e95de00f6fcb0d12a2e8@group.calendar.google.com',
}
```

**Dynamic Access:**
- The `CONFIG.calendarId` getter automatically returns the correct calendar ID based on `CONFIG.year`
- Falls back to 2026 if the year is not found

**Best Practices:**
- Keep calendar IDs in version control (they're not sensitive)
- Document which calendar ID corresponds to which year
- Test year switching after adding new calendar IDs

### Configuration Management

**Where Configuration Lives:**
- **NOT in `config.js`**: The `personnel`, `projects`, and `roles` arrays in `config.js` are placeholders
- **In Calendar Event**: Actual data is stored in `__PERSONNEL_CONFIG__` event
- **Per-Year**: Each year has its own configuration event

**How to Modify Configuration:**

**Via UI (Recommended):**
1. **Personnel**: Click "Manage Personnel" → Add/Remove names
2. **Projects**: Click "Manage Projects" → Add/Remove projects, change colors
3. **Roles**: Click "Manage Roles" → Add/Remove roles

**Via Google Calendar (Advanced):**
1. Open the calendar for the year
2. Find event `__PERSONNEL_CONFIG__` on `2000-01-01`
3. Edit the event description or use Google Calendar API
4. Modify `extendedProperties.shared.personnelConfig` JSON

**Via Code (Development):**
- Modify `getDefaultConfigData()` in `app.js` to change default roles
- This only affects new calendar years (existing years keep their config)

**Synchronization:**
- Configuration is loaded on sign-in and year switch
- Changes are saved immediately when modified via UI
- All users see the same configuration (shared via calendar event)

**Code References:**
- **Load**: `loadConfigFromCalendar()` in `app.js` (lines ~82-147)
- **Save**: `saveConfigToCalendar()` in `app.js` (lines ~149-187)
- **Defaults**: `getDefaultConfigData()` in `app.js` (lines ~13-24)

### Troubleshooting

**Common Issues and Solutions:**

**1. "Calendar for year XXXX is not configured"**
- **Cause**: Year selected but no calendar ID in `config.js`
- **Solution**: Add the calendar ID to `calendarIds` object in `config.js`

**2. Configuration not loading**
- **Cause**: Config event doesn't exist or is corrupted
- **Solution**: 
  - Check if `__PERSONNEL_CONFIG__` event exists on `2000-01-01`
  - If missing, the app will create it automatically on next load
  - If corrupted, delete the event and let the app recreate it

**3. Events showing wrong dates**
- **Cause**: Timezone issues or incorrect date parsing
- **Solution**:
  - Verify dates are parsed in local timezone (not UTC)
  - Check that end dates are exclusive (day after last day)
  - Ensure `formatLocalDate()` is used for all date formatting

**4. Project colors not showing**
- **Cause**: Projects missing color property or incorrect format
- **Solution**:
  - Verify projects are objects: `{ name: "...", color: "#..." }`
  - Check `getProjectColor()` function returns correct color
  - Ensure `loadConfigFromCalendar()` reads projects correctly

**5. Year switching not working**
- **Cause**: Calendar ID missing or invalid
- **Solution**:
  - Verify `calendarIds[year]` exists in `config.js`
  - Check calendar is shared with user account
  - Verify calendar ID format is correct

**6. "Cannot save: You do not have write access"**
- **Cause**: User doesn't have "Make changes to events" permission
- **Solution**: Calendar owner must grant write permission

**Debugging Tips:**

1. **Check Browser Console:**
   - Look for JavaScript errors
   - Check network requests to Google Calendar API
   - Verify OAuth token is valid

2. **Inspect Calendar Events:**
   - Use Google Calendar UI to view `__PERSONNEL_CONFIG__` event
   - Check event details for `extendedProperties.shared.personnelConfig`
   - Verify assignment events have correct summary format

3. **Test API Calls:**
   - Use Google Calendar API Explorer to test API calls
   - Verify calendar ID is correct
   - Check OAuth scopes include `https://www.googleapis.com/auth/calendar`

4. **Check Configuration:**
   - Verify `config.js` has correct OAuth client ID
   - Ensure calendar IDs are correct format
   - Check year selector dropdown has all years

**Code References for Debugging:**
- **Error Handling**: `loadConfigFromCalendar()`, `saveConfigToCalendar()`, `loadEvents()`
- **Status Messages**: `showStatus()` function displays user-facing errors
- **Console Logging**: `console.error()` used for detailed error logging

---

## Additional Notes

**OAuth Configuration:**
- OAuth client ID is stored in `config.js` → `oauthClientId`
- Must be added to "Authorized JavaScript origins" in Google Cloud Console
- Scopes required: `https://www.googleapis.com/auth/calendar`

**Performance Considerations:**
- Events are loaded once per year switch
- Configuration is cached in `CONFIG` object
- Overview view recalculates on demand (not cached)

**Security:**
- No sensitive data in code (OAuth client ID is public by design)
- Access tokens are short-lived and scoped to calendar access
- Users can only access calendars they have permission to view/edit
