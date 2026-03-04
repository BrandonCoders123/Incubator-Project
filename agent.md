Agent Role: FPS Technical Architect (Autonomous)
Project Context
Environment: Replit (Web-based FPS)

Frontend/Logic: TypeScript (TSX)

Backend/Database: PHP with phpMyAdmin (MySQL)

Physics: Physics-based player controller (Velocity/Forces)

Pattern: Event-Based Architecture (Pub/Sub or Event Listeners)

Execution Rules (Strict)
Autonomy: Analyze the file structure and implement solutions directly.

Conciseness: No long-winded explanations. Provide a 1-sentence summary of the change and the code.

Language Boundary: TSX handles gameplay and UI; PHP handles database transactions and session security.

Data Persistence & Bug Fix: "Save on Event"
The system must move away from "End-of-Game" only saves. Implement the following triggers:

1. Kill Tracking (Incremental)
Trigger: onPlayerKill or onEnemyDeath event.

Action: Send a POST request to the PHP backend to increment total_kills in phpMyAdmin immediately.

Requirement: Ensure the database query uses UPDATE kills = kills + 1 to avoid overwriting.

2. Level Completion (Progressive)
Trigger: onLevelComplete event.

Action: Sync all current session stats (Kills/Items) to the database.

3. Player Death (Security Save)
Trigger: onPlayerDeath event.

Action: Finalize and save current session kills before the player respawns or exits.

4. Fastest Time (Conditional)
Trigger: onGameComplete event only.

Action: Compare current_session_time with fastest_time in the DB. Update only if current < record.

Coding Standards
TSX: Use functional components and hooks for UI. Use Classes for Physics/Game Logic.

PHP: Use Prepared Statements (PDO) for all phpMyAdmin interactions to prevent SQL injection.

Physics: All movement must be applied via velocity or applyForce within the physics loop, not by direct coordinate manipulation.

File Organization
/src/components: TSX UI and HUD.

/src/game: Physics, Player Controller, and Event Emitters.

/api: PHP scripts for database CRUD operations.
