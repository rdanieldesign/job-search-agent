// src/calendar.js
// Fetches upcoming job-related calendar events for the daily digest.

import { calendar } from './google.js';

/**
 * Fetch calendar events for the next N days
 * @param {number} daysAhead - how many days forward to look (default 7)
 * @returns {Array} array of simplified event objects
 */
export async function fetchUpcomingEvents(daysAhead = 7) {
  try {
    const now = new Date();
    const future = new Date(now.getTime() + daysAhead * 24 * 60 * 60 * 1000);

    const res = await calendar.events.list({
      calendarId: 'primary',
      timeMin: now.toISOString(),
      timeMax: future.toISOString(),
      singleEvents: true,
      orderBy: 'startTime',
      maxResults: 50,
    });

    const events = res.data.items || [];

    // Filter to job-search-relevant events
    const jobKeywords = [
      'interview', 'recruiter', 'screening', 'call with', 'chat with',
      'offer', 'technical', 'hiring', 'follow up', 'job', 'prep',
    ];

    const jobEvents = events.filter((event) => {
      const title = (event.summary || '').toLowerCase();
      const desc = (event.description || '').toLowerCase();
      return jobKeywords.some((kw) => title.includes(kw) || desc.includes(kw));
    });

    // Also include ALL events today so nothing gets missed
    const todayEvents = events.filter((event) => {
      const start = event.start?.dateTime || event.start?.date;
      if (!start) return false;
      return new Date(start).toDateString() === now.toDateString();
    });

    // Merge and deduplicate
    const merged = [...new Map(
      [...jobEvents, ...todayEvents].map((e) => [e.id, e])
    ).values()];

    return merged.map((event) => ({
      id: event.id,
      title: event.summary || '(no title)',
      start: event.start?.dateTime || event.start?.date,
      end: event.end?.dateTime || event.end?.date,
      description: event.description || '',
      location: event.location || '',
      attendees: (event.attendees || []).map((a) => a.email).join(', '),
      isJobRelated: jobEvents.some((e) => e.id === event.id),
    }));
  } catch (err) {
    console.error('[Calendar] Error fetching events:', err.message);
    return [];
  }
}

/**
 * Create a calendar event
 * @param {object} eventData - { title, startTime, endTime, description, location }
 */
export async function createEvent({ title, startTime, endTime, description, location }) {
  try {
    const res = await calendar.events.insert({
      calendarId: 'primary',
      requestBody: {
        summary: title,
        description,
        location,
        start: { dateTime: startTime },
        end: { dateTime: endTime },
      },
    });
    console.log(`[Calendar] Event created: ${title}`);
    return res.data;
  } catch (err) {
    console.error('[Calendar] Error creating event:', err.message);
    return null;
  }
}
