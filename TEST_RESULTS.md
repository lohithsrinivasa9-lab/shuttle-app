# Shuttle App Test Results

Run at: 2026-08-14T01:23:12.676Z
Result: **44/44 passed**

**What's new in this run:** the shared front desk/driver dashboard's backend (`/api/admin/today`
7 AM day-rollover, color-coded slot levels, multi-select bulk regroup + email, and the
front-desk-approved change-request flow with approve/reject) plus the redesigned email templates
(hotel name, big time display, 15-minute lobby reminder, front desk phone/email, safe-travels
sign-off). Same methodology as before: real Express/Nodemailer/QRCode packages, an in-memory
stand-in only for MongoDB since this sandbox has no outbound network to a real database.

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
| 16 | Allocation produced the expected majority-cluster assignment | PASS | {"B1 Stadium":"10:00","B2 Stadium":"09:00","B3 Stadium":"09:00","B4 Ferry":"13:00","B5 Airport":"07:00","B6 Train":"16:00"} |
| 17 | Slot grid usage/group matches allocation (18/20 at 09:00, airport+train share pool) | PASS | {"time":"09:00","label":"9:00 AM","window":"morning","blocked":false,"blockReason":"","group":"STADIUM","used":18,"max":20,"remaining":2,"bookingCount":2,"level":"yellow"} |
| 18 | POST /api/bookings creates oversized B7 Ferry Overflow | PASS | status=201 |
| 19 | POST /api/admin/allocate flags unfittable booking as NEEDS_REVIEW | PASS | {"allocated":0,"needsReview":1,"message":"Allocated 0 booking(s). 1 need manual review."} |
| 20 | PATCH /api/admin/bookings manually assigns B7 to 13:00 | PASS | "ALLOCATED" |
| 21 | PATCH /api/admin/config saves phone number | PASS | {"key":"singleton","frontdeskPhone":"+1 (555) 111-2222","hotelName":"Our Hotel","frontdeskEmail":"","_id":"304a52a594e4ca7ba8c6300c"} |
| 22 | GET /api/admin/config returns saved phone number | PASS | {"key":"singleton","frontdeskPhone":"+1 (555) 111-2222","hotelName":"Our Hotel","frontdeskEmail":"","_id":"304a52a594e4ca7ba8c6300c"} |
| 23 | GET /api/admin/qrcode returns a PNG image | PASS | status=200 type=image/png bytes=2518 |
| 24 | POST /api/admin/slots/block can unblock 12:00 again | PASS | blocked=false |
| 25 | GET /api/respond/:token shows B2's assigned slot | PASS | {"name":"B2 Stadium","destination":"STADIUM","direction":"DROPOFF","date":"2026-08-20","partySize":8,"assignedSlot":"09:00","assignedSlotLabel":"9:00 AM","requestedSlot":null,"requestedSlotLabel":null,"status":"ALLOCATED"} |
| 26 | POST /api/respond accept -> CONFIRMED | PASS | {"ok":true,"status":"CONFIRMED"} |
| 27 | POST /api/respond reject -> REJECTED | PASS | {"ok":true,"status":"REJECTED"} |
| 28 | Rejecting B3 frees its 10 seats at 09:00 (18 -> 8 used) | PASS | used=8 |
| 29 | POST /api/respond change (no slot) -> CHANGE_REQUESTED | PASS | {"ok":true,"status":"CHANGE_REQUESTED","needsSelection":true} |
| 30 | GET alternatives excludes slots held by a different destination group | PASS | alternatives=08:00,09:00,11:00,12:00,17:00,18:00,19:00,20:00,21:00 |
| 31 | POST /api/respond change with valid newSlot -> CHANGE_REQUESTED (pending front desk approval) | PASS | {"ok":true,"status":"CHANGE_REQUESTED","requestedSlot":"09:00","pendingApproval":true} |
| 32 | GET /api/respond/:token shows pending change with original slot untouched | PASS | {"name":"B1 Stadium","destination":"STADIUM","direction":"DROPOFF","date":"2026-08-20","partySize":5,"assignedSlot":"10:00","assignedSlotLabel":"10:00 AM","requestedSlot":"09:00","requestedSlotLabel":"9:00 AM","status":"CHANGE_REQUESTED"} |
| 33 | POST /api/admin/bookings/:id/approve-change moves B1 to 09:00 and confirms | PASS | {"name":"B1 Stadium","partySize":5,"email":"b1stadium@test.com","phone":"555-0000","roomNumber":"101","destination":"STADIUM","direction":"DROPOFF","date":"2026-08-20","preferredSlots":["09:00","10:00"],"status":"CONFIRMED","assignedSlot":"09:00","requestedSlot":null,"reviewNote":"","respondToken":"6b3483c509aadec79b5ba8f21d47dc0c8d791a4f","allocationEmailSentAt":null,"_id":"192cf876500a22a25b3fe12a","createdAt":"2026-08-14T01:23:12.315Z","updatedAt":"2026-08-14T01:23:12.581Z"} |
| 34 | POST /api/admin/bookings/:id/reject-change reverts B4 to its original slot (13:00) and re-confirms | PASS | {"name":"B4 Ferry","partySize":6,"email":"b4ferry@test.com","phone":"555-0001","roomNumber":"102","destination":"FERRY","direction":"DROPOFF","date":"2026-08-20","preferredSlots":["09:00","13:00"],"status":"CONFIRMED","assignedSlot":"13:00","requestedSlot":null,"reviewNote":"","respondToken":"026911c6e3ceb75d9dc520f735164678bf0e1105","allocationEmailSentAt":null,"_id":"a0b356aeb2e6c8b461e9b11a","createdAt":"2026-08-14T01:23:12.322Z","updatedAt":"2026-08-14T01:23:12.584Z"} |
| 35 | POST /api/admin/bookings/bulk-assign regroups B5+B6 into 08:00 and emails both | PASS | {"ok":true,"updated":2,"emailed":2} |
| 36 | Bulk-assigned bookings now both show assignedSlot 08:00 | PASS | B5=08:00 B6=08:00 |
| 37 | GET /api/admin/today returns operational date + upcoming/history bounds | PASS | {"today":"2026-08-13","previousDay":"2026-08-12","upcomingMax":"2026-12-13","historyMin":"2026-04-13"} |
| 38 | Slot color levels: full/over-capacity slot is red, empty slot is green | PASS | 08:00 used=21 level=red / 19:00 used=0 level=green |
| 39 | GET /api/respond/:token with bad token -> 404 | PASS | status=404 |
| 40 | POST /api/respond with unknown action -> 400 | PASS | status=400 |
| 41 | POST /api/respond change into a cross-group slot -> 409 | PASS | {"error":"That slot just filled up. Please pick another."} |
| 42 | POST /api/admin/allocate with no pending bookings reports 0/0 | PASS | {"allocated":0,"needsReview":0,"message":"No pending bookings for this date."} |
| 43 | PATCH /api/admin/config saves hotelName + frontdeskEmail | PASS | {"key":"singleton","frontdeskPhone":"+1 (555) 111-2222","hotelName":"Lakeside Grand Hotel","frontdeskEmail":"frontdesk@lakesidegrand.test","_id":"304a52a594e4ca7ba8c6300c"} |
| 44 | Allocation email includes hotel name, big time wedge, 15-min reminder, phone, email, safe travels | PASS | {"hotelName":true,"bigTime":true,"lobbyReminder":true,"phone":true,"email":true,"safeTravels":true} |
