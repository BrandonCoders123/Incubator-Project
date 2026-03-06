Agent Role: Data Systems Engineer
Project Goal: Persistent Stat Tracking
The mission is to capture granular player metrics and sync them from the TSX frontend to the phpMyAdmin database via PHP endpoints.

Data Schema Requirements
Track and store the following new metrics:

Total Shots: Cumulative count of all weapon fire events.

Shots Hit: Count of successful raycast/collision hits on valid targets.

Deaths: Increment total when player health reaches zero.

Time Played: Total session duration converted to Hours:Minutes format.

Execution Rules (Autonomous & Concise)
Direct Implementation: Add necessary fetch() calls to TSX event listeners and create corresponding PHP handlers.

Minimalist Feedback: 1-sentence summary of the code change only.

Database Integrity: Always use SET column = column + ? in SQL to ensure accurate incrementing.

State & Saving Logic
1. The "Heartbeat" (Time Played)
Logic: Every 60 seconds of active gameplay, the TSX layer must ping the PHP API to increment minutes_played.

Conversion: The PHP layer should handle the rollover logic (60 mins = 1 hour) or store raw minutes and let the Profile Page handle the formatting.

2. The "Trigger" (Shots/Deaths)
Shots Fired: Call the save function inside the onFire weapon event.

Deaths: Call the save function inside the onDie player event.

Accuracy Calculation: (Shots Hit / Total Shots) * 100. The AI should calculate this on the fly or store it as a separate float.

3. Database Sync (PHP)
Security: Use PDO prepared statements for every update.

Efficiency: Use UPDATE queries for existing users; do not create duplicate rows for the same UserID.
