// src/drafter.js
// Watches for interview calendar events and pre-drafts thank-you emails.
// Also provides on-demand email drafting for outreach, follow-ups, etc.

import Anthropic from "@anthropic-ai/sdk";
import { fetchUpcomingEvents } from "./calendar.js";
import { createDraft } from "./gmail.js";
import { PROFILE_CONTEXT } from "../prompts/profile.js";
import "dotenv/config";

const YOUR_NAME = process.env.YOUR_NAME || "the user";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

/**
 * Scan for upcoming interviews and pre-draft thank-you emails
 * Drafts are saved to Gmail and ready to personalize after the call
 */
export async function draftInterviewFollowUps() {
  console.log("[Drafter] Scanning for upcoming interviews...");
  const events = await fetchUpcomingEvents(2); // next 48 hours

  const interviewEvents = events.filter(
    (e) =>
      e.isJobRelated &&
      ["interview", "technical", "screening", "hiring"].some((kw) =>
        e.title.toLowerCase().includes(kw),
      ),
  );

  if (interviewEvents.length === 0) {
    console.log("[Drafter] No upcoming interview events found");
    return;
  }

  for (const event of interviewEvents) {
    console.log(`[Drafter] Pre-drafting thank-you for: ${event.title}`);
    await draftThankYou(event);
  }
}

/**
 * Draft a post-interview thank-you email for a calendar event
 */
async function draftThankYou(event) {
  const response = await anthropic.messages.create({
    model: "claude-haiku-4-5",
    max_tokens: 600,
    system: PROFILE_CONTEXT,
    messages: [
      {
        role: "user",
        content: `Draft a post-interview thank-you email based on this calendar event.

Event: ${event.title}
Date/Time: ${new Date(event.start).toLocaleString("en-US", { timeZone: process.env.TIMEZONE || "America/New_York" })}
Attendees: ${event.attendees || "not listed"}
Description: ${event.description || "none"}

Write a warm, professional thank-you email in ${YOUR_NAME}'s voice:
- 3-4 short paragraphs
- Reference the specific company/role from the event title
- Include a placeholder [SPECIFIC_TOPIC] where he can fill in something discussed
- Reaffirm interest and key differentiator (founding engineer, AI workflow expertise)
- Clear, confident close
- Subject line on the first line formatted as: SUBJECT: <subject here>
- Then the email body

Keep it under 180 words total. Do not be sycophantic or use hollow phrases.`,
      },
    ],
  });

  const text = response.content[0]?.text || "";
  const lines = text.split("\n");
  const subjectLine = lines.find((l) => l.startsWith("SUBJECT:"));
  const subject = subjectLine
    ? subjectLine.replace("SUBJECT:", "").trim()
    : `Thank you — ${event.title}`;
  const body = lines.filter((l) => !l.startsWith("SUBJECT:")).join("\n");

  if (process.env.DRY_RUN === "true") {
    console.log("[DRY RUN] Would create draft:");
    console.log(`  Subject: ${subject}`);
    console.log(`  Body preview: ${body.slice(0, 150)}...`);
    return;
  }

  // Save to Gmail drafts — the user reviews and sends manually
  await createDraft(process.env.YOUR_EMAIL, `[DRAFT] ${subject}`, body);
}

/**
 * Draft a cold outreach / intro message to a contact
 * @param {object} params - { name, title, company, context, type }
 * type: 'linkedin' | 'email' | 'referral-ask'
 */
export async function draftOutreach({
  name,
  title,
  company,
  context,
  type = "email",
}) {
  console.log(
    `[Drafter] Drafting ${type} outreach to ${name} at ${company}...`,
  );

  const typeInstructions = {
    email:
      "Write a professional email. Include subject line as SUBJECT: <subject>.",
    linkedin:
      "Write a LinkedIn connection message. Max 300 characters. No subject line needed.",
    "referral-ask":
      "Write a warm message asking for a referral introduction. Friendly tone, acknowledge the relationship.",
  };

  const response = await anthropic.messages.create({
    model: "claude-haiku-4-5",
    max_tokens: 500,
    system: PROFILE_CONTEXT,
    messages: [
      {
        role: "user",
        content: `Draft a ${type} outreach message from ${YOUR_NAME} to:

Name: ${name}
Title: ${title}
Company: ${company}
Context: ${context}

${typeInstructions[type] || typeInstructions.email}

Guidelines:
- Write in ${YOUR_NAME}'s voice: direct, warm, not desperate
- Lead with shared context or genuine interest in their work
- One clear ask — not multiple questions
- No hollow openers like "I hope this message finds you well"
- Do not mention he is "actively looking" — frame as exploring conversations`,
      },
    ],
  });

  const text = response.content[0]?.text || "";

  if (type === "email") {
    const lines = text.split("\n");
    const subjectLine = lines.find((l) => l.startsWith("SUBJECT:"));
    const subject = subjectLine
      ? subjectLine.replace("SUBJECT:", "").trim()
      : `Connecting — ${company}`;
    const body = lines.filter((l) => !l.startsWith("SUBJECT:")).join("\n");

    if (process.env.DRY_RUN === "true") {
      console.log(`[DRY RUN] Would create draft — Subject: ${subject}`);
      console.log(body);
      return { subject, body };
    }

    await createDraft(process.env.YOUR_EMAIL, subject, body);
    return { subject, body };
  }

  // For LinkedIn messages — just return the text
  console.log("[Drafter] LinkedIn message draft:");
  console.log(text);
  return { body: text };
}
