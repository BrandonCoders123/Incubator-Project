# Doom-Style Game Project Overview

## Project Description
A first-person shooter game inspired by the classic Doom aesthetic. The game features a home screen, gameplay mechanics, stat tracking, and a leaderboard.

---

## Current Features
- **Gameplay Mechanics**: Player movement, shooting, enemy AI, and level progression.
- **Stat Tracking**: Tracks shots fired, shots hit, deaths, and playtime.
- **Backend Integration**: PHP endpoints for updating player stats.
- **Frontend**: Built with React, Three.js, and TypeScript.

---

## Tasks Completed
1. **Stat Tracking**:
   - Implemented tracking for shots fired, shots hit, deaths, and playtime.
   - Backend PHP endpoints for updating stats.
   - Frontend logic to call these endpoints.

2. **Home Screen**:
   - Added a Doom-style home screen UI with buttons for "Start Game," "Settings," "Leaderboard," and "Quit."
   - Conditionally renders the home screen when the game is in the `menu` phase.

---

## Next Steps and Requirements

### 1. Home Screen Enhancements
- **Objective**: Improve the home screen UI to match the Doom aesthetic more closely.
- **Tasks**:
  - Use `HomeScreen.png` as the background.
  - Use `HomeScreenReference.webp` as a reference for button placement and styling.
  - Ensure buttons are functional and navigate to the correct game phases.

### 2. Gameplay Improvements
- **Objective**: Ensure all gameplay mechanics are smooth and bug-free.
- **Tasks**:
  - Test and debug shooting, enemy AI, and player movement.
  - Ensure stat tracking works correctly and updates the database.

### 3. UI/UX Improvements
- **Objective**: Enhance the overall user experience.
- **Tasks**:
  - Improve button hover and click effects.
  - Add sound effects for UI interactions.
  - Ensure the UI is responsive and visually appealing.

### 4. Backend and Database
- **Objective**: Ensure the backend is robust and secure.
- **Tasks**:
  - Test all PHP endpoints for functionality and security.
  - Ensure the database schema is correctly set up and updated.

### 5. Testing and Debugging
- **Objective**: Ensure the game is stable and ready for release.
- **Tasks**:
  - Test all features thoroughly.
  - Debug any issues with stat tracking, UI, or gameplay.
  - Optimize performance where necessary.

---

## File Structure
- **Frontend**: Located in `client/src/`.
  - `SimpleFPS.tsx`: Main game component, includes home screen UI.
  - `api/backend.ts`: Functions for calling backend endpoints.
  - `api/components/fps/`: Game components like `Bullet.tsx`, `Game.tsx`, etc.

- **Backend**: PHP files for handling stat updates.
  - `updateShots.php`, `updateDeaths.php`, `updateTimePlayed.php`: Endpoints for updating player stats.

- **Assets**: Images and textures.
  - `HomeScreen.png`, `HomeScreenReference.webp`: Home screen background and reference.

---

## How to Contribute
1. **Frontend Development**:
   - Work on UI components in `client/src/`.
   - Use React, Three.js, and TypeScript.

2. **Backend Development**:
   - Update or add PHP endpoints as needed.
   - Ensure database queries are efficient and secure.

3. **Testing**:
   - Test all features and report any bugs.
   - Use Postman to test backend endpoints.

---

## Notes
- Ensure all changes are tested before merging.
- Follow the existing code style and structure.
- Document any new features or changes in this file.

---

## Contact
For any questions or further instructions, please reach out to Brandon Benrud.
