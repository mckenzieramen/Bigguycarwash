# Big Guy's Carwash — DTR Starter

This starter includes:
- Admin login UI
- Employee ID → biometric camera step
- Daily DTR with Early (blue), On-time, Late (red)
- Admin-configurable employee start time
- Full / Semi Full / Part Time base daily rates
- Sales recording
- Commission calculation: 40% normal, 35% late, 30% AWOL
- Daily/monthly/yearly report starter
- Transparent Big Guy's logo

## Important
This is a front-end prototype using browser localStorage. It is NOT yet suitable for production payroll/security.

The camera step currently checks camera access only. True face recognition requires employee face enrollment plus a face-recognition model and should be connected to a secure backend/Firebase before deployment.

Commission formula implemented:
`daily pay = max(base daily rate, sales × commission rate)` for a recorded attendance day.

Example: Full-time + ₱350 sales + normal attendance:
350 × 40% = ₱140, so pay remains ₱250.

For production, replace the demo admin credentials with Firebase Authentication and store employee/DTR/sales records in Firestore with security rules.


V82: Schedule Week/Date now selects the calendar week, saved weeks can be viewed/edited, and unsaved future weeks are blank dropdown grids. Existing DTR/time data is preserved.
