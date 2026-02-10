import { dev } from '$app/environment';

// --- Helpers: Base64URL <-> ArrayBuffer ---
function bufferToBase64URL(buffer: ArrayBuffer): string {
    const bytes = new Uint8Array(buffer);
    let string = '';
    for (const b of bytes) string += String.fromCharCode(b);
    return btoa(string).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64URLToBuffer(base64url: string): ArrayBuffer {
    const base64 = base64url.replace(/-/g, '+').replace(/_/g, '/');
    const pad = base64.length % 4;
    const padded = pad ? base64 + '='.repeat(4 - pad) : base64;
    const binary = atob(padded);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes.buffer;
}

// --- Registration (Create New Passkey) ---
export async function registerCredential(
    challengeStr: string,
    user: { id: string; email: string },
    rpName: string = 'Game Portal'
) {
    try {
        const publicKey: PublicKeyCredentialCreationOptions = {
            challenge: base64URLToBuffer(challengeStr),
            rp: { name: rpName },
            user: {
                id: base64URLToBuffer(user.id),
                name: user.email,
                displayName: user.email
            },
            pubKeyCredParams: [
                { type: 'public-key', alg: -7 }, // ES256
                { type: 'public-key', alg: -257 } // RS256
            ],
            authenticatorSelection: { userVerification: 'preferred' },
            timeout: 60000,
            attestation: 'none'
        };

        const credential = (await navigator.credentials.create({
            publicKey
        })) as PublicKeyCredential;

        if (!credential) throw new Error('Credential creation returned null');

        const response = credential.response as AuthenticatorAttestationResponse;
        return {
            id: credential.id,
            rawId: bufferToBase64URL(credential.rawId),
            type: credential.type,
            response: {
                attestationObject: bufferToBase64URL(response.attestationObject),
                clientDataJSON: bufferToBase64URL(response.clientDataJSON)
            }
        };
    } catch (err: any) {
        // Distinguish between User Cancellation vs Technical Error
        if (err.name === 'NotAllowedError') {
            throw new Error('User cancelled the passkey request.');
        }
        if (dev) console.error('WebAuthn Registration Error:', err);
        throw new Error('Passkey setup failed. Please try again.');
    }
}

// --- Authentication (Login with Passkey) ---
export async function authenticateCredential(challengeStr: string) {
    try {
        const publicKey: PublicKeyCredentialRequestOptions = {
            challenge: base64URLToBuffer(challengeStr),
            timeout: 60000,
            userVerification: 'preferred'
        };

        const credential = (await navigator.credentials.get({
            publicKey
        })) as PublicKeyCredential;

        if (!credential) throw new Error('Credential retrieval returned null');

        const response = credential.response as AuthenticatorAssertionResponse;
        return {
            id: credential.id,
            rawId: bufferToBase64URL(credential.rawId),
            type: credential.type,
            response: {
                authenticatorData: bufferToBase64URL(response.authenticatorData),
                clientDataJSON: bufferToBase64URL(response.clientDataJSON),
                signature: bufferToBase64URL(response.signature),
                userHandle: response.userHandle ? bufferToBase64URL(response.userHandle) : null
            }
        };
    } catch (err: any) {
        if (err.name === 'NotAllowedError') {
            throw new Error('User cancelled the login request.');
        }
        if (dev) console.error('WebAuthn Auth Error:', err);
        throw new Error('Passkey authentication failed.');
    }
}