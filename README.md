# Hotel Shuttle Booking App

Connects guests, front desk, and drivers around a shared shuttle schedule (7:00 AM-2:00 PM and
4:00 PM-10:00 PM, hourly runs) to the airport, stadium, ferry terminal, and train station.

- Guests scan a QR code -> land on `/book.html` -> submit name, party size, email, phone, room
  number, destination, direction, and 2-3 preferred time slots.
- An allocation engine clusters guests by demand into slots (max 20 people per slot). Airport and
  Train Station may share a slot as long as their combined total stays at or under 20; every other
  destination gets an exclusive slot.
- Guests get an email once a slot is assigned, with buttons to accept, reject, or request a
  different time. Requesting a change no longer auto-confirms - it goes to front desk for
  approval, and the guest is emailed either way (approved into the new time, or kept at their
  original time if rejected).
- Front desk and driver share a single dashboard and a single link (`/dashboard.html`) - no login,
  no role split. It has five tabs: **Today** (resets automatically at 7:00 AM, the start of the
  shuttle day), **Previous Day**, **Upcoming** (any future date up to 4 months out), **History**
  (past dates), and **Settings** (hotel name, front desk phone/email, QR code). Slots are
  color-coded green/yellow/red as they fill, and staff can multi-select requests and regroup them
  into a time slot in one action, which emails everyone in the batch.

## Project layout

```
server.js            Express app entry point
config/db.js          MongoDB connection
models/               Booking, SlotOverride (blocked slots), Config (hotel name/phone/email)
utils/slots.js         Fixed daily timetable, destination grouping, 7 AM day-rollover, slot colors
utils/allocate.js      The clustering/allocation algorithm
utils/mailer.js        Gmail SMTP + email templates
routes/booking.js       Guest-facing booking API
routes/respond.js       Accept / reject / request-change API (used by the emailed link)
routes/admin.js         Shared front desk + driver dashboard API
public/                HTML/CSS/JS for book.html, respond.html, dashboard.html
```

`frontdesk.html` and `driver.html` still exist as redirect stubs to `dashboard.html`, in case
either link was already saved or bookmarked somewhere.

## 1. Run it locally first

You'll need [Node.js 18+](https://nodejs.org).

1. `cd shuttle-app`
2. `npm install`
3. Copy `.env.example` to `.env` and fill in `MONGODB_URI` (see step 2 below). You can leave
   `GMAIL_USER`/`GMAIL_APP_PASSWORD` blank for now - emails will just print to the terminal
   instead of sending. Optionally set `TZ` to the hotel's timezone (e.g. `America/New_York`) so
   the 7 AM day-rollover lines up with local time on the host.
4. `npm start`
5. Open `http://localhost:3000/book.html` (guest form) and
   `http://localhost:3000/dashboard.html` (shared front desk / driver dashboard).

## 2. Free database: MongoDB Atlas (permanent free tier)

MongoDB Atlas's M0 tier is free forever (512 MB storage, no expiration).

1. Go to https://www.mongodb.com/cloud/atlas/register and create a free account.
2. Create a new free **M0** cluster (any provider/region is fine).
3. Under **Database Access**, add a database user with a username/password.
4. Under **Network Access**, add IP address `0.0.0.0/0` (allow access from anywhere) so Render can
   reach it.
5. Click **Connect** -> **Drivers** -> copy the connection string. It looks like:
   `mongodb+srv://USER:PASSWORD@cluster0.xxxxx.mongodb.net/?retryWrites=true&w=majority`
6. Add a database name before the `?`, e.g. `.../shuttle?retryWrites=true...` - paste this into
   `MONGODB_URI` in your `.env` (and later into Render's environment variables).

## 3. Free email sending: Gmail App Password

Gmail's normal password won't work with Nodemailer - you need an **App Password**.

1. Turn on 2-Step Verification on the Gmail account you want to send from:
   https://myaccount.google.com/signinoptions/two-step-verification
2. Go to https://myaccount.google.com/apppasswords, sign in, and create an app password (name it
   "Shuttle App"). Google gives you a 16-character code.
3. Put the Gmail address in `GMAIL_USER` and the 16-character code (no spaces) in
   `GMAIL_APP_PASSWORD`.

Gmail's free sending limit is roughly 500 emails/day, which is more than enough for this use case.

## 4. Free hosting + free domain: Render

Render's free web service tier gives you a free `.onrender.com` subdomain, no credit card
required. The trade-off: it spins down after 15 minutes of no traffic and takes 30-60 seconds to
wake back up on the next request - fine for an internal booking tool.

1. Push this `shuttle-app` folder to a new GitHub repository (Render deploys from GitHub/GitLab).
2. Go to https://render.com, sign up free, click **New +** -> **Web Service**, and connect that
   repo.
3. Settings:
   - **Environment**: Node
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
   - **Instance Type**: Free
4. Under **Environment Variables**, add: `MONGODB_URI`, `GMAIL_USER`, `GMAIL_APP_PASSWORD`,
   `FRONTDESK_PHONE`, `BASE_URL` (set this to the Render URL you're given, e.g.
   `https://your-app-name.onrender.com` - you can update it after the first deploy once you know
   the final URL), and optionally `HOTEL_NAME`, `FRONTDESK_EMAIL`, and `TZ`. Hotel name and front
   desk phone/email can also be edited later from the dashboard's Settings tab without redeploying.
5. Click **Create Web Service**. After it builds, your app is live at
   `https://your-app-name.onrender.com`.
6. Update the `BASE_URL` environment variable to match that exact URL and redeploy (this is what
   gets used inside confirmation emails, so it must be correct).

## 5. Generate the QR code guests will scan

You don't need a separate QR tool - it's built in:

1. Open `https://your-app-name.onrender.com/dashboard.html` -> **Settings** tab.
2. Scroll to **Guest Booking QR Code** and click **Generate QR Code**.
3. It encodes `https://your-app-name.onrender.com/book.html`. Screenshot or right-click-save the
   image and print it for the front desk / guest rooms.

## How the allocation algorithm works

Run it from the front desk dashboard's **Run Allocation** button (any time - once a day, or
whenever new requests come in):

1. Airport and Train Station requests are pooled together (since they're allowed to share a
   slot); Stadium and Ferry are each their own pool.
2. Within each pool, guests' 1st-choice time slots are tallied. The slot with the most people
   requesting it as their #1 choice is filled first (up to 20 people), largest parties seated
   first so a big family isn't bumped by a string of solo travelers.
3. Anyone who didn't fit is retried against their 2nd choice, then 3rd choice, using the same
   majority-first logic.
4. Anyone who still doesn't fit after all 3 rounds is marked **Needs Review** for front desk to
   place manually (e.g. by opening an extra slot or contacting the guest).
5. Click **Send Allocation Emails** to email everyone their assigned time with accept/reject/
   change-time links.

Rejecting a slot outright takes no further action. Requesting a change shows the guest all
currently-open compatible slots, but picking one no longer auto-confirms - it flags the booking as
**Change Requested** on the dashboard. From there, staff either **Approve** it (moves the guest to
their requested slot and emails them the new time) or **Reject** it (the guest's original slot is
left untouched, and they're emailed that their time stands). Staff can also multi-select any set
of requests on the Today/Previous Day/Upcoming/History tabs and regroup them into a slot in one
action ("Assign & Email"), which is the quickest way to build out a day's schedule by hand instead
of relying only on the automatic algorithm.

Slots are color-coded on the dashboard as they fill: green (under half full), yellow (half to
full), red (full or blocked). Staff can block any slot at any time (e.g. driver unavailable,
vehicle in for service) by clicking it - blocked slots are skipped by the allocation algorithm and
hidden as options in guest emails.

## Notes / things to double check before go-live

- No login is used for `/dashboard.html` in this version - anyone with the link can view/edit
  bookings. Don't put that link on public signage; only share `/book.html` (or the QR code) with
  guests. Ask if you'd like a simple password added later.
- Pickup vs. drop-off is currently just a label saved on each booking for the driver's reference;
  the seat-count/slot-sharing rule is enforced at the destination level, not per direction.
- Gmail's free tier is meant for low-volume sending; if you expect very high booking volume,
  consider a dedicated transactional email service (e.g. SendGrid) later - the code in
  `utils/mailer.js` is written so swapping providers only touches that one file.
