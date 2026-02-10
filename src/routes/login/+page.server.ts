import { fail } from '@sveltejs/kit';
import type { Actions } from './$types';
import { dev } from '$app/environment';
import { GO_BACKEND_URL } from '$env/static/private';

export const actions: Actions = {
    // Flow 1: Passkey - Request Challenge
    get_challenge: async ({ request, fetch }) => {
        const formData = await request.formData();
        const email = formData.get('email');

        try {
            const res = await fetch(`${GO_BACKEND_URL}/auth/login-challenge`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email })
            });
            const data = await res.json();

            if (!data.success) return fail(400, { error: data.message, mode: 'passkey' });

            return { mode: 'sign_challenge', challenge: data.data.challenge, email };
        } catch (e) {
            return fail(500, { error: 'Server error', mode: 'passkey' });
        }
    },

    // Flow 1: Passkey - Verify Signature
    verify_passkey: async ({ request, fetch, cookies }) => {
        const formData = await request.formData();
        const email = formData.get('email');
        const credential = formData.get('credential');

        try {
            const res = await fetch(`${GO_BACKEND_URL}/auth/login-verify-passkey`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, credential: JSON.parse(credential as string) })
            });
            const data = await res.json();

            if (!data.success) return fail(400, { error: 'Auth failed', mode: 'passkey' });

            cookies.set('session_token', data.data.token, {
                path: '/',
                httpOnly: true,
                secure: !dev,
                maxAge: 60 * 60 * 24 * 7
            });

            return { success: true, token: data.data.token };
        } catch (e) {
            return fail(500, { error: 'Verification failed', mode: 'passkey' });
        }
    },

    // Flow 2: OTP - Request Code
    request_otp: async ({ request, fetch }) => {
        const formData = await request.formData();
        const email = formData.get('email');

        try {
            await fetch(`${GO_BACKEND_URL}/auth/otp-request`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email })
            });
            return { mode: 'otp_verify', email };
        } catch (e) {
            return fail(500, { error: 'Service unavailable' });
        }
    },

    // Flow 2: OTP - Verify Code
    verify_otp: async ({ request, fetch, cookies }) => {
        const formData = await request.formData();
        const email = formData.get('email');
        const code = formData.get('code');

        try {
            const res = await fetch(`${GO_BACKEND_URL}/auth/otp-verify`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, code })
            });
            const data = await res.json();

            if (!data.success) return fail(400, { error: 'Invalid Code', mode: 'otp_verify', email });

            cookies.set('session_token', data.data.token, {
                path: '/',
                httpOnly: true,
                secure: !dev,
                maxAge: 60 * 60 * 24 * 7
            });

            return { success: true, token: data.data.token };
        } catch (e) {
            return fail(500, { error: 'Error', mode: 'otp_verify' });
        }
    }
};