# Shuttle App Test Results

Run at: 2026-08-18T02:31:09.971Z
Result: **66/66 passed**

**This round covers:** destination-exclusivity + capacity now enforced on every manual
assignment path (PATCH, bulk-assign, approve-change), not just the automatic algorithm and guest
self-service; a required reason (emailed to the guest) when front desk changes an
already-assigned/confirmed time; blocking preferred time slots that have already passed today;
name/email/phone/room-number validation (phone validated per-country digit length, floor 3-5 room
dropdowns); room number optional for pick-up trips; a pooled/queued mailer so concurrent sends
don't race or get throttled; and a date-range bookings query that powers the new Upcoming/History
agenda view. Also separately verified: legacy_test.js (2/2) for pre-migration bookings that lack
roomNumbers.

Not covered by this API-level suite (dashboard-only / client-side, verified by code review): the
Upcoming/History agenda grouping and "Load more" pagination, dashboard auto-refresh polling, the
guest-detail popup, the reason prompt UI, and the guest booking form's floor/room and phone-country
dropdowns, inline validation messages, and date-reset button.

| # | Test | Result | Detail |
|---|------|--------|--------|
| 1 | GET /api/bookings/slots returns 13 slots | PASS | status=200 count=13 |
| 2 | GET /api/bookings/rooms returns floors 3-5 with correct ranges | PASS | [{"floor":3,"count":53},{"floor":4,"count":55},{"floor":5,"count":55}] |
| 3 | GET /api/bookings/phone-countries includes USA with +1 dial code | PASS | {"code":"US","name":"United States","dial":"+1","digits":[10]} |
| 4 | POST /api/bookings creates Stadium First | PASS | status=201 |
| 5 | POST /api/bookings creates Stadium Second | PASS | status=201 |
| 6 | POST /api/bookings creates Stadium Third | PASS | status=201 |
| 7 | POST /api/bookings creates Ferry Guest | PASS | status=201 |
| 8 | POST /api/bookings creates Airport Guest | PASS | status=201 |
| 9 | POST /api/bookings creates Train Guest | PASS | status=201 |
| 10 | Pickup booking with no room numbers is accepted (room optional for pickups) | PASS | [] |
| 11 | POST /api/bookings accepts multiple room numbers, trims/drops blanks | PASS | ["401","402","403"] |
| 12 | POST /api/bookings rejects an empty room list for a drop-off trip | PASS | status=400 |
| 13 | POST /api/bookings rejects missing email | PASS | status=400 |
| 14 | POST /api/bookings rejects only 1 preferred slot | PASS | status=400 |
| 15 | POST /api/bookings rejects invalid slot time | PASS | status=400 |
| 16 | POST /api/bookings rejects partySize > 20 | PASS | status=400 |
| 17 | POST /api/bookings rejects a name containing digits | PASS | status=400 |
| 18 | POST /api/bookings rejects a malformed email address | PASS | status=400 |
| 19 | POST /api/bookings rejects a US phone number with the wrong digit count | PASS | status=400 |
| 20 | POST /api/bookings rejects a room number outside any valid floor range | PASS | status=400 |
| 21 | isSlotPast correctly flags past vs future slot times (no buffer beyond already-started) | PASS | past=true future=false startingNow=true |
| 22 | POST /api/bookings rejects a preferred slot that has already passed today | PASS | status=400 slot=07:00 |
| 23 | GET /api/admin/bookings lists 6 bookings | PASS | count=6 |
| 24 | GET /api/admin/bookings?from=&to= returns bookings spanning multiple dates | PASS | status=200 dates=2026-08-20,2026-09-01 |
| 25 | POST /api/admin/slots/block blocks 12:00 | PASS | status=200 |
| 26 | GET /api/admin/slots shows 12:00 blocked | PASS | blocked=true |
| 27 | POST /api/admin/allocate runs and allocates 6 bookings | PASS | {"allocated":6,"needsReview":0,"message":"Allocated 6 booking(s). 0 need manual review."} |
| 28 | Allocation produced the expected majority-cluster assignment | PASS | {"Stadium First":"10:00","Stadium Second":"09:00","Stadium Third":"09:00","Ferry Guest":"13:00","Airport Guest":"07:00","Train Guest":"16:00"} |
| 29 | Slot grid usage/group matches allocation (18/20 at 09:00, airport+train share pool) | PASS | {"time":"09:00","label":"9:00 AM","window":"morning","blocked":false,"blockReason":"","group":"STADIUM","used":18,"max":20,"remaining":2,"bookingCount":2,"level":"yellow"} |
| 30 | POST /api/bookings creates Exclusivity Check Guest (unassigned) | PASS | status=201 |
| 31 | bulk-assign blocks moving a booking into a slot already claimed by a different destination group | PASS | {"ok":true,"updated":0,"emailed":0,"emailSkipped":0,"blocked":1} |
| 32 | PATCH /api/admin/bookings also blocks assigning into a conflicting destination group's slot | PASS | {"error":"That time is already running to stadium. Pick a slot not already claimed by a different destination."} |
| 33 | bulk-assign requires a reason when moving an already-assigned booking without one | PASS | {"error":"1 of the selected guest(s) already have a confirmed time - a reason is required to change it.","needsReason":true} |
| 34 | bulk-assign succeeds once a reason is supplied | PASS | {"ok":true,"updated":1,"emailed":0,"emailSkipped":0,"blocked":0} |
| 35 | Changed booking now shows the reason as its review note and is CONFIRMED | PASS | {"assignedSlot":"17:00","status":"CONFIRMED","reviewNote":"Driver requested a route change"} |
| 36 | POST /api/bookings creates oversized Ferry Overflow Guest | PASS | status=201 |
| 37 | POST /api/admin/allocate flags unfittable booking as NEEDS_REVIEW | PASS | {"allocated":0,"needsReview":2,"message":"Allocated 0 booking(s). 2 need manual review."} |
| 38 | PATCH /api/admin/bookings manually assigns Ferry Overflow Guest to 18:00 | PASS | "ALLOCATED" |
| 39 | PATCH /api/admin/config saves phone number | PASS | {"key":"singleton","frontdeskPhone":"+1 (555) 111-2222","hotelName":"Our Hotel","frontdeskEmail":"","_id":"a2bd3a9fb7990151b358e800"} |
| 40 | GET /api/admin/config returns saved phone number | PASS | {"key":"singleton","frontdeskPhone":"+1 (555) 111-2222","hotelName":"Our Hotel","frontdeskEmail":"","_id":"a2bd3a9fb7990151b358e800"} |
| 41 | GET /api/admin/qrcode returns a PNG image | PASS | status=200 type=image/png bytes=2518 |
| 42 | POST /api/admin/slots/block can unblock 12:00 again | PASS | blocked=false |
| 43 | GET /api/respond/:token shows Stadium Second's assigned slot | PASS | {"name":"Stadium Second","destination":"STADIUM","direction":"DROPOFF","date":"2026-08-20","partySize":8,"assignedSlot":"09:00","assignedSlotLabel":"9:00 AM","requestedSlot":null,"requestedSlotLabel":null,"status":"ALLOCATED"} |
| 44 | POST /api/respond accept -> CONFIRMED | PASS | {"ok":true,"status":"CONFIRMED"} |
| 45 | POST /api/respond reject -> REJECTED | PASS | {"ok":true,"status":"REJECTED"} |
| 46 | Rejecting Stadium Third frees its 10 seats at 09:00 (18 -> 8 used) | PASS | used=8 |
| 47 | POST /api/respond change (no slot) -> CHANGE_REQUESTED | PASS | {"ok":true,"status":"CHANGE_REQUESTED","needsSelection":true} |
| 48 | GET alternatives excludes slots held by a different destination group | PASS | alternatives=07:00,08:00,09:00,11:00,12:00,19:00,20:00,21:00 |
| 49 | POST /api/respond change with valid newSlot -> CHANGE_REQUESTED (pending front desk approval) | PASS | {"ok":true,"status":"CHANGE_REQUESTED","requestedSlot":"09:00","pendingApproval":true} |
| 50 | GET /api/respond/:token shows pending change with original slot untouched | PASS | {"name":"Stadium First","destination":"STADIUM","direction":"DROPOFF","date":"2026-08-20","partySize":5,"assignedSlot":"10:00","assignedSlotLabel":"10:00 AM","requestedSlot":"09:00","requestedSlotLabel":"9:00 AM","status":"CHANGE_REQUESTED"} |
| 51 | POST /api/admin/bookings/:id/approve-change moves Stadium First to 09:00 and confirms | PASS | {"name":"Stadium First","partySize":5,"email":"stadiumfirst@test.com","phone":"+1 5550000001","roomNumbers":["311"],"destination":"STADIUM","direction":"DROPOFF","date":"2026-08-20","preferredSlots":["09:00","10:00"],"notes":"","wheelchairAccessible":false,"accessibilityNote":"","status":"CONFIRMED","assignedSlot":"09:00","requestedSlot":null,"reviewNote":"","respondToken":"04e6743f77af6eacfb9c24335d237923f4bc65f2","allocationEmailSentAt":null,"bookingReceivedEmailSentAt":null,"_id":"57a0eea58d9d07d94a725eec","createdAt":"2026-08-18T02:31:09.821Z","updatedAt":"2026-08-18T02:31:09.897Z"} |
| 52 | POST /api/admin/bookings/:id/reject-change reverts Ferry Guest to its original slot (13:00) and re-confirms | PASS | {"name":"Ferry Guest","partySize":6,"email":"ferryguest@test.com","phone":"+1 5550000004","roomNumbers":["314"],"destination":"FERRY","direction":"DROPOFF","date":"2026-08-20","preferredSlots":["09:00","13:00"],"notes":"","wheelchairAccessible":false,"accessibilityNote":"","status":"CONFIRMED","assignedSlot":"13:00","requestedSlot":null,"reviewNote":"","respondToken":"5d43b34e860357b446685d6e77dd210476245c2e","allocationEmailSentAt":null,"bookingReceivedEmailSentAt":null,"_id":"cfbd0bf12750b2ba88b9f5d9","createdAt":"2026-08-18T02:31:09.829Z","updatedAt":"2026-08-18T02:31:09.900Z"} |
| 53 | POST /api/bookings creates two fresh unassigned guests for the regroup test | PASS | A=201 B=201 |
| 54 | POST /api/admin/bookings/bulk-assign regroups two fresh guests into 19:00 and honestly reports emails as skipped (no Gmail creds here) | PASS | {"ok":true,"updated":2,"emailed":0,"emailSkipped":2,"blocked":0} |
| 55 | Bulk-assigned bookings now both show assignedSlot 19:00 | PASS | A=19:00 B=19:00 |
| 56 | bulk-assign refuses to combine two same-group bookings that would exceed the 20-seat cap (12+9=21) | PASS | {"ok":true,"updated":1,"emailed":0,"emailSkipped":0,"blocked":1} |
| 57 | GET /api/admin/today returns operational date + upcoming/history bounds | PASS | {"today":"2026-08-17","previousDay":"2026-08-16","upcomingMax":"2026-12-17","historyMin":"2026-04-17","emailConfigured":false} |
| 58 | Topping 19:00 up to exactly 20/20 succeeds (right at the cap, not over it) | PASS | {"ok":true,"updated":1,"emailed":0,"emailSkipped":0,"blocked":0} |
| 59 | Slot color levels: a full (20/20) slot is red, an empty slot is green | PASS | 19:00 used=20 level=red / 21:00 used=0 level=green |
| 60 | GET /api/respond/:token with bad token -> 404 | PASS | status=404 |
| 61 | POST /api/respond with unknown action -> 400 | PASS | status=400 |
| 62 | POST /api/respond change into a cross-group slot -> 409 | PASS | {"error":"That slot just filled up. Please pick another."} |
| 63 | POST /api/admin/allocate with no pending bookings reports 0/0 | PASS | {"allocated":0,"needsReview":0,"message":"No pending bookings for this date."} |
| 64 | PATCH /api/admin/config saves hotelName + frontdeskEmail | PASS | {"key":"singleton","frontdeskPhone":"+1 (555) 111-2222","hotelName":"Lakeside Grand Hotel","frontdeskEmail":"frontdesk@lakesidegrand.test","_id":"a2bd3a9fb7990151b358e800"} |
| 65 | Allocation email includes hotel name, logo, big time wedge, 15-min reminder, phone, email, Request Changes button, rooms, safe travels | PASS | {"hotelName":true,"bigTime":true,"lobbyReminder":true,"phone":true,"email":true,"safeTravels":true,"logo":true,"requestChangesButton":true,"rooms":true} |
| 66 | Front-desk-initiated change email includes the reason for the change | PASS | reason line present |
