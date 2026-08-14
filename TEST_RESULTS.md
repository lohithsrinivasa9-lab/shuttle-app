# Shuttle App Test Results

Run at: 2026-08-14T02:46:05.334Z
Result: **46/46 passed**

**Also fixed and separately verified (legacy_test.js, 2/2 passed):** bookings created before
the multi-room-number migration don't have a valid `roomNumbers` array, and Mongoose re-validates
the whole document on every save - so any unrelated staff action (approve, reject, bulk-assign,
manual edit) on an old booking was failing with `roomNumbers: Enter at least one room number`.
Added a pre-validate hook on the Booking model that recovers the legacy `roomNumber` string field
if present, or falls back to `["Not provided"]`, so old bookings stay editable.

| # | Test | Result | Detail |
|---|------|--------|--------|
| 1 | GET /api/bookings/slots returns 13 slots | PASS | status=200 count=13 |
| 2 | POST /api/bookings creates B1 Stadium | PASS | status=201 |
| 3 | POST /api/bookings creates B2 Stadium | PASS | status=201 |
| 4 | POST /api/bookings creates B3 Stadium | PASS | status=201 |
| 5 | POST /api/bookings creates B4 Ferry | PASS | status=201 |
| 6 | POST /api/bookings creates B5 Airport | PASS | status=201 |
| 7 | POST /api/bookings creates B6 Train | PASS | status=201 |
| 8 | POST /api/bookings accepts multiple room numbers, trims/drops blanks | PASS | ["201","202","203"] |
| 9 | POST /api/bookings rejects an empty room list | PASS | status=400 |
| 10 | POST /api/bookings rejects missing email | PASS | status=400 |
| 11 | POST /api/bookings rejects only 1 preferred slot | PASS | status=400 |
| 12 | POST /api/bookings rejects invalid slot time | PASS | status=400 |
| 13 | POST /api/bookings rejects partySize > 20 | PASS | status=400 |
| 14 | GET /api/admin/bookings lists 6 bookings | PASS | count=6 |
| 15 | POST /api/admin/slots/block blocks 12:00 | PASS | status=200 |
| 16 | GET /api/admin/slots shows 12:00 blocked | PASS | blocked=true |
| 17 | POST /api/admin/allocate runs and allocates 6 bookings | PASS | {"allocated":6,"needsReview":0,"message":"Allocated 6 booking(s). 0 need manual review."} |
| 18 | Allocation produced the expected majority-cluster assignment | PASS | {"B1 Stadium":"10:00","B2 Stadium":"09:00","B3 Stadium":"09:00","B4 Ferry":"13:00","B5 Airport":"07:00","B6 Train":"16:00"} |
| 19 | Slot grid usage/group matches allocation (18/20 at 09:00, airport+train share pool) | PASS | {"time":"09:00","label":"9:00 AM","window":"morning","blocked":false,"blockReason":"","group":"STADIUM","used":18,"max":20,"remaining":2,"bookingCount":2,"level":"yellow"} |
| 20 | POST /api/bookings creates oversized B7 Ferry Overflow | PASS | status=201 |
| 21 | POST /api/admin/allocate flags unfittable booking as NEEDS_REVIEW | PASS | {"allocated":0,"needsReview":1,"message":"Allocated 0 booking(s). 1 need manual review."} |
| 22 | PATCH /api/admin/bookings manually assigns B7 to 13:00 | PASS | "ALLOCATED" |
| 23 | PATCH /api/admin/config saves phone number | PASS | {"key":"singleton","frontdeskPhone":"+1 (555) 111-2222","hotelName":"Our Hotel","frontdeskEmail":"","_id":"c8edbabc7303ec7e92a2a967"} |
| 24 | GET /api/admin/config returns saved phone number | PASS | {"key":"singleton","frontdeskPhone":"+1 (555) 111-2222","hotelName":"Our Hotel","frontdeskEmail":"","_id":"c8edbabc7303ec7e92a2a967"} |
| 25 | GET /api/admin/qrcode returns a PNG image | PASS | status=200 type=image/png bytes=2518 |
| 26 | POST /api/admin/slots/block can unblock 12:00 again | PASS | blocked=false |
| 27 | GET /api/respond/:token shows B2's assigned slot | PASS | {"name":"B2 Stadium","destination":"STADIUM","direction":"DROPOFF","date":"2026-08-20","partySize":8,"assignedSlot":"09:00","assignedSlotLabel":"9:00 AM","requestedSlot":null,"requestedSlotLabel":null,"status":"ALLOCATED"} |
| 28 | POST /api/respond accept -> CONFIRMED | PASS | {"ok":true,"status":"CONFIRMED"} |
| 29 | POST /api/respond reject -> REJECTED | PASS | {"ok":true,"status":"REJECTED"} |
| 30 | Rejecting B3 frees its 10 seats at 09:00 (18 -> 8 used) | PASS | used=8 |
| 31 | POST /api/respond change (no slot) -> CHANGE_REQUESTED | PASS | {"ok":true,"status":"CHANGE_REQUESTED","needsSelection":true} |
| 32 | GET alternatives excludes slots held by a different destination group | PASS | alternatives=08:00,09:00,11:00,12:00,17:00,18:00,19:00,20:00,21:00 |
| 33 | POST /api/respond change with valid newSlot -> CHANGE_REQUESTED (pending front desk approval) | PASS | {"ok":true,"status":"CHANGE_REQUESTED","requestedSlot":"09:00","pendingApproval":true} |
| 34 | GET /api/respond/:token shows pending change with original slot untouched | PASS | {"name":"B1 Stadium","destination":"STADIUM","direction":"DROPOFF","date":"2026-08-20","partySize":5,"assignedSlot":"10:00","assignedSlotLabel":"10:00 AM","requestedSlot":"09:00","requestedSlotLabel":"9:00 AM","status":"CHANGE_REQUESTED"} |
| 35 | POST /api/admin/bookings/:id/approve-change moves B1 to 09:00 and confirms | PASS | {"name":"B1 Stadium","partySize":5,"email":"b1stadium@test.com","phone":"555-0000","roomNumbers":["101"],"destination":"STADIUM","direction":"DROPOFF","date":"2026-08-20","preferredSlots":["09:00","10:00"],"status":"CONFIRMED","assignedSlot":"09:00","requestedSlot":null,"reviewNote":"","respondToken":"5af33fad9bd2bac886665f956230e252f25ee131","allocationEmailSentAt":null,"_id":"2115a6883563851a09b4c8bc","createdAt":"2026-08-14T02:46:05.188Z","updatedAt":"2026-08-14T02:46:05.255Z"} |
| 36 | POST /api/admin/bookings/:id/reject-change reverts B4 to its original slot (13:00) and re-confirms | PASS | {"name":"B4 Ferry","partySize":6,"email":"b4ferry@test.com","phone":"555-0001","roomNumbers":["102"],"destination":"FERRY","direction":"DROPOFF","date":"2026-08-20","preferredSlots":["09:00","13:00"],"status":"CONFIRMED","assignedSlot":"13:00","requestedSlot":null,"reviewNote":"","respondToken":"b6849b6e8ebd41a865cb48f4fe6f0d0518e2d40d","allocationEmailSentAt":null,"_id":"b8ef5b34f28f8e02446b6fc8","createdAt":"2026-08-14T02:46:05.194Z","updatedAt":"2026-08-14T02:46:05.258Z"} |
| 37 | POST /api/admin/bookings/bulk-assign regroups B5+B6 into 08:00 and honestly reports emails as skipped (no Gmail creds here) | PASS | {"ok":true,"updated":2,"emailed":0,"emailSkipped":2} |
| 38 | Bulk-assigned bookings now both show assignedSlot 08:00 | PASS | B5=08:00 B6=08:00 |
| 39 | GET /api/admin/today returns operational date + upcoming/history bounds | PASS | {"today":"2026-08-13","previousDay":"2026-08-12","upcomingMax":"2026-12-13","historyMin":"2026-04-13","emailConfigured":false} |
| 40 | Slot color levels: full/over-capacity slot is red, empty slot is green | PASS | 08:00 used=21 level=red / 19:00 used=0 level=green |
| 41 | GET /api/respond/:token with bad token -> 404 | PASS | status=404 |
| 42 | POST /api/respond with unknown action -> 400 | PASS | status=400 |
| 43 | POST /api/respond change into a cross-group slot -> 409 | PASS | {"error":"That slot just filled up. Please pick another."} |
| 44 | POST /api/admin/allocate with no pending bookings reports 0/0 | PASS | {"allocated":0,"needsReview":0,"message":"No pending bookings for this date."} |
| 45 | PATCH /api/admin/config saves hotelName + frontdeskEmail | PASS | {"key":"singleton","frontdeskPhone":"+1 (555) 111-2222","hotelName":"Lakeside Grand Hotel","frontdeskEmail":"frontdesk@lakesidegrand.test","_id":"c8edbabc7303ec7e92a2a967"} |
| 46 | Allocation email includes hotel name, logo, big time wedge, 15-min reminder, phone, email, Request Changes button, rooms, safe travels | PASS | {"hotelName":true,"bigTime":true,"lobbyReminder":true,"phone":true,"email":true,"safeTravels":true,"logo":true,"requestChangesButton":true,"rooms":true} |
