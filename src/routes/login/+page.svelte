<script lang="ts">
    import { enhance } from "$app/forms";
    import { authenticateCredential } from "$lib/auth/webauthn";
    import { goto } from "$app/navigation";
    import { page } from "$app/state";
    import { untrack } from "svelte";
    import { LAUNCHER_URL } from "$lib/constants";

    interface LoginFormState {
        mode?: "passkey" | "sign_challenge" | "otp_request" | "otp_verify";
        email?: string;
        challenge?: string;
        token?: string;
        success?: boolean;
        error?: string;
    }

    let { form }: { form: LoginFormState } = $props();

    // Mutable State Initialization
    let mode = $state(untrack(() => form?.mode) ?? "passkey");
    let email = $state(untrack(() => form?.email) ?? "");
    let errorMessage = $state(untrack(() => form?.error) ?? "");
    let loading = $state(false);

    const isLauncher = page.url.searchParams.get("source") === "launcher";

    $effect(() => {
        if (form) {
            if (form.mode) mode = form.mode;
            if (form.email) email = form.email;
            if (form.error) errorMessage = form.error;

            // Handle Passkey Challenge (Auto-trigger)
            if (mode === "sign_challenge" && form.challenge) {
                processPasskeyChallenge(form.challenge);
            }

            // Handle Login Success
            if (form.success && form.token) {
                handleSuccess(form.token);
            }
        }
    });

    async function processPasskeyChallenge(challenge: string) {
        loading = true;
        try {
            const credential = await authenticateCredential(challenge);
            // Submit signature back to server via BFF action
            const formData = new FormData();
            formData.append("email", email);
            formData.append("credential", JSON.stringify(credential));

            const response = await fetch("?/verify_passkey", {
                method: "POST",
                body: formData,
            });
            const result = await response.json();

            if (result.type === "success" && result.data) {
                handleSuccess(result.data.token);
            } else {
                errorMessage = "Passkey verification failed.";
                loading = false;
                mode = "passkey";
            }
        } catch (err: unknown) {
            // Type Narrowing: 'any' -> 'unknown'
            console.error(err);
            errorMessage =
                err instanceof Error
                    ? err.message
                    : "Passkey request cancelled or failed.";
            loading = false;
            mode = "passkey";
        }
    }

    function handleSuccess(token: string) {
        if (isLauncher) {
            // Use constant instead of hardcoded string
            window.location.href = `${LAUNCHER_URL}/callback?token=${token}`;
        } else {
            goto("/dashboard");
        }
    }
</script>

<div
    class="min-h-screen flex items-center justify-center bg-zinc-950 text-white font-sans"
>
    <div
        class="w-full max-w-md p-8 bg-black rounded-xl border border-zinc-800 shadow-2xl"
    >
        <h1
            class="text-3xl font-bold mb-8 text-center bg-clip-text text-transparent bg-gradient-to-r from-emerald-400 to-cyan-500"
        >
            System Login
        </h1>

        {#if errorMessage}
            <div
                class="p-3 mb-6 bg-red-950/50 text-red-400 text-sm border border-red-900 rounded"
                role="alert"
            >
                {errorMessage}
            </div>
        {/if}

        {#if mode === "passkey" || mode === "sign_challenge"}
            <form
                method="POST"
                action="?/get_challenge"
                use:enhance={() => {
                    loading = true;
                    errorMessage = "";
                    return async ({ update }) => {
                        loading = false;
                        update();
                    };
                }}
            >
                <div class="space-y-6">
                    <div>
                        <label
                            for="email-input"
                            class="block text-sm text-zinc-500 mb-2"
                            >Identify</label
                        >
                        <input
                            id="email-input"
                            bind:value={email}
                            name="email"
                            type="email"
                            placeholder="user@domain.com"
                            required
                            class="w-full p-3 bg-zinc-900 rounded border border-zinc-700 focus:border-emerald-500 outline-none text-white placeholder-zinc-600"
                        />
                    </div>

                    <button
                        disabled={loading}
                        class="w-full py-3 bg-white text-black font-bold rounded hover:bg-zinc-200 transition-colors flex justify-center items-center gap-2"
                    >
                        {#if loading}
                            Processing...
                        {:else}
                            🔑 Sign in with Passkey
                        {/if}
                    </button>

                    <button
                        type="button"
                        onclick={() => (mode = "otp_request")}
                        class="w-full text-sm text-zinc-500 hover:text-white transition-colors"
                    >
                        Trouble logging in? Use email code
                    </button>

                    <a
                        href="/register"
                        class="block text-center text-sm text-emerald-500 hover:text-emerald-400 mt-4"
                    >
                        Initialize New Identity (Register)
                    </a>
                </div>
            </form>
        {:else if mode === "otp_request"}
            <form
                method="POST"
                action="?/request_otp"
                use:enhance={() => {
                    loading = true;
                    errorMessage = "";
                    return async ({ update }) => {
                        loading = false;
                        update();
                    };
                }}
            >
                <div class="space-y-6">
                    <h2 class="text-xl text-center text-zinc-300">
                        Email Recovery
                    </h2>
                    <div>
                        <label for="recovery-email" class="sr-only"
                            >Email Address</label
                        >
                        <input
                            id="recovery-email"
                            bind:value={email}
                            name="email"
                            type="email"
                            placeholder="Enter your email"
                            required
                            class="w-full p-3 bg-zinc-900 rounded border border-zinc-700 focus:border-emerald-500 outline-none"
                        />
                    </div>
                    <button
                        disabled={loading}
                        class="w-full py-3 bg-emerald-700 hover:bg-emerald-600 text-white font-bold rounded transition-colors"
                    >
                        Send Verification Code
                    </button>
                    <button
                        type="button"
                        onclick={() => (mode = "passkey")}
                        class="w-full text-sm text-zinc-500"
                    >
                        Back to Passkey
                    </button>
                </div>
            </form>
        {:else if mode === "otp_verify"}
            <form
                method="POST"
                action="?/verify_otp"
                use:enhance={() => {
                    loading = true;
                    errorMessage = "";
                    return async ({ update }) => {
                        loading = false;
                        update();
                    };
                }}
            >
                <div class="space-y-6 text-center">
                    <p class="text-zinc-400">Code sent to {email}</p>
                    <input type="hidden" name="email" value={email} />
                    <div>
                        <label for="otp-code" class="sr-only"
                            >One Time Password</label
                        >
                        <input
                            id="otp-code"
                            name="code"
                            type="text"
                            maxlength="6"
                            placeholder="000 000"
                            class="w-full text-center text-3xl tracking-[0.5em] p-4 bg-zinc-900 rounded border border-zinc-700 focus:border-emerald-500 outline-none font-mono"
                        />
                    </div>
                    <button
                        disabled={loading}
                        class="w-full py-3 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded"
                    >
                        {loading ? "Verifying..." : "Login"}
                    </button>
                </div>
            </form>
        {/if}
    </div>
</div>
