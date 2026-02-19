/**
 * src/lib/types.ts
 * * This file contains all shared TypeScript definitions for the Authentication Module.
 */

// =============================================================================
// 1. DATA MODELS (Database Schema Reflection)
// =============================================================================

/**
 * Represents a User entity as stored in the PostgreSQL `users` table.
 */
export interface User {
    id: string;           // UUID (Primary Key)
    email: string;        // Unique
    firstName: string;    // Added per requirements
    lastName: string;     // Added per requirements
    dob: string;          // ISO Date String (YYYY-MM-DD)
    createdAt: string;    // ISO Timestamp
}

/**
 * Represents a WebAuthn credential stored in the `credentials` table.
 */
export interface Credential {
    id: string;           // UUID
    userId: string;       // Foreign Key to User
    publicKey: string;    // Base64 encoded public key
    signCount: number;    // Counter to prevent replay attacks
    deviceName?: string;  // User-friendly name (e.g., "Abhishek's MacBook Air")
}

// =============================================================================
// 2. REGISTRATION FLOW (Svelte -> Golang -> Redis)
// =============================================================================

/**
 * Step 1: Payload sent to Golang to initiate registration.
 * Golang saves this + generated OTP into Redis (TTL 10m).
 */
export interface RegisterInitRequest {
    firstName: string;
    lastName: string;
    dob: string;          // Format: YYYY-MM-DD
    email: string;
}

/**
 * Step 2: Payload sent to verify Email/OTP and finalize account creation.
 * Golang checks Redis, if match -> Insert into Postgres.
 */
export interface RegisterVerifyRequest {
    email: string;        // Used as the key to look up in Redis
    code: string;         // The 6-digit OTP entered by user
}

// =============================================================================
// 3. LOGIN FLOW (Passkeys & OTP Fallback)
// =============================================================================

/**
 * Payload to request an OTP for login (Secondary/Recovery Flow).
 */
export interface LoginOtpRequest {
    email: string;
}

/**
 * Payload to verify the Login OTP.
 */
export interface LoginOtpVerifyRequest {
    email: string;
    code: string;
}

// =============================================================================
// 4. WEBAUTHN / PASSKEY PROTOCOLS (FIDO2)
// =============================================================================

/**
 * The challenge sent FROM the Golang Backend TO the Browser.
 * Used for both Registration (`navigator.credentials.create`) 
 * and Authentication (`navigator.credentials.get`).
 */
export interface WebAuthnChallenge {
    challenge: string;    // Base64URL encoded random bytes
    rpId: string;         // Relaying Party ID (e.g., "game.com")
    timeout?: number;
    user?: {              // Only present during Registration
        id: string;
        name: string;
        displayName: string;
    };
    allowCredentials?: {  // Only present during Authentication
        type: 'public-key';
        id: string;       // Base64URL encoded Credential ID
    }[];
}

/**
 * The signed assertion sent FROM the Browser TO the Golang Backend.
 * Result of `navigator.credentials.get()`.
 */
export interface PasskeyAuthenticationResponse {
    id: string;           // Credential ID
    rawId: string;        // Base64URL encoded
    type: 'public-key';
    response: {
        authenticatorData: string;
        clientDataJSON: string;
        signature: string;
        userHandle?: string | null;
    };
}

/**
 * The new credential sent FROM the Browser TO the Golang Backend.
 * Result of `navigator.credentials.create()`.
 */
export interface PasskeyRegistrationResponse {
    id: string;
    rawId: string;
    type: 'public-key';
    response: {
        attestationObject: string;
        clientDataJSON: string;
    };
}

// =============================================================================
// 5. API RESPONSES & STATE MANAGEMENT
// =============================================================================

/**
 * Standard wrapper for all JSON responses from the Golang Backend.
 */
export interface ApiResponse<T = any> {
    success: boolean;
    message?: string;     // Human-readable status (e.g., "OTP sent")
    data?: T;             // The actual payload (Token, User, Challenge)
    error?: string;       // Debug info or error code
}

/**
 * The session object returned upon successful Login or Register.
 */
export interface AuthSession {
    token: string;        // PASETO ID (Set as HttpOnly cookie)
    expiresAt: number;    // Unix Timestamp
    user: User;           // The logged-in user details
    refreshToken?: string;// For long-lived sessions (Trusted Devices)
}

/**
 * UI State Helper for Svelte Components
 */
export type AuthStep =
    | 'idle'             // Initial state
    | 'loading'          // Waiting for API
    | 'otp_sent'         // Waiting for user to input code
    | 'challenge_wait'   // Waiting for user to touch fingerprint reader
    | 'success'          // Redirecting
    | 'error';           // Show error message