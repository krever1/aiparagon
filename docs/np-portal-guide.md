# Care portal guide (Spectrum Care Advisory OS)
Reflects v12.41 (Nov 3, 2026). For build history, open items and backend notes, see CLAUDE.md section 2.

This guide says what each page of the care portal is for and how to do things in it. It is written for the AI Paragon team and for np-bot, which answers the team's questions in Slack.

How to read it:

- "A > B > C" means click A, then B, then C.
- Button names are written as they appear on screen, without their leading icons. On screen most start with a symbol such as ＋, ✎, ⇧ or ⚙, so "Add client" on screen is "＋ Add client".
- "The gear" is the round settings button (tooltip "Settings") at the top right of a page.
- "The ⋯ button" is the three-dot menu at the end of a row.

---

## 1. Overview

### What it is

Spectrum Care Advisory OS is a web portal for care agencies: residential homes, day programs and supported living. It runs in the browser at np.aiparagonconsulting.com, on a computer, tablet or phone. There is no app to install.

The portal calls each agency a **team**. Each team has its own private workspace with its own clients, staff, documents and settings. Nobody outside the team sees any of it.

Clients are identified by their **UCI**, the 7-digit client ID from the regional center. Client names are kept out of anything shared or sent outside (see section 4).

### The three roles

**Director.** Runs the team and can change everything: clients, staff, shifts, templates, binders, settings and who can sign in.

- Menu: Today (Home, Tasks, Calendar), Care (Clients, Staff, Training & onboarding, Safety log, Accountability), Records (Documents, Templates), Setup (Directory, Change log).

**Staff** (care staff, DSPs, house leads). Sees their own shift, their own tasks and the clients the director gave them access to.

- Menu: Today (My shift, My tasks, Calendar), Care (Clients, Safety log, Accountability).

**Family.** Sees one client only: appointments, documents shared with them, and messages.

- Menu: Overview, Appointments, Documents, Messages.
- Family members do not have their own sign-in in this pilot. The family view is a preview: a director opens it with Switch view, and the demo view has it with sample data. An invite always makes someone a director or staff member.

**Who sees what.** Each team's records are its own: nobody in another team can see or change them, and a new team starts empty. Inside a team the shared work (clients, tasks, calendar, incidents, logs, documents) is everyone's, so what a director adds reaches the staff and what staff add reaches the director (after a reload; messages arrive on their own). Some things are each person's, and the database keeps them that way, not just the screens: a conversation is seen by the people in it (and the directors), a notice by the person or house it is for (and the directors), and certifications, the signed agreement and sign-in records by their owner (and the directors). Only directors add or remove clients, change shifts, invite people or clear the change log.

Outside the menu, everyone has:

- the top bar: search, Help and support, Messages (envelope), Notifications (bell) and Ask Spectrum
- their name card at the bottom of the sidebar, which opens their profile and Account settings

On a phone the sidebar is behind the menu button (☰) at the top left.

### How people get in

**A new team signs up.** On the sign-in page, "Get your team started" (top right) opens **Set up a new team**. The director enters Team name, Your name, Your role, Work email and a password (at least 8 characters) and clicks **Create team account**. If asked to confirm their email first, they confirm it and sign in to finish. Then come the setup questions and the pilot agreement. A new team starts in Development, with no sample records.

**Staff and other directors join from an invite.** The emailed link opens a page titled "Join <team name>" with their email filled in. They choose a password (or type their existing one) and click **Join <team name>**. They land with the role the invite gave them. A link works once, only for the email it was sent to, and expires after 14 days.

**Everyone else signs in** with Work email and Password, then **Sign in**. "Remember my email on this device" is ticked by default; untick it on a shared computer. "Forgot password?" is next to the Password label.

The first time each person signs in they must accept the **Pilot Dashboard Agreement**. The director who set up the team signs for the team; people invited later accept it as users. The dashboard does not open until it is accepted.

### The demo view

The portal address with `?demo=1` at the end opens a separate demo dashboard with sample data. There is no sign-in and no agreement, and nothing done there is saved: every visit starts from the original sample data. A brown banner marks it as a demonstration view.

Directors open it from Account settings > Demonstration view > "Open the demo dashboard with sample data" (a new tab; the real workspace is untouched). Inside the demo view, Account settings > Switch view also shows the staff and family views.

### Demo vs. Development

A team setting in Account settings, card **Demo vs. Development**. Only a director can change it.

- **Demo** shows sample clients, staff, shifts, tasks and messages on every page, for showing people how the portal works. A brown banner on every page says "Demo mode: the clients, staff and records here are sample data, not real." Directors get a "Switch to Development" link in the banner.
- **Development** shows only the team's real records. Use it once real work starts.

Switching changes what everyone on the team sees. Nothing is deleted either way. Demo mode lives inside the team's real workspace; the demo view is a separate throwaway copy.

### Previewing other roles (Switch view)

Account settings > Switch view > Switch view opens "Choose a view" with three cards: Director, Care staff, Family member. Nothing is saved in someone else's name while previewing: what would be done as that person (adding a task to their list, sending a message, an acknowledgement, training) says "You are previewing..." and stops. Anything else you change while previewing, such as a progress note, is saved under your own name. Use Switch view again to return.

---

## 2. The pages

Pages are in menu order. Pages outside the menu come after.

### Home (staff: My shift; family: Overview)

A greeting with the date and time, a one-line summary ("N items need your attention today" or "Nothing needs you right now"), up to four number tiles, today's schedule and a set of sections. Each person sets up their own (see Customize your home page).

- Header buttons: **Add appointment** (not family), **Add shift** (director), **Show me around** (a guided tour), and the gear.
- An **Ask Spectrum** chip under the summary asks a ready question, such as "Summarize today for me" or "What do I need to do this shift?".
- Sections: Needs your attention, This week's progress, Who's working, Coming up, Ask Spectrum. Staff also have Your tasks and Your training. Family have Needs your attention, Coming up and Ask Spectrum.
- Today's schedule is a List (with a Now line), a Timeline (one line each for appointments, shifts, meetings and events, reminders, and Google Calendar when there is something on it) or a Month.
- Over the schedule, once Google is connected, a **View** bar: **All**, **Portal** (the team's calendars only) and one button per Google account the person connected (named by its address, or the name they gave it; with one account it just says **Google**). One click switches what the home page and the Calendar page show. The choice is per person.
- Under it, **calendar chips**: one per calendar the person can see in that view (the team's Company calendar, their own calendar, and their Google calendars). Click a chip to hide or show that calendar; a hidden one stays listed, struck through, with **Show all**. In **All** with two or more Google accounts the chips are grouped (Portal, then each account, whose own calendar reads "Main calendar"), and clicking a group's name hides or shows all of its calendars at once. The choices are per person and the same on the Calendar page. **＋ Google calendar** (when Google is connected) adds another of their Google calendars.
- The schedule, Next up, Coming up, the Month and the tiles follow the view and the chips, and show the person's Google events (only to them), each marked with its calendar. A Google event opens in Google Calendar (one on the main Google account's calendar can also be edited from the Calendar page). The "Appointments today" tile counts portal appointments only. Reminders and Ask Spectrum follow the chips, never the view, so switching the view never hides a reminder.

Staff also see:

- a strip of shortcuts: **Safety log**, **My tasks**, **Report an incident**
- **Documents assigned to you**, each with **Acknowledge** and **Open & fill**
- **Readiness guides**, each with **Acknowledge**
- in **Your training** (the "Training to finish" card), their **Onboarding checklist** with how many steps are done and **Open**, while steps are left

The sidebar's **This week** box shows progress counts on every page but Home. Directors pick what it counts with its small gear.

### Tasks (staff: My tasks)

Open tasks in a table: task, assignee (director view), client, category, due date, stage, priority. Done tasks sit in a Completed card (Today, Last week, Last month, All). Directors also get a **By staff member** table; clicking a name shows that person's open tasks.

- Filters: category tabs, a search box, Everyone (director), Any stage (To do: not started yet; In progress; Overdue: open past its due date; Done), and a sort (Due date, Priority, Assignee, Least progress).
- **Assign task** (director) or **Add task** (staff, always assigned to yourself).
- The tick box at the start of a row marks a task done.
- Clicking a task opens it:
  - **Edit task** (name, due date, priority, category, assignee; Save changes; directors get Delete task, which asks first)
  - A task needs a due date. Once the date has passed it shows as Overdue, on the list, the home page and Needs your attention.
  - **Steps** to add, tick, reorder and edit
  - **Notes**
  - **Sign-off**: "Sign off as <your name>" records name, date and time and marks it done
  - **Move to**: Not started, In progress, Done
- A done task opens read-only with **Re-open task**.
- Directors: **Edit categories** at the end of the tabs; Task colors under the gear.

### Calendar (family: Appointments)

One shared calendar for appointments, events and outings, meetings, shifts, reminders and tasks, and where clients were.

- Views (kept per person): **Calendar** (the month, with the picked day's plan beside it), **Week**, and **List** (Upcoming, This week, This month, Past, All).
- **View** (once Google is connected): **All**, **Portal**, or one Google account, the same bar and choice as on Home.
- **Calendars**: a row of chips, one per calendar the person can see in that view (Company calendar, their own, the director's extra calendars such as a day program or a van, and their Google calendars), grouped by Google account in All when there are two or more (click a group's name to hide or show all of it). Click one to hide or show it; the choice is per person and holds on Home too. Directors also get **＋ Calendar**; anyone with Google connected gets **＋ Google calendar**, and **＋ Google account** to connect another Google account.
- **The legend** counts each kind (Appointments, Events, Meetings, Shifts, Reminders, Accountability, Google Calendar) and turns it on or off for this page, per person. Accountability starts off here.
- Tools: "Search the calendar…" and appointment-type chips that filter to one type. Directors also get **Category** and **Edit categories**.
- **Connect Google Calendar**. Once connected: "Refresh Google" and "Google ✓ · Disconnect" (with two or more Google accounts, "Google ✓ · 2 accounts", which opens them in the settings). After a page load it may show "Checking Google Calendar…" for a few seconds.
- The gear: calendar settings (see Page settings).
- **Add item** opens a menu:
  - **Appointment**: a client's visit
  - **Event or outing**
  - **Meeting**: a team meeting, an IPP or a care plan review
  - **Shift** (directors only)
  - **Reminder or task**
  - **Where someone was** (an Accountability entry)
- Clicking an appointment opens it: Reschedule (Save new time), Cancel appointment or Restore appointment, Edit details, Notes, and "Attach a document".
- A shift on the day plan lists who is on it; a director clicks a name to change that shift.

Events and meetings can be for the whole team (Client: "No one client (the whole team)"); everyone but families sees them.

Each appointment goes on a calendar: the **<team name> calendar** (shared), **<your first name>'s calendar** (yours alone), or a **contractor calendar** for outside providers. Directors also set "Who can see this appointment": everyone with access to the calendar, or only listed staff.

Staff see the page without Shift. Family see "Appointments" for their one client, with no Add item.

### Clients

A table of clients: UCI, home, service, active meds, next appointment, standing alerts. Click a column to sort; use the filter box. Staff see only the clients they have access to.

- **Add client** (director) opens the Add a client page.
- Click a row to open the client.

### The client page

Titled with the client's UCI, then home, program and guardian. Standing alerts show in a red bar.

- Header: **Report incident**, **Export record** (the full record in the print window; choose "Save as PDF"), **Delete client** (director), the gear (director).
- Tabs: **Overview, Care, Appointments, Files, Incidents, Directory.**

**Overview**

- **Profile**: UCI, home, program, age, in service since, guardian, standing alerts. Editing it is a director action in edit mode.
- **Weekly checklist**: tick items as done; each tick records name, date and time. Anyone but family can add an item; only a director removes one. When every item is ticked, the week is filed to the Daily Logs binder. Each week starts clear.
- **Internal notes**: staff-only notes. "@name" notifies a teammate.
- **Recent activity**: click an entry to go where it happened.
- **How to support <UCI>**: a free-text support profile.
- **IPP goals & notes**: Add goal; "Open goal & notes" adds a dated, signed progress note to a goal.
- **Progress notes**: **Write note** with a category (Health, Diet, Behavior, Hygiene, Community, Shift). Click a note for "Add to this note", Edit or Delete (your own), and "Mark reviewed" (director).

**Care.** The daily record, one day at a time. Pick a day on the small calendar (dots mark days with entries), or "Show the full history". **Record vitals** (blood pressure, heart rate, temperature, respiration, oxygen, weight, glucose, pain) and **Log an activity** (meals, fluids, bathing, toileting, dressing, mobility, sleep, activity, with the level of support). Click an entry to edit or delete it.

**Appointments.** This client's appointments with a week strip, All, Upcoming, Past week, Past month, a search box and **Add appointment**. Click one to see it beside the list.

**Files.** The client's own binders (Agency, Medical, Daily Logs and any the team added). Binders hold tabs; tabs hold documents.

- **New from template**: pick a blank form; it opens as a draft in this client's files.
- **Upload**, **Export folder**.
- In edit mode: **Link a document**, **New binder**.
- Binder ⋯: Add a document to this binder, Add a tab, Rename binder.

A document filed to a team binder shows both here and on the Documents page.

**Incidents.** Everything filed for this client. **Report incident** files a new one. The team's Incident protocols are listed below.

The Files tab also has a **Providers & contacts** card: this client's own doctors, dentist, day program and case manager (**＋ Add contact**). It is separate from the Directory tab.

**Directory.** Providers and resources assigned to this client, plus team-wide entries. **Add entry**; click an entry to edit or call.

### Staff (director)

Tiles for Trainings outstanding, Certifications current and Open staff tasks, then the **Staff roster** (name, role, home, certifications, trainings outstanding, open tasks). Click a person to open their staff page.

- **Add shift**.
- **Add staff**: full name, initials, role, primary home, date of hire, work email, up to two starting certifications, and "Email them an invite to sign in" (ticked by default). Saving shares the team's onboarding steps, sends a welcome notice ("Your onboarding checklist is on your Profile page, under Onboarding."), and emails the invite if there is a work email.

### The staff page

- Header: **Task**, **Shift**, **Client access** (All clients, or Only these clients), **Send reminder** (about a certification, a course or a task), the gear.
- Edit mode adds **Edit details**, **Invite to the portal**, and **My icon & color** (or "Set their icon & color").
- Cards:
  - **Onboarding checklist** (once one is shared)
  - **Certifications**, with Add credential; anything expiring within 90 days goes into the reminder email
  - **Open tasks**
  - **Shifts this week**, with Add shift
  - **Staff folder**: binders and tabs like a client's Files; Export folder prints the staff file
  - **Training & onboarding**: **Assign a course**, **Share onboarding steps**

### Training & onboarding (director)

Three lists:

- **Training library.** **Add training** adds a course. Open one to see who has it and who has completed it, its materials (link, files, Add a file) and notes, with Assign, Remind outstanding, Edit and Delete.
- **Readiness guides**: protocols staff sign off on. **Add guide** (Guide title, Review note). Open one to see who has acknowledged it, with Remind pending, Edit and Delete. Renaming a guide resets acknowledgements.
- **Onboarding checklists**, one per path (portal, HIPAA, medication, CPR and so on). **Create new checklist**, then open it to Add step (with an optional note and link), reorder steps, **Share with a new hire**, Rename or Delete.

Staff complete training from their home page: Your training > Open, or Mark complete.

### Safety log

Logs filled in regularly. The **This week / History (3 months)** switch sets the period.

- **Digital inspections**: forms that score themselves. Click one for **Start inspection** or **Preview** (directors also get Edit lines and Remove).
- **Completed inspections**: View / print (directors also File to a binder, or delete).
- **Signed paper logs**: **Upload signed log** files a wet-ink copy to the Daily Logs binder against its period.
- **Fire drill log**: **Log a drill** (home, shift, time started, evacuation time, all residents accounted for, issues). A warning shows when no drill was logged this month.
- **Water temperature log**: **Add reading** (kitchen sink, bathrooms, refrigerator, freezer, time checked). Readings over the limit show in red; the limit is 120°F at fixtures unless the director changes it.
- **Weekly logs**: the team's own logs that have a weekly target, with Run now.

Clicking a log's heading opens every entry, to tick and **Print**, **Print for wet signatures**, **Comment** or **Edit**. Directors also get File week to binder, File to binder, Edit limit, the log's gear (change its lines) and delete.

A log or inspection runs full screen. Answer each line; out-of-range answers are flagged. A line can take a note, or an action that becomes a task. **Complete & file to logs** files the report, with the time and score, to the Daily Logs binder.

Directors also get **New log or inspection**. Certification expiry dates are on the Staff page.

### Accountability

Where each client was, who they were with and why, on the same calendar as Calendar. Views: Calendar and List. Each day shows how many clients have an entry (for example 3/5). The day plan ends with "No entry yet for N people" and their UCIs, and **Log where someone was**.

**Add item** has the same menu as Calendar, starting with **Where someone was**. Click an entry to edit or delete it. Family do not see this page.

### Documents (director)

The binders: completed and filed paperwork, organized the way licensing expects. Blank forms are on Templates.

- **Client binders**: one row per client. Click one to open that client's binders here (the same files as their Files tab), with New from template and Link a document.
- **Staff binder**: one row per staff member, with forms assigned to them and how many are still to acknowledge.
- **Agency binders**: the team's own. The stock ones are the Agency binder (face sheet, emergency info, insurance, IPP, SIR), the Medical binder and the Daily Logs binder.
  - Open a binder to see Resources & guidelines, "Forms that file here", and its tabs.
  - Binder ⋯: Open or Close binder, Add a document, Add a tab, Rename binder, Export binder, Delete binder.
  - A filed document shows "✓ Signed" with who and when, or a **Sign** button. Its ⋯: Open, Rename, Move to another binder or tab, Export, Delete.
- **Recent activity**: documents and templates added, changed, signed, assigned or deleted.

Buttons:

- **New binder**.
- **Upload document**: File, Title, Binder, Subfolder. The Subfolder choice decides what it becomes:
  - "Blank forms (the Templates page)": a blank form, optionally "Make this editable in-app"
  - "Resources & guidelines": a reference document
  - a tab: a filed document
- **Edit binders**: drag to reorder, rename in place.

### Templates (director)

The blank forms the team works from, grouped as Agency binder templates, Medical binder templates, Daily Logs binder templates and Other templates. Each row says how many boxes or fields it has, which binder its signed copies file to, who it is assigned to, and whether an incident type uses it.

- **Create new template**: build a form block by block.
- **Upload a form**: turn a PDF or a photo of a paper form into a template that keeps the original page. It carries the Ask Spectrum sparkle because the form reader is AI.
- Click a row to open the template editor.
- Row ⋯: Fill it in, Open the template, Rename, Assign to staff, Print blank, Delete template.
- **Incident protocols**: one per kind of incident, with first steps, who to call, the hours to report within, and which template is its report form. All protocols, New protocol.

The two editors:

- **Create new template** ("New template"):
  - "Add a field" bar: Short answer, Long answer, Date, Time, Amount, Yes / no, Multiple choice, Table, Checklist, Section heading, Paragraph, Signature, plus More… (Rating, Person, Place, Email, Phone, Link, File or photo, Title, Divider)
  - a format bar (size, bold, italic, underline, colour, alignment)
  - Click a kind, then click where it goes, or drag it there. Click a label to rename it.
  - Footer: Fill it in, Assign to staff, Cancel, Print preview, **Save template**
- **Upload a form** ("Set up the uploaded form"):
  - Undo, Revert, **Find boxes**, and "Add a box": Text, Paragraph, Date, Time, Amount, Tick box, Signature
  - Click a box to name it ("What goes here?"), change its kind, Duplicate or Remove it. Drag to move, pull the corner to resize. Boxes in a table can be changed a column or row at a time.
  - Footer: Fill it in, Assign to staff, Cancel, Print blank, **Save template**
  - The page itself cannot be changed, only the boxes on it

Create new template has "Files to" under its name: the binder its copies file to, which is also the section it is kept in on Templates (or a client's or a staff member's file). Upload a form has "Keep it in Templates", which picks the section; the note under it says where signed copies go.

### Directory (director)

Providers, programs and resources the team refers to, in category tabs, with sort and search.

- **Add entry**: Category, Name, Organization, Phone, Fax, Email, Notes, and "Who sees this provider" (tick clients, or none for the whole team).
- Open an entry for Call, Email, Delete or Save changes.
- **New category** at the end of the tabs; on a category tab, "Rename, icon and color" and Delete category.

Entries ticked for a client show on that client's Directory tab.

### Change log (director)

Every change made in the portal, with who made it and the client ID (never client names). Tabs: Everything, Documents, People, Care, Admin. Search, newest or oldest first, and All time, Today, Last 7 days, Last 30 days.

- **Add entry**: Category, What happened, Detail; Add to the log.
- **Export / print**.

### Family pages

Overview (their home page), Appointments (read-only calendar), Documents ("Shared with you by the care team") and Messages, all for their one client only. In a real team on Development, the family preview says "Nothing to show yet", because family sign-ins do not exist in this pilot.

### Messages (top bar envelope)

Directors and staff open Messages with the envelope in the top bar; its red number counts unread messages.

- Left side: **Team** (everyone with a sign-in, then staff with "Not signed in yet"), then **Conversations**. A green dot means someone was in the portal in the last few minutes; otherwise it says "Last seen 2 h ago" or similar. "New" marks people for a week after joining.
- **New message**: To (a director, a staff member, or a house team as a group), Subject, Message, then **Send message**.
- Clicking a person under Team opens your conversation with them, or starts one.
- ◫ attaches a document by reference; the other person opens it in the portal.
- Directors can delete a conversation (✕).

While Messages is open, new messages arrive on their own and a half-typed message is kept. Elsewhere the unread count updates about once a minute.

### Notifications (top bar bell)

A panel with Upcoming appointments (with a Reminders link), System notifications (task assigned, onboarding shared, SIR clock started and so on), unread Messages & questions, and every item that needs attention. Click an item to go to it. For staff, the "Welcome to the portal" and "Onboarding checklist shared" notices open their onboarding checklist.

### Ask Spectrum (top bar)

The AI assistant. Open it with **Ask Spectrum** at the top right (a floating button on a phone or tablet).

- Type a question and press Enter, or tap a suggested question. A microphone button appears on browsers that support speech.
- **New chat** starts over. **Past chats** lists your earlier chats (yours only).
- Every page has an Ask Spectrum chip under its title with a ready question; on a client's page it asks for that client's last week.
- It answers only from records the person is allowed to see.

### Your profile and Account settings

Click your name at the bottom of the sidebar for your **profile**: credentials (Add credential), and for staff with a checklist shared with them an **Onboarding** tab ("Onboarding · 2 of 5"), where they tick each step as they do it, About (sign-in email, Team alerts and Team website for directors, role, time zone), Preferences (date format and time format, 12-hour or 24-hour), your signed agreement, and Account settings, "Start over on this dashboard" and Sign out. Directors also see **Workspace: <team name> ✎ Edit** under their name, which renames the team for everyone.

**Settings** (top of the profile) or **Account settings** opens the Account window:

- **Profile**: name, sign-in email, role, time zone (Change).
- **Security**: Change password.
- **Notifications**: Notification settings (directors) or What reaches me (staff); "Run setup again" for the director who set up the team.
- **Team access** (director): everyone who can sign in, Remove for staff, **Invite a director**.
- **Demo vs. Development** (director).
- **Workspace data** (director): "Restore sample data", "Erase all data (clean slate)". Erasing is permanent for everyone.
- **Lists** (director): Manage houses, Manage task categories.
- **Demonstration view** (director).
- **Colors** (director): Homes, Attention.
- **Names** (director): Rename menus and binders.
- **Certification reminders** (director): how many days ahead, and who is told.
- **Session**: auto sign-out after 15 minutes, 30 minutes or 1 hour idle, or Never. Your setting only.
- **Staff display** (director): Full names or Initials only.
- **Switch view** (directors).

### Page settings (the gear)

The gear opens a window titled **Settings** with up to three tabs. Staff reach it only from Calendar, and only see Calendar integrations.

- **Editing tool** (director): **Edit this page** (rename titles, drag sections, hide sections, add your own notes, table or quick links; the layout is yours and follows your login), **Rename menus and binders**, and on Tasks, **Task colors**.
- **Display settings** (director): **Houses** (Add house), **Appointment types** (New type), **Attention icons**, and on Calendar and Home, **Calendar colors and text**.
- **Calendar integrations**: Google Calendar (Connect, Refresh, Disconnect) and, once connected, Your Google calendars (the main one, the others you added with ✎ and ✕, Add another Google calendar and Connect another Google account). With two or more Google accounts it is **Your Google accounts**: each account with its calendars under it, **Main** on the one portal appointments go to, **Use for appointments** on the others, ✎ (a name and colour only you see) and **Disconnect** (that account only); for directors the team's calendars with New calendar, Contractors and Access ("Who sees each calendar"); Calendars and filters.

Edit mode shows a gold **Done editing** button. On Tasks, Safety log, Accountability, Training & onboarding, Documents, Templates and the staff page, a **Customize layout** button at the bottom corner also turns it on (staff see it on their pages too). On those pages and on Clients, the client page and Staff, the Edit, ✎ and ✕ buttons stay hidden until edit mode is on.

### Customize your home page

The gear on Home opens it.

- **Look**: Clear agenda (light header, numbers in tiles) or Bold overview (green header, sections in a grid).
- **Today's schedule**: List, Timeline or Month.
- **Numbers at the top**: up to 4.
- **Pin what's next at the top**.
- **Sections**: tick, drag or use the arrows; **Add your own section**.

**Save** keeps it for you on every device. Directors also get "Team default for: Directors, Staff, Families", which sets what each role sees until each person sets up their own.

### Search, help and the rest of the top bar

- **Search** ("Search clients by UCI, staff, appointments"): type two or more letters. Press / to jump to it.
- **Help and support** (the ? button, or the sidebar footer): write to support@aiparagonconsulting.com.
- **Pilot agreement** (sidebar footer): read the agreement.
- A red **!** button appears if something did not save. Click it to see what and why.

---

## 3. How do I…

### Getting in

**1. Start a new team.**

1. Sign-in page > "Get your team started".
2. Team name, Your name, Your role, Work email, password > Create team account.
3. Answer the setup questions > Open my workspace. The first is "What's your role?" (Program leadership, Care provider, Family member or guardian, Just looking around). Program leadership then gives the organization name and kind of program, how many people it supports, what to organize first, and how it tracks things today.
4. Pilot Dashboard Agreement: legal entity name, license number(s), your name and title, tick > Continue.

**2. Join from an invite.** Open the emailed link > choose a password (or enter your existing one) > "Join <team name>" > accept the pilot agreement. "Already used" means sign in instead; "not valid" means ask the director for a new link.

**3. Reset a forgotten password.** Sign-in page > Forgot password? > email > Send reset link. The link works once, for an hour.

**4. Change your password.** Your name (sidebar) > Settings > Security > Change password.

**5. Sign out.** The power button on your name card, or profile > Sign out. This signs out this device only.

### Setup and settings

**6. Switch between Demo and Development.** Your name > Settings > Demo vs. Development > Demo or Development. Director only. The "Switch to Development" link in the Demo banner goes to the same card.

**7. Open the demo view.** Your name > Settings > Demonstration view > "Open the demo dashboard with sample data". Or add `?demo=1` to the portal address.

**8. See what staff or a family member see.** Your name > Settings > Switch view > Switch view > Care staff or Family member.

**9. Rename a menu item or a binder.** Your name > Settings > Names > Rename (or any page's gear > Editing tool > Rename menus and binders). Type the team's own name, for example what the regional center calls the Agency binder, and click Save names. Blank keeps the standard name. Everyone sees the change. A single binder can also be renamed from its ⋯ > Rename binder on Documents.

**10. Customize the home page.** Home > the gear > Look, Today's schedule, numbers, sections > Save.

**11. Change reminders, alerts and the daily summary, or the Team alerts email.** Your name > Settings > Notifications > Notification settings (director). Three tabs:

- **Reminders**: Appointments (hours before), New tasks, Portal messages (after how long without a reply), Daily logs (check time).
- **Activity**: who is told when something happens.
- **Daily summary**: Never, Every day or Once a week, the time, who gets it, what it covers; "Preview mine" and "Email me a test copy".

For each, choose Who and How (In the portal, Email). Staff see their own under Settings > Notifications > What reaches me. SIR deadline alerts and the overdue digest go to the Team alerts email: your name (profile) > About > Team alerts > Add or edit.

**12. Add a house or an appointment type.** Any page's gear > Display settings > Houses > Add house, or Appointment types > New type. The + next to Type in the appointment form also adds a type.

### People

**13. Add a client.** Clients > Add client > Client ID (UCI, exactly 7 digits), Age, Home, Program, Guardian, Standing alerts (comma separated), How to support this person > Save client. A second window offers to add a progress note, IPP goals or the weekly checklist. A UCI already in use is refused.

**14. Edit a client's details.** Open the client > the gear > Editing tool > Edit this page > Edit on the Profile card > Done editing. Director only.

**15. Add a staff member and invite them.** Staff > Add staff > fill in the form, including the work email, keep "Email them an invite to sign in" ticked > Add staff member.

**16. Invite someone already on the roster.** Staff > their name > turn on edit mode (the gear > Editing tool > Edit this page, or Customize layout) > Invite to the portal (or Edit details > Invite) > check the email > Create invite link > Email the invite now. Copy link, Gmail draft and Mail app are there too.

**17. Invite another director.** Your name > Settings > Team access > Invite a director > Full name, Email, Title > Create invite link > Email the invite now.

**18. Remove someone's sign-in.** Your name > Settings > Team access > Remove > Remove access. Their sign-in stops opening the workspace and any invite sent to them stops working. Their staff record stays.

**19. Limit which clients a staff member can open.** Staff > their name > Client access > "Only these clients:" > tick them > Save access.

**20. Add or change a shift.** Staff > Add shift, or Calendar > Add item > Shift > staff member, date, start, end, house > Add shift. To change one, click the person on the calendar day plan. An end time earlier than the start means the shift ends the next day. The staff member is notified.

**21. Add a certification.** Staff > their name > Certifications > Add credential > name and expiry date > Save. Staff can add their own on their profile.

**22. Assign onboarding.** Training & onboarding > Onboarding checklists > open one > Share with a new hire > pick the person > Share checklist. Or Staff > their name > Share onboarding steps > tick the steps > Share with them. Sharing another checklist adds its steps to what the person already has; their ticks stay. New staff get the team's steps automatically. The new hire ticks the steps on their profile's Onboarding tab (or My shift > Your training > Onboarding checklist > Open); you see their progress on their staff page.

**23. Assign a training course.** Training & onboarding > open the course > Assign, or Staff > their name > Assign a course. It shows on their My shift page under Training to finish, and they are told. Remind outstanding nudges anyone not finished.

**24. Get staff to acknowledge a guide.** Training & onboarding > Readiness guides > Add guide > Add guide. Staff click Acknowledge on My shift. Open the guide to see who has, and use Remind pending.

### Daily work

**25. Assign or add a task.** Tasks > Assign task (director) or Add task (staff) > Task, Assign to, Due date, Client (optional), Priority, Category > Assign task. Or Calendar > Add item > Reminder or task.

**26. Finish a task.** Tick its box on Tasks, or open it > Mark done. "Sign off as <name>" records a signed sign-off.

**27. Add an appointment, event or meeting.** Calendar > Add item > Appointment (or Home > Add appointment, or the client's Appointments tab). Fill in Client, Type, Title (blank stays anonymous), Calendar, Date, Time, Duration, Provider, Location, Preparation note, and "Also send to Google Calendar" (ticked by default) > Save appointment. For a team event or meeting: Calendar > Add item > Event or outing (or Meeting); Client stays "No one client (the whole team)" unless you pick one > Save event or Save meeting.

**28. Reschedule or cancel an appointment.** Click it on the calendar. Reschedule: new date and time > Save new time. Cancel: Cancel appointment (Restore appointment undoes it). A connected Google Calendar is updated too.

**29. Log where a client was.** Accountability > Add item > Where someone was (or "Log where someone was" on a day) > Person, Date, From, To, Where, Who they were with, Why, Notes > Log it.

**30. Record vitals or a daily-living log.** The client > Care > pick the day > Record vitals (save with Record) or Log an activity (save with Log it).

**31. Write a progress note.** The client > Overview > Progress notes > Write note > note and category > Save note. For a goal: IPP goals & notes > Open goal & notes > Progress note > Save changes.

**32. File an incident or SIR.**

1. Start from My shift > Report an incident (staff), or the client page > Report incident.
2. Pick the client (UCI) and Type. The type's protocol steps and who to call appear.
3. Date, Time, Severity (Minor, Moderate, Serious).
4. Fill in the type's report form, or "What happened" (facts and times only).
5. Tick who has been told (saved with the report) > File report.

The written-report clock starts (24 hours unless the protocol says otherwise) and the protocol walkthrough opens. If the type has a report form, the completed form is filed in the Agency binder (SIR tab) and the client's Files.

**33. Follow up and close an incident.** The client > Incidents > the report. Click Mark notified for each required notification (regional center, guardian, licensing written report), add follow-up notes, work through Protocol steps, then Close report.

**34. Print a SIR.** Open the incident. At the bottom are two print buttons: Print SIR, and a UCI-only version beside it. Use the UCI-only one for anything going outside the team.

**35. Log a fire drill or water temperatures.** Safety log > Fire drill log > Log a drill, or Water temperature log > Add reading > fill in each line > Complete & file to logs. It files to the Daily Logs binder and the log updates.

**36. Run an inspection.** Safety log > Digital inspections > the inspection > Start inspection > answer each line > Complete & file to logs.

**37. Upload a signed paper log.** Safety log > Signed paper logs > Upload signed log. To get paper first: open the log > Print for wet signatures.

### Forms and documents

**38. Upload a paper form as a template.**

1. Templates > Upload a form > "A blank form".
2. Choose the PDF, or a photo or scan of the paper form (on a phone, take a photo).
3. Pick the language the form is in, a Template name, and where to keep it > Set up the form.
4. Check each box found: name it, change its kind, move or resize it. Add any it missed from "Add a box".
5. Save template.

Use the blank form, not a filled-in copy. "Find boxes" looks again later.

**39. Build a template from scratch.** Templates > Create new template > Template name > add fields from "Add a field" > Save template.

**40. Fill in and sign a form.**

1. Open it: Templates > the form's ⋯ > Fill it in; or for a client, Files > New from template > Start; or for staff, My shift > Documents assigned to you > Open & fill.
2. Type the answers. For a signature: Sign here > draw with a mouse or finger (or Type instead) > Use this signature.
3. Then:
   - **Save draft**: pick the name, binder, Subfolder, and optionally a client or staff file > Save to binder. Come back to it any time.
   - **Sign and finalize**: confirm, and if it is not filed yet, pick where it goes. A finalized copy cannot be changed by anyone.

**41. Find a signed form.** Documents > the binder > the tab; signed copies show "✓ Signed" with who and when. For a client: their Files tab, or Documents > Client binders > the client. Documents > Recent activity also lists recent signing.

**42. Change a signed form.** Open the signed copy > Copy as a new draft. The signed copy stays; edit and sign the new draft.

**43. Upload a document or completed form.** The client > Files > Upload (pick the binder and tab), or Documents > Upload document, or Templates > Upload a form > "A completed or signed form" > choose a binder, a client's file or a staff member's file > File it. Up to 25 MB. Titles use the UCI, never names or dates of birth.

**44. Print a blank form.** Templates > the form's ⋯ > Print blank. In an editor: Print blank (uploaded forms) or Print preview (built forms).

**45. Assign a form to staff.** Templates > the form's ⋯ > Assign to staff > click names > Save assignment. They see it on My shift.

**46. Add a binder or a tab.** Documents > New binder > name > Create binder. For a tab: the binder's ⋯ > Add a tab.

### Communication

**47. Message someone.** Top bar envelope > New message > To, Subject, Message > Send message. Or click their name under Team. Refer to clients by UCI only.

**48. Ask Ask Spectrum something.** Top bar Ask Spectrum > type > Enter. Or click the chip under any page title.

**49. Connect Google Calendar.** Calendar > Connect Google Calendar (or the gear > Calendar integrations > Connect) > pick the Google account > allow. It stays connected until Disconnect. Each person connects their own account.

**49a. Show another of your Google calendars.** With Google connected: Calendar (or Home) > **＋ Google calendar**, or the gear > Calendar integrations > Your Google calendars > **＋ Add another Google calendar**. Paste the calendar's ID: in Google Calendar, Settings > under "Settings for my calendars" click the calendar > Integrate calendar > Calendar ID (an embed link works too) > **Add calendar**. It gets its own chip and colour, and its events show on the Calendar page and Home, only to you. Only calendars you own can be added this way; one someone shared with you says "That calendar isn't yours". Rename, recolour (✎) or remove (✕) it under Your Google calendars; removing it changes nothing in Google. Portal appointments are still sent to your main Google calendar only.

**49b. Hide a calendar.** Click its chip on the Calendar page or over Home's schedule. Click again, or **Show all**, to bring it back. To hide all of one Google account's calendars at once, click the account's name in front of its chips (in the All view).

**49c. Connect another Google account (a work and a personal one, say).** With Google connected: Calendar > **＋ Google account**, or the gear > Calendar integrations > **＋ Connect another Google account** > pick the other Google account in Google's window > allow. Its calendar shows next to the first one's, only to you, and both stay connected until disconnected. Up to 5 accounts. To disconnect just one: the gear > Calendar integrations > Your Google accounts > **Disconnect** on that account.

**49d. Switch views.** Over Home's schedule or on the Calendar page: **View** > **All**, **Portal** (only the team's calendars), or one Google account (only its calendars). The choice stays until changed, on both pages.

**49e. Choose which Google account gets portal appointments.** The gear > Calendar integrations > Your Google accounts > **Use for appointments** on that account. Appointments sent to Google from then on go there (the account marked **Main**), and its events can be edited from the portal. Appointments sent before stay in the account they went to, and changes to them still reach it.

**49f. Name a Google account.** The gear > Calendar integrations > Your Google accounts > ✎ > a name (such as Work) and a colour > Save. Only you see it, on the View bar, the chips and the tag on its events. Nothing changes in Google.

**50. Export a client's whole record.** The client > Export record > "Save as PDF" in the print window.

---

## 4. What leaves the portal

The rule: clients are named by UCI inside the portal and by nothing outside it. Anything sent out has every client's UCI, name and initials, any other 7-digit number, email addresses and phone numbers taken out.

### Google Calendar

When "Also send to Google Calendar" is ticked, Google gets:

- the title, with client names, initials and UCIs taken out
- the date, time and length
- the place, with the same taken out
- a fixed note: "From the care portal. Client details stay in the portal."

If the person's Google Calendar is connected, the event goes straight onto their own Google Calendar, and rescheduling or cancelling follows it. If not, Google Calendar opens in a new tab, filled in, and they save it with one click.

With Google connected, the person's Google events (the main calendar of each Google account they connected, and any other Google calendars they added) show on the portal calendar and their home page, to them only. A calendar added by its ID is read with the account that owns it. A Google event whose title names a client is shown with initials. The portal reads those calendars; it never writes to the extra ones. It asks Google only for permission over events on calendars the person owns. A list of all their Google calendars, shared ones included, is built but switched off until Google approves two more permissions (see CLAUDE.md, section 2).

### Ask Spectrum

With each question the page sends the question, a snapshot of the records the person can see, and the last few exchanges, through AI Paragon's server to the AI model (Claude). Before it leaves:

- each client becomes "Client 1", "Client 2" (the same number all session)
- each house becomes "Home A", "Home B"
- identity boxes on forms (name, date of birth, address, phone, email, insurance and ID numbers, emergency contact) become "[withheld]"
- UCIs, names, initials, emails and phone numbers are swapped out

The answer comes back with the portal's own names put back. What does go out is the content of records without identifiers: appointments, notes, form answers, dates. Whether that needs more limits is an open decision (CLAUDE.md, Compliance rules). If the AI service cannot be reached, Ask Spectrum gives a simpler answer worked out on the page.

### Emails

The portal does not write its emails. It names the kind of email and the recipient, and AI Paragon's server writes it from fixed wording.

- **Invite**: the team's name, the person's name and role, the one-time link, and that they can sign in any time at np.aiparagonconsulting.com afterwards.
- **Reminders and alerts**: that something is waiting and when. Never a client's name, ID or anything from their record. A task email gives the due date, not what the task is. A message reminder says a secure message is waiting, not what it says.
- **Daily or weekly summary**: counts only. It never names a client or a task.
- **SIR deadline alerts and the overdue digest**: how many and how soon, to the Team alerts address.
- **Password reset**: a link that works once, for an hour.

Messages between team members stay in the portal; their content is never emailed.

### Incidents

Filing an incident creates a notice in the portal only: the type, the house, the time and who reported it. No client ID and no description leave the portal.

### Uploaded forms

The box finder and word reader run on the person's own computer. Nothing about the form is sent anywhere to read it. The first time a language is used, the reader downloads its language data (about 7 MB for English) and keeps it.

### Printing

Printouts and PDFs are made by the browser on the person's computer. The SIR has a UCI-only print for sharing.

---

## 5. Limits and not built yet

- **No texting.** No SMS provider yet. Notification settings show Text as "coming soon".
- **No DocuSign.** Signatures are drawn or typed in the portal, and a finalized copy is locked with who signed and when. Anything needing wet ink can be printed. Whether the regional center accepts drawn signatures is still being confirmed.
- **Handwriting is not read.** On a photo of a filled-in form the writing is cleared and the boxes kept; a scanned PDF keeps its writing and the editor asks for a blank form. Upload blank forms.
- **Word files** cannot keep their look; they are read into an editable form. Save as PDF first to keep the original page.
- **File limits.** 25 MB per file. Only the first 20 pages of a PDF are kept.
- **No family sign-ins.** The family view is a preview only.
- **Live updates.** Only messages arrive on their own. Other changes by teammates show after a reload.
- **Tabs for new templates.** A template made with Create new template or Upload a form has no tab picker, so its signed copies land in the binder with no tab. Built-in templates file under a tab.
- **No incident types at the start.** A new team has none. The first report needs "＋ Create new…" under Type, or a protocol added first under Templates > Incident protocols.
- **Official form layouts.** The real regional center template layouts are not loaded yet.
- **No medication tracking.** Medication records were removed; the MAR is only a printable blank form.
- **Invite and alert emails.** As of Oct 27 none had been seen arriving in production. If an invite does not arrive, use Copy link or Gmail draft in the invite window and send the link another way.
- **Google Calendar.** Google approved the calendar permission on Nov 5, 2026. Each person connects their own calendar. The appointment form says staff listed under "Only these staff" get a Google Calendar invite; the server sync behind that does nothing for current teams (CLAUDE.md section 2), so do not promise it. Each person's own connection is what works.
- **No phone app.** It runs in the phone's browser.
- **Sign-out** ends the sign-in on this device only.
- **If a sign-in runs out** (for example after a laptop sleeps), the portal shows the sign-in page with the reason, and changes that did not save are sent once the person signs back in.
