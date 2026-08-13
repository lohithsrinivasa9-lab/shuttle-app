# Shuttle App Test Results

Run at: 2026-08-13T15:17:39.277Z
Result: **35/35 passed**

**How this was run:** against the real `server.js`/`routes`/`models`/`utils` code, using the
real Express, Nodemailer, and QRCode packages already installed in this project's
`node_modules`. The one exception is MongoDB: this test environment has no outbound network
access, so there is no reachable database to connect to here. A minimal in-memory stand-in for
Mongoose's API (find/create/save/etc.) was used just for this test run so the real business logic
(validation, the allocation algorithm, slot capacity/exclusivity rules, the guest response flow)
could be exercised end to end. Email sending was similarly not exercised for real (no Gmail
credentials were configured for this run) - Nodemailer's real `createTransport` still loads
correctly, it just wasn't asked to send. Once a real `MONGODB_URI` and Gmail app password are in
`.env`, running `npm start` uses the real database and sends real email - no code changes needed.

| # | Test | Result | Detail |
|---|------|--------|--------|
| 1 | GET /api/bookings/slots returns 13 slots | PASS | status=200 count=13 |
| 2 | POST /api/bookings creates B1 Stadium | PASS | status=201 |
| 3 | POST /api/bookings creates B2 Stadium | PASS | status=201 |
| 4 | POST /api/bookings creates B3 Stadium | PASS | status=201 |
| 5 | POST /api/bookings creates B4 Ferry | PASS | status=201 |
| 6 | POST /api/bookings creates B5 Airport | PASS | status=201 |
| 7 | POST /api/bookings creates B6 Train | PASS | status=201 |
| 8 | POST /api/bookings rejects missing email | PASS | status=400 |
| 9 | POST /api/bookings rejects only 1 preferred slot | PASS | status=400 |
| 10 | POST /api/bookings rejects invalid slot time | PASS | status=400 |
| 11 | POST /api/bookings rejects partySize > 20 | PASS | status=400 |
| 12 | GET /api/admin/bookings lists 6 bookings | PASS | count=6 |
| 13 | POST /api/admin/slots/block blocks 12:00 | PASS | status=200 |
| 14 | GET /api/admin/slots shows 12:00 blocked | PASS | blocked=true |
| 15 | POST /api/admin/allocate runs and allocates 6 bookings | PASS | {"allocated":6,"needsReview":0,"message":"Allocated 6 booking(s). 0 need manual review."} |
| 16 | Allocation produced the expected majority-cluster assignment | PASS | {"B6 Train":"16:00","B5 Airport":"07:00","B4 Ferry":"13:00","B3 Stadium":"09:00","B2 Stadium":"09:00","B1 Stadium":"10:00"} |
| 17 | Slot grid usage/group matches allocation (18/20 at 09:00, airport+train share pool) | PASS | {"time":"09:00","label":"9:00 AM","window":"morning","blocked":false,"blockReason":"","group":"STADIUM","used":18,"max":20,"remaining":2,"bookingCount":2} |
| 18 | POST /api/bookings creates oversized B7 Ferry Overflow | PASS | status=201 |
| 19 | POST /api/admin/allocate flags unfittable booking as NEEDS_REVIEW | PASS | {"allocated":0,"needsReview":1,"message":"Allocated 0 booking(s). 1 need manual review."} |
| 20 | PATCH /api/admin/bookings manually assigns B7 to 13:00 | PASS | "ALLOCATED" |
| 21 | PATCH /api/admin/config saves phone number | PASS | {"key":"singleton","frontdeskPhone":"+1 (555) 111-2222","_id":"71d32b9c38ac79e71d313c37"} |
| 22 | GET /api/admin/config returns saved phone number | PASS | {"key":"singleton","frontdeskPhone":"+1 (555) 111-2222","_id":"71d32b9c38ac79e71d313c37"} |
| 23 | GET /api/admin/qrcode returns a PNG image | PASS | status=200 type=image/png bytes=2518 |
| 24 | POST /api/admin/slots/block can unblock 12:00 again | PASS | blocked=false |
| 25 | GET /api/respond/:token shows B2's assigned slot | PASS | {"name":"B2 Stadium","destination":"STADIUM","direction":"DROPOFF","date":"2026-08-20","partySize":8,"assignedSlot":"09:00","assignedSlotLabel":"9:00 AM","status":"ALLOCATED"} |
| 26 | POST /api/respond accept -> CONFIRMED | PASS | {"ok":true,"status":"CONFIRMED"} |
| 27 | POST /api/respond reject -> REJECTED | PASS | {"ok":true,"status":"REJECTED"} |
| 28 | Rejecting B3 frees its 10 seats at 09:00 (18 -> 8 used) | PASS | used=8 |
| 29 | POST /api/respond change (no slot) -> CHANGE_REQUESTED | PASS | {"ok":true,"status":"CHANGE_REQUESTED","needsSelection":true} |
| 30 | GET alternatives excludes slots held by a different destination group | PASS | alternatives=08:00,09:00,11:00,12:00,17:00,18:00,19:00,20:00,21:00 |
| 31 | POST /api/respond change with valid newSlot -> CONFIRMED at new slot | PASS | {"ok":true,"status":"CONFIRMED","assignedSlot":"09:00"} |
| 32 | GET /api/respond/:token with bad token -> 404 | PASS | status=404 |
| 33 | POST /api/respond with unknown action -> 400 | PASS | status=400 |
| 34 | POST /api/respond change into a cross-group slot -> 409 | PASS | {"error":"That slot just filled up. Please pick another."} |
| 35 | POST /api/admin/allocate with no pending bookings reports 0/0 | PASS | {"allocated":0,"needsReview":0,"message":"No pending bookings for this date."} |
