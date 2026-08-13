# Hotel Shuttle Booking App

Connects guests, front desk, and drivers around a shared shuttle schedule (7:00 AM-2:00 PM and
4:00 PM-10:00 PM, hourly runs) to the airport, stadium, ferry terminal, and train station.

- Guests scan a QR code -> land on `/book.html` -> submit name, party size, email, phone, room
  number, destination, direction, and 2-3 preferred time slots.
- An allocation engine clusters guests by demand into slots (max 20 people per slot). Airport and
  Train Station may share a slot as long as their combined total stays at or under 20; every other
  destination gets an exclusive slot.
- Guests get an email once a slot is assigned, with buttons to accept, reject, or request a
  different time.
- Front desk and driver each get a dashboard (`/frontdesk.html`, `/driver.html`) to view all
  bookings, edit/reassign slots, block slots they can't run, and (front desk only) trigger
  allocation and send confirmation emails. No login is required for either dashboard in this
  version - keep those URLs off the public QR code.

## Project layout

```
server.js            Express app entry point
config/db.js          MongoDB connection
models/               Booking, SlotOverride (blocked slots), Config (front desk phone)
utils/slots.js         Fixed daily timetable + destination grouping rules
utils/allocate.js      The clustering/allocation algorithm
utils/mailer.js        Gmail SMTP + email templates
routes/booking.js       Guest-facing booking API
routes/respond.js       Accept / reject / request-change API (used by the emailed link)
routes/admin.js         Front desk & driver dashboard API
public/                HTML/CSS/JS for book.html, respond.html, frontdesk.html, driver.html
```

## 1. Run it locally first

You'll need [Node.js 18+](https://nodejs.org).

1. `cd shuttle-app`
2. `npm install`
3. Copy `.env.example` to `.env` and fill in `MONGODB_URI` (see step 2 below). You can leave
   `GMAIL_USER`/`GMAIL_APP_PASSWORD` blank for now - emails will just print to the terminal
   instead of sending.
4. `npm start`
5. Open `http://localhost:3000/book.html` (guest form), `http://localhost:3000/frontdesk.html`,
   and `http://localhost:3000/driver.html`.

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
   `FRONTDESK_PHONE`, and `BASE_URL` (set this to the Render URL you're given, e.g.
   `https://your-app-name.onrender.com` - you can update it after the first deploy once you know
   the final URL).
5. Click **Create Web Service**. After it builds, your app is live at
   `https://your-app-name.onrender.com`.
6. Update the `BASE_URL` environment variable to match that exact URL and redeploy (this is what
   gets used inside confirmation emails, so it must be correct).

## 5. Generate the QR code guests will scan

You don't need a separate QR tool - it's built in:

1. Open `https://your-app-name.onrender.com/frontdesk.html`.
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
   change-time links. Rejecting takes no further action; requesting a change shows the guest all
   currently-open compatible slots to pick from themselves.

Front desk and driver can block any slot at any time (e.g. driver unavailable, vehicle in for
service) from either dashboard - blocked slots are skipped by the allocation algorithm and hidden
as options in guest emails.

## Notes / things to double check before go-live

- No login is used for `/frontdesk.html` or `/driver.html` in this version - anyone with the link
  can view/edit bookings. Don't put those links on public signage; only share `/book.html` (or the
  QR code) with guests. Ask if you'd like a simple password added later.
- Pickup vs. drop-off is currently just a label saved on each booking for the driver's reference;
  the seat-count/slot-sharing rule is enforced at the destination level, not per direction.
- Gmail's free tier is meant for low-volume sending; if you expect very high booking volume,
  consider a dedicated transactional email service (e.g. SendGrid) later - the code in
  `utils/mailer.js` is written so swapping providers only touches that one file.
