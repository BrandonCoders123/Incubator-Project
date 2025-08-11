# Overview

This is a full-stack web application featuring a first-person shooter (FPS) game built with React and Three.js on the frontend, with an Express.js backend. The application combines modern web technologies to create an immersive 3D gaming experience with a complete user interface system.

The project implements a 3D FPS game where players navigate through an environment, shoot at enemies, and manage game state. The frontend utilizes React Three Fiber for 3D rendering, Radix UI for interface components, and Tailwind CSS for styling. The backend provides a REST API foundation with database integration capabilities.

# User Preferences

Preferred communication style: Simple, everyday language.

# System Architecture

## Frontend Architecture

The client-side application is built using React with TypeScript and follows a component-based architecture:

- **3D Rendering Engine**: React Three Fiber (@react-three/fiber) provides the core 3D rendering capabilities, with additional utilities from @react-three/drei for enhanced 3D features and @react-three/postprocessing for visual effects
- **Game State Management**: Zustand stores handle different aspects of the application state:
  - `useFPS`: Manages game mechanics (health, enemies, bullets, game phases)
  - `useAudio`: Controls sound effects and background music
  - `useGame`: Handles overall game flow and transitions
- **UI Components**: Comprehensive component library built on Radix UI primitives with Tailwind CSS styling, providing consistent and accessible interface elements
- **Input Handling**: Keyboard controls for player movement and actions, with pointer lock API for mouse look functionality

## Backend Architecture  

The server-side follows an Express.js RESTful architecture pattern:

- **Web Framework**: Express.js with TypeScript support for type safety
- **Development Setup**: Vite integration for hot module replacement during development
- **Route Organization**: Modular route registration system with API endpoints prefixed under `/api`
- **Storage Layer**: Abstracted storage interface supporting both in-memory and database implementations
- **Error Handling**: Centralized error handling middleware with proper HTTP status codes

## Data Storage Solutions

**Database Integration**: 
- Drizzle ORM configured for PostgreSQL with Neon Database serverless integration
- Schema definition includes user management tables with username/password authentication
- Migration system for database version control
- Environment-based configuration for database connectivity

**Storage Abstraction**:
- Interface-based storage layer (`IStorage`) allowing multiple implementations
- In-memory storage implementation for development and testing
- Database storage implementation ready for production use

## Game Engine Components

**3D World System**:
- Environment generation with textures, lighting, and physics boundaries
- Player controller with first-person perspective and movement mechanics
- Enemy AI system with health management and collision detection
- Projectile physics system for bullets and combat

**Audio System**:
- Background music management with looping capabilities
- Sound effects for actions (shooting, hits, success)
- Mute/unmute functionality with state persistence

**User Interface System**:
- Game menu with start/pause/resume functionality
- HUD displaying health, ammunition, and score information
- Crosshair overlay for aiming
- Responsive design supporting both desktop and mobile viewports

# External Dependencies

## Core Framework Dependencies
- **React Ecosystem**: React 18 with TypeScript, React DOM for rendering
- **Three.js Integration**: React Three Fiber ecosystem for 3D graphics and WebGL
- **Backend Framework**: Express.js with TypeScript support

## Database and ORM
- **Neon Database**: Serverless PostgreSQL database hosting (@neondatabase/serverless)
- **Drizzle ORM**: Type-safe database toolkit with migration support
- **Database Validation**: Zod integration for schema validation

## UI and Styling
- **Radix UI**: Complete set of unstyled, accessible UI primitives
- **Tailwind CSS**: Utility-first CSS framework with custom design tokens
- **Lucide React**: Icon library for consistent iconography

## Development Tools
- **Build System**: Vite for fast development and optimized production builds
- **TypeScript**: Full type safety across frontend and backend
- **PostCSS**: CSS processing with Tailwind integration
- **TSX**: TypeScript execution for server-side development

## State Management and Data Fetching
- **Zustand**: Lightweight state management with subscription support
- **TanStack Query**: Server state management and caching for API calls

## Audio and Media
- **Web Audio API**: Browser-native audio processing and playback
- **Asset Loading**: Support for 3D models (GLTF/GLB) and audio files (MP3, OGG, WAV)

## Shader Support
- **GLSL**: Shader language support via vite-plugin-glsl for custom visual effects