import { fail, redirect } from '@sveltejs/kit';
import type { Actions } from './$types';
import { dev } from '$app/environment';
import { GO_BACKEND_URL } from '$env/static/private';

export const actions: Actions = {
    // Phase 1: Send Details -> Go Backend (Redis Save) -> Email OTP
    initiate: async ({ request, fetch }) => {
        const formData = await request.formData();
        const payload = {
            firstName: formData.get('firstName'),
            lastName: formData.get('lastName'),
            dob: formData.get('dob'),
            email: formData.get('email')
        };

        try {
            const res = await fetch(`${GO_BACKEND_URL}/auth/register-init`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            const data = await res.json();
            if (!data.success) return fail(400, { error: data.message });

            return { step: 'otp', email: payload.email };
        } catch (err) {
            console.error(err);
            return fail(500, { error: 'Backend unreachable' });
        }
    },

    // Phase 2: Send OTP -> Go Backend (Verify Redis) -> Postgres Create -> Return Token
    verify: async ({ request, fetch, cookies }) => {
        const formData = await request.formData();
        const email = formData.get('email');
        const code = formData.get('code');

        try {
            const res = await fetch(`${GO_BACKEND_URL}/auth/register-verify`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, code })
            });

            const data = await res.json();
            if (!data.success)
                return fail(400, { error: data.message, step: 'otp', email });

            // Set Session Cookie (HttpOnly)
            cookies.set('session_token', data.data.token, {
                path: '/',
                httpOnly: true,
                secure: !dev,
                maxAge: 60 * 60 * 24 * 7 // 7 Days
            });

            return {
                step: 'passkey',
                user: data.data.user
                // Note: Token is now in cookie, no need to return to client textually
            };
        } catch (err) {
            return fail(500, { error: 'Verification failed' });
        }
    },

    // Phase 3a: Get Challenge (Proxied via Server)
    passkey_challenge: async ({ fetch, cookies }) => {
        const token = cookies.get('session_token');
        if (!token) return fail(401, { error: 'Unauthorized' });

        try {
            const res = await fetch(`${GO_BACKEND_URL}/auth/webauthn/challenge`, {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            });
            const data = await res.json();
            return { challenge: data.data.challenge };
        } catch (e) {
            return fail(500, { error: 'Failed to get challenge' });
        }
    },

    // Phase 3b: Complete Registration (Proxied via Server)
    passkey_register: async ({ request, fetch, cookies }) => {
        const token = cookies.get('session_token');
        if (!token) return fail(401, { error: 'Unauthorized' });

        const formData = await request.formData();
        const credential = formData.get('credential');

        try {
            await fetch(`${GO_BACKEND_URL}/auth/webauthn/register`, {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: credential as string // Already JSON string
            });
        } catch (e) {
            return fail(500, { error: 'Failed to save passkey' });
        }

        redirect(303, '/dashboard');
    }
};